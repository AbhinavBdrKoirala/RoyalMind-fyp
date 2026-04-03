const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const {
    ensurePremiumSchema,
    getActiveSubscription
} = require("../utils/premiumData");

const router = express.Router();

function parseSolutionMoves(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function mapPuzzleRow(row, isPremiumUser, includeSolution = false) {
    const locked = row.is_premium && !isPremiumUser;
    const solutionMoves = parseSolutionMoves(row.solution_moves);

    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        difficulty: row.difficulty,
        theme: row.theme,
        rating: row.rating,
        sourceName: row.source_name,
        isPremium: row.is_premium,
        locked,
        fen: locked ? null : row.fen,
        gameUrl: locked ? null : row.game_url,
        solutionMoves: includeSolution && !locked ? solutionMoves : []
    };
}

function mapVideoRow(row, isPremiumUser) {
    const locked = row.is_premium && !isPremiumUser;

    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        category: row.category,
        isPremium: row.is_premium,
        locked,
        youtubeUrl: locked ? null : row.youtube_url,
        youtubeVideoId: locked ? null : row.youtube_video_id,
        previewUrl: row.youtube_url
    };
}

router.get("/puzzles", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);
        const subscription = await getActiveSubscription(pool, req.user.id);
        const isPremiumUser = Boolean(subscription);

        const result = await pool.query(
            `WITH imported AS (
                SELECT EXISTS(
                    SELECT 1
                    FROM puzzles
                    WHERE source_name = 'lichess'
                ) AS has_lichess
             )
             SELECT p.*
             FROM puzzles p
             CROSS JOIN imported i
             WHERE NOT i.has_lichess OR p.source_name = 'lichess'
             ORDER BY
                 p.is_premium ASC,
                 p.rating ASC NULLS LAST,
                 p.id ASC`
        );

        res.json({
            isPremium: isPremiumUser,
            puzzles: result.rows.map((row) => mapPuzzleRow(row, isPremiumUser, false))
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load puzzles" });
    }
});

router.get("/puzzles/:id", authenticateToken, async (req, res) => {
    const puzzleId = Number(req.params.id);
    if (!Number.isInteger(puzzleId) || puzzleId <= 0) {
        return res.status(400).json({ error: "Invalid puzzle id" });
    }

    try {
        await ensurePremiumSchema(pool);
        const subscription = await getActiveSubscription(pool, req.user.id);
        const isPremiumUser = Boolean(subscription);

        const result = await pool.query(
            `SELECT * FROM puzzles WHERE id = $1 LIMIT 1`,
            [puzzleId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Puzzle not found" });
        }

        const puzzle = result.rows[0];
        if (puzzle.is_premium && !isPremiumUser) {
            return res.status(403).json({
                error: "Premium access required",
                puzzle: mapPuzzleRow(puzzle, false, false)
            });
        }

        res.json({ puzzle: mapPuzzleRow(puzzle, isPremiumUser, true) });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load puzzle" });
    }
});

router.post("/puzzles/:id/attempt", authenticateToken, async (req, res) => {
    const puzzleId = Number(req.params.id);
    const attemptedMove = String(req.body?.move || "").trim().toLowerCase();
    if (!Number.isInteger(puzzleId) || puzzleId <= 0) {
        return res.status(400).json({ error: "Invalid puzzle id" });
    }

    if (!attemptedMove) {
        return res.status(400).json({ error: "Move is required" });
    }

    try {
        await ensurePremiumSchema(pool);
        const subscription = await getActiveSubscription(pool, req.user.id);
        const isPremiumUser = Boolean(subscription);

        const result = await pool.query(
            `SELECT * FROM puzzles WHERE id = $1 LIMIT 1`,
            [puzzleId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Puzzle not found" });
        }

        const puzzle = result.rows[0];
        if (puzzle.is_premium && !isPremiumUser) {
            return res.status(403).json({ error: "Premium access required" });
        }

        const solutionMoves = parseSolutionMoves(puzzle.solution_moves);
        const expectedMove = String(solutionMoves[0] || "").toLowerCase();
        const correct = attemptedMove === expectedMove;

        res.json({
            correct,
            expectedMove: expectedMove || null,
            solutionMoves,
            message: correct
                ? "Correct move. Nice solve."
                : "Not quite. Try again or reveal the line."
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to check puzzle move" });
    }
});

router.get("/videos", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);
        const subscription = await getActiveSubscription(pool, req.user.id);
        const isPremiumUser = Boolean(subscription);

        const result = await pool.query(
            `SELECT * FROM video_lessons ORDER BY sort_order ASC, id ASC`
        );

        res.json({
            isPremium: isPremiumUser,
            lessons: result.rows.map((row) => mapVideoRow(row, isPremiumUser))
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load lessons" });
    }
});

module.exports = router;
