const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === "\"") {
            if (inQuotes && next === "\"") {
                current += "\"";
                index += 1;
                continue;
            }

            inQuotes = !inQuotes;
            continue;
        }

        if (char === "," && !inQuotes) {
            values.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    values.push(current);
    return values;
}

function parseFen(fen) {
    const parts = String(fen || "").trim().split(/\s+/);
    if (parts.length < 2) {
        throw new Error(`Invalid FEN: ${fen}`);
    }

    const [
        boardPart,
        activeColor,
        castlingRights = "-",
        enPassant = "-",
        halfmoveClock = "0",
        fullmoveNumber = "1"
    ] = parts;

    const board = boardPart.split("/").map((rank) => {
        const row = [];
        for (const char of rank) {
            if (/\d/.test(char)) {
                for (let count = 0; count < Number(char); count += 1) {
                    row.push("");
                }
            } else {
                const color = char === char.toUpperCase() ? "w" : "b";
                row.push(`${color}${char.toLowerCase()}`);
            }
        }

        if (row.length !== 8) {
            throw new Error(`Invalid board row in FEN: ${fen}`);
        }

        return row;
    });

    if (board.length !== 8) {
        throw new Error(`Invalid board in FEN: ${fen}`);
    }

    return {
        board,
        activeColor,
        castlingRights,
        enPassant,
        halfmoveClock: Number(halfmoveClock) || 0,
        fullmoveNumber: Number(fullmoveNumber) || 1
    };
}

function boardToFenBoard(board) {
    return board.map((row) => {
        let output = "";
        let emptyCount = 0;

        row.forEach((piece) => {
            if (!piece) {
                emptyCount += 1;
                return;
            }

            if (emptyCount > 0) {
                output += String(emptyCount);
                emptyCount = 0;
            }

            const letter = piece[1];
            output += piece.startsWith("w") ? letter.toUpperCase() : letter;
        });

        if (emptyCount > 0) {
            output += String(emptyCount);
        }

        return output;
    }).join("/");
}

function squareToCoords(square) {
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]);

    if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) {
        throw new Error(`Invalid square: ${square}`);
    }

    return {
        row: 8 - rank,
        col: file
    };
}

function coordsToSquare(row, col) {
    return `${FILES[col]}${8 - row}`;
}

function normalizeCastlingRights(castlingRights) {
    if (!castlingRights || castlingRights === "-") return "";
    return castlingRights;
}

function removeCastlingFlag(castlingRights, flag) {
    return normalizeCastlingRights(castlingRights).replace(flag, "");
}

