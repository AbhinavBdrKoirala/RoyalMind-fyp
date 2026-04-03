const fs = require("fs");
const path = require("path");
const readline = require("readline");
const pool = require("../db");
const { ensurePremiumSchema } = require("../utils/premiumData");
const {
    parseCsvLine,
    applyUciMoveToFen,
    difficultyFromRating,
    themeFromTags,
    titleFromTags,
    descriptionFromPuzzle
} = require("../utils/puzzleImport");

function parseArgs(argv) {
    const args = {
        file: "",
        limit: 250,
        minRating: 800,
        maxRating: 2600,
        freeCount: 20,
        themes: []
    };

    argv.forEach((arg) => {
        if (!arg.startsWith("--")) return;
        const [rawKey, rawValue = ""] = arg.slice(2).split("=");
        const key = rawKey.trim();
        const value = rawValue.trim();

        if (key === "file") args.file = value;
        if (key === "limit") args.limit = Number(value) || args.limit;
        if (key === "min-rating") args.minRating = Number(value) || args.minRating;
        if (key === "max-rating") args.maxRating = Number(value) || args.maxRating;
        if (key === "free-count") args.freeCount = Number(value) || args.freeCount;
        if (key === "themes") {
            args.themes = value
                .split(",")
                .map((theme) => theme.trim())
                .filter(Boolean);
        }
    });

    return args;
}

function matchesFilters(row, options) {
    const rating = Number(row.Rating);
    if (Number.isFinite(rating)) {
        if (rating < options.minRating || rating > options.maxRating) return false;
    }

    if (!options.themes.length) return true;

    const tags = String(row.Themes || "")
        .split(/\s+/)
        .map((tag) => tag.trim())
        .filter(Boolean);

    return options.themes.some((theme) => tags.includes(theme));
}

async function importPuzzles() {
    const options = parseArgs(process.argv.slice(2));
    const filePath = options.file
        ? path.resolve(process.cwd(), options.file)
        : "";

    if (!filePath) {
        throw new Error("Missing required --file=PATH argument.");
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`CSV file not found: ${filePath}`);
    }

    await ensurePremiumSchema(pool);

    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const reader = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
    });

    let header = [];
    let imported = 0;
    let skipped = 0;
    let scanned = 0;

    await pool.query("BEGIN");

    try {
        for await (const line of reader) {
            if (!line.trim()) continue;

            if (header.length === 0) {
                header = parseCsvLine(line);
                continue;
            }

            if (imported >= options.limit) break;

            scanned += 1;
            const values = parseCsvLine(line);
            const row = Object.fromEntries(header.map((name, index) => [name, values[index] || ""]));

            if (!matchesFilters(row, options)) {
                skipped += 1;
                continue;
            }

            const moves = String(row.Moves || "")
                .trim()
                .split(/\s+/)
                .filter(Boolean);

            if (moves.length < 2) {
                skipped += 1;
                continue;
            }

            try {
                const sourceFen = row.FEN;
                const firstMove = moves[0];
                const startFen = applyUciMoveToFen(sourceFen, firstMove);
                const solutionMoves = moves.slice(1);
                const rating = Number(row.Rating) || null;
                const popularity = Number(row.Popularity) || null;
                const nbPlays = Number(row.NbPlays) || null;
                const tags = String(row.Themes || "")
                    .split(/\s+/)
                    .map((tag) => tag.trim())
                    .filter(Boolean);

                const titleBase = titleFromTags(tags);
                const theme = themeFromTags(tags);
                const title = titleBase === "Lichess Puzzle"
                    ? `${titleBase} ${row.PuzzleId}`
                    : titleBase;
                const description = descriptionFromPuzzle(startFen, tags, rating);
                const isPremium = imported >= options.freeCount;

                await pool.query(
                    `INSERT INTO puzzles (
                        slug,
                        title,
                        description,
                        fen,
                        source_name,
                        source_fen,
                        first_move_uci,
                        solution_moves,
                        difficulty,
                        theme,
                        rating,
                        popularity,
                        nb_plays,
                        game_url,
                        opening_tags,
                        imported_at,
                        is_premium
                    )
                    VALUES (
                        $1, $2, $3, $4, 'lichess', $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, NOW(), $15
                    )
                    ON CONFLICT (slug) DO UPDATE
                    SET title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        fen = EXCLUDED.fen,
                        source_name = EXCLUDED.source_name,
                        source_fen = EXCLUDED.source_fen,
                        first_move_uci = EXCLUDED.first_move_uci,
                        solution_moves = EXCLUDED.solution_moves,
                        difficulty = EXCLUDED.difficulty,
                        theme = EXCLUDED.theme,
                        rating = EXCLUDED.rating,
                        popularity = EXCLUDED.popularity,
                        nb_plays = EXCLUDED.nb_plays,
                        game_url = EXCLUDED.game_url,
                        opening_tags = EXCLUDED.opening_tags,
                        imported_at = EXCLUDED.imported_at,
                        is_premium = EXCLUDED.is_premium`,
                    [
                        `lichess-${String(row.PuzzleId || "").toLowerCase()}`,
                        title,
                        description,
                        startFen,
                        sourceFen,
                        firstMove,
                        JSON.stringify(solutionMoves),
                        difficultyFromRating(rating),
                        theme,
                        rating,
                        popularity,
                        nbPlays,
                        row.GameUrl || null,
                        row.OpeningTags || null,
                        isPremium
                    ]
                );

                imported += 1;
            } catch {
                skipped += 1;
            }
        }

        await pool.query("COMMIT");
        console.log(`Imported ${imported} puzzles from ${filePath}. Scanned ${scanned} rows and skipped ${skipped}.`);
    } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
    } finally {
        reader.close();
        stream.close();
        await pool.end();
    }
}

importPuzzles().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
