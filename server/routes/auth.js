const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

const JWT_SECRET = "royalmind_secret_key";
let userSchemaEnsured = false;

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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS first_name VARCHAR(80),
        ADD COLUMN IF NOT EXISTS last_name VARCHAR(80),
        ADD COLUMN IF NOT EXISTS username VARCHAR(40),
        ADD COLUMN IF NOT EXISTS phone VARCHAR(25),
        ADD COLUMN IF NOT EXISTS country VARCHAR(80)
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
            `INSERT INTO users (first_name, last_name, username, phone, country, email, password)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [safeFirstName, safeLastName, safeUsername, safePhone, safeCountry, safeEmail, hashedPassword]
        );

        res.status(201).json({ message: "User registered successfully" });

    } catch (error) {
        console.error(error);
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

        res.json({ token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;