function applyUciMoveToFen(fen, moveUci) {
    const state = parseFen(fen);
    const move = String(moveUci || "").trim().toLowerCase();

    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
        throw new Error(`Invalid UCI move: ${moveUci}`);
    }

    const from = squareToCoords(move.slice(0, 2));
    const to = squareToCoords(move.slice(2, 4));
    const promotion = move[4] || "";
    const piece = state.board[from.row][from.col];

    if (!piece) {
        throw new Error(`No piece found on ${move.slice(0, 2)} for move ${moveUci}`);
    }

    let castlingRights = normalizeCastlingRights(state.castlingRights);
    let capturedPiece = state.board[to.row][to.col];
    const movingColor = piece[0];
    const movingType = piece[1];
    const isWhite = movingColor === "w";
    let enPassantSquare = "-";

    if (movingType === "k") {
        castlingRights = removeCastlingFlag(castlingRights, isWhite ? "K" : "k");
        castlingRights = removeCastlingFlag(castlingRights, isWhite ? "Q" : "q");

        if (Math.abs(to.col - from.col) === 2) {
            const rookFromCol = to.col > from.col ? 7 : 0;
            const rookToCol = to.col > from.col ? 5 : 3;
            const rook = state.board[from.row][rookFromCol];
            state.board[from.row][rookFromCol] = "";
            state.board[from.row][rookToCol] = rook;
        }
    }

    if (movingType === "r") {
        if (from.row === 7 && from.col === 0) castlingRights = removeCastlingFlag(castlingRights, "Q");
        if (from.row === 7 && from.col === 7) castlingRights = removeCastlingFlag(castlingRights, "K");
        if (from.row === 0 && from.col === 0) castlingRights = removeCastlingFlag(castlingRights, "q");
        if (from.row === 0 && from.col === 7) castlingRights = removeCastlingFlag(castlingRights, "k");
    }

    if (capturedPiece === "wr") {
        if (to.row === 7 && to.col === 0) castlingRights = removeCastlingFlag(castlingRights, "Q");
        if (to.row === 7 && to.col === 7) castlingRights = removeCastlingFlag(castlingRights, "K");
    }

    if (capturedPiece === "br") {
        if (to.row === 0 && to.col === 0) castlingRights = removeCastlingFlag(castlingRights, "q");
        if (to.row === 0 && to.col === 7) castlingRights = removeCastlingFlag(castlingRights, "k");
    }

    if (
        movingType === "p" &&
        state.enPassant !== "-" &&
        move.slice(2, 4) === state.enPassant &&
        !capturedPiece &&
        from.col !== to.col
    ) {
        const captureRow = isWhite ? to.row + 1 : to.row - 1;
        capturedPiece = state.board[captureRow][to.col];
        state.board[captureRow][to.col] = "";
    }

    state.board[from.row][from.col] = "";
    state.board[to.row][to.col] = promotion ? `${movingColor}${promotion}` : piece;

    if (movingType === "p" && Math.abs(to.row - from.row) === 2) {
        enPassantSquare = coordsToSquare((from.row + to.row) / 2, from.col);
    }

    const halfmoveClock = movingType === "p" || capturedPiece ? 0 : state.halfmoveClock + 1;
    const fullmoveNumber = state.activeColor === "b" ? state.fullmoveNumber + 1 : state.fullmoveNumber;
    const nextActiveColor = state.activeColor === "w" ? "b" : "w";

    return `${boardToFenBoard(state.board)} ${nextActiveColor} ${castlingRights || "-"} ${enPassantSquare} ${halfmoveClock} ${fullmoveNumber}`;
}

function difficultyFromRating(rating) {
    if (!Number.isFinite(rating)) return "Mixed";
    if (rating < 1200) return "Beginner";
    if (rating < 1800) return "Intermediate";
    if (rating < 2400) return "Advanced";
    return "Expert";
}

function themeFromTags(tags) {
    const tagList = Array.isArray(tags) ? tags : [];
    const preferred = [
        ["mateIn1", "Mate in 1"],
        ["mateIn2", "Mate in 2"],
        ["mateIn3", "Mate in 3"],
        ["mate", "Mate"],
        ["fork", "Fork"],
        ["pin", "Pin"],
        ["skewer", "Skewer"],
        ["hangingPiece", "Hanging Piece"],
        ["endgame", "Endgame"],
        ["opening", "Opening"],
        ["middlegame", "Middlegame"],
        ["crushing", "Crushing"],
        ["advantage", "Advantage"]
    ];

    const match = preferred.find(([tag]) => tagList.includes(tag));
    return match ? match[1] : "Puzzle";
}

function titleFromTags(tags) {
    const tagList = Array.isArray(tags) ? tags : [];
    if (tagList.includes("mateIn1")) return "Mate in 1";
    if (tagList.includes("mateIn2")) return "Mate in 2";
    if (tagList.includes("mateIn3")) return "Mate in 3";
    if (tagList.includes("fork")) return "Fork Tactic";
    if (tagList.includes("pin")) return "Pin Tactic";
    if (tagList.includes("skewer")) return "Skewer Tactic";
    if (tagList.includes("endgame")) return "Endgame Puzzle";
    return "Lichess Puzzle";
}

function descriptionFromPuzzle(startFen, tags, rating) {
    const sideToMove = parseFen(startFen).activeColor === "w" ? "White" : "Black";
    const theme = themeFromTags(tags);
    const difficulty = difficultyFromRating(rating);
    return `${sideToMove} to move. Solve the ${theme.toLowerCase()} puzzle. Difficulty: ${difficulty}.`;
}

module.exports = {
    parseCsvLine,
    parseFen,
    applyUciMoveToFen,
    difficultyFromRating,
    themeFromTags,
    titleFromTags,
    descriptionFromPuzzle
};
