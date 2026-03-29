import { createStockfishCoach } from "./components/coach-engine.js";

const overviewSection = document.getElementById("historyOverview");
const reviewSection = document.getElementById("historyReview");
const listContainer = document.getElementById("historyList");
const filterToggle = document.getElementById("filterToggle");
const filtersPanel = document.getElementById("historyFilters");
const filterResult = document.getElementById("filterResult");
const filterOpponent = document.getElementById("filterOpponent");
const filterMoves = document.getElementById("filterMoves");
const filterSort = document.getElementById("filterSort");
const applyFiltersBtn = document.getElementById("applyFilters");
const resetFiltersBtn = document.getElementById("resetFilters");
const backToHistoryBtn = document.getElementById("backToHistory");

const reviewTitle = document.getElementById("reviewTitle");
const reviewDate = document.getElementById("reviewDate");
const reviewWinner = document.getElementById("reviewWinner");
const reviewBoard = document.getElementById("reviewBoard");
const reviewControls = document.getElementById("reviewControls");
const reviewMovesList = document.getElementById("reviewMovesList");
const reviewMovesNote = document.getElementById("reviewMovesNote");
const reviewCapturedTop = document.getElementById("reviewCapturedTop");
const reviewCapturedBottom = document.getElementById("reviewCapturedBottom");
const historyCoachStatus = document.getElementById("historyCoachStatus");
const historyCoachEval = document.getElementById("historyCoachEval");
const historyCoachBestMove = document.getElementById("historyCoachBestMove");
const historyCoachBestLine = document.getElementById("historyCoachBestLine");
const historyCoachTurnHint = document.getElementById("historyCoachTurnHint");
const historyCoachTopMoves = document.getElementById("historyCoachTopMoves");

const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
let allGames = [];
let filteredGames = [];
let historyCoach = null;
let historyCoachRequestId = 0;

const BOARD_THEME_CLASS_PREFIX = "board-theme-";
const PIECE_STYLE_CLASS_PREFIX = "piece-style-";

function decorateUiPieceIcon(img, piece, ...extraClasses) {
    img.classList.add(...extraClasses);
    if (piece?.startsWith("b")) {
        img.classList.add("ui-piece-icon-black");
    }
}

function getStoredSettings() {
    try {
        return JSON.parse(localStorage.getItem("royalmindSettings")) || {};
    } catch {
        return {};
    }
}

function normalizeAppearanceToken(value, fallback) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return normalized || fallback;
}

function applyAppearanceSettings() {
    const body = document.body;
    if (!body) return;

    const settings = getStoredSettings();
    const boardTheme = `${BOARD_THEME_CLASS_PREFIX}${normalizeAppearanceToken(settings.boardTheme, "classic-wood")}`;
    const pieceStyle = `${PIECE_STYLE_CLASS_PREFIX}${normalizeAppearanceToken(settings.pieceStyle, "royal-set")}`;
    const animationClass = settings.animatePieces === false ? "pieces-static" : "pieces-animated";

    [BOARD_THEME_CLASS_PREFIX, PIECE_STYLE_CLASS_PREFIX].forEach((prefix) => {
        Array.from(body.classList)
            .filter((className) => className.startsWith(prefix))
            .forEach((className) => body.classList.remove(className));
    });

    body.classList.remove("pieces-static", "pieces-animated");
    body.classList.add(boardTheme, pieceStyle, animationClass);
}

function parseStoredUser() {
    const raw = localStorage.getItem("royalmindUser");
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return raw.includes("@")
            ? { email: raw, displayName: raw }
            : { username: raw, displayName: raw };
    }
}

function getStoredUserLabel() {
    const user = parseStoredUser();
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return user?.displayName || user?.username || fullName || user?.email || null;
}

