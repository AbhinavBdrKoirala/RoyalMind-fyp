const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

const JWT_SECRET = "royalmind_secret_key";
let userSchemaEnsured = false;

const SETTINGS_KEYS = [
    "language",
    "timeZone",
    "autoQueen",
    "showLegal",
    "moveConfirm",
    "defaultTime",
    "boardTheme",
    "pieceStyle",
    "boardCoordinates",
    "animatePieces",
    "notifyGameStart",
    "notifyChallenges",
    "notifySounds",
    "privacyOnline",
    "privacyDM",
    "privacyHistory"
];

function sanitizeSettings(input) {
    const safeInput = input && typeof input === "object" ? input : {};
    return SETTINGS_KEYS.reduce((accumulator, key) => {
        if (typeof safeInput[key] !== "undefined") {
            accumulator[key] = safeInput[key];
        }
        return accumulator;
    }, {});
}

function getDisplayName(row) {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return row.display_name || row.username || fullName || row.email;
}

function buildUserPayload(row) {
    return {
        id: row.id,
        email: row.email,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: getDisplayName(row),
        settings: sanitizeSettings(row.settings || {})
    };
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
        ADD COLUMN IF NOT EXISTS country VARCHAR(80),
        ADD COLUMN IF NOT EXISTS display_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb
    `);

    try {
        await pool.query(`ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)`);
    } catch (emailConstraintError) {
        // Ignore if it already exists or cannot be added due to legacy data.
    }

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username)`);
    } catch (indexError) {
        // Keep registration functional even if legacy duplicate usernames block index creation.
        console.warn("Skipping users_username_key index creation:", indexError.message);
    }
    userSchemaEnsured = true;
}

// REGISTER
router.post('/register', async (req, res) => {
    const { firstName, lastName, username, phone, country, email, password } = req.body;

    try {
        const safeFirstName = String(firstName || "").trim();
        const safeLastName = String(lastName || "").trim();
        const safeUsername = String(username || "").trim();
        const safePhone = String(phone || "").trim();
        const safeCountry = String(country || "").trim();
        const safeEmail = String(email || "").trim().toLowerCase();
        const safePassword = String(password || "");
        const safeDisplayName = safeUsername || `${safeFirstName} ${safeLastName}`.trim() || safeEmail;

        if (!safeFirstName || !safeLastName || !safeUsername || !safePhone || !safeCountry || !safeEmail || !safePassword) {
            return res.status(400).json({ error: "Please fill all required fields" });
        }

        if (safePassword.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters long" });
        }

        if (!/^[+]?[0-9()\-\s]{7,20}$/.test(safePhone)) {
            return res.status(400).json({ error: "Invalid phone number format" });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        await ensureUserColumns();

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [safeEmail, safeUsername]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: "Email or username already exists" });
        }

        const hashedPassword = await bcrypt.hash(safePassword, 10);

        await pool.query(
            `INSERT INTO users (first_name, last_name, username, phone, country, email, password, display_name, settings)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
            [safeFirstName, safeLastName, safeUsername, safePhone, safeCountry, safeEmail, hashedPassword, safeDisplayName, JSON.stringify({})]
        );

        res.status(201).json({ message: "User registered successfully" });

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
    const { email, password } = req.body;
    
    try {
        await ensureUserColumns();

        const user = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
            [email]
        );

        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const validPassword = await bcrypt.compare(password, user.rows[0].password);

        if (!validPassword) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: user.rows[0].id },
            JWT_SECRET,
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

        const requestedDisplayName = String(req.body?.displayName || "").trim();
        const requestedSettings = sanitizeSettings(req.body?.settings);

        const existing = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.user.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const currentUser = existing.rows[0];
        const nextDisplayName = requestedDisplayName || getDisplayName(currentUser);
        const nextSettings = {
            ...sanitizeSettings(currentUser.settings || {}),
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

