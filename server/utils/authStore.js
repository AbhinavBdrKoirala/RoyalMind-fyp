const pool = require("../db");

let authSchemaEnsured = false;

function getPendingAccountRetentionHours() {
    const configured = Number(process.env.UNVERIFIED_ACCOUNT_RETENTION_HOURS || 72);
    return Number.isFinite(configured) && configured > 0 ? configured : 72;
}

async function ensureAuthSchema() {
    if (authSchemaEnsured) return;

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
            password_reset_code_hash VARCHAR(255),
            password_reset_expires_at TIMESTAMP,
            password_reset_sent_at TIMESTAMP,
            pending_email VARCHAR(255),
            pending_email_code_hash VARCHAR(255),
            pending_email_expires_at TIMESTAMP,
            pending_email_sent_at TIMESTAMP,
            display_name VARCHAR(120),
            settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        ADD COLUMN IF NOT EXISTS password_reset_code_hash VARCHAR(255),
        ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS pending_email_code_hash VARCHAR(255),
        ADD COLUMN IF NOT EXISTS pending_email_expires_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS pending_email_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS display_name VARCHAR(120),
        ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_audit_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            email VARCHAR(255),
            action VARCHAR(80) NOT NULL,
            status VARCHAR(40) NOT NULL,
            ip_address VARCHAR(120),
            user_agent TEXT,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
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
        SET updated_at = COALESCE(updated_at, created_at, NOW())
        WHERE updated_at IS NULL
    `);

    await pool.query(`
        UPDATE users
        SET is_verified = TRUE,
            verified_at = COALESCE(verified_at, created_at)
        WHERE verification_code_hash IS NULL
          AND pending_email_code_hash IS NULL
          AND (is_verified IS NULL OR is_verified = FALSE)
    `);

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (LOWER(email))`);
    } catch (error) {
        console.warn("Skipping users_email_lower_key index creation:", error.message);
    }

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username)`);
    } catch (error) {
        console.warn("Skipping users_username_key index creation:", error.message);
    }

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_phone_normalized_key ON users (phone_normalized) WHERE phone_normalized IS NOT NULL`);
    } catch (error) {
        console.warn("Skipping users_phone_normalized_key index creation:", error.message);
    }

    try {
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_pending_email_lower_key ON users (LOWER(pending_email)) WHERE pending_email IS NOT NULL`);
    } catch (error) {
        console.warn("Skipping users_pending_email_lower_key index creation:", error.message);
    }

    authSchemaEnsured = true;
}

async function logAuthEvent({
    userId = null,
    email = "",
    action,
    status,
    ipAddress = "",
    userAgent = "",
    details = {}
}) {
    try {
        await ensureAuthSchema();
        await pool.query(
            `INSERT INTO auth_audit_logs (user_id, email, action, status, ip_address, user_agent, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
            [
                userId,
                email || null,
                action,
                status,
                ipAddress || null,
                userAgent || null,
                JSON.stringify(details || {})
            ]
        );
    } catch (error) {
        console.warn("Auth audit logging failed:", error.message);
    }
}

async function cleanupExpiredAuthState() {
    await ensureAuthSchema();

    const deletedUnverified = await pool.query(
        `DELETE FROM users
         WHERE is_verified = FALSE
           AND created_at < NOW() - ($1 || ' hours')::interval
           AND (
                verification_code_expires_at IS NULL
                OR verification_code_expires_at < NOW() - INTERVAL '1 hour'
           )`,
        [String(getPendingAccountRetentionHours())]
    );

    await pool.query(`
        UPDATE users
        SET password_reset_code_hash = NULL,
            password_reset_expires_at = NULL
        WHERE password_reset_expires_at IS NOT NULL
          AND password_reset_expires_at < NOW()
    `);

    await pool.query(`
        UPDATE users
        SET pending_email = NULL,
            pending_email_code_hash = NULL,
            pending_email_expires_at = NULL,
            pending_email_sent_at = NULL
        WHERE pending_email_expires_at IS NOT NULL
          AND pending_email_expires_at < NOW()
    `);

    if (deletedUnverified.rowCount > 0) {
        await logAuthEvent({
            action: "auth_cleanup",
            status: "success",
            details: { deletedUnverifiedAccounts: deletedUnverified.rowCount }
        });
    }

    return {
        deletedUnverifiedAccounts: deletedUnverified.rowCount
    };
}

module.exports = {
    cleanupExpiredAuthState,
    ensureAuthSchema,
    logAuthEvent
};
