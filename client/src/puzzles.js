const token = localStorage.getItem("token");
const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
const appUi = window.RoyalMindUI || {
    notify: () => {}
};
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

const puzzleMembershipNote = document.getElementById("puzzleMembershipNote");
const puzzleList = document.getElementById("puzzleList");
const puzzleTitle = document.getElementById("puzzleTitle");
const puzzleDescription = document.getElementById("puzzleDescription");
const puzzleBoardWrap = document.getElementById("puzzleBoardWrap");
const puzzleBoard = document.getElementById("puzzleBoard");
const puzzleRanks = document.getElementById("puzzleRanks");
const puzzleFiles = document.getElementById("puzzleFiles");
const puzzleStatus = document.getElementById("puzzleStatus");
const puzzleSolution = document.getElementById("puzzleSolution");
const puzzleMeta = document.getElementById("puzzleMeta");
const puzzleSourceRow = document.getElementById("puzzleSourceRow");
const puzzleSourceLink = document.getElementById("puzzleSourceLink");
const showSolutionBtn = document.getElementById("showSolutionBtn");
const lockedPuzzleCta = document.getElementById("lockedPuzzleCta");

const pieceMap = {
    wp: "white_pawn.png",
    wr: "white_rook.png",
    wn: "white_knight.png",
    wb: "white_bishop.png",
    wq: "white_queen.png",
    wk: "white_king.png",
    bp: "black_pawn.png",
    br: "black_rook.png",
    bn: "black_knight.png",
    bb: "black_bishop.png",
    bq: "black_queen.png",
    bk: "black_king.png"
};

let currentPuzzle = null;
let puzzleCatalog = [];
let puzzleBoardState = null;
let puzzlePosition = null;
let selectedSquare = null;
let premiumUnlocked = false;
let puzzleSolved = false;
let audioContext = null;
let solutionPlaybackTimer = null;

function getRequestedPuzzleId() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("puzzle") || "").trim();
}

if (!token) {
    appUi.notify("Please log in to access puzzles.", {
        title: "Session required",
        tone: "info",
        duration: 1200
    });
    setTimeout(() => {
        window.location.href = "index.html";
    }, 700);
}

function redirectToLogin(message) {
    localStorage.removeItem("token");
    appUi.notify(message || "Please log in to continue.", {
        title: "Session required",
        tone: "info",
        duration: 1200
    });
    setTimeout(() => {
        window.location.href = "index.html";
    }, 700);
}

function redirectToSubscription(message) {
    appUi.notify(message || "Premium access is required to open puzzles.", {
        title: "Subscription required",
        tone: "info",
        duration: 1800
    });
    setTimeout(() => {
        window.location.href = "subscription.html";
    }, 800);
}

function getStoredSettings() {
    try {
        return JSON.parse(localStorage.getItem("royalmindSettings")) || {};
    } catch {
        return {};
    }
}

function getLocalePreferences() {
    const settings = getStoredSettings();
    const localeMap = {
        English: "en-US",
        Spanish: "es-ES",
        French: "fr-FR"
    };

    return {
        locale: localeMap[settings.language] || "en-US",
        timeZone: settings.timeZone && settings.timeZone !== "Local device time" ? settings.timeZone : undefined
    };
}

function formatDateTimeLabel(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const { locale, timeZone } = getLocalePreferences();
    return date.toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timeZone ? { timeZone } : {})
    });
}

function shouldPlaySounds() {
    return getStoredSettings().notifySounds !== false;
}

function getAudioContext() {
    if (audioContext) return audioContext;

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;

    audioContext = new AudioCtor();
    return audioContext;
}

function playUiSound(kind = "move") {
    if (!shouldPlaySounds()) return;

    const context = getAudioContext();
    if (!context) return;

    const tones = {
        success: { frequency: 560, duration: 0.11, type: "triangle", gain: 0.03 },
        warning: { frequency: 190, duration: 0.09, type: "sawtooth", gain: 0.02 }
    };

    const tone = tones[kind] || tones.success;

    try {
        if (context.state === "suspended") {
            context.resume().catch(() => {});
        }

        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        const now = context.currentTime;

        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.frequency, now);
        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.linearRampToValueAtTime(tone.gain, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + tone.duration + 0.02);
    } catch {
        // ignore audio errors
    }
}

function clearSolutionPlayback() {
    if (!solutionPlaybackTimer) return;
    clearTimeout(solutionPlaybackTimer);
    solutionPlaybackTimer = null;
}

function normalizeAppearanceToken(value, fallback) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return normalized || fallback;
}

function cloneBoard(board) {
    return Array.isArray(board) ? board.map((row) => [...row]) : [];
}

function applyAppearanceSettings() {
    const settings = getStoredSettings();
    const body = document.body;
    if (!body) return;

    body.classList.remove(
        "board-theme-classic-wood",
        "board-theme-emerald",
        "board-theme-slate",
        "piece-style-royal-set",
        "piece-style-modern",
        "piece-style-minimal",
        "pieces-animated",
        "pieces-static"
    );

    body.classList.add(
        `board-theme-${normalizeAppearanceToken(settings.boardTheme, "classic-wood")}`,
        `piece-style-${normalizeAppearanceToken(settings.pieceStyle, "royal-set")}`,
        settings.animatePieces === false ? "pieces-static" : "pieces-animated"
    );
}

