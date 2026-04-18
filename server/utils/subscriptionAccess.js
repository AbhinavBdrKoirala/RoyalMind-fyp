const {
    checkEsewaTransactionStatus
} = require("./esewa");
const {
    ensurePremiumSchema,
    getActiveSubscription,
    mapSubscriptionStatus
} = require("./premiumData");

function getPlanDurationDays(planCode) {
    if (planCode === "premium-monthly") return 30;
    return 30;
}

async function activateSubscriptionFromPayment(pool, paymentRow) {
    const planDetails = await pool.query(
        `SELECT id, code, name, price_label, billing_period, description
         FROM subscription_plans
         WHERE id = $1
         LIMIT 1`,
        [paymentRow.plan_id]
    );

    if (planDetails.rows.length === 0) {
        throw new Error("Subscription plan is not configured");
    }

    const plan = planDetails.rows[0];

    await pool.query(
        `UPDATE user_subscriptions
         SET status = 'cancelled',
             updated_at = NOW()
         WHERE user_id = $1
           AND status = 'active'`,
        [paymentRow.user_id]
    );

    const activated = await pool.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, provider, provider_ref, started_at, expires_at, created_at, updated_at)
         VALUES ($1, $2, 'active', 'esewa', $3, NOW(), NOW() + ($4 || ' days')::interval, NOW(), NOW())
         RETURNING *`,
        [paymentRow.user_id, paymentRow.plan_id, paymentRow.provider_ref || paymentRow.transaction_uuid, String(getPlanDurationDays(plan.code))]
    );

    return {
        ...activated.rows[0],
        plan_name: plan.name,
        plan_code: plan.code,
        price_label: plan.price_label,
        billing_period: plan.billing_period,
        description: plan.description
    };
}

async function finalizeEsewaPayment(pool, paymentRow, successPayload = null) {
    const statusPayload = await checkEsewaTransactionStatus({
        productCode: paymentRow.product_code,
        totalAmount: paymentRow.total_amount,
        transactionUuid: paymentRow.transaction_uuid
    });

    const normalizedStatus = String(statusPayload.status || "").toUpperCase();
    const providerRef = statusPayload.ref_id || paymentRow.provider_ref || null;

    const updatedPayment = await pool.query(
        `UPDATE subscription_payments
         SET status = $1::text,
             provider_ref = $2,
             transaction_code = COALESCE($3, transaction_code),
             verified_payload = $4::jsonb,
             success_payload = CASE WHEN $5::jsonb = '{}'::jsonb THEN success_payload ELSE $5::jsonb END,
             verification_checked_at = NOW(),
             paid_at = CASE WHEN $1::text = 'complete' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
            normalizedStatus === "COMPLETE" ? "complete" : normalizedStatus.toLowerCase(),
            providerRef,
            successPayload?.transaction_code || statusPayload.ref_id || null,
            JSON.stringify(statusPayload || {}),
            JSON.stringify(successPayload || {}),
            paymentRow.id
        ]
    );

    if (normalizedStatus !== "COMPLETE") {
        return {
            payment: updatedPayment.rows[0],
            subscription: null,
            statusPayload
        };
    }

    const subscription = await activateSubscriptionFromPayment(pool, updatedPayment.rows[0]);
    return {
        payment: updatedPayment.rows[0],
        subscription,
        statusPayload
    };
}

async function expireStalePendingPayments(pool, userId) {
    await pool.query(
        `UPDATE subscription_payments
         SET status = 'expired',
             updated_at = NOW()
         WHERE user_id = $1
           AND status = 'pending'
           AND expires_at IS NOT NULL
           AND expires_at <= NOW()`,
        [userId]
    );
}

async function getLatestPendingPaymentRow(pool, userId) {
    const pendingPayment = await pool.query(
        `SELECT *
         FROM subscription_payments
         WHERE user_id = $1
           AND status = 'pending'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
    );

    return pendingPayment.rows[0] || null;
}

async function resolveUserSubscription(pool, userId, { refreshPending = false } = {}) {
    await ensurePremiumSchema(pool);
    await expireStalePendingPayments(pool, userId);

    let subscription = await getActiveSubscription(pool, userId);
    if (subscription || !refreshPending) {
        return subscription;
    }

    const pendingPayment = await getLatestPendingPaymentRow(pool, userId);
    if (!pendingPayment) {
        return null;
    }

    try {
        const verificationResult = await finalizeEsewaPayment(pool, pendingPayment);
        if (verificationResult.subscription) {
            return verificationResult.subscription;
        }
    } catch (error) {
        console.error(`Unable to refresh eSewa payment ${pendingPayment.transaction_uuid}: ${error.message}`);
    }

    return await getActiveSubscription(pool, userId);
}

module.exports = {
    activateSubscriptionFromPayment,
    expireStalePendingPayments,
    finalizeEsewaPayment,
    getLatestPendingPaymentRow,
    getPlanDurationDays,
    mapSubscriptionStatus,
    resolveUserSubscription
};
