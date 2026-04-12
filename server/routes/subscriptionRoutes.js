const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const {
    ensurePremiumSchema,
    getActiveSubscription,
    mapSubscriptionStatus
} = require("../utils/premiumData");
const {
    buildCallbackUrls,
    checkEsewaTransactionStatus,
    decodeEsewaSuccessData,
    formatAmount,
    getEsewaConfig,
    isEsewaConfigured,
    signEsewaFields,
    verifyEsewaSignature
} = require("../utils/esewa");

const router = express.Router();

function getClientBaseUrl() {
    return process.env.CLIENT_BASE_URL || "http://localhost:3000";
}

function buildClientRedirect(path, params = {}) {
    const url = new URL(path, getClientBaseUrl().replace(/\/$/, "/"));
    Object.entries(params).forEach(([key, value]) => {
        if (value === null || typeof value === "undefined" || value === "") return;
        url.searchParams.set(key, String(value));
    });
    return url.toString();
}

function getPlanDurationDays(planCode) {
    if (planCode === "premium-monthly") return 30;
    return 30;
}

function buildEsewaInitiationPayload(plan, payment) {
    const config = getEsewaConfig();
    const callbackUrls = buildCallbackUrls(payment.transaction_uuid);
    const totalAmount = formatAmount(payment.total_amount);
    const fieldsToSign = {
        total_amount: totalAmount,
        transaction_uuid: payment.transaction_uuid,
        product_code: config.productCode
    };

    return {
        formUrl: config.formUrl,
        fields: {
            amount: formatAmount(payment.amount),
            tax_amount: formatAmount(payment.tax_amount),
            total_amount: totalAmount,
            transaction_uuid: payment.transaction_uuid,
            product_code: config.productCode,
            product_service_charge: formatAmount(payment.service_charge),
            product_delivery_charge: formatAmount(payment.delivery_charge),
            success_url: callbackUrls.successUrl,
            failure_url: callbackUrls.failureUrl,
            signed_field_names: "total_amount,transaction_uuid,product_code",
            signature: signEsewaFields(fieldsToSign)
        },
        plan: {
            code: plan.code,
            name: plan.name,
            priceLabel: plan.price_label,
            amount: Number(plan.price_amount || payment.total_amount || 0),
            currency: plan.currency || "NPR"
        }
    };
}

async function activateSubscriptionFromPayment(paymentRow) {
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

    return mapSubscriptionStatus({
        ...activated.rows[0],
        plan_name: plan.name,
        plan_code: plan.code,
        price_label: plan.price_label,
        billing_period: plan.billing_period,
        description: plan.description
    });
}