async function apiFetch(path, options = {}) {
    for (const base of API_BASES) {
        try {
            const response = await fetch(`${base}${path}`, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    ...(options.headers || {})
                }
            });
            return response;
        } catch {
            // try next base
        }
    }

    return null;
}

async function ensurePremiumAccess() {
    const response = await apiFetch("/api/subscription/me");
    if (!response) {
        setPuzzleMessage("Unable to verify premium access right now.", "warning");
        return false;
    }

    if (response.status === 401) {
        redirectToLogin("Your session expired. Please log in again.");
        return false;
    }

    if (!response.ok) {
        setPuzzleMessage("Unable to verify premium access right now.", "warning");
        return false;
    }

    const data = await response.json();
    if (!data.subscription?.isPremium) {
        redirectToSubscription("Subscribe to unlock the puzzle trainer.");
        return false;
    }

    premiumUnlocked = true;
    return true;
}

function parseFenBoard(fen) {
    const boardToken = String(fen || "").split(" ")[0];
    return boardToken.split("/").map((rank) => {
        const row = [];
        rank.split("").forEach((char) => {
            if (/\d/.test(char)) {
                for (let index = 0; index < Number(char); index += 1) {
                    row.push("");
                }
            } else {
                const color = char === char.toUpperCase() ? "w" : "b";
                row.push(`${color}${char.toLowerCase()}`);
            }
        });
        return row;
    });
}

function cloneCastlingRights(rights) {
    return {
        white: { ...rights.white },
        black: { ...rights.black }
    };
}

function cloneEnPassantTarget(target) {
    return target ? { ...target } : null;
}

function parseFenCastling(castlingToken) {
    const token = String(castlingToken || "-");
    return {
        white: {
            kingMoved: !(token.includes("K") || token.includes("Q")),
            rookA: !token.includes("Q"),
            rookH: !token.includes("K")
        },
        black: {
            kingMoved: !(token.includes("k") || token.includes("q")),
            rookA: !token.includes("q"),
            rookH: !token.includes("k")
        }
    };
}

function parseFenEnPassant(token, activeColor) {
    if (!token || token === "-") return null;

    const col = FILES.indexOf(token[0]);
    const rank = Number(token[1]);
    if (col < 0 || Number.isNaN(rank)) return null;

    const targetRow = 8 - rank;
    const pawnColor = activeColor === "w" ? "black" : "white";

    return {
        targetRow,
        targetCol: col,
        captureRow: pawnColor === "black" ? targetRow + 1 : targetRow - 1,
        captureCol: col,
        pawnColor,
        capturedPiece: pawnColor === "black" ? "bp" : "wp"
    };
}

function parseFenPosition(fen) {
    const parts = String(fen || "").trim().split(/\s+/);
    if (parts.length < 2) return null;

    const [
        boardToken,
        activeColor,
        castlingToken = "-",
        enPassantToken = "-",
        halfmoveClock = "0",
        fullmoveNumber = "1"
    ] = parts;

    return {
        board: parseFenBoard(boardToken),
        activeColor,
        castlingRights: parseFenCastling(castlingToken),
        enPassantTarget: parseFenEnPassant(enPassantToken, activeColor),
        halfmoveClock: Number(halfmoveClock) || 0,
        fullmoveNumber: Number(fullmoveNumber) || 1
    };
}

function shouldShowCoordinates() {
    const settings = getStoredSettings();
    return settings.boardCoordinates !== "Hide";
}

function shouldShowLegalHints() {
    const settings = getStoredSettings();
    return settings.showLegal !== false;
}

function renderPuzzleList(puzzles) {
    if (!puzzleList) return;
    puzzleList.innerHTML = puzzles.map((puzzle) => `
        <button class="premium-list-item premium-puzzle-list-item${puzzle.locked ? " locked" : ""}${puzzle.solved ? " solved" : ""}${currentPuzzle && String(currentPuzzle.id) === String(puzzle.id) ? " active" : ""}" type="button" data-puzzle-id="${puzzle.id}">
            <strong>${escapeHtml(puzzle.title)}</strong>
            <span>${escapeHtml(puzzle.theme || "Puzzle")} - ${escapeHtml(puzzle.difficulty || "Mixed")}</span>
            <small>${puzzle.locked ? "Premium" : puzzle.solved ? "Solved" : puzzle.attemptCount > 0 ? `${puzzle.attemptCount} attempt${puzzle.attemptCount === 1 ? "" : "s"}` : "Open"}</small>
        </button>
    `).join("");
}

function setPuzzleMessage(message, tone = "info") {
    if (!puzzleStatus) return;
    puzzleStatus.textContent = message;
    puzzleStatus.className = `premium-status-banner tone-${tone}`;
    puzzleStatus.classList.remove("hidden");
}

function clearPuzzleMessage() {
    if (!puzzleStatus) return;
    puzzleStatus.classList.add("hidden");
}

