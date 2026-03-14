const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

let gamesSchemaEnsured = false;

async function ensureGamesTable() {
    if (gamesSchemaEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            opponent VARCHAR(80),
            result VARCHAR(80),
            moves TEXT,
            status VARCHAR(40),
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS opponent VARCHAR(80)`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS result VARCHAR(80)`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS moves TEXT`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS status VARCHAR(40)`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

    gamesSchemaEnsured = true;
}

// Start game (create record)
router.post("/start", authenticateToken, async (req, res) => {
    const { opponent, moves } = req.body || {};
    const userId = req.user.id;

    try {
        await ensureGamesTable();

        const newGame = await pool.query(
            `INSERT INTO games (user_id, opponent, result, moves, status, started_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             RETURNING *`,
            [
                userId,
                opponent || "Local",
                "ongoing",
                JSON.stringify(Array.isArray(moves) ? moves : []),
                "in_progress"
            ]
        );

        res.json(newGame.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// Update game (auto-save moves/results)
router.patch("/:id", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const gameId = Number(req.params.id);
    const { moves, result, status, opponent } = req.body || {};

    if (!Number.isFinite(gameId)) {
        return res.status(400).json({ error: "Invalid game id" });
    }

    try {
        await ensureGamesTable();

        const movesPayload = typeof moves === "undefined"
            ? null
            : JSON.stringify(Array.isArray(moves) ? moves : []);

        const updated = await pool.query(
            `UPDATE games
             SET moves = COALESCE($1, moves),
                 result = COALESCE($2, result),
                 status = COALESCE($3, status),
                 opponent = COALESCE($4, opponent),
                 updated_at = NOW(),
                 played_at = CASE
                     WHEN $3 = 'finished' OR $2 IS NOT NULL THEN NOW()
                     ELSE played_at
                 END
             WHERE id = $5 AND user_id = $6
             RETURNING *`,
            [movesPayload, result || null, status || null, opponent || null, gameId, userId]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({ error: "Game not found" });
        }

        res.json(updated.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// Save game
router.post("/save", authenticateToken, async (req, res) => {
    const { opponent, result, moves } = req.body;
    const userId = req.user.id;

    try {
        await ensureGamesTable();
        const newGame = await pool.query(
            `INSERT INTO games (user_id, opponent, result, moves, status, started_at, updated_at, played_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW()) RETURNING *`,
            [
                userId,
                opponent || "Local",
                result || "finished",
                JSON.stringify(Array.isArray(moves) ? moves : []),
                "finished"
            ]
        );

        res.json(newGame.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// Get all games for logged user
router.get("/", authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        await ensureGamesTable();
        const games = await pool.query(
            "SELECT * FROM games WHERE user_id = $1 ORDER BY played_at DESC",
            [userId]
        );

        res.json(games.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
