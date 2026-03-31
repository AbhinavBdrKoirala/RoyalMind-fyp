const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const {
    ensurePremiumSchema,
    getActiveSubscription,
    mapSubscriptionStatus
} = require("../utils/premiumData");

const router = express.Router();

router.get("/plans", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        const plans = await pool.query(
            `SELECT id, code, name, price_label AS "priceLabel", billing_period AS "billingPeriod", description
             FROM subscription_plans
             WHERE is_active = TRUE
             ORDER BY id ASC`
        );

        res.json({ plans: plans.rows });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load subscription plans" });
    }
});

router.get("/me", authenticateToken, async (req, res) => {
    try {
        const subscription = await getActiveSubscription(pool, req.user.id);
        res.json({ subscription: mapSubscriptionStatus(subscription) });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load subscription status" });
    }
});

router.post("/activate", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        const planResult = await pool.query(
            `SELECT id FROM subscription_plans WHERE code = 'premium-monthly' LIMIT 1`
        );

        if (planResult.rows.length === 0) {
            return res.status(500).json({ error: "Premium plan is not configured" });
        }

        await pool.query(
            `UPDATE user_subscriptions
             SET status = 'cancelled',
                 updated_at = NOW()
             WHERE user_id = $1
               AND status = 'active'`,
            [req.user.id]
        );

        const activated = await pool.query(
            `INSERT INTO user_subscriptions (user_id, plan_id, status, provider, provider_ref, started_at, expires_at, created_at, updated_at)
             VALUES ($1, $2, 'active', 'manual', $3, NOW(), NOW() + INTERVAL '30 days', NOW(), NOW())
             RETURNING *`,
            [req.user.id, planResult.rows[0].id, `manual-${req.user.id}-${Date.now()}`]
        );

        res.json({
            message: "Premium access activated",
            subscription: mapSubscriptionStatus({
                ...activated.rows[0],
                plan_name: "Premium",
                plan_code: "premium-monthly",
                price_label: "$4.99 / month",
                billing_period: "monthly",
                description: "Unlock premium puzzles and curated YouTube lesson collections."
            })
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to activate premium access" });
    }
});

router.delete("/me", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);

        await pool.query(
            `UPDATE user_subscriptions
             SET status = 'cancelled',
                 updated_at = NOW()
             WHERE user_id = $1
               AND status = 'active'`,
            [req.user.id]
        );

        res.json({
            message: "Premium access cancelled",
            subscription: mapSubscriptionStatus(null)
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to cancel premium access" });
    }
});

module.exports = router;