function renderSolutionText(solutionMoves) {
    if (!puzzleSolution || !currentPuzzle?.fen) return;

    const line = formatPuzzlePv(solutionMoves || [], currentPuzzle.fen);
    const solvedMeta = currentPuzzle?.solvedAt ? ` Solved on ${formatDateTimeLabel(currentPuzzle.solvedAt)}.` : "";
    puzzleSolution.textContent = line ? `Solution line: ${line}.${solvedMeta}`.trim() : "No stored line.";
    puzzleSolution.classList.remove("hidden");
}

function playSolutionLine(solutionMoves, { resetToStart = false } = {}) {
    clearSolutionPlayback();

    if (!Array.isArray(solutionMoves) || solutionMoves.length === 0) {
        return;
    }

    if (resetToStart && currentPuzzle?.fen) {
        puzzlePosition = parseFenPosition(currentPuzzle.fen);
        puzzleBoardState = puzzlePosition?.board || null;
        selectedSquare = null;
        renderPuzzleBoard();
    }

    const step = (index) => {
        if (!puzzlePosition || index >= solutionMoves.length) {
            solutionPlaybackTimer = null;
            return;
        }

        const parsedMove = parseUciMove(solutionMoves[index]);
        const moveMeta = parsedMove
            ? createMoveMetaFromBoard(puzzlePosition.board, parsedMove, puzzlePosition.enPassantTarget)
            : null;

        if (!moveMeta) {
            solutionPlaybackTimer = null;
            return;
        }

        puzzlePosition = applyMoveToPosition(puzzlePosition, moveMeta);
        puzzleBoardState = puzzlePosition.board;
        renderPuzzleBoard();

        solutionPlaybackTimer = setTimeout(() => {
            step(index + 1);
        }, 550);
    };

    solutionPlaybackTimer = setTimeout(() => {
        step(0);
    }, 250);
}

function renderPuzzleMeta(puzzle, position = puzzlePosition) {
    if (!puzzleMeta) return;

    const chips = [];
    if (position?.activeColor) {
        chips.push(`<span class="premium-badge premium">${position.activeColor === "w" ? "White to move" : "Black to move"}</span>`);
    }
    chips.push(`<span class="premium-badge">${escapeHtml(puzzle.theme || "Puzzle")}</span>`);
    if (puzzle.difficulty) {
        chips.push(`<span class="premium-badge">${escapeHtml(puzzle.difficulty)}</span>`);
    }
    if (puzzle.rating) {
        chips.push(`<span class="premium-badge">Rating ${escapeHtml(puzzle.rating)}</span>`);
    }
    if (puzzle.sourceName) {
        const sourceLabel = puzzle.sourceName === "lichess" ? "Lichess" : "Starter Set";
        chips.push(`<span class="premium-badge${puzzle.sourceName === "lichess" ? " premium" : ""}">${escapeHtml(sourceLabel)}</span>`);
    }
    if (puzzle.solved) {
        chips.push('<span class="premium-badge premium">Solved</span>');
    } else if (puzzle.attemptCount > 0) {
        chips.push(`<span class="premium-badge">${escapeHtml(`${puzzle.attemptCount} attempt${puzzle.attemptCount === 1 ? "" : "s"}`)}</span>`);
    }

    puzzleMeta.innerHTML = chips.join("");
}

function updatePuzzleProgress(progress) {
    if (!progress || !currentPuzzle) return;

    currentPuzzle = {
        ...currentPuzzle,
        attemptCount: Number(progress.attemptCount || 0),
        solved: progress.solved === true,
        solvedAt: progress.solvedAt || null,
        lastAttemptAt: progress.lastAttemptAt || null
    };

    puzzleCatalog = puzzleCatalog.map((puzzle) => (
        String(puzzle.id) === String(currentPuzzle.id)
            ? { ...puzzle, ...currentPuzzle }
            : puzzle
    ));

    renderPuzzleList(puzzleCatalog);
    renderPuzzleMeta(currentPuzzle, puzzlePosition);
}

function renderBoardAxes() {
    const showCoordinates = shouldShowCoordinates();

    if (puzzleRanks) {
        puzzleRanks.innerHTML = showCoordinates
            ? RANKS.map((rank) => `<span class="puzzle-axis-label">${rank}</span>`).join("")
            : "";
        puzzleRanks.classList.toggle("hidden", !showCoordinates);
    }

    if (puzzleFiles) {
        puzzleFiles.innerHTML = showCoordinates
            ? FILES.map((file) => `<span class="puzzle-axis-label">${file}</span>`).join("")
            : "";
        puzzleFiles.classList.toggle("hidden", !showCoordinates);
    }
}

function getLegalTargets() {
    const legalTargets = new Set();

    if (!selectedSquare || !puzzlePosition || !shouldShowLegalHints()) {
        return legalTargets;
    }

    const piece = puzzlePosition.board[selectedSquare.row]?.[selectedSquare.col];
    if (!piece) return legalTargets;

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            if (
                isValidMoveOnBoard(
                    puzzlePosition.board,
                    piece,
                    selectedSquare.row,
                    selectedSquare.col,
                    row,
                    col,
                    false,
                    puzzlePosition
                )
            ) {
                legalTargets.add(`${row}:${col}`);
            }
        }
    }

    return legalTargets;
}

