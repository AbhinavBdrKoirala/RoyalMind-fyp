const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const { getJwtSecret } = require("../utils/jwt");
const {
    normalizeEmail,
    sanitizeSettings,
    validateEmailChangeConfirmPayload,
    validateEmailChangeRequestPayload,
    validateLoginPayload,
    validatePasswordResetConfirmPayload,
    validatePasswordResetRequestPayload,
    validateRegisterPayload,
    validateSettingsPayload,
    validateVerificationCode
} = require("../utils/validation");
const {
    generateVerificationCode,
    hashVerificationCode,
    sendPasswordResetEmail,
    sendPendingEmailVerification,
    sendVerificationEmail
} = require("../utils/verification");
const {
    cleanupExpiredAuthState,
    ensureAuthSchema,
    logAuthEvent
} = require("../utils/authStore");
const {
    createRateLimiter,
    getClientIp
} = require("../utils/authSecurity");

const router = express.Router();

const registerLimiter = createRateLimiter({
    name: "register",
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many registration attempts. Please wait 15 minutes and try again."
});

const loginLimiter = createRateLimiter({
    name: "login",
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: "Too many login attempts. Please wait 10 minutes and try again."
});

const verificationLimiter = createRateLimiter({
    name: "verify-registration",
    windowMs: 10 * 60 * 1000,
    max: 8,
    message: "Too many verification attempts. Please wait a few minutes and try again."
});

const resendLimiter = createRateLimiter({
    name: "resend-verification",
    windowMs: 10 * 60 * 1000,
    max: 3,
    message: "Too many code requests. Please wait 10 minutes before requesting another code."
});

const forgotPasswordLimiter = createRateLimiter({
    name: "forgot-password",
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: "Too many password reset requests. Please wait 15 minutes and try again."
});

const resetPasswordLimiter = createRateLimiter({
    name: "reset-password",
    windowMs: 15 * 60 * 1000,
    max: 6,
    message: "Too many password reset attempts. Please wait 15 minutes and try again."
});

const changeEmailRequestLimiter = createRateLimiter({
    name: "change-email-request",
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: "Too many email change requests. Please wait 15 minutes and try again."
});

const changeEmailConfirmLimiter = createRateLimiter({
    name: "change-email-confirm",
    windowMs: 10 * 60 * 1000,
    max: 6,
    message: "Too many email confirmation attempts. Please wait a few minutes and try again."
});

function getDisplayName(row) {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return row.display_name || row.username || fullName || row.email;
}

function buildUserPayload(row) {
    const settingsResult = sanitizeSettings(row.settings || {});

    return {
        id: row.id,
        email: row.email,
        username: row.username,
        phone: row.phone_normalized || row.phone,
        country: row.country,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: getDisplayName(row),
        settings: settingsResult.ok ? settingsResult.value : {}
    };
}

function getRequestMeta(req) {
    return {
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || ""
    };
}

function buildCodeDeliveryResponse({
    email,
    code,
    delivery,
    extra = {}
}) {
    return {
        email,
        deliveryMethod: delivery.delivered ? delivery.mode : "dev",
        ...(delivery.delivered ? {} : { devVerificationCode: code }),
        ...extra
    };
}

function getMailErrorMessage(error, fallbackMessage) {
    if (error.code === "EMAIL_NOT_CONFIGURED") {
        return "Email delivery is not configured on the server. Add Gmail or SMTP credentials before using this feature.";
    }
    if (error.code === "EAUTH" || error.responseCode === 535) {
        return "Gmail rejected the sign-in. Check GMAIL_USER and the Gmail app password in server/.env.";
    }
    if (["EACCES", "ECONNECTION", "ESOCKET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"].includes(error.code)) {
        return "Could not connect to Gmail SMTP. Check internet access, firewall rules, or Gmail SMTP settings.";
    }

    return fallbackMessage;
}

function buildDuplicateMessage(conflicts) {
    if (conflicts.has("email")) return "An account with this email already exists.";
    if (conflicts.has("phone")) return "This phone number is already linked to another account.";
    if (conflicts.has("username")) return "This username is already taken.";
    return "Email, phone number, or username already exists.";
}

function buildPendingConflictMessage(conflicts) {
    if (conflicts.has("email")) return "This email is already waiting for verification.";
    if (conflicts.has("phone")) return "This phone number is already waiting for verification.";
    if (conflicts.has("username")) return "This username is already reserved by an account waiting for verification.";
    return "An account with this email, phone number, or username is already waiting for verification.";
}

