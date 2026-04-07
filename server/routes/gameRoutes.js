const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const {
    validateGameSavePayload,
    validateGameStartPayload,
    validateGameUpdatePayload
} = require("../utils/validation");

let gamesSchemaEnsured = false;

function normalizeMovesForStorage(moves) {
    const safeMoves = Array.isArray(moves) ? moves : [];
    return {
        movesText: JSON.stringify(safeMoves),
        movesJson: JSON.stringify(safeMoves),
        moveCount: safeMoves.length
    };
}

async function ensureGamesTable() {
    if (gamesSchemaEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            opponent VARCHAR(80),
            result VARCHAR(80),
            moves TEXT,
            moves_json JSONB DEFAULT '[]'::jsonb,
            move_count INTEGER DEFAULT 0,
            status VARCHAR(40),
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS opponent VARCHAR(80)`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS result VARCHAR(80)`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS moves TEXT`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS moves_json JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS move_count INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS status VARCHAR(40)`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_games_user_played_at ON games(user_id, played_at DESC)`);

    await pool.query(`
        UPDATE games
        SET moves_json = CASE
            WHEN moves IS NULL OR BTRIM(moves) = '' THEN '[]'::jsonb
            ELSE moves::jsonb
        END
        WHERE moves_json IS NULL
    `);

    await pool.query(`
        UPDATE games
        SET move_count = COALESCE(jsonb_array_length(moves_json), 0)
        WHERE move_count IS NULL OR move_count = 0
    `);

    gamesSchemaEnsured = true;
}

// Start game (create record)
router.post("/start", authenticateToken, async (req, res) => {
    const validation = validateGameStartPayload(req.body);
    const userId = req.user.id;

    if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
    }

    const { opponent, moves } = validation.value;
    const moveStorage = normalizeMovesForStorage(moves);

    try {
        await ensureGamesTable();

        const newGame = await pool.query(
            `INSERT INTO games (user_id, opponent, result, moves, moves_json, move_count, status, started_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW())
             RETURNING *`,
            [
                userId,
                opponent || "Local",
                "ongoing",
                moveStorage.movesText,
                moveStorage.movesJson,
                moveStorage.moveCount,
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
    const validation = validateGameUpdatePayload(gameId, req.body);

    if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
    }

    const { moves, result, status, opponent } = validation.value;

    try {
        await ensureGamesTable();

        const moveStorage = typeof moves === "undefined"
            ? null
            : normalizeMovesForStorage(moves);

        const updated = await pool.query(
            `UPDATE games
             SET moves = COALESCE($1, moves),
                 moves_json = COALESCE($2::jsonb, moves_json),
                 move_count = COALESCE($3, move_count),
                 result = COALESCE($4, result),
                 status = COALESCE($5, status),
                 opponent = COALESCE($6, opponent),
                 updated_at = NOW(),
                 played_at = CASE
                     WHEN $5 = 'finished' OR $4 IS NOT NULL THEN NOW()
                     ELSE played_at
                 END
             WHERE id = $7 AND user_id = $8
             RETURNING *`,
            [
                moveStorage ? moveStorage.movesText : null,
                moveStorage ? moveStorage.movesJson : null,
                moveStorage ? moveStorage.moveCount : null,
                result || null,
                status || null,
                opponent || null,
                gameId,
                userId
            ]
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
    const validation = validateGameSavePayload(req.body);
    const userId = req.user.id;

    if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
    }

    const { opponent, result, moves } = validation.value;
    const moveStorage = normalizeMovesForStorage(moves);

    try {
        await ensureGamesTable();
        const newGame = await pool.query(
            `INSERT INTO games (user_id, opponent, result, moves, moves_json, move_count, status, started_at, updated_at, played_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW(), NOW()) RETURNING *`,
            [
                userId,
                opponent || "Local",
                result || "finished",
                moveStorage.movesText,
                moveStorage.movesJson,
                moveStorage.moveCount,
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
            "SELECT *, COALESCE(moves_json, '[]'::jsonb) AS moves_json FROM games WHERE user_id = $1 ORDER BY played_at DESC",
            [userId]
        );

        res.json(games.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