function renderPuzzleBoard() {
    if (!puzzleBoard || !Array.isArray(puzzlePosition?.board)) return;
    puzzleBoard.innerHTML = "";
    renderBoardAxes();
    const legalTargets = getLegalTargets();

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const square = document.createElement("button");
            square.type = "button";
            square.className = "square premium-puzzle-square";
            square.classList.add((row + col) % 2 === 0 ? "light" : "dark");
            square.dataset.row = String(row);
            square.dataset.col = String(col);

            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                square.classList.add("selected");
            }

            const piece = puzzlePosition.board[row][col];
            const isLegalTarget = legalTargets.has(`${row}:${col}`);
            if (isLegalTarget) {
                square.classList.add("legal-target");
                if (piece) {
                    square.classList.add("legal-capture");
                } else {
                    const targetDot = document.createElement("span");
                    targetDot.className = "legal-target-dot";
                    square.appendChild(targetDot);
                }
            }

            if (piece) {
                const img = document.createElement("img");
                img.src = `src/assets/pieces/${pieceMap[piece]}`;
                img.alt = piece;
                square.appendChild(img);
            }

            square.addEventListener("click", () => handleSquareClick(row, col));
            puzzleBoard.appendChild(square);
        }
    }
}

function toAlgebraic(row, col) {
    return `${FILES[col]}${8 - row}`;
}

function buildMoveUci(fromRow, fromCol, toRow, toCol, promotion = "") {
    return `${toAlgebraic(fromRow, fromCol)}${toAlgebraic(toRow, toCol)}${promotion}`;
}

function parseUciMove(moveUci) {
    if (!moveUci || moveUci.length < 4) return null;

    const fromCol = FILES.indexOf(moveUci[0]);
    const toCol = FILES.indexOf(moveUci[2]);
    const fromRank = Number(moveUci[1]);
    const toRank = Number(moveUci[3]);
    if (fromCol < 0 || toCol < 0 || Number.isNaN(fromRank) || Number.isNaN(toRank)) return null;

    return {
        fromRow: 8 - fromRank,
        fromCol,
        toRow: 8 - toRank,
        toCol,
        promotion: moveUci[4] || ""
    };
}

function isPathClear(board, fromRow, fromCol, toRow, toCol) {
    const rowStep = toRow === fromRow ? 0 : (toRow > fromRow ? 1 : -1);
    const colStep = toCol === fromCol ? 0 : (toCol > fromCol ? 1 : -1);

    let row = fromRow + rowStep;
    let col = fromCol + colStep;

    while (row !== toRow || col !== toCol) {
        if (board[row][col] !== "") return false;
        row += rowStep;
        col += colStep;
    }

    return true;
}

function findKingOnBoard(state, color) {
    const kingCode = color === "white" ? "wk" : "bk";
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            if (state[row][col] === kingCode) {
                return { row, col };
            }
        }
    }
    return null;
}

function canCaptureEnPassant(state, piece, row, col, targetRow, targetCol, position) {
    const target = position.enPassantTarget;
    if (!target) return false;
    return (
        target.targetRow === targetRow &&
        target.targetCol === targetCol &&
        Math.abs(col - targetCol) === 1 &&
        target.pawnColor !== (piece.startsWith("w") ? "white" : "black") &&
        state[target.captureRow]?.[target.captureCol] === target.capturedPiece
    );
}

function canCastleOnBoard(state, color, side, position) {
    const rights = position.castlingRights?.[color];
    if (!rights || rights.kingMoved) return false;
    if (isKingInCheckOnBoard(state, color, position)) return false;

    const row = color === "white" ? 7 : 0;
    const kingPiece = color === "white" ? "wk" : "bk";
    const rookPiece = color === "white" ? "wr" : "br";
    const rookCol = side === "king" ? 7 : 0;
    const pathCols = side === "king" ? [5, 6] : [1, 2, 3];
    const kingPassCols = side === "king" ? [5, 6] : [3, 2];

    if (state[row][4] !== kingPiece || state[row][rookCol] !== rookPiece) return false;
    if ((side === "king" && rights.rookH) || (side === "queen" && rights.rookA)) return false;
    if (pathCols.some((colIndex) => state[row][colIndex] !== "")) return false;

    const enemyColor = color === "white" ? "black" : "white";
    if (kingPassCols.some((colIndex) => isSquareAttackedOnBoard(state, enemyColor, row, colIndex, position))) {
        return false;
    }

    return true;
}

function getSpecialMoveMetaForBoard(state, piece, fromRow, fromCol, toRow, toCol, position) {
    if (piece[1] === "k" && Math.abs(toCol - fromCol) === 2) {
        const rookFromCol = toCol > fromCol ? 7 : 0;
        const rookToCol = toCol > fromCol ? 5 : 3;
        return {
            castleSide: toCol > fromCol ? "king" : "queen",
            rookMove: {
                piece: piece.startsWith("w") ? "wr" : "br",
                fromRow,
                fromCol: rookFromCol,
                toRow: fromRow,
                toCol: rookToCol
            },
            enPassantCapture: null
        };
    }

    if (
        piece[1] === "p" &&
        fromCol !== toCol &&
        state[toRow][toCol] === "" &&
        canCaptureEnPassant(state, piece, fromRow, fromCol, toRow, toCol, position)
    ) {
        return {
            castleSide: null,
            rookMove: null,
            enPassantCapture: {
                row: position.enPassantTarget.captureRow,
                col: position.enPassantTarget.captureCol,
                piece: position.enPassantTarget.capturedPiece
            }
        };
    }

    return {
        castleSide: null,
        rookMove: null,
        enPassantCapture: null
    };
}