function getConflictSet(rows, { email, phone, username, excludeUserId = null, includePendingEmail = false }) {
    const conflicts = new Set();

    rows.forEach((row) => {
        if (excludeUserId && row.id === excludeUserId) return;
        if (email && row.email?.toLowerCase() === email.toLowerCase()) conflicts.add("email");
        if (includePendingEmail && email && row.pending_email?.toLowerCase() === email.toLowerCase()) conflicts.add("email");
        if (phone && row.phone_normalized === phone) conflicts.add("phone");
        if (username && row.username === username) conflicts.add("username");
    });

    return conflicts;
}

function issueAuthToken(userId) {
    return jwt.sign({ id: userId }, getJwtSecret(), { expiresIn: "1h" });
}

async function touchCleanup() {
    try {
        await cleanupExpiredAuthState();
    } catch (error) {
        console.warn("Auth cleanup failed:", error.message);
    }
}

async function sendRegistrationVerification(userRow) {
    const code = generateVerificationCode();
    const hashedCode = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000));

    const updated = await pool.query(
        `UPDATE users
         SET verification_code_hash = $1,
             verification_code_expires_at = $2,
             verification_sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [hashedCode, expiresAt, userRow.id]
    );

    const row = updated.rows[0];
    const delivery = await sendVerificationEmail({
        email: row.email,
        displayName: getDisplayName(row),
        code
    });

    return buildCodeDeliveryResponse({
        email: row.email,
        code,
        delivery,
        extra: {
            requiresVerification: true,
            phone: row.phone_normalized || row.phone,
            country: row.country || "Nepal"
        }
    });
}

async function sendPasswordResetCode(userRow) {
    const code = generateVerificationCode();
    const hashedCode = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000));

    const updated = await pool.query(
        `UPDATE users
         SET password_reset_code_hash = $1,
             password_reset_expires_at = $2,
             password_reset_sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [hashedCode, expiresAt, userRow.id]
    );

    const row = updated.rows[0];
    const delivery = await sendPasswordResetEmail({
        email: row.email,
        displayName: getDisplayName(row),
        code
    });

    return buildCodeDeliveryResponse({
        email: row.email,
        code,
        delivery
    });
}