async function finalizeEsewaPayment(paymentRow, successPayload = null) {
    const statusPayload = await checkEsewaTransactionStatus({
        productCode: paymentRow.product_code,
        totalAmount: paymentRow.total_amount,
        transactionUuid: paymentRow.transaction_uuid
    });

    const normalizedStatus = String(statusPayload.status || "").toUpperCase();
    const providerRef = statusPayload.ref_id || paymentRow.provider_ref || null;

    const updatedPayment = await pool.query(
        `UPDATE subscription_payments
         SET status = $1,
             provider_ref = $2,
             transaction_code = COALESCE($3, transaction_code),
             verified_payload = $4::jsonb,
             success_payload = CASE WHEN $5::jsonb = '{}'::jsonb THEN success_payload ELSE $5::jsonb END,
             verification_checked_at = NOW(),
             paid_at = CASE WHEN $1 = 'complete' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
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

    const subscription = await activateSubscriptionFromPayment(updatedPayment.rows[0]);
    return {
        payment: updatedPayment.rows[0],
        subscription,
        statusPayload
    };
}

router.get("/plans", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        const plans = await pool.query(
            `SELECT id, code, name, price_label AS "priceLabel", price_amount AS "priceAmount", currency, billing_period AS "billingPeriod", description
             FROM subscription_plans
             WHERE is_active = TRUE
             ORDER BY id ASC`
        );

        res.json({
            plans: plans.rows,
            paymentProvider: "esewa",
            isEsewaConfigured: isEsewaConfigured(),
            testMode: getEsewaConfig().testMode
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load subscription plans" });
    }
});

router.get("/me", authenticateToken, async (req, res) => {
    try {
        const subscription = await getActiveSubscription(pool, req.user.id);
        const pendingPayment = await pool.query(
            `SELECT transaction_uuid AS "transactionUuid", status, total_amount AS "totalAmount", created_at AS "createdAt"
             FROM subscription_payments
             WHERE user_id = $1
               AND status = 'pending'
             ORDER BY created_at DESC
             LIMIT 1`,
            [req.user.id]
        );

        res.json({
            subscription: mapSubscriptionStatus(subscription),
            pendingPayment: pendingPayment.rows[0] || null
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load subscription status" });
    }
});

router.post("/esewa/initiate", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        if (!isEsewaConfigured()) {
            return res.status(500).json({ error: "eSewa is not configured on the server yet." });
        }

        const requestedPlanCode = String(req.body?.planCode || "premium-monthly").trim() || "premium-monthly";
        const planResult = await pool.query(
            `SELECT * FROM subscription_plans WHERE code = $1 AND is_active = TRUE LIMIT 1`,
            [requestedPlanCode]
        );

        if (planResult.rows.length === 0) {
            return res.status(404).json({ error: "Requested subscription plan was not found." });
        }

        const plan = planResult.rows[0];
        const transactionUuid = `sub-${req.user.id}-${Date.now()}`;
        const totalAmount = Number(plan.price_amount || 0);

        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return res.status(500).json({ error: "Subscription amount is not configured correctly." });
        }

        const inserted = await pool.query(
            `INSERT INTO subscription_payments (
                user_id, plan_id, provider, transaction_uuid, status,
                amount, tax_amount, service_charge, delivery_charge, total_amount, product_code,
                created_at, updated_at, expires_at
             )
             VALUES ($1, $2, 'esewa', $3, 'pending', $4, 0, 0, 0, $5, $6, NOW(), NOW(), NOW() + INTERVAL '30 minutes')
             RETURNING *`,
            [req.user.id, plan.id, transactionUuid, totalAmount, totalAmount, getEsewaConfig().productCode]
        );

        const payment = inserted.rows[0];
        res.json({
            message: "Redirecting to eSewa",
            checkout: buildEsewaInitiationPayload(plan, payment)
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to initialize eSewa payment" });
    }
});

router.get("/esewa/success", async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        const transactionUuid = String(req.query?.transaction_uuid || "").trim();
        const encodedData = String(req.query?.data || "").trim();
        const decodedData = decodeEsewaSuccessData(encodedData);

        if (!transactionUuid || !decodedData) {
            return res.redirect(buildClientRedirect("subscription.html", {
                payment: "error",
                message: "Invalid eSewa success response"
            }));
        }

        const paymentResult = await pool.query(
            `SELECT * FROM subscription_payments WHERE transaction_uuid = $1 LIMIT 1`,
            [transactionUuid]
        );

        if (paymentResult.rows.length === 0) {
            return res.redirect(buildClientRedirect("subscription.html", {
                payment: "error",
                message: "Payment record was not found"
            }));
        }

        const payment = paymentResult.rows[0];
        if (payment.status === "complete") {
            return res.redirect(buildClientRedirect("subscription.html", {
                payment: "success",
                transaction_uuid: transactionUuid
            }));
        }

        const signedFields = decodedData.signed_field_names || "";
        const signatureValid = verifyEsewaSignature(
            decodedData,
            decodedData.signature,
            signedFields || "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names"
        );

        if (!signatureValid) {
            await pool.query(
                `UPDATE subscription_payments
                 SET status = 'signature_invalid',
                     success_payload = $1::jsonb,
                     updated_at = NOW()
                 WHERE id = $2`,
                [JSON.stringify(decodedData), payment.id]
            );

            return res.redirect(buildClientRedirect("subscription.html", {
                payment: "error",
                message: "eSewa signature verification failed"
            }));
        }

        const result = await finalizeEsewaPayment(payment, decodedData);
        if (!result.subscription) {
            return res.redirect(buildClientRedirect("subscription.html", {
                payment: "failed",
                transaction_uuid: transactionUuid,
                status: result.statusPayload?.status || "FAILED"
            }));
        }

        return res.redirect(buildClientRedirect("subscription.html", {
            payment: "success",
            transaction_uuid: transactionUuid
        }));
    } catch (error) {
        console.error(error.message);
        return res.redirect(buildClientRedirect("subscription.html", {
            payment: "error",
            message: "Unable to verify eSewa payment"
        }));
    }
});

router.get("/esewa/failure", async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        const transactionUuid = String(req.query?.transaction_uuid || "").trim();
        if (transactionUuid) {
            await pool.query(
                `UPDATE subscription_payments
                 SET status = 'failed',
                     failure_payload = $1::jsonb,
                     updated_at = NOW()
                 WHERE transaction_uuid = $2
                   AND status = 'pending'`,
                [JSON.stringify(req.query || {}), transactionUuid]
            );
        }

        return res.redirect(buildClientRedirect("subscription.html", {
            payment: "failed",
            transaction_uuid: transactionUuid || ""
        }));
    } catch (error) {
        console.error(error.message);
        return res.redirect(buildClientRedirect("subscription.html", {
            payment: "error",
            message: "Unable to process eSewa failure response"
        }));
    }
});

router.delete("/me", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        const cancelled = await pool.query(
            `UPDATE user_subscriptions
             SET status = 'cancelled',
                 expires_at = CASE
                     WHEN expires_at IS NULL OR expires_at > NOW() THEN NOW()
                     ELSE expires_at
                 END,
                 updated_at = NOW()
             WHERE user_id = $1
               AND status = 'active'
             RETURNING id`,
            [req.user.id]
        );

        res.json({
            cancelled: cancelled.rowCount > 0,
            message: cancelled.rowCount > 0
                ? "Premium access cancelled"
                : "No active premium access was found",
            subscription: mapSubscriptionStatus(null)
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to cancel premium access" });
    }
});

module.exports = router;