async function fetchGamesFromServer() {
    const token = localStorage.getItem("token");
    if (!token) return null;

    for (const base of API_BASES) {
        try {
            const response = await fetch(`${base}/api/games`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) continue;
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch {
            // try next base
        }
    }
    return null;
}

function getLocalGames() {
    const games = JSON.parse(localStorage.getItem("royalmindHistory")) || [];
    const userLabel = getStoredUserLabel();
    return userLabel ? games.filter(g => g.user === userLabel) : games;
}

function normalizeServerGames(games) {
    return games.map(game => {
        let moves = null;
        if (typeof game.moves === "string") {
            try {
                moves = JSON.parse(game.moves);
            } catch {
                moves = null;
            }
        } else if (Array.isArray(game.moves)) {
            moves = game.moves;
        }

        const playedAt = game.played_at ? new Date(game.played_at) : null;

        return {
            id: game.id,
            date: playedAt ? playedAt.toLocaleString() : "Unknown date",
            timestamp: playedAt ? playedAt.getTime() : 0,
            winner: game.result || "Unknown",
            opponent: game.opponent || "Local",
            moves
        };
    });
}

function normalizeLocalGames(games) {
    return games.map((game, index) => {
        const dateObj = game.date ? new Date(game.date) : null;
        return {
            id: game.id || `local-${index}`,
            date: game.date || "Unknown date",
            timestamp: dateObj ? dateObj.getTime() : 0,
            winner: game.winner || "Unknown",
            opponent: game.opponent || "Local",
            moves: Array.isArray(game.moves) ? game.moves : null
        };
    });
}

function populateResultFilter(games) {
    if (!filterResult) return;
    const options = ["Any Result", ...new Set(games.map(g => g.winner).filter(Boolean))];
    filterResult.innerHTML = "";
    options.forEach((opt, index) => {
        const option = document.createElement("option");
        option.value = index === 0 ? "any" : opt;
        option.textContent = opt;
        filterResult.appendChild(option);
    });
}

function applyFilters() {
    const resultValue = filterResult ? filterResult.value : "any";
    const opponentValue = filterOpponent ? filterOpponent.value.trim().toLowerCase() : "";
    const minMoves = filterMoves ? Number(filterMoves.value) : 0;
    const sortMode = filterSort ? filterSort.value : "recent";

    filteredGames = allGames.filter(game => {
        const matchesResult = resultValue === "any" || game.winner === resultValue;
        const matchesOpponent = !opponentValue || game.opponent.toLowerCase().includes(opponentValue);
        const moveCount = Array.isArray(game.moves) ? game.moves.length : 0;
        const matchesMoves = !minMoves || moveCount >= minMoves;
        return matchesResult && matchesOpponent && matchesMoves;
    });

    filteredGames.sort((a, b) => {
        if (sortMode === "oldest") return a.timestamp - b.timestamp;
        return b.timestamp - a.timestamp;
    });

    renderList(filteredGames);
}

function resetFilters() {
    if (filterOpponent) filterOpponent.value = "";
    if (filterMoves) filterMoves.value = "";
    if (filterSort) filterSort.value = "recent";
    if (filterResult) filterResult.value = "any";
    applyFilters();
}

function renderList(games) {
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (!games || games.length === 0) {
        listContainer.innerHTML = "<div class=\"history-empty\">No games found.</div>";
        return;
    }

    games.forEach((game, index) => {
        const displayNumber = games.length - index;
        const row = document.createElement("div");
        row.className = "history-row";
        row.innerHTML = `
            <div class="history-cell history-cell-game">
                <div class="history-game-label">Game ${displayNumber}</div>
                <div class="history-game-opponent">vs ${game.opponent || "Local"}</div>
            </div>
            <div class="history-cell">
                <span class="history-result-pill">${game.winner || "Unknown"}</span>
            </div>
            <div class="history-cell">${Array.isArray(game.moves) ? game.moves.length : 0}</div>
            <div class="history-cell">${game.date || "Unknown date"}</div>
            <div class="history-cell history-cell-actions">
                <button class="history-mini-btn" data-action="review" data-id="${game.id}" data-display="${displayNumber}">Review</button>
                <button class="history-mini-btn ghost" data-action="analyze" data-id="${game.id}" data-display="${displayNumber}">Analyze</button>
            </div>
        `;

        listContainer.appendChild(row);
    });
}

function showReview(game, displayNumber) {
    if (!game) return;
    if (overviewSection) overviewSection.classList.add("hidden");
    if (reviewSection) reviewSection.classList.remove("hidden");

    if (reviewTitle) reviewTitle.textContent = `Game ${displayNumber || game.id}`;
    if (reviewDate) reviewDate.textContent = game.date || "Unknown date";
    if (reviewWinner) reviewWinner.textContent = `Winner: ${game.winner || "Unknown"}`;

    setupReviewBoard(game);
}

function showOverview() {
    if (reviewSection) reviewSection.classList.add("hidden");
    if (overviewSection) overviewSection.classList.remove("hidden");
}

function setupReviewBoard(game) {
    reviewControls.innerHTML = `
        <button class="history-btn ghost" data-action="start">Start</button>
        <button class="history-btn" data-action="prev">Rewind</button>
        <button class="history-btn" data-action="next">Play</button>
        <button class="history-btn ghost" data-action="end">End</button>
        <button class="history-btn" data-action="auto">Auto</button>
        <label class="history-speed">
            <span>Speed</span>
            <input class="history-speed-input" type="range" min="0.5" max="2" step="0.25" value="1">
            <span class="history-speed-value">1x</span>
        </label>
        <span class="history-step">0 / 0</span>
    `;

    const moves = Array.isArray(game.moves) ? game.moves : null;
    reviewMovesNote.textContent = "";

    if (!moves) {
        reviewMovesNote.textContent = "Replay not available for this game.";
        renderBoard(reviewBoard, getInitialBoard());
        renderReviewCaptures({ capturedByWhite: [], capturedByBlack: [] });
        renderHistoryCoachLoading("Replay not available");
        reviewMovesList.innerHTML = "<div class=\"history-move-row empty\">No moves available.</div>";
        reviewMovesList.onclick = null;
        return;
    }

    let currentIndex = 0;
    let autoTimer = null;
    let autoPlaying = false;
    const speedInput = reviewControls.querySelector(".history-speed-input");
    const speedValue = reviewControls.querySelector(".history-speed-value");
    const autoButton = reviewControls.querySelector('[data-action="auto"]');
    const stepLabel = reviewControls.querySelector(".history-step");
    const annotatedMoves = buildAnnotatedMoves(moves);

    const updateStep = () => {
        stepLabel.textContent = `${currentIndex} / ${moves.length}`;
    };

    const renderCurrentReviewState = () => {
        const position = buildReviewPosition(moves, currentIndex);
        renderBoard(reviewBoard, position.board);
        renderReviewCaptures(position);
        updateStep();
        renderMovesList(reviewMovesList, annotatedMoves, currentIndex);
        analyzeHistoryPosition(position);
    };

    const stopAuto = () => {
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }
        autoPlaying = false;
        if (autoButton) autoButton.textContent = "Auto";
    };

    const startAuto = () => {
        stopAuto();
        autoPlaying = true;
        if (autoButton) autoButton.textContent = "Pause";
        const speed = Number(speedInput ? speedInput.value : 1) || 1;
        const delay = Math.max(150, 800 / speed);
        autoTimer = setInterval(() => {
            if (currentIndex >= moves.length) {
                stopAuto();
                return;
            }
            currentIndex += 1;
            renderCurrentReviewState();
        }, delay);
    };

    reviewControls.onclick = (event) => {
        const action = event.target.getAttribute("data-action");
        if (!action) return;

        if (action === "start") {
            stopAuto();
            currentIndex = 0;
            renderCurrentReviewState();
            return;
        }

        if (action === "next" && currentIndex < moves.length) {
            stopAuto();
            currentIndex += 1;
            renderCurrentReviewState();
        }

        if (action === "prev" && currentIndex > 0) {
            stopAuto();
            currentIndex -= 1;
            renderCurrentReviewState();
        }

        if (action === "end") {
            stopAuto();
            currentIndex = moves.length;
            renderCurrentReviewState();
        }

        if (action === "auto") {
            if (autoPlaying) {
                stopAuto();
            } else {
                startAuto();
            }
        }
    };

    reviewMovesList.onclick = (event) => {
        const target = event.target.closest("[data-move-index]");
        if (!target) return;

        const index = Number(target.dataset.moveIndex);
        if (!Number.isFinite(index) || index < 0 || index >= moves.length) return;

        stopAuto();
        currentIndex = index + 1;
        renderCurrentReviewState();
    };

    renderCurrentReviewState();

    if (speedInput && speedValue) {
        speedValue.textContent = `${speedInput.value}x`;
        speedInput.addEventListener("input", () => {
            speedValue.textContent = `${speedInput.value}x`;
            if (autoPlaying) {
                startAuto();
            }
        });
    }
}