async function sendEmailChangeCode(userRow, nextEmail) {
    const code = generateVerificationCode();
    const hashedCode = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000));

    const updated = await pool.query(
        `UPDATE users
         SET pending_email = $1,
             pending_email_code_hash = $2,
             pending_email_expires_at = $3,
             pending_email_sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [nextEmail, hashedCode, expiresAt, userRow.id]
    );

    const row = updated.rows[0];
    const delivery = await sendPendingEmailVerification({
        email: nextEmail,
        displayName: getDisplayName(row),
        code
    });

    return buildCodeDeliveryResponse({
        email: nextEmail,
        code,
        delivery,
        extra: { pendingEmail: nextEmail }
    });
}

router.post("/register", registerLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        const validation = validateRegisterPayload(req.body);
        if (!validation.ok) {
            await logAuthEvent({
                email: normalizeEmail(req.body?.email),
                action: "register",
                status: "rejected",
                ...meta,
                details: { reason: validation.error }
            });
            return res.status(400).json({ error: validation.error });
        }

        const {
            firstName,
            lastName,
            username,
            phone,
            country,
            email,
            password,
            displayName
        } = validation.value;

        await ensureAuthSchema();
        await touchCleanup();

        const conflictingUsers = await pool.query(
            `SELECT *
             FROM users
             WHERE LOWER(email) = LOWER($1)
                OR phone_normalized = $2
                OR username = $3`,
            [email, phone, username]
        );

        const exactConflicts = getConflictSet(conflictingUsers.rows, { email, phone, username });
        const verifiedConflict = conflictingUsers.rows.some((row) => row.is_verified === true && (
            row.email?.toLowerCase() === email.toLowerCase() ||
            row.phone_normalized === phone ||
            row.username === username
        ));

        if (verifiedConflict) {
            const errorMessage = buildDuplicateMessage(exactConflicts);
            await logAuthEvent({
                email,
                action: "register",
                status: "rejected",
                ...meta,
                details: { reason: errorMessage }
            });
            return res.status(400).json({ error: errorMessage });
        }

        const unverifiedMatches = conflictingUsers.rows.filter((row) => row.is_verified !== true && (
            row.email?.toLowerCase() === email.toLowerCase() ||
            row.phone_normalized === phone ||
            row.username === username
        ));

        const distinctUnverifiedIds = [...new Set(unverifiedMatches.map((row) => row.id))];
        if (distinctUnverifiedIds.length > 1) {
            const errorMessage = buildPendingConflictMessage(exactConflicts);
            await logAuthEvent({
                email,
                action: "register",
                status: "rejected",
                ...meta,
                details: { reason: errorMessage }
            });
            return res.status(400).json({ error: errorMessage });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        let userRow;

        if (unverifiedMatches[0]) {
            const updated = await pool.query(
                `UPDATE users
                 SET first_name = $1,
                     last_name = $2,
                     username = $3,
                     phone = $4,
                     phone_normalized = $5,
                     country = $6,
                     email = $7,
                     password = $8,
                     display_name = $9,
                     settings = COALESCE(settings, '{}'::jsonb),
                     pending_email = NULL,
                     pending_email_code_hash = NULL,
                     pending_email_expires_at = NULL,
                     pending_email_sent_at = NULL,
                     updated_at = NOW()
                 WHERE id = $10
                 RETURNING *`,
                [firstName, lastName, username, phone, phone, country, email, hashedPassword, displayName, unverifiedMatches[0].id]
            );
            userRow = updated.rows[0];
        } else {
            const inserted = await pool.query(
                `INSERT INTO users (
                    first_name, last_name, username, phone, phone_normalized, country, email, password,
                    display_name, settings, is_verified
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, FALSE)
                 RETURNING *`,
                [firstName, lastName, username, phone, phone, country, email, hashedPassword, displayName, JSON.stringify({})]
            );
            userRow = inserted.rows[0];
        }

        const verificationResponse = await sendRegistrationVerification(userRow);
        await logAuthEvent({
            userId: userRow.id,
            email,
            action: "register",
            status: "success",
            ...meta,
            details: { deliveryMethod: verificationResponse.deliveryMethod }
        });

        return res.status(201).json({
            message: "Verification code sent",
            ...verificationResponse
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            email: normalizeEmail(req.body?.email),
            action: "register",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });

        if (error.code === "28P01") {
            return res.status(500).json({ error: "Database authentication failed. Check DB_USER/DB_PASSWORD." });
        }
        if (error.code === "3D000") {
            return res.status(500).json({ error: "Database not found. Check DB_NAME in server/.env." });
        }
        if (error.code === "ECONNREFUSED") {
            return res.status(500).json({ error: "Database connection refused. Ensure PostgreSQL is running." });
        }

        return res.status(500).json({ error: getMailErrorMessage(error, "Registration failed. Please try again.") });
    }
});

router.post("/login", loginLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        const validation = validateLoginPayload(req.body);
        if (!validation.ok) {
            await logAuthEvent({
                email: normalizeEmail(req.body?.email),
                action: "login",
                status: "rejected",
                ...meta,
                details: { reason: validation.error }
            });
            return res.status(400).json({ error: validation.error });
        }

        const { email, password } = validation.value;

        await ensureAuthSchema();

        const user = await pool.query(
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
            [email]
        );

        if (user.rows.length === 0) {
            await logAuthEvent({
                email,
                action: "login",
                status: "rejected",
                ...meta,
                details: { reason: "unknown_email" }
            });
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const row = user.rows[0];
        if (row.is_verified !== true) {
            await logAuthEvent({
                userId: row.id,
                email: row.email,
                action: "login",
                status: "rejected",
                ...meta,
                details: { reason: "email_not_verified" }
            });
            return res.status(403).json({
                error: "Please verify your email before logging in",
                requiresVerification: true,
                email: row.email
            });
        }

        const validPassword = await bcrypt.compare(password, row.password);
        if (!validPassword) {
            await logAuthEvent({
                userId: row.id,
                email: row.email,
                action: "login",
                status: "rejected",
                ...meta,
                details: { reason: "wrong_password" }
            });
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = issueAuthToken(row.id);
        await pool.query(
            `UPDATE users SET updated_at = NOW() WHERE id = $1`,
            [row.id]
        );

        await logAuthEvent({
            userId: row.id,
            email: row.email,
            action: "login",
            status: "success",
            ...meta
        });

        return res.json({
            token,
            user: buildUserPayload(row)
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            email: normalizeEmail(req.body?.email),
            action: "login",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: "Server error" });
    }
});

router.post("/verify-registration", verificationLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        await ensureAuthSchema();

        const email = normalizeEmail(req.body?.email);
        const codeResult = validateVerificationCode(req.body?.code);
        if (!email || !codeResult.ok) {
            return res.status(400).json({ error: !email ? "Email is required" : codeResult.error });
        }

        const user = await pool.query(
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
            [email]
        );

        if (user.rows.length === 0) {
            await logAuthEvent({
                email,
                action: "verify_registration",
                status: "rejected",
                ...meta,
                details: { reason: "account_not_found" }
            });
            return res.status(404).json({ error: "Account not found" });
        }

        const row = user.rows[0];
        if (row.is_verified === true) {
            const token = issueAuthToken(row.id);
            return res.json({
                message: "Account already verified",
                token,
                user: buildUserPayload(row)
            });
        }

        if (!row.verification_code_hash || !row.verification_code_expires_at) {
            return res.status(400).json({ error: "No verification code is available. Please request a new one." });
        }

        const expectedHash = hashVerificationCode(codeResult.value);
        const expiresAt = new Date(row.verification_code_expires_at);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            await logAuthEvent({
                userId: row.id,
                email: row.email,
                action: "verify_registration",
                status: "rejected",
                ...meta,
                details: { reason: "expired_code" }
            });
            return res.status(400).json({ error: "Verification code expired. Please request a new one." });
        }

        if (expectedHash !== row.verification_code_hash) {
            await logAuthEvent({
                userId: row.id,
                email: row.email,
                action: "verify_registration",
                status: "rejected",
                ...meta,
                details: { reason: "invalid_code" }
            });
            return res.status(400).json({ error: "Invalid verification code" });
        }

        const verified = await pool.query(
            `UPDATE users
             SET is_verified = TRUE,
                 verified_at = NOW(),
                 verification_code_hash = NULL,
                 verification_code_expires_at = NULL,
                 verification_sent_at = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [row.id]
        );

        const token = issueAuthToken(verified.rows[0].id);
        await logAuthEvent({
            userId: verified.rows[0].id,
            email: verified.rows[0].email,
            action: "verify_registration",
            status: "success",
            ...meta
        });

        return res.json({
            message: "Account verified successfully",
            token,
            user: buildUserPayload(verified.rows[0])
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            email: normalizeEmail(req.body?.email),
            action: "verify_registration",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: "Verification failed. Please try again." });
    }
});