function updateCastlingRightsForMove(move, rights) {
    const movingColor = move.piece.startsWith("w") ? "white" : "black";
    const opponentColor = movingColor === "white" ? "black" : "white";

    if (move.piece[1] === "k") {
        rights[movingColor].kingMoved = true;
    }

    if (move.piece[1] === "r") {
        if (move.fromRow === (movingColor === "white" ? 7 : 0) && move.fromCol === 0) rights[movingColor].rookA = true;
        if (move.fromRow === (movingColor === "white" ? 7 : 0) && move.fromCol === 7) rights[movingColor].rookH = true;
    }

    if (move.captured === (opponentColor === "white" ? "wr" : "br")) {
        const captureRow = move.enPassantCapture ? move.enPassantCapture.row : move.toRow;
        const captureCol = move.enPassantCapture ? move.enPassantCapture.col : move.toCol;
        if (captureRow === (opponentColor === "white" ? 7 : 0) && captureCol === 0) rights[opponentColor].rookA = true;
        if (captureRow === (opponentColor === "white" ? 7 : 0) && captureCol === 7) rights[opponentColor].rookH = true;
    }
}

function getEnPassantTargetForMove(move) {
    if (move.piece[1] !== "p") return null;
    if (Math.abs(move.toRow - move.fromRow) !== 2) return null;

    const direction = move.piece.startsWith("w") ? -1 : 1;
    const pawnColor = move.piece.startsWith("w") ? "white" : "black";
    return {
        targetRow: move.fromRow + direction,
        targetCol: move.fromCol,
        captureRow: move.toRow,
        captureCol: move.toCol,
        pawnColor,
        capturedPiece: move.piece
    };
}

function applyMoveToPosition(position, move) {
    const nextBoard = cloneBoard(position.board);
    const nextRights = cloneCastlingRights(position.castlingRights);

    nextBoard[move.toRow][move.toCol] = move.promotedTo || move.piece;
    nextBoard[move.fromRow][move.fromCol] = "";

    if (move.enPassantCapture) {
        nextBoard[move.enPassantCapture.row][move.enPassantCapture.col] = "";
    }

    if (move.rookMove) {
        nextBoard[move.rookMove.toRow][move.rookMove.toCol] = move.rookMove.piece;
        nextBoard[move.rookMove.fromRow][move.rookMove.fromCol] = "";
    }

    updateCastlingRightsForMove(move, nextRights);

    return {
        board: nextBoard,
        activeColor: position.activeColor === "w" ? "b" : "w",
        castlingRights: nextRights,
        enPassantTarget: getEnPassantTargetForMove(move),
        halfmoveClock: position.halfmoveClock,
        fullmoveNumber: position.fullmoveNumber
    };
}

function createMoveMetaForAttempt(position, fromRow, fromCol, toRow, toCol, promotionOverride = "") {
    const piece = position.board[fromRow]?.[fromCol];
    if (!piece) return null;

    const parsedMove = {
        fromRow,
        fromCol,
        toRow,
        toCol,
        promotion: promotionOverride || ""
    };

    return createMoveMetaFromBoard(position.board, parsedMove, position.enPassantTarget);
}

function createMoveMetaFromBoard(board, parsedMove, enPassantTarget = null) {
    const piece = board?.[parsedMove.fromRow]?.[parsedMove.fromCol];
    if (!piece) return null;

    const targetPiece = board?.[parsedMove.toRow]?.[parsedMove.toCol] || "";
    const isCastle = piece[1] === "k" && Math.abs(parsedMove.toCol - parsedMove.fromCol) === 2;
    const isEnPassant = piece[1] === "p"
        && parsedMove.fromCol !== parsedMove.toCol
        && !targetPiece
        && enPassantTarget
        && enPassantTarget.targetRow === parsedMove.toRow
        && enPassantTarget.targetCol === parsedMove.toCol;
    const isPromotion =
        (piece === "wp" && parsedMove.toRow === 0) ||
        (piece === "bp" && parsedMove.toRow === 7);

    const moveMeta = {
        piece,
        fromRow: parsedMove.fromRow,
        fromCol: parsedMove.fromCol,
        toRow: parsedMove.toRow,
        toCol: parsedMove.toCol,
        captured: isEnPassant ? board[parsedMove.fromRow][parsedMove.toCol] : (targetPiece || null),
        promotedTo: isPromotion ? `${piece[0]}${(parsedMove.promotion || "q").toLowerCase()}` : null,
        castleSide: null,
        rookMove: null,
        enPassantCapture: null
    };

    if (isCastle) {
        const rookFromCol = parsedMove.toCol > parsedMove.fromCol ? 7 : 0;
        const rookToCol = parsedMove.toCol > parsedMove.fromCol ? parsedMove.toCol - 1 : parsedMove.toCol + 1;
        moveMeta.castleSide = parsedMove.toCol > parsedMove.fromCol ? "king" : "queen";
        moveMeta.rookMove = {
            piece: piece.startsWith("w") ? "wr" : "br",
            fromRow: parsedMove.fromRow,
            fromCol: rookFromCol,
            toRow: parsedMove.fromRow,
            toCol: rookToCol
        };
    }

    if (isEnPassant) {
        moveMeta.enPassantCapture = {
            row: parsedMove.fromRow,
            col: parsedMove.toCol,
            piece: board[parsedMove.fromRow][parsedMove.toCol]
        };
    }

    return moveMeta;
}

