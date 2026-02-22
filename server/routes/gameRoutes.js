const express = require("express");
const router = express.Router();
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

// Save game
router.post("/save", authenticateToken, async (req, res) => {
    const { opponent, result, moves } = req.body;
    const userId = req.user.id;

    try {
        const newGame = await pool.query(
            "INSERT INTO games (user_id, opponent, result, moves) VALUES ($1, $2, $3, $4) RETURNING *",
            [userId, opponent, result, moves]
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