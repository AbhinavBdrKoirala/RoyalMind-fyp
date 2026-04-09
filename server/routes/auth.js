const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const { getJwtSecret } = require('../utils/jwt');
const {
    normalizeNepalPhone,
    sanitizeSettings,
    validateLoginPayload,
    validateRegisterPayload,
    validateSettingsPayload
} = require('../utils/validation');
const {
    generateVerificationCode,
    hashVerificationCode,
    sendVerificationEmail
} = require("../utils/verification");

const router = express.Router();
let userSchemaEnsured = false;

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

function buildVerificationResponse(row, delivery, code) {
    return {
        requiresVerification: true,
        email: row.email,
        phone: row.phone_normalized || row.phone,
        country: row.country || "Nepal",
        deliveryMethod: delivery.delivered ? delivery.mode : "dev",
        ...(delivery.delivered ? {} : { devVerificationCode: code })
    };
}

async function sendAndStoreVerificationCode(userRow) {
    const code = generateVerificationCode();
    const hashedCode = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000));

    const updated = await pool.query(
        `UPDATE users
         SET verification_code_hash = $1,
             verification_code_expires_at = $2,
             verification_sent_at = NOW()
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

    return buildVerificationResponse(row, delivery, code);
}

async function ensureUserColumns() {
    if (userSchemaEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            first_name VARCHAR(80),
            last_name VARCHAR(80),
            username VARCHAR(40),
            phone VARCHAR(25),
            country VARCHAR(80),
            email VARCHAR(255) NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone_normalized VARCHAR(20),
            is_verified BOOLEAN DEFAULT FALSE,
            verification_code_hash VARCHAR(255),
            verification_code_expires_at TIMESTAMP,
            verification_sent_at TIMESTAMP,
            verified_at TIMESTAMP,
            display_name VARCHAR(120),
            settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS first_name VARCHAR(80),
        ADD COLUMN IF NOT EXISTS last_name VARCHAR(80),
        ADD COLUMN IF NOT EXISTS username VARCHAR(40),
        ADD COLUMN IF NOT EXISTS phone VARCHAR(25),
        ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(20),
        ADD COLUMN IF NOT EXISTS country VARCHAR(80),
        ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS verification_code_hash VARCHAR(255),
        ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS display_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb
    `);

    await pool.query(`
        UPDATE users
        SET phone_normalized = phone
        WHERE phone_normalized IS NULL
          AND phone IS NOT NULL
          AND phone LIKE '+977%'
    `);

    await pool.query(`
        UPDATE users
        SET is_verified = TRUE,
            verified_at = COALESCE(verified_at, created_at)
        WHERE verification_code_hash IS NULL
          AND (is_verified IS NULL OR is_verified = FALSE)
    `);

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (LOWER(email))`);
    } catch (emailConstraintError) {
        // Ignore if it already exists or cannot be added due to legacy data.
    }

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username)`);
    } catch (indexError) {
        // Keep registration functional even if legacy duplicate usernames block index creation.
        console.warn("Skipping users_username_key index creation:", indexError.message);
    }
    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_phone_normalized_key ON users (phone_normalized) WHERE phone_normalized IS NOT NULL`);
    } catch (phoneIndexError) {
        console.warn("Skipping users_phone_normalized_key index creation:", phoneIndexError.message);
    }
    userSchemaEnsured = true;
}

// REGISTER
router.post('/register', async (req, res) => {
    try {
        const validation = validateRegisterPayload(req.body);
        if (!validation.ok) {
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

        await ensureUserColumns();

        const conflictingUser = await pool.query(
            `SELECT *
             FROM users
             WHERE LOWER(email) = LOWER($1)
                OR phone_normalized = $2
                OR username = $3`,
            [email, phone, username]
        );

        const exactConflicts = conflictingUser.rows.filter((row) => (
            row.email.toLowerCase() === email.toLowerCase() ||
            row.phone_normalized === phone ||
            row.username === username
        ));

        const verifiedConflict = exactConflicts.find((row) => row.is_verified === true);

        if (verifiedConflict) {
            return res.status(400).json({ error: "Email, phone number, or username already exists" });
        }

        const unverifiedConflicts = exactConflicts.filter((row) => row.is_verified !== true);
        const distinctUnverifiedIds = [...new Set(unverifiedConflicts.map((row) => row.id))];

        if (distinctUnverifiedIds.length > 1) {
            return res.status(400).json({
                error: "An account with this email, phone number, or username is already waiting for verification"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const existingUnverified = unverifiedConflicts[0];

        let userRow;
        if (existingUnverified) {
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
                     settings = COALESCE(settings, '{}'::jsonb)
                 WHERE id = $10
                 RETURNING *`,
                [
                    firstName,
                    lastName,
                    username,
                    phone,
                    phone,
                    country,
                    email,
                    hashedPassword,
                    displayName,
                    existingUnverified.id
                ]
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

        const verificationResponse = await sendAndStoreVerificationCode(userRow);
        res.status(201).json({
            message: "Verification code sent",
            ...verificationResponse
        });

    } catch (error) {
        console.error(error);
        if (error.code === '28P01') {
            return res.status(500).json({ error: "Database authentication failed. Check DB_USER/DB_PASSWORD." });
        }
        if (error.code === '3D000') {
            return res.status(500).json({ error: "Database not found. Check DB_NAME in server/.env." });
        }
        if (error.code === 'ECONNREFUSED') {
            return res.status(500).json({ error: "Database connection refused. Ensure PostgreSQL is running." });
        }
        res.status(500).json({ error: "Registration failed. Please try again." });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    try {
        const validation = validateLoginPayload(req.body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const { email, password } = validation.value;

        await ensureUserColumns();

        const user = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        if (user.rows[0].is_verified !== true) {
            return res.status(403).json({
                error: "Please verify your email before logging in",
                requiresVerification: true,
                email: user.rows[0].email
            });
        }

        const validPassword = await bcrypt.compare(password, user.rows[0].password);

        if (!validPassword) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.rows[0].id },
            getJwtSecret(),
            { expiresIn: '1h' }
        );

        res.json({
            token,
            user: buildUserPayload(user.rows[0])
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

router.post('/verify-registration', async (req, res) => {
    try {
        await ensureUserColumns();

        const email = String(req.body?.email || "").trim().toLowerCase();
        const code = String(req.body?.code || "").trim();

        if (!email || !code) {
            return res.status(400).json({ error: "Email and verification code are required" });
        }

        const user = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
            [email]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: "Account not found" });
        }

        const row = user.rows[0];
        if (row.is_verified === true) {
            const token = jwt.sign(
                { id: row.id },
                getJwtSecret(),
                { expiresIn: '1h' }
            );

            return res.json({
                message: "Account already verified",
                token,
                user: buildUserPayload(row)
            });
        }

        if (!row.verification_code_hash || !row.verification_code_expires_at) {
            return res.status(400).json({ error: "No verification code is available. Please request a new one." });
        }

        const expectedHash = hashVerificationCode(code);
        const expiresAt = new Date(row.verification_code_expires_at);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ error: "Verification code expired. Please request a new one." });
        }

        if (expectedHash !== row.verification_code_hash) {
            return res.status(400).json({ error: "Invalid verification code" });
        }

        const verified = await pool.query(
            `UPDATE users
             SET is_verified = TRUE,
                 verified_at = NOW(),
                 verification_code_hash = NULL,
                 verification_code_expires_at = NULL,
                 verification_sent_at = NULL
             WHERE id = $1
             RETURNING *`,
            [row.id]
        );

        const token = jwt.sign(
            { id: verified.rows[0].id },
            getJwtSecret(),
            { expiresIn: '1h' }
        );

        res.json({
            message: "Account verified successfully",
            token,
            user: buildUserPayload(verified.rows[0])
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Verification failed. Please try again." });
    }
});