router.post("/resend-verification", resendLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        await ensureAuthSchema();

        const email = normalizeEmail(req.body?.email);
        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const user = await pool.query(
            `SELECT *
             FROM users
             WHERE LOWER(email) = LOWER($1)
             LIMIT 1`,
            [email]
        );

        if (user.rows.length === 0) {
            await logAuthEvent({
                email,
                action: "resend_verification",
                status: "rejected",
                ...meta,
                details: { reason: "account_not_found" }
            });
            return res.status(404).json({ error: "Account not found" });
        }

        const row = user.rows[0];
        if (row.is_verified === true) {
            return res.status(400).json({ error: "Account is already verified" });
        }

        const verificationResponse = await sendRegistrationVerification(row);
        await logAuthEvent({
            userId: row.id,
            email: row.email,
            action: "resend_verification",
            status: "success",
            ...meta,
            details: { deliveryMethod: verificationResponse.deliveryMethod }
        });

        return res.json({
            message: "Verification code sent",
            ...verificationResponse
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            email: normalizeEmail(req.body?.email),
            action: "resend_verification",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: getMailErrorMessage(error, "Unable to resend verification code") });
    }
});

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        await ensureAuthSchema();
        const validation = validatePasswordResetRequestPayload(req.body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const { email } = validation.value;
        const result = await pool.query(
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
            [email]
        );

        const genericMessage = "If an account exists for that email, a password reset code has been sent.";
        if (result.rows.length === 0 || result.rows[0].is_verified !== true) {
            await logAuthEvent({
                email,
                action: "forgot_password",
                status: "success",
                ...meta,
                details: { sent: false }
            });
            return res.json({ message: genericMessage });
        }

        const payload = await sendPasswordResetCode(result.rows[0]);
        await logAuthEvent({
            userId: result.rows[0].id,
            email: result.rows[0].email,
            action: "forgot_password",
            status: "success",
            ...meta,
            details: { deliveryMethod: payload.deliveryMethod }
        });

        return res.json({
            message: genericMessage,
            ...payload
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            email: normalizeEmail(req.body?.email),
            action: "forgot_password",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: getMailErrorMessage(error, "Unable to send the password reset code right now.") });
    }
});

