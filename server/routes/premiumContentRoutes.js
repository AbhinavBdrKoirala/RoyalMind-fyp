const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const {
    ensurePremiumSchema,
    getActiveSubscription
} = require("../utils/premiumData");

const router = express.Router();

function isPreviewRequest(req) {
    const value = String(req.query?.preview || "").trim().toLowerCase();
    return value === "1" || value === "true";
}

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
        solutionMoves: includeSolution && !locked ? solutionMoves : [],
        attemptCount: Number(row.attempt_count || 0),
        solved: row.solved === true,
        solvedAt: row.solved_at || null,
        lastAttemptAt: row.last_attempted_at || null
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
        previewUrl: row.youtube_url,
        openedCount: Number(row.opened_count || 0),
        completed: row.completed === true,
        lastOpenedAt: row.last_opened_at || null
    };
}

function mapPreviewPuzzleRow(row) {
    return {
        ...mapPuzzleRow(row, false, false),
        locked: true,
        fen: null,
        gameUrl: null,
        solutionMoves: []
    };
}

function mapPreviewVideoRow(row) {
    return {
        ...mapVideoRow(row, false),
        locked: true,
        youtubeUrl: null,
        youtubeVideoId: null
    };
}

router.get("/puzzles", authenticateToken, async (req, res) => {
    try {
        await ensurePremiumSchema(pool);
        const subscription = await getActiveSubscription(pool, req.user.id);
        const isPremiumUser = Boolean(subscription);
        const previewMode = isPreviewRequest(req);

        if (!isPremiumUser && !previewMode) {
            return res.status(403).json({
                error: "Premium access required",
                redirectTo: "subscription.html"
            });
        }

        const result = await pool.query(
            `WITH imported AS (
                SELECT EXISTS(
                    SELECT 1
                    FROM puzzles
                    WHERE source_name = 'lichess'
                ) AS has_lichess
             ),
             attempts AS (
                SELECT
                    puzzle_id,
                    COUNT(*)::int AS attempt_count,
                    BOOL_OR(was_correct) AS solved,
                    MAX(attempted_at) AS last_attempted_at,
                    MAX(CASE WHEN was_correct THEN attempted_at END) AS solved_at
                FROM puzzle_attempts
                WHERE user_id = $1
                GROUP BY puzzle_id
             )
             SELECT p.*,
                    COALESCE(a.attempt_count, 0) AS attempt_count,
                    COALESCE(a.solved, FALSE) AS solved,
                    a.last_attempted_at,
                    a.solved_at
             FROM puzzles p
             CROSS JOIN imported i
             LEFT JOIN attempts a ON a.puzzle_id = p.id
             WHERE NOT i.has_lichess OR p.source_name = 'lichess'
             ORDER BY
                 COALESCE(a.solved, FALSE) ASC,
                 p.is_premium ASC,
                 p.rating ASC NULLS LAST,
                 p.id ASC`,
            [req.user.id]
        );

        res.json({
            isPremium: isPremiumUser,
            previewMode: previewMode && !isPremiumUser,
            puzzles: result.rows.map((row) => (
                !isPremiumUser && previewMode
                    ? mapPreviewPuzzleRow(row)
                    : mapPuzzleRow(row, isPremiumUser, false)
            ))
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

        if (!isPremiumUser) {
            return res.status(403).json({
                error: "Premium access required",
                redirectTo: "subscription.html"
            });
        }

        const result = await pool.query(
            `WITH attempts AS (
                SELECT
                    puzzle_id,
                    COUNT(*)::int AS attempt_count,
                    BOOL_OR(was_correct) AS solved,
                    MAX(attempted_at) AS last_attempted_at,
                    MAX(CASE WHEN was_correct THEN attempted_at END) AS solved_at
                FROM puzzle_attempts
                WHERE user_id = $2
                GROUP BY puzzle_id
             )
             SELECT p.*,
                    COALESCE(a.attempt_count, 0) AS attempt_count,
                    COALESCE(a.solved, FALSE) AS solved,
                    a.last_attempted_at,
                    a.solved_at
             FROM puzzles p
             LEFT JOIN attempts a ON a.puzzle_id = p.id
             WHERE p.id = $1
             LIMIT 1`,
            [puzzleId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Puzzle not found" });
        }

        const puzzle = result.rows[0];
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

        if (!isPremiumUser) {
            return res.status(403).json({
                error: "Premium access required",
                redirectTo: "subscription.html"
            });
        }

        const result = await pool.query(
            `SELECT * FROM puzzles WHERE id = $1 LIMIT 1`,
            [puzzleId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Puzzle not found" });
        }

        const puzzle = result.rows[0];
        const solutionMoves = parseSolutionMoves(puzzle.solution_moves);
        const expectedMove = String(solutionMoves[0] || "").toLowerCase();
        const correct = attemptedMove === expectedMove;

        await pool.query(
            `INSERT INTO puzzle_attempts (user_id, puzzle_id, attempted_move, was_correct, attempted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [req.user.id, puzzleId, attemptedMove, correct]
        );

        const progress = await pool.query(
            `SELECT
                COUNT(*)::int AS attempt_count,
                BOOL_OR(was_correct) AS solved,
                MAX(attempted_at) AS last_attempted_at,
                MAX(CASE WHEN was_correct THEN attempted_at END) AS solved_at
             FROM puzzle_attempts
             WHERE user_id = $1 AND puzzle_id = $2`,
            [req.user.id, puzzleId]
        );

        res.json({
            correct,
            expectedMove: expectedMove || null,
            solutionMoves,
            progress: {
                attemptCount: Number(progress.rows[0]?.attempt_count || 0),
                solved: progress.rows[0]?.solved === true,
                solvedAt: progress.rows[0]?.solved_at || null,
                lastAttemptAt: progress.rows[0]?.last_attempted_at || null
            },
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
        const previewMode = isPreviewRequest(req);

        if (!isPremiumUser && !previewMode) {
            return res.status(403).json({
                error: "Premium access required",
                redirectTo: "subscription.html"
            });
        }

        const result = await pool.query(
            `SELECT v.*,
                    COALESCE(vp.opened_count, 0) AS opened_count,
                    COALESCE(vp.completed, FALSE) AS completed,
                    vp.last_opened_at
             FROM video_lessons v
             LEFT JOIN video_progress vp
               ON vp.lesson_id = v.id
              AND vp.user_id = $1
             ORDER BY v.sort_order ASC, v.id ASC`,
            [req.user.id]
        );

        res.json({
            isPremium: isPremiumUser,
            previewMode: previewMode && !isPremiumUser,
            lessons: result.rows.map((row) => (
                !isPremiumUser && previewMode
                    ? mapPreviewVideoRow(row)
                    : mapVideoRow(row, isPremiumUser)
            ))
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to load lessons" });
    }
});

router.post("/videos/:id/open", authenticateToken, async (req, res) => {
    const lessonId = Number(req.params.id);
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
        return res.status(400).json({ error: "Invalid lesson id" });
    }

    try {
        await ensurePremiumSchema(pool);
        const subscription = await getActiveSubscription(pool, req.user.id);
        const isPremiumUser = Boolean(subscription);

        if (!isPremiumUser) {
            return res.status(403).json({
                error: "Premium access required",
                redirectTo: "subscription.html"
            });
        }

        const lessonResult = await pool.query(
            `SELECT * FROM video_lessons WHERE id = $1 LIMIT 1`,
            [lessonId]
        );

        if (lessonResult.rows.length === 0) {
            return res.status(404).json({ error: "Lesson not found" });
        }

        const lesson = lessonResult.rows[0];
        const progress = await pool.query(
            `INSERT INTO video_progress (user_id, lesson_id, opened_count, completed, last_opened_at, created_at, updated_at)
             VALUES ($1, $2, 1, FALSE, NOW(), NOW(), NOW())
             ON CONFLICT (user_id, lesson_id)
             DO UPDATE SET
                 opened_count = video_progress.opened_count + 1,
                 last_opened_at = NOW(),
                 updated_at = NOW()
             RETURNING opened_count, completed, last_opened_at`,
            [req.user.id, lessonId]
        );

        res.json({
            progress: {
                openedCount: Number(progress.rows[0]?.opened_count || 0),
                completed: progress.rows[0]?.completed === true,
                lastOpenedAt: progress.rows[0]?.last_opened_at || null
            }
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Unable to track lesson progress" });
    }
});

module.exports = router;