function buildReviewPosition(moves, currentIndex) {
    const board = getInitialBoard();
    const castlingRights = createInitialCastlingRights();
    let enPassantTarget = null;
    const capturedByWhite = [];
    const capturedByBlack = [];

    for (let index = 0; index < currentIndex; index += 1) {
        const move = moves[index];
        applyMoveToBoard(board, move, true);
        updateCastlingRightsForMove(move, castlingRights);
        enPassantTarget = getEnPassantTargetForMove(move);

        if (move.captured) {
            if (move.piece.startsWith("w")) {
                capturedByWhite.push(move.captured);
            } else {
                capturedByBlack.push(move.captured);
            }
        }
    }

    return {
        board,
        castlingRights,
        enPassantTarget,
        sideToMove: currentIndex % 2 === 0 ? "w" : "b",
        moveCount: currentIndex,
        capturedByWhite,
        capturedByBlack
    };
}

function renderReviewCaptures(position) {
    if (reviewCapturedTop) {
        reviewCapturedTop.innerHTML = "";
        position.capturedByBlack.forEach((piece) => {
            const img = document.createElement("img");
            img.src = `src/assets/pieces/${pieceMap[piece]}`;
            img.alt = piece;
            decorateUiPieceIcon(img, piece, "captured-piece-icon");
            reviewCapturedTop.appendChild(img);
        });
    }

    if (reviewCapturedBottom) {
        reviewCapturedBottom.innerHTML = "";
        position.capturedByWhite.forEach((piece) => {
            const img = document.createElement("img");
            img.src = `src/assets/pieces/${pieceMap[piece]}`;
            img.alt = piece;
            decorateUiPieceIcon(img, piece, "captured-piece-icon");
            reviewCapturedBottom.appendChild(img);
        });
    }
}

function ensureHistoryCoach() {
    if (historyCoach) return historyCoach;

    try {
        historyCoach = createStockfishCoach({
            onStatus: ({ text, tone }) => updateHistoryCoachStatus(text, tone)
        });
        updateHistoryCoachStatus("Starting engine", "pending");
    } catch {
        historyCoach = null;
        updateHistoryCoachStatus("Engine unavailable", "danger");
    }

    return historyCoach;
}