router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        await ensureAuthSchema();
        const validation = validatePasswordResetConfirmPayload(req.body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const { email, code, newPassword } = validation.value;
        const result = await pool.query(
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
            [email]
        );

        if (result.rows.length === 0) {
            await logAuthEvent({
                email,
                action: "reset_password",
                status: "rejected",
                ...meta,
                details: { reason: "account_not_found" }
            });
            return res.status(404).json({ error: "Account not found" });
        }

        const row = result.rows[0];
        if (!row.password_reset_code_hash || !row.password_reset_expires_at) {
            return res.status(400).json({ error: "No password reset code is available. Request a new reset code first." });
        }

        const expectedHash = hashVerificationCode(code);
        const expiresAt = new Date(row.password_reset_expires_at);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ error: "Password reset code expired. Request a new reset code." });
        }

        if (expectedHash !== row.password_reset_code_hash) {
            await logAuthEvent({
                userId: row.id,
                email: row.email,
                action: "reset_password",
                status: "rejected",
                ...meta,
                details: { reason: "invalid_code" }
            });
            return res.status(400).json({ error: "Invalid password reset code" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(
            `UPDATE users
             SET password = $1,
                 password_reset_code_hash = NULL,
                 password_reset_expires_at = NULL,
                 password_reset_sent_at = NULL,
                 updated_at = NOW()
             WHERE id = $2`,
            [hashedPassword, row.id]
        );

        await logAuthEvent({
            userId: row.id,
            email: row.email,
            action: "reset_password",
            status: "success",
            ...meta
        });

        return res.json({
            message: "Password reset successful. You can log in with the new password now."
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            email: normalizeEmail(req.body?.email),
            action: "reset_password",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: "Unable to reset the password right now." });
    }
});

router.post("/change-email/request", authenticateToken, changeEmailRequestLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        await ensureAuthSchema();
        const validation = validateEmailChangeRequestPayload(req.body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const { newEmail, password } = validation.value;
        const currentUser = await pool.query(
            "SELECT * FROM users WHERE id = $1 LIMIT 1",
            [req.user.id]
        );

        if (currentUser.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const row = currentUser.rows[0];
        if (row.email?.toLowerCase() === newEmail) {
            return res.status(400).json({ error: "That email is already on your account." });
        }

        const validPassword = await bcrypt.compare(password, row.password);
        if (!validPassword) {
            await logAuthEvent({
                userId: row.id,
                email: row.email,
                action: "change_email_request",
                status: "rejected",
                ...meta,
                details: { reason: "wrong_password" }
            });
            return res.status(400).json({ error: "Current password is incorrect." });
        }

        const conflicts = await pool.query(
            `SELECT id, email, pending_email
             FROM users
             WHERE LOWER(email) = LOWER($1)
                OR LOWER(COALESCE(pending_email, '')) = LOWER($1)`,
            [newEmail]
        );

        const conflictSet = getConflictSet(conflicts.rows, {
            email: newEmail,
            excludeUserId: row.id,
            includePendingEmail: true
        });

        if (conflictSet.has("email")) {
            return res.status(400).json({ error: "That email is already in use or waiting for confirmation on another account." });
        }

        const payload = await sendEmailChangeCode(row, newEmail);
        await logAuthEvent({
            userId: row.id,
            email: row.email,
            action: "change_email_request",
            status: "success",
            ...meta,
            details: { nextEmail: newEmail, deliveryMethod: payload.deliveryMethod }
        });

        return res.json({
            message: "A confirmation code has been sent to your new email address.",
            ...payload
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            userId: req.user?.id || null,
            action: "change_email_request",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: getMailErrorMessage(error, "Unable to send the email change code right now.") });
    }
});