function isSquareAttackedOnBoard(state, byColor, targetRow, targetCol, position) {
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = state[row][col];
            if (!piece) continue;

            if (
                (byColor === "white" && piece.startsWith("w")) ||
                (byColor === "black" && piece.startsWith("b"))
            ) {
                if (isValidMoveOnBoard(state, piece, row, col, targetRow, targetCol, true, position)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isKingInCheckOnBoard(state, color, position) {
    const kingPos = findKingOnBoard(state, color);
    if (!kingPos) return false;
    const enemyColor = color === "white" ? "black" : "white";
    return isSquareAttackedOnBoard(state, enemyColor, kingPos.row, kingPos.col, position);
}

function isValidMoveOnBoard(state, piece, row, col, targetRow, targetCol, skipCheck, position) {
    if (row === targetRow && col === targetCol) return false;

    const color = piece.startsWith("w") ? "white" : "black";
    const target = state[targetRow][targetCol];
    if (target && target.startsWith(piece[0])) return false;
    if (target && target[1] === "k" && !skipCheck) return false;

    const type = piece[1];
    let valid = false;

    switch (type) {
        case "p": {
            const dir = color === "white" ? -1 : 1;
            const startRow = color === "white" ? 6 : 1;

            if (col === targetCol && target === "") {
                if (row + dir === targetRow) valid = true;
                if (row === startRow && row + (2 * dir) === targetRow && state[row + dir][col] === "") valid = true;
            }

            if (Math.abs(col - targetCol) === 1 && row + dir === targetRow) {
                if (target && !target.startsWith(piece[0])) {
                    valid = true;
                } else if (canCaptureEnPassant(state, piece, row, col, targetRow, targetCol, position)) {
                    valid = true;
                }
            }
            break;
        }
        case "n": {
            const dr = Math.abs(targetRow - row);
            const dc = Math.abs(targetCol - col);
            valid = (dr === 2 && dc === 1) || (dr === 1 && dc === 2);
            break;
        }
        case "b":
            valid = Math.abs(targetRow - row) === Math.abs(targetCol - col) && isPathClear(state, row, col, targetRow, targetCol);
            break;
        case "r":
            valid = (row === targetRow || col === targetCol) && isPathClear(state, row, col, targetRow, targetCol);
            break;
        case "q": {
            const dr = Math.abs(targetRow - row);
            const dc = Math.abs(targetCol - col);
            valid = (dr === dc || row === targetRow || col === targetCol) && isPathClear(state, row, col, targetRow, targetCol);
            break;
        }
        case "k": {
            const dr = Math.abs(targetRow - row);
            const dc = Math.abs(targetCol - col);
            valid = dr <= 1 && dc <= 1;
            if (!valid && dr === 0 && dc === 2 && !skipCheck) {
                valid = canCastleOnBoard(state, color, targetCol > col ? "king" : "queen", position);
            }
            break;
        }
        default:
            return false;
    }

    if (valid && !skipCheck) {
        const moveMeta = createMoveMetaForAttempt(position, row, col, targetRow, targetCol);
        if (!moveMeta) return false;
        const nextPosition = applyMoveToPosition(position, moveMeta);
        if (isKingInCheckOnBoard(nextPosition.board, color, nextPosition)) {
            return false;
        }
    }

    return valid;
}

function canPieceReachTargetForNotation(board, piece, fromRow, fromCol, toRow, toCol) {
    if (!board || !piece) return false;
    if (fromRow === toRow && fromCol === toCol) return false;

    const target = board[toRow]?.[toCol] || "";
    if (target && target.startsWith(piece[0])) return false;

    const rowDiff = toRow - fromRow;
    const colDiff = toCol - fromCol;
    const absRow = Math.abs(rowDiff);
    const absCol = Math.abs(colDiff);

    if (piece[1] === "n") return (absRow === 2 && absCol === 1) || (absRow === 1 && absCol === 2);
    if (piece[1] === "b") return absRow === absCol && isPathClear(board, fromRow, fromCol, toRow, toCol);
    if (piece[1] === "r") return (fromRow === toRow || fromCol === toCol) && isPathClear(board, fromRow, fromCol, toRow, toCol);
    if (piece[1] === "q") return ((absRow === absCol) || (fromRow === toRow || fromCol === toCol)) && isPathClear(board, fromRow, fromCol, toRow, toCol);
    if (piece[1] === "k") return absRow <= 1 && absCol <= 1;
    return false;
}

function getNotationDisambiguation(board, moveMeta) {
    const { piece, fromRow, fromCol, toRow, toCol } = moveMeta;
    const contenders = [];

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            if (row === fromRow && col === fromCol) continue;
            if (board[row][col] !== piece) continue;
            if (canPieceReachTargetForNotation(board, piece, row, col, toRow, toCol)) {
                contenders.push({ row, col });
            }
        }
    }

    return contenders.length > 0 ? toAlgebraic(fromRow, fromCol) : "";
}

function buildSanLikeNotation(moveMeta, board) {
    if (moveMeta.castleSide) {
        return moveMeta.castleSide === "king" ? "O-O" : "O-O-O";
    }

    const { piece, fromRow, fromCol, toRow, toCol, captured, promotedTo } = moveMeta;
    const isPawn = piece[1] === "p";
    const pieceLetter = isPawn ? "" : piece[1].toUpperCase();
    const captureMark = captured ? "x" : "";
    const targetSquare = toAlgebraic(toRow, toCol);
    const promotionMark = promotedTo ? `=${promotedTo[1].toUpperCase()}` : "";

    if (isPawn) {
        const pawnPrefix = captured ? toAlgebraic(fromRow, fromCol)[0] : "";
        return `${pawnPrefix}${captureMark}${targetSquare}${promotionMark}`;
    }

    return `${pieceLetter}${getNotationDisambiguation(board, moveMeta)}${captureMark}${targetSquare}${promotionMark}`;
}

function formatPuzzlePv(solutionMoves, fen, moveLimit = 6) {
    const position = parseFenPosition(fen);
    if (!position) return "";

    let currentPosition = {
        board: cloneBoard(position.board),
        activeColor: position.activeColor,
        castlingRights: cloneCastlingRights(position.castlingRights),
        enPassantTarget: cloneEnPassantTarget(position.enPassantTarget),
        halfmoveClock: position.halfmoveClock,
        fullmoveNumber: position.fullmoveNumber
    };

    return (solutionMoves || []).slice(0, moveLimit).map((moveUci) => {
        const parsed = parseUciMove(moveUci);
        if (!parsed) return "";

        const moveMeta = createMoveMetaFromBoard(currentPosition.board, parsed, currentPosition.enPassantTarget);
        if (!moveMeta) return "";

        const notation = buildSanLikeNotation(moveMeta, currentPosition.board);
        currentPosition = applyMoveToPosition(currentPosition, moveMeta);
        return notation;
    }).filter(Boolean).join("  ");
}

function handleSquareClick(row, col) {
    if (!currentPuzzle || currentPuzzle.locked || !puzzlePosition || puzzleSolved) return;

    const piece = puzzlePosition.board[row][col];
    const sideToMove = puzzlePosition.activeColor === "b" ? "black" : "white";

    if (!selectedSquare) {
        if (!piece) return;
        if (sideToMove === "white" && !piece.startsWith("w")) return;
        if (sideToMove === "black" && !piece.startsWith("b")) return;
        selectedSquare = { row, col };
        renderPuzzleBoard();
        return;
    }

    if (selectedSquare.row === row && selectedSquare.col === col) {
        selectedSquare = null;
        renderPuzzleBoard();
        return;
    }

    if (piece && piece[0] === puzzlePosition.board[selectedSquare.row][selectedSquare.col]?.[0]) {
        selectedSquare = { row, col };
        renderPuzzleBoard();
        return;
    }

    const fromPiece = puzzlePosition.board[selectedSquare.row][selectedSquare.col];
    const isLegal = isValidMoveOnBoard(
        puzzlePosition.board,
        fromPiece,
        selectedSquare.row,
        selectedSquare.col,
        row,
        col,
        false,
        puzzlePosition
    );

    if (!isLegal) {
        playUiSound("warning");
        setPuzzleMessage("That move is not legal in this position.", "warning");
        return;
    }

    const moveMeta = createMoveMetaForAttempt(puzzlePosition, selectedSquare.row, selectedSquare.col, row, col);
    const promotion = moveMeta?.promotedTo ? moveMeta.promotedTo[1] : "";
    submitAttempt(buildMoveUci(selectedSquare.row, selectedSquare.col, row, col, promotion), moveMeta);
    selectedSquare = null;
    renderPuzzleBoard();
}

async function submitAttempt(moveUci, moveMeta) {
    const response = await apiFetch(`/api/premium/puzzles/${currentPuzzle.id}/attempt`, {
        method: "POST",
        body: JSON.stringify({ move: moveUci })
    });

    if (!response) {
        setPuzzleMessage("Unable to check that move right now.", "warning");
        return;
    }

    const data = await response.json();
    if (response.status === 401) {
        redirectToLogin("Your session expired. Please log in again.");
        return;
    }

    if (response.status === 403) {
        redirectToSubscription(data.error || "Subscribe to solve premium puzzles.");
        return;
    }

    if (!response.ok) {
        setPuzzleMessage(data.error || "Unable to check that move.", "warning");
        return;
    }

    if (data.correct) {
        currentPuzzle.solutionMoves = Array.isArray(data.solutionMoves) ? data.solutionMoves : (currentPuzzle.solutionMoves || []);
        if (moveMeta) {
            puzzlePosition = applyMoveToPosition(puzzlePosition, moveMeta);
            puzzleBoardState = puzzlePosition.board;
            puzzleSolved = true;
            selectedSquare = null;
            renderPuzzleBoard();
        }
        playUiSound("success");
        updatePuzzleProgress(data.progress || null);
        setPuzzleMessage(data.message || "Correct move. Completing the line.", "success");
        renderSolutionText(currentPuzzle.solutionMoves);
        playSolutionLine(currentPuzzle.solutionMoves.slice(1));
        return;
    }

    playUiSound("warning");
    updatePuzzleProgress(data.progress || null);
    setPuzzleMessage(data.message || "Try again.", "warning");
}

function revealSolution(solutionMoves) {
    if (!currentPuzzle?.fen) return;

    currentPuzzle.solutionMoves = Array.isArray(solutionMoves) ? solutionMoves : (currentPuzzle.solutionMoves || []);
    puzzleSolved = true;
    selectedSquare = null;
    renderSolutionText(currentPuzzle.solutionMoves);
    playSolutionLine(currentPuzzle.solutionMoves, { resetToStart: true });
}

async function openPuzzle(id) {
    const response = await apiFetch(`/api/premium/puzzles/${id}`);
    if (!response) {
        setPuzzleMessage("Unable to load this puzzle right now.", "warning");
        return;
    }

    const data = await response.json();
    if (response.status === 401) {
        redirectToLogin("Your session expired. Please log in again.");
        return;
    }

    if (response.status === 403) {
        redirectToSubscription(data.error || "Subscribe to unlock the puzzle trainer.");
        return;
    }

    if (!response.ok || !data.puzzle) {
        setPuzzleMessage(data.error || "Unable to load the selected puzzle.", "warning");
        return;
    }

    currentPuzzle = data.puzzle;
    clearSolutionPlayback();
    renderPuzzleList(puzzleCatalog);
    puzzlePosition = parseFenPosition(currentPuzzle.fen);
    puzzleBoardState = puzzlePosition?.board || null;
    selectedSquare = null;
    puzzleSolved = false;

    if (puzzleTitle) puzzleTitle.textContent = currentPuzzle.title;
    if (puzzleDescription) {
        puzzleDescription.textContent = currentPuzzle.description || "Find the best move.";
    }
    renderPuzzleMeta(currentPuzzle, puzzlePosition);
    if (puzzleBoardWrap) puzzleBoardWrap.classList.remove("hidden");
    if (puzzleSourceRow && puzzleSourceLink) {
        if (currentPuzzle.gameUrl) {
            puzzleSourceLink.href = currentPuzzle.gameUrl;
            puzzleSourceRow.classList.remove("hidden");
        } else {
            puzzleSourceRow.classList.add("hidden");
        }
    }
    if (lockedPuzzleCta) lockedPuzzleCta.classList.add("hidden");
    if (showSolutionBtn) {
        showSolutionBtn.classList.remove("hidden");
        showSolutionBtn.onclick = () => revealSolution(currentPuzzle.solutionMoves || []);
    }
    if (puzzleSolution) {
        puzzleSolution.textContent = "";
        puzzleSolution.classList.add("hidden");
    }

    clearPuzzleMessage();
    renderPuzzleBoard();
}

async function initPuzzles() {
    applyAppearanceSettings();

    // No premium gate here — free puzzles are accessible to all logged-in users.
    // The backend returns locked:true for premium puzzles if !isPremiumUser,
    // so non-premium users see free puzzles playable and premium ones as locked cards.

    const response = await apiFetch("/api/premium/puzzles");
    if (!response) {
        if (puzzleList) {
            puzzleList.innerHTML = '<p class="premium-muted">Unable to load puzzles right now.</p>';
        }
        return;
    }

    if (response.status === 401) {
        redirectToLogin("Your session expired. Please log in again.");
        return;
    }

    if (!response.ok) {
        if (puzzleList) {
            puzzleList.innerHTML = '<p class="premium-muted">Unable to load puzzles right now.</p>';
        }
        return;
    }

    const data = await response.json();
    premiumUnlocked = !!data.isPremium;
    puzzleCatalog = Array.isArray(data.puzzles) ? data.puzzles : [];

    if (puzzleMembershipNote) {
        puzzleMembershipNote.textContent = data.isPremium
            ? "Premium puzzles are unlocked for your account."
            : "Free puzzles are available. Subscribe to unlock all premium challenges.";
    }

    renderPuzzleList(puzzleCatalog);
    puzzleList?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-puzzle-id]");
        if (!button) return;
        openPuzzle(button.dataset.puzzleId);
    });

    const requestedPuzzleId = getRequestedPuzzleId();
    const requestedPuzzle = requestedPuzzleId
        ? puzzleCatalog.find((puzzle) => String(puzzle.id) === requestedPuzzleId)
        : null;

    if (requestedPuzzle) {
        openPuzzle(requestedPuzzle.id);
        return;
    }

    if (puzzleCatalog.length > 0) {
        openPuzzle(puzzleCatalog[0].id);
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

initPuzzles();