async function analyzeHistoryPosition(position) {
    const coach = ensureHistoryCoach();
    if (!coach) return;

    const requestId = ++historyCoachRequestId;
    const fen = buildReviewFen(position);

    try {
        const analysis = await coach.analyze({
            fen,
            depth: 11,
            multiPv: 3
        });

        if (requestId !== historyCoachRequestId || !analysis) {
            return;
        }

        renderHistoryCoachAnalysis(analysis);
    } catch (error) {
        if (error?.message === "Analysis superseded" || error?.message === "Analysis stopped") {
            return;
        }
        updateHistoryCoachStatus("Engine unavailable", "danger");
    }
}

function renderHistoryCoachLoading(message) {
    updateHistoryCoachStatus(message, "pending");
    if (historyCoachEval) historyCoachEval.textContent = "Eval: --";
    if (historyCoachBestMove) historyCoachBestMove.textContent = "Waiting...";
    if (historyCoachBestLine) historyCoachBestLine.textContent = "Step through the game and Stockfish will update for the current position.";
    if (historyCoachTurnHint) historyCoachTurnHint.textContent = "White to move";
    if (historyCoachTopMoves) {
        historyCoachTopMoves.innerHTML = '<p class="coach-supporting-text">Analysis lines will appear here for the selected review position.</p>';
    }
}

function updateHistoryCoachStatus(text, tone = "idle") {
    if (!historyCoachStatus) return;
    historyCoachStatus.textContent = text;
    historyCoachStatus.className = `coach-status-badge tone-${tone}`;
}

function renderHistoryCoachAnalysis(analysis) {
    const bestLine = analysis.lines?.[0];

    updateHistoryCoachStatus("Engine ready", "ready");
    if (historyCoachEval) historyCoachEval.textContent = `Eval: ${formatEvaluationLabel(bestLine, analysis.sideToMove)}`;
    if (historyCoachBestMove) historyCoachBestMove.textContent = formatEngineMove(bestLine?.pv?.[0] || analysis.bestMove, analysis.fen);
    if (historyCoachBestLine) {
        historyCoachBestLine.textContent = describePreferredIdea(bestLine?.pv?.[0] || analysis.bestMove, analysis.fen);
    }
    if (historyCoachTurnHint) {
        historyCoachTurnHint.textContent = `${analysis.sideToMove === "w" ? "White" : "Black"} to move`;
    }
    renderHistoryCoachTopMoves(analysis);
}

function renderHistoryCoachTopMoves(analysis) {
    if (!historyCoachTopMoves) return;

    historyCoachTopMoves.innerHTML = "";
    const lines = analysis.lines || [];
    if (lines.length === 0) {
        historyCoachTopMoves.innerHTML = '<p class="coach-supporting-text">No engine lines available for this position.</p>';
        return;
    }

    lines.forEach((line, index) => {
        const item = document.createElement("div");
        item.className = `coach-top-line${index === 0 ? " is-best" : ""}`;

        const head = document.createElement("div");
        head.className = "coach-top-line-head";

        const move = document.createElement("strong");
        move.textContent = `${index + 1}. ${formatEngineMove(line.pv?.[0] || null, analysis.fen)}`;

        const score = document.createElement("span");
        score.className = "coach-line-score";
        score.textContent = formatEvaluationLabel(line, analysis.sideToMove);

        const pv = document.createElement("div");
        pv.className = "coach-line-pv";
        pv.textContent = formatEnginePv(line.pv || [], analysis.fen);

        head.appendChild(move);
        head.appendChild(score);
        item.appendChild(head);
        item.appendChild(pv);
        historyCoachTopMoves.appendChild(item);
    });
}

function formatEvaluationLabel(line, sideToMove) {
    if (!line) return "--";

    const whiteScore = scoreLineToWhiteCentipawns(line, sideToMove);
    if (line.scoreType === "mate") {
        const winner = whiteScore > 0 ? "White" : "Black";
        return `${winner} mate in ${Math.abs(line.scoreValue)}`;
    }

    const advantage = Math.abs(whiteScore / 100).toFixed(1);
    return `${whiteScore >= 0 ? "White" : "Black"} +${advantage}`;
}

function scoreLineToWhiteCentipawns(line, sideToMove) {
    if (!line) return 0;

    if (line.scoreType === "mate") {
        const mateValue = 100000 - (Math.abs(line.scoreValue) * 1000);
        const signedMate = line.scoreValue < 0 ? -mateValue : mateValue;
        return sideToMove === "w" ? signedMate : -signedMate;
    }

    return sideToMove === "w" ? line.scoreValue : -line.scoreValue;
}

function formatEngineMove(moveUci, fen) {
    const position = parseFenPosition(fen);
    if (!position) return "--";

    return formatMoveOnBoard(moveUci, position.board, position.enPassantTarget);
}

