const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const {
    ensurePremiumSchema,
    mapSubscriptionStatus
} = require("../utils/premiumData");
const {
    buildCallbackUrls,
    decodeEsewaSuccessData,
    formatAmount,
    getEsewaConfig,
    isEsewaConfigured,
    signEsewaFields,
    verifyEsewaSignature
} = require("../utils/esewa");
const {
    expireStalePendingPayments,
    finalizeEsewaPayment,
    getLatestPendingPaymentRow,
    resolveUserSubscription
} = require("../utils/subscriptionAccess");

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

function isRefreshRequest(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

function mapPendingPayment(paymentRow) {
    if (!paymentRow) return null;

    return {
        transactionUuid: paymentRow.transaction_uuid,
        status: paymentRow.status,
        totalAmount: Number(paymentRow.total_amount || 0),
        createdAt: paymentRow.created_at,
        expiresAt: paymentRow.expires_at
    };
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

async function getSubscriptionSnapshot(userId, { refreshPending = false } = {}) {
    await ensurePremiumSchema(pool);
    await expireStalePendingPayments(pool, userId);

    const subscription = await resolveUserSubscription(pool, userId, { refreshPending });
    const pendingPayment = subscription ? null : await getLatestPendingPaymentRow(pool, userId);

    return {
        subscription: subscription ? mapSubscriptionStatus(subscription) : mapSubscriptionStatus(null),
        pendingPayment: mapPendingPayment(pendingPayment)
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
        const snapshot = await getSubscriptionSnapshot(req.user.id, {
            refreshPending: isRefreshRequest(req.query?.refresh)
        });

        res.json(snapshot);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load subscription status" });
    }
});

router.get("/history", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        const result = await pool.query(
            `SELECT
                sp.name AS "planName",
                sp.code AS "planCode",
                sp.price_label AS "priceLabel",
                py.transaction_uuid AS "transactionUuid",
                py.status,
                py.total_amount AS "totalAmount",
                py.provider,
                py.provider_ref AS "providerRef",
                py.created_at AS "createdAt",
                py.updated_at AS "updatedAt",
                py.paid_at AS "paidAt",
                py.expires_at AS "expiresAt"
             FROM subscription_payments py
             JOIN subscription_plans sp ON sp.id = py.plan_id
             WHERE py.user_id = $1
             ORDER BY py.created_at DESC, py.id DESC
             LIMIT 12`,
            [req.user.id]
        );

        res.json({
            payments: result.rows.map((row) => ({
                ...row,
                totalAmount: Number(row.totalAmount || 0)
            }))
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load subscription history" });
    }
});

router.post("/esewa/initiate", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        if (!isEsewaConfigured()) {
            return res.status(500).json({ error: "eSewa is not configured on the server yet." });
        }

        await expireStalePendingPayments(pool, req.user.id);

        const activeSubscription = await resolveUserSubscription(pool, req.user.id, { refreshPending: true });
        if (activeSubscription) {
            return res.status(409).json({
                error: "Premium is already active on this account.",
                subscription: mapSubscriptionStatus(activeSubscription)
            });
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
        const existingPendingPayment = await getLatestPendingPaymentRow(pool, req.user.id);
        if (existingPendingPayment) {
            return res.status(409).json({
                error: "A premium payment is already pending verification. Refresh its status or cancel it before starting a new one.",
                pendingPayment: mapPendingPayment(existingPendingPayment)
            });
        }

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

        const result = await finalizeEsewaPayment(pool, payment, decodedData);
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

        const cancelledSubscriptions = await pool.query(
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

        const cancelledPayments = await pool.query(
            `UPDATE subscription_payments
             SET status = 'cancelled',
                 updated_at = NOW()
             WHERE user_id = $1
               AND status = 'pending'
             RETURNING id`,
            [req.user.id]
        );

        const cancelledAny = cancelledSubscriptions.rowCount > 0 || cancelledPayments.rowCount > 0;
        const message = cancelledSubscriptions.rowCount > 0
            ? "Premium access cancelled"
            : cancelledPayments.rowCount > 0
                ? "Pending premium payment cancelled"
                : "No active or pending premium access was found";

        res.json({
            cancelled: cancelledAny,
            cancelledSubscription: cancelledSubscriptions.rowCount > 0,
            cancelledPendingPayment: cancelledPayments.rowCount > 0,
            message,
            subscription: mapSubscriptionStatus(null)
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to cancel premium access" });
    }
});

module.exports = router;