router.post("/change-email/resend", authenticateToken, changeEmailRequestLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        await ensureAuthSchema();
        const currentUser = await pool.query(
            "SELECT * FROM users WHERE id = $1 LIMIT 1",
            [req.user.id]
        );

        if (currentUser.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const row = currentUser.rows[0];
        if (!row.pending_email) {
            return res.status(400).json({ error: "There is no pending email change to resend." });
        }

        const payload = await sendEmailChangeCode(row, row.pending_email);
        await logAuthEvent({
            userId: row.id,
            email: row.email,
            action: "change_email_resend",
            status: "success",
            ...meta,
            details: { nextEmail: row.pending_email, deliveryMethod: payload.deliveryMethod }
        });

        return res.json({
            message: "A fresh confirmation code has been sent to your new email address.",
            ...payload
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            userId: req.user?.id || null,
            action: "change_email_resend",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: getMailErrorMessage(error, "Unable to resend the email change code right now.") });
    }
});

router.post("/change-email/confirm", authenticateToken, changeEmailConfirmLimiter, async (req, res) => {
    const meta = getRequestMeta(req);

    try {
        await ensureAuthSchema();
        const validation = validateEmailChangeConfirmPayload(req.body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const user = await pool.query(
            "SELECT * FROM users WHERE id = $1 LIMIT 1",
            [req.user.id]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const row = user.rows[0];
        if (!row.pending_email || !row.pending_email_code_hash || !row.pending_email_expires_at) {
            return res.status(400).json({ error: "No pending email change was found." });
        }

        const expectedHash = hashVerificationCode(validation.value.code);
        const expiresAt = new Date(row.pending_email_expires_at);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ error: "Email change code expired. Request a new confirmation code." });
        }

        if (expectedHash !== row.pending_email_code_hash) {
            await logAuthEvent({
                userId: row.id,
                email: row.email,
                action: "change_email_confirm",
                status: "rejected",
                ...meta,
                details: { reason: "invalid_code", nextEmail: row.pending_email }
            });
            return res.status(400).json({ error: "Invalid email change code" });
        }

        const conflicts = await pool.query(
            `SELECT id, email, pending_email
             FROM users
             WHERE LOWER(email) = LOWER($1)
                OR LOWER(COALESCE(pending_email, '')) = LOWER($1)`,
            [row.pending_email]
        );

        const conflictSet = getConflictSet(conflicts.rows, {
            email: row.pending_email,
            excludeUserId: row.id,
            includePendingEmail: true
        });

        if (conflictSet.has("email")) {
            return res.status(400).json({ error: "That email is already in use on another account." });
        }

        const updated = await pool.query(
            `UPDATE users
             SET email = pending_email,
                 pending_email = NULL,
                 pending_email_code_hash = NULL,
                 pending_email_expires_at = NULL,
                 pending_email_sent_at = NULL,
                 is_verified = TRUE,
                 verified_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [row.id]
        );

        await logAuthEvent({
            userId: row.id,
            email: updated.rows[0].email,
            action: "change_email_confirm",
            status: "success",
            ...meta
        });

        return res.json({
            message: "Email address updated successfully.",
            user: buildUserPayload(updated.rows[0])
        });
    } catch (error) {
        console.error(error);
        await logAuthEvent({
            userId: req.user?.id || null,
            action: "change_email_confirm",
            status: "error",
            ...meta,
            details: { code: error.code || "", message: error.message }
        });
        return res.status(500).json({ error: "Unable to confirm the new email address right now." });
    }
});

router.get("/me", authenticateToken, async (req, res) => {
    try {
        await ensureAuthSchema();

        const result = await pool.query(
            "SELECT * FROM users WHERE id = $1",
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        return res.json({ user: buildUserPayload(result.rows[0]) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Unable to load user profile" });
    }
});

router.put("/settings", authenticateToken, async (req, res) => {
    try {
        await ensureAuthSchema();

        const validation = validateSettingsPayload(req.body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const requestedDisplayName = validation.value.displayName;
        const requestedSettings = validation.value.settings;

        const existing = await pool.query(
            "SELECT * FROM users WHERE id = $1",
            [req.user.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const currentUser = existing.rows[0];
        const nextDisplayName = requestedDisplayName || getDisplayName(currentUser);
        const currentSettings = sanitizeSettings(currentUser.settings || {});
        const nextSettings = {
            ...(currentSettings.ok ? currentSettings.value : {}),
            ...requestedSettings
        };

        const updated = await pool.query(
            `UPDATE users
             SET display_name = $1,
                 settings = $2::jsonb,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [nextDisplayName, JSON.stringify(nextSettings), req.user.id]
        );

        return res.json({
            message: "Settings saved successfully",
            user: buildUserPayload(updated.rows[0])
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Unable to save settings" });
    }
});

module.exports = router;