function parseUciMove(moveUci) {
    if (!moveUci || moveUci.length < 4) return null;

    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const fromCol = files.indexOf(moveUci[0]);
    const toCol = files.indexOf(moveUci[2]);
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

function parseFenPosition(fen) {
    if (!fen) return null;

    const parts = fen.split(" ");
    return {
        board: boardFromFen(fen),
        enPassantTarget: parseFenEnPassant(parts[3])
    };
}

function parseFenEnPassant(token) {
    if (!token || token === "-") return null;
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const col = files.indexOf(token[0]);
    const rank = Number(token[1]);
    if (col < 0 || Number.isNaN(rank)) return null;

    return {
        targetRow: 8 - rank,
        targetCol: col
    };
}

function formatMoveOnBoard(moveUci, board, enPassantTarget = null) {
    const parsed = parseUciMove(moveUci);
    if (!parsed || !board) return "--";

    const moveMeta = createMoveMetaFromBoard(board, parsed, enPassantTarget);
    if (!moveMeta) return "--";
    return buildSanLikeNotation(moveMeta, board);
}

function formatEnginePv(pv, fen, moveLimit = 4) {
    const position = parseFenPosition(fen);
    if (!position) return "";

    const board = cloneBoard(position.board);
    let enPassantTarget = position.enPassantTarget ? { ...position.enPassantTarget } : null;

    return (pv || []).slice(0, moveLimit).map((moveUci) => {
        const notation = formatMoveOnBoard(moveUci, board, enPassantTarget);
        const parsed = parseUciMove(moveUci);
        if (parsed) {
            const moveMeta = createMoveMetaFromBoard(board, parsed, enPassantTarget);
            if (moveMeta) {
                applyMoveToBoard(board, moveMeta);
                enPassantTarget = getEnPassantTargetForNotation(moveMeta);
            } else {
                enPassantTarget = null;
            }
        } else {
            enPassantTarget = null;
        }
        return notation;
    }).filter(Boolean).join("  ");
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

    const moveMeta = {
        piece,
        fromRow: parsedMove.fromRow,
        fromCol: parsedMove.fromCol,
        toRow: parsedMove.toRow,
        toCol: parsedMove.toCol,
        captured: isEnPassant ? board[parsedMove.fromRow][parsedMove.toCol] : (targetPiece || null),
        promotedTo: parsedMove.promotion ? `${piece[0]}${parsedMove.promotion.toLowerCase()}` : null,
        rookMove: null,
        enPassantCapture: null
    };

    if (isCastle) {
        const rookFromCol = parsedMove.toCol > parsedMove.fromCol ? 7 : 0;
        const rookToCol = parsedMove.toCol > parsedMove.fromCol ? parsedMove.toCol - 1 : parsedMove.toCol + 1;
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

function buildSanLikeNotation(moveMeta, board) {
    if (moveMeta.piece[1] === "k" && Math.abs(moveMeta.toCol - moveMeta.fromCol) === 2) {
        return moveMeta.toCol > moveMeta.fromCol ? "O-O" : "O-O-O";
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

    const disambiguation = getNotationDisambiguation(board, moveMeta);
    return `${pieceLetter}${disambiguation}${captureMark}${targetSquare}${promotionMark}`;
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

function canPieceReachTargetForNotation(board, piece, fromRow, fromCol, toRow, toCol) {
    if (!board || !piece) return false;
    if (fromRow === toRow && fromCol === toCol) return false;

    const target = board[toRow]?.[toCol] || "";
    if (target && target.startsWith(piece[0])) return false;

    const rowDiff = toRow - fromRow;
    const colDiff = toCol - fromCol;
    const absRow = Math.abs(rowDiff);
    const absCol = Math.abs(colDiff);

    if (piece[1] === "n") {
        return (absRow === 2 && absCol === 1) || (absRow === 1 && absCol === 2);
    }

    if (piece[1] === "b") {
        return absRow === absCol && isPathClear(board, fromRow, fromCol, toRow, toCol);
    }

    if (piece[1] === "r") {
        return (fromRow === toRow || fromCol === toCol) && isPathClear(board, fromRow, fromCol, toRow, toCol);
    }

    if (piece[1] === "q") {
        const diagonal = absRow === absCol;
        const straight = fromRow === toRow || fromCol === toCol;
        return (diagonal || straight) && isPathClear(board, fromRow, fromCol, toRow, toCol);
    }

    if (piece[1] === "k") {
        return absRow <= 1 && absCol <= 1;
    }

    return false;
}

function isPathClear(board, fromRow, fromCol, toRow, toCol) {
    const rowStep = Math.sign(toRow - fromRow);
    const colStep = Math.sign(toCol - fromCol);
    let row = fromRow + rowStep;
    let col = fromCol + colStep;

    while (row !== toRow || col !== toCol) {
        if (board[row]?.[col]) return false;
        row += rowStep;
        col += colStep;
    }

    return true;
}

function getEnPassantTargetForNotation(move) {
    if (!move || move.piece[1] !== "p") return null;
    if (Math.abs(move.toRow - move.fromRow) !== 2) return null;

    const direction = move.piece.startsWith("w") ? -1 : 1;
    return {
        targetRow: move.fromRow + direction,
        targetCol: move.fromCol
    };
}

function describePreferredIdea(moveUci, fen) {
    const parsed = parseUciMove(moveUci);
    if (!parsed) return "It keeps the position under the best control.";

    const state = boardFromFen(fen);
    const piece = state?.[parsed.fromRow]?.[parsed.fromCol] || "";
    const isCapture = Boolean(state?.[parsed.toRow]?.[parsed.toCol]);

    if (piece[1] === "k" && Math.abs(parsed.toCol - parsed.fromCol) === 2) {
        return "It castles, improving king safety and bringing the rook into play.";
    }

    if (piece[1] === "n" || piece[1] === "b") {
        return "It develops a minor piece and improves activity.";
    }

    if (piece[1] === "p" && ["d", "e"].includes(moveUci[0]) && ["4", "5"].includes(moveUci[3])) {
        return "It fights for the center and opens lines for the other pieces.";
    }

    if (isCapture) {
        return "It wins material or removes an important defender.";
    }

    return "It keeps the position under the best control.";
}

function boardFromFen(fen) {
    const boardToken = fen?.split(" ")[0];
    if (!boardToken) return null;

    return boardToken.split("/").map((rank) => {
        const row = [];
        rank.split("").forEach((char) => {
            if (/\d/.test(char)) {
                for (let index = 0; index < Number(char); index += 1) {
                    row.push("");
                }
                return;
            }

            const color = char === char.toUpperCase() ? "w" : "b";
            row.push(`${color}${char.toLowerCase()}`);
        });
        return row;
    });
}

function buildReviewFen(position) {
    const boardFen = position.board.map((row) => {
        let empty = 0;
        let output = "";

        row.forEach((piece) => {
            if (!piece) {
                empty += 1;
                return;
            }

            if (empty > 0) {
                output += String(empty);
                empty = 0;
            }

            const letter = piece[1];
            output += piece.startsWith("w") ? letter.toUpperCase() : letter;
        });

        if (empty > 0) output += String(empty);
        return output;
    }).join("/");

    return `${boardFen} ${position.sideToMove} ${getReviewCastlingFen(position.castlingRights, position.board)} ${getReviewEnPassantFen(position.enPassantTarget)} ${getReviewHalfmoveClock(position.moveCount)} ${Math.floor(position.moveCount / 2) + 1}`;
}

function getReviewCastlingFen(rights, board) {
    let value = "";
    if (!rights.white.kingMoved && !rights.white.rookH && board[7][4] === "wk" && board[7][7] === "wr") value += "K";
    if (!rights.white.kingMoved && !rights.white.rookA && board[7][4] === "wk" && board[7][0] === "wr") value += "Q";
    if (!rights.black.kingMoved && !rights.black.rookH && board[0][4] === "bk" && board[0][7] === "br") value += "k";
    if (!rights.black.kingMoved && !rights.black.rookA && board[0][4] === "bk" && board[0][0] === "br") value += "q";
    return value || "-";
}

function getReviewEnPassantFen(target) {
    if (!target) return "-";
    return toAlgebraic(target.targetRow, target.targetCol);
}

function getReviewHalfmoveClock(moveCount) {
    return moveCount === 0 ? 0 : 1;
}

function createInitialCastlingRights() {
    return {
        white: { kingMoved: false, rookA: false, rookH: false },
        black: { kingMoved: false, rookA: false, rookH: false }
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
    return {
        targetRow: move.fromRow + direction,
        targetCol: move.fromCol
    };
}

async function initHistory() {
    let games = await fetchGamesFromServer();
    if (!games) {
        games = normalizeLocalGames(getLocalGames());
    } else {
        games = normalizeServerGames(games);
    }

    allGames = Array.isArray(games) ? games : [];
    populateResultFilter(allGames);
    applyFilters();
}

listContainer?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;
    const displayNumber = button.dataset.display;
    const game = allGames.find(g => String(g.id) === String(id));
    if (!game) return;

    if (action === "review" || action === "analyze") {
        showReview(game, displayNumber);
    }
});

filterToggle?.addEventListener("click", () => {
    filtersPanel?.classList.toggle("is-open");
});

applyFiltersBtn?.addEventListener("click", applyFilters);
resetFiltersBtn?.addEventListener("click", resetFilters);

backToHistoryBtn?.addEventListener("click", () => {
    showOverview();
});

applyAppearanceSettings();
initHistory();

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

function getInitialBoard() {
    return [
        ["br","bn","bb","bq","bk","bb","bn","br"],
        ["bp","bp","bp","bp","bp","bp","bp","bp"],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["wp","wp","wp","wp","wp","wp","wp","wp"],
        ["wr","wn","wb","wq","wk","wb","wn","wr"]
    ];
}

function renderBoard(container, state) {
    container.innerHTML = "";
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement("div");
            square.className = "square history-square";
            square.classList.add((row + col) % 2 === 0 ? "light" : "dark");

            const piece = state[row][col];
            if (piece) {
                const img = document.createElement("img");
                img.src = `src/assets/pieces/${pieceMap[piece]}`;
                img.alt = piece;
                square.appendChild(img);
            }

            container.appendChild(square);
        }
    }
}

function moveToNotation(move) {
    if (!move) return "";
    return move.notation || "";
}

function toAlgebraic(row, col) {
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    return files[col] + (8 - row);
}

function renderMovesList(container, moves, currentIndex) {
    container.innerHTML = "";
    const lastIndex = currentIndex - 1;
    for (let i = 0; i < moves.length; i += 2) {
        const whiteMove = moves[i];
        const blackMove = moves[i + 1];
        const row = document.createElement("div");
        row.className = "history-move-row";

        const num = document.createElement("span");
        num.className = "history-move-num";
        num.textContent = `${Math.floor(i / 2) + 1}.`;

        const white = document.createElement("span");
        white.className = "history-move-cell";
        white.textContent = moveToNotation(whiteMove);
        white.dataset.moveIndex = String(i);

        const black = document.createElement("span");
        black.className = "history-move-cell";
        black.textContent = blackMove ? moveToNotation(blackMove) : "";
        if (blackMove) {
            black.dataset.moveIndex = String(i + 1);
        }

        row.appendChild(num);
        row.appendChild(white);
        row.appendChild(black);

        const nextIndex = i + 1;
        if (lastIndex === i) {
            white.classList.add("active");
        } else if (lastIndex === nextIndex) {
            black.classList.add("active");
        }

        container.appendChild(row);
    }
}

function buildAnnotatedMoves(moves) {
    const board = getInitialBoard();
    const annotated = [];

    moves.forEach((move, index) => {
        const color = index % 2 === 0 ? "white" : "black";
        const opponent = color === "white" ? "black" : "white";

        applyMoveToBoard(board, move);

        const inCheck = isInCheck(board, opponent);
        const isMate = inCheck && !hasAnyLegalMove(board, opponent);

        annotated.push({
            ...move,
            notation: buildNotation(move, color, inCheck, isMate)
        });
    });

    return annotated;
}

function buildNotation(move, color, inCheck, isMate) {
    if (!move || !move.piece) return "";
    const pieceType = move.piece[1];
    const isPawn = pieceType === "p";
    const isKing = pieceType === "k";
    const isCastle = isKing && Math.abs(move.toCol - move.fromCol) === 2;

    if (isCastle) {
        const notation = move.toCol > move.fromCol ? "O-O" : "O-O-O";
        return notation + (isMate ? "#" : inCheck ? "+" : "");
    }

    const pieceLetter = isPawn ? "" : pieceType.toUpperCase();
    const capture = move.captured ? "x" : "";
    const to = toAlgebraic(move.toRow, move.toCol);
    const promo = move.promotedTo ? `=${move.promotedTo[1].toUpperCase()}` : "";
    const pawnPrefix = isPawn && capture ? toAlgebraic(move.fromRow, move.fromCol)[0] : "";

    return `${pawnPrefix}${pieceLetter}${capture}${to}${promo}${isMate ? "#" : inCheck ? "+" : ""}`;
}

function applyMoveToBoard(board, move, forward = true) {
    if (!move) return;

    if (forward) {
        const piece = move.promotedTo || move.piece;
        board[move.toRow][move.toCol] = piece;
        board[move.fromRow][move.fromCol] = "";

        if (move.enPassantCapture) {
            board[move.enPassantCapture.row][move.enPassantCapture.col] = "";
        }

        if (move.rookMove) {
            board[move.rookMove.toRow][move.rookMove.toCol] = move.rookMove.piece;
            board[move.rookMove.fromRow][move.rookMove.fromCol] = "";
        }

        return;
    }

    board[move.fromRow][move.fromCol] = move.piece;
    board[move.toRow][move.toCol] = "";

    if (move.promotedTo) {
        board[move.fromRow][move.fromCol] = move.piece;
    }

    if (move.enPassantCapture) {
        board[move.enPassantCapture.row][move.enPassantCapture.col] = move.enPassantCapture.piece;
    } else {
        board[move.toRow][move.toCol] = move.captured || "";
    }

    if (move.rookMove) {
        board[move.rookMove.fromRow][move.rookMove.fromCol] = move.rookMove.piece;
        board[move.rookMove.toRow][move.rookMove.toCol] = "";
    }
}

function isInCheck(board, color) {
    const kingPos = findKing(board, color);
    if (!kingPos) return false;
    const opponent = color === "white" ? "black" : "white";
    return isSquareAttacked(board, opponent, kingPos.row, kingPos.col);
}

function findKing(board, color) {
    const target = color === "white" ? "wk" : "bk";
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            if (board[r][c] === target) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

function isSquareAttacked(board, byColor, targetRow, targetCol) {
    const isWhite = byColor === "white";
    const pawnDir = isWhite ? -1 : 1;
    const pawn = isWhite ? "wp" : "bp";
    const knight = isWhite ? "wn" : "bn";
    const bishop = isWhite ? "wb" : "bb";
    const rook = isWhite ? "wr" : "br";
    const queen = isWhite ? "wq" : "bq";
    const king = isWhite ? "wk" : "bk";

    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

    const pawnRows = [targetRow + pawnDir];
    const pawnCols = [targetCol - 1, targetCol + 1];
    for (const r of pawnRows) {
        for (const c of pawnCols) {
            if (inBounds(r, c) && board[r][c] === pawn) return true;
        }
    }

    const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightMoves) {
        const r = targetRow + dr;
        const c = targetCol + dc;
        if (inBounds(r, c) && board[r][c] === knight) return true;
    }

    const lineChecks = [
        { dr: -1, dc: 0, pieces: [rook, queen] },
        { dr: 1, dc: 0, pieces: [rook, queen] },
        { dr: 0, dc: -1, pieces: [rook, queen] },
        { dr: 0, dc: 1, pieces: [rook, queen] },
        { dr: -1, dc: -1, pieces: [bishop, queen] },
        { dr: -1, dc: 1, pieces: [bishop, queen] },
        { dr: 1, dc: -1, pieces: [bishop, queen] },
        { dr: 1, dc: 1, pieces: [bishop, queen] }
    ];

    for (const line of lineChecks) {
        let r = targetRow + line.dr;
        let c = targetCol + line.dc;
        while (inBounds(r, c)) {
            const piece = board[r][c];
            if (piece) {
                if (line.pieces.includes(piece)) return true;
                break;
            }
            r += line.dr;
            c += line.dc;
        }
    }

    for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            const r = targetRow + dr;
            const c = targetCol + dc;
            if (inBounds(r, c) && board[r][c] === king) return true;
        }
    }

    return false;
}