router.post('/resend-verification', async (req, res) => {
    try {
        await ensureUserColumns();

        const email = String(req.body?.email || "").trim().toLowerCase();
        const phone = normalizeNepalPhone(req.body?.phone);

        if (!email && !phone) {
            return res.status(400).json({ error: "Email or phone number is required" });
        }

        const user = await pool.query(
            `SELECT *
             FROM users
             WHERE ($1 <> '' AND LOWER(email) = LOWER($1))
                OR ($2 <> '' AND phone_normalized = $2)
             LIMIT 1`,
            [email || "", phone || ""]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: "Account not found" });
        }

        const row = user.rows[0];
        if (row.is_verified === true) {
            return res.status(400).json({ error: "Account is already verified" });
        }

        const verificationResponse = await sendAndStoreVerificationCode(row);
        res.json({
            message: "Verification code sent",
            ...verificationResponse
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to resend verification code" });
    }
});

router.get('/me', authenticateToken, async (req, res) => {
    try {
        await ensureUserColumns();

        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({ user: buildUserPayload(result.rows[0]) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to load user profile" });
    }
});

router.put('/settings', authenticateToken, async (req, res) => {
    try {
        await ensureUserColumns();

        const validation = validateSettingsPayload(req.body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const requestedDisplayName = validation.value.displayName;
        const requestedSettings = validation.value.settings;

        const existing = await pool.query(
            'SELECT * FROM users WHERE id = $1',
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
                 settings = $2::jsonb
             WHERE id = $3
             RETURNING *`,
            [nextDisplayName, JSON.stringify(nextSettings), req.user.id]
        );

        res.json({
            message: "Settings saved successfully",
            user: buildUserPayload(updated.rows[0])
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to save settings" });
    }
});

module.exports = router;