function hasAnyLegalMove(board, color) {
    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const isWhite = color === "white";

    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            const piece = board[r][c];
            if (!piece) continue;
            if (isWhite && !piece.startsWith("w")) continue;
            if (!isWhite && !piece.startsWith("b")) continue;

            const moves = generatePseudoMoves(board, piece, r, c);
            for (const move of moves) {
                const nextBoard = cloneBoard(board);
                const movingPiece = move.promotedTo || move.piece;
                nextBoard[move.toRow][move.toCol] = movingPiece;
                nextBoard[move.fromRow][move.fromCol] = "";
                if (!isInCheck(nextBoard, color)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function cloneBoard(board) {
    return board.map(row => row.slice());
}

function generatePseudoMoves(board, piece, row, col) {
    const moves = [];
    const color = piece.startsWith("w") ? "white" : "black";
    const opponentPrefix = color === "white" ? "b" : "w";
    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const type = piece[1];

    if (type === "p") {
        const dir = color === "white" ? -1 : 1;
        const startRow = color === "white" ? 6 : 1;
        const nextRow = row + dir;
        if (inBounds(nextRow, col) && board[nextRow][col] === "") {
            moves.push({ piece, fromRow: row, fromCol: col, toRow: nextRow, toCol: col, captured: null, promotedTo: nextRow === (color === "white" ? 0 : 7) ? `${color[0]}q` : null });
            const jumpRow = row + dir * 2;
            if (row === startRow && board[jumpRow][col] === "") {
                moves.push({ piece, fromRow: row, fromCol: col, toRow: jumpRow, toCol: col, captured: null, promotedTo: null });
            }
        }
        for (const dc of [-1, 1]) {
            const tr = row + dir;
            const tc = col + dc;
            if (inBounds(tr, tc) && board[tr][tc] && board[tr][tc].startsWith(opponentPrefix)) {
                moves.push({ piece, fromRow: row, fromCol: col, toRow: tr, toCol: tc, captured: board[tr][tc], promotedTo: tr === (color === "white" ? 0 : 7) ? `${color[0]}q` : null });
            }
        }
        return moves;
    }

    const pushSlideMoves = (directions) => {
        directions.forEach(([dr, dc]) => {
            let tr = row + dr;
            let tc = col + dc;
            while (inBounds(tr, tc)) {
                const target = board[tr][tc];
                if (target === "") {
                    moves.push({ piece, fromRow: row, fromCol: col, toRow: tr, toCol: tc, captured: null, promotedTo: null });
                } else {
                    if (target.startsWith(opponentPrefix)) {
                        moves.push({ piece, fromRow: row, fromCol: col, toRow: tr, toCol: tc, captured: target, promotedTo: null });
                    }
                    break;
                }
                tr += dr;
                tc += dc;
            }
        });
    };

    if (type === "n") {
        const knightMoves = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        knightMoves.forEach(([dr, dc]) => {
            const tr = row + dr;
            const tc = col + dc;
            if (!inBounds(tr, tc)) return;
            const target = board[tr][tc];
            if (target === "" || target.startsWith(opponentPrefix)) {
                moves.push({ piece, fromRow: row, fromCol: col, toRow: tr, toCol: tc, captured: target || null, promotedTo: null });
            }
        });
        return moves;
    }

    if (type === "b") {
        pushSlideMoves([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
        return moves;
    }

    if (type === "r") {
        pushSlideMoves([[-1, 0], [1, 0], [0, -1], [0, 1]]);
        return moves;
    }

    if (type === "q") {
        pushSlideMoves([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
        return moves;
    }

    if (type === "k") {
        for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
                if (dr === 0 && dc === 0) continue;
                const tr = row + dr;
                const tc = col + dc;
                if (!inBounds(tr, tc)) continue;
                const target = board[tr][tc];
                if (target === "" || target.startsWith(opponentPrefix)) {
                    moves.push({ piece, fromRow: row, fromCol: col, toRow: tr, toCol: tc, captured: target || null, promotedTo: null });
                }
            }
        }
        return moves;
    }

    return moves;
}
