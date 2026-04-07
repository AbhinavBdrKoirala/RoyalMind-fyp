import { createStockfishCoach } from "./coach-engine.js";

let selectedSquare = null;
let selectedPiece = null;
let currentTurn = "white";
let moveHistory = [];
let moveNumber = 1;
let capturedByWhite = [];
let capturedByBlack = [];
let moveSequence = [];
let lastMoveMeta = null;
let lastCompletedMove = null;
let pendingPromotionMeta = null;
let timerInterval = null;
let botMoveTimeout = null;
let whiteTimeLeft = 600;
let blackTimeLeft = 600;
let timerRunning = false;
let uiInitialized = false;
let matchUiInitialized = false;
let currentGameId = null;
let remoteSyncFailed = false;
let gameFinished = false;
let castlingRights = createInitialCastlingRights();
let enPassantTarget = null;
let coachUiInitialized = false;
let coachEngine = null;
let coachAnalysisTimer = null;
let coachCurrentAnalysis = null;
let coachCurrentFen = "";
let queuedMoveReview = null;
let pendingMoveReview = null;
let coachLastReview = null;
let coachEnabled = false;

const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
const settingsCache = getStoredSettings();
const storedUser = parseStoredUser();
const appUi = window.RoyalMindUI || {
    notify: () => {},
    confirm: async () => false
};
let audioContext = null;

const BOT_LEVELS = {
    easy: { label: "Easy Bot", depth: 1, thinkTime: 420 },
    medium: { label: "Medium Bot", depth: 2, thinkTime: 620 },
    hard: { label: "Hard Bot", depth: 3, thinkTime: 760 }
};

const BOARD_THEME_CLASS_PREFIX = "board-theme-";
const PIECE_STYLE_CLASS_PREFIX = "piece-style-";

const query = new URLSearchParams(window.location.search);
const gameMode = query.get("mode") === "bot" ? "bot" : "local";
const botLevel = BOT_LEVELS[query.get("level")] ? query.get("level") : "easy";
const humanColor = "white";
const botColor = gameMode === "bot" ? "black" : null;

const TIME_PRESETS = {
    "bullet-1": 60,
    "blitz-3": 180,
    "blitz-5": 300,
    "rapid-10": 600,
    "rapid-15": 900,
    "classical-30": 1800,
    "classical-60": 3600
};

const SETTINGS_TIME_TO_PRESET = {
    "Bullet 1+0": "bullet-1",
    "Blitz 3+0": "blitz-3",
    "Blitz 5+0": "blitz-5",
    "Rapid 10+0": "rapid-10",
    "Rapid 15+0": "rapid-15",
    "Classical 30+0": "classical-30",
    "Classical 60+0": "classical-60"
};

const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
};

const initialBoardState = [
    ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"],
    ["bp", "bp", "bp", "bp", "bp", "bp", "bp", "bp"],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["wp", "wp", "wp", "wp", "wp", "wp", "wp", "wp"],
    ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"]
];

let boardState = cloneBoard(initialBoardState);

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

function decorateUiPieceIcon(img, piece, ...extraClasses) {
    img.classList.add(...extraClasses);
    if (piece?.startsWith("b")) {
        img.classList.add("ui-piece-icon-black");
    }
}

const COACH_DEPTH = 11;
const COACH_MULTI_PV = 3;
const COACH_STORAGE_KEY = "royalmindCoachEnabled";
coachEnabled = getStoredCoachPreference();

export function createBoard() {
    initializeGameUi();
    initializeMatchUi();
    applyAppearanceSettings();

    const boardElement = document.getElementById("chessboard");
    if (!boardElement) return;

    boardElement.innerHTML = "";

    const perspective = humanColor || "white";
    const files = perspective === "white"
        ? ["a", "b", "c", "d", "e", "f", "g", "h"]
        : ["h", "g", "f", "e", "d", "c", "b", "a"];
    const showCoordinates = shouldShowCoordinates();

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const square = document.createElement("div");
            square.classList.add("square", (row + col) % 2 === 0 ? "light" : "dark");
            square.dataset.row = row;
            square.dataset.col = col;

            if (showCoordinates && row === 7) {
                const fileLabel = document.createElement("span");
                fileLabel.className = "square-label file-label";
                fileLabel.textContent = files[col];
                square.appendChild(fileLabel);
            }

            if (showCoordinates && col === 0) {
                const rankLabel = document.createElement("span");
                rankLabel.className = "square-label rank-label";
                rankLabel.textContent = perspective === "white" ? String(8 - row) : String(row + 1);
                square.appendChild(rankLabel);
            }

            square.addEventListener("click", () => handleSquareClick(square));

            const piece = boardState[row][col];
            if (piece) {
                const img = document.createElement("img");
                img.src = `src/assets/pieces/${pieceMap[piece]}`;
                img.alt = piece;
                square.appendChild(img);
            }

            const kingColor = piece === "wk" ? "white" : piece === "bk" ? "black" : null;
            if (kingColor && isKingInCheckOnBoard(boardState, kingColor)) {
                square.classList.add("check");
            }

            if (shouldHighlightLastMove() && isLastMoveSquare(row, col)) {
                square.classList.add("last-move");
                if (lastCompletedMove?.toRow === row && lastCompletedMove?.toCol === col) {
                    square.classList.add("last-move-target");
                }
            }

            boardElement.appendChild(square);
        }
    }

    updateTurnLabel();
    renderCapturedPieces();
    updateTimerDisplay();
    renderCoachPanel();
    if (coachUiInitialized && coachEnabled && !gameFinished) {
        scheduleCoachAnalysis();
    }
}

function initializeGameUi() {
    if (uiInitialized) return;

    initializeCoachUi();

    const timeControlSelect = document.getElementById("timeControlSelect");
    const customMinutes = document.getElementById("customMinutes");
    const setTimeControlBtn = document.getElementById("setTimeControlBtn");
    const fullscreenToggle = document.getElementById("fullscreenToggle");
    const drawToggle = document.getElementById("drawToggle");
    const resignToggle = document.getElementById("resignToggle");
    const overlayNewGameBtn = document.getElementById("overlayNewGameBtn");
    const overlayReviewBtn = document.getElementById("overlayReviewBtn");
    const overlayViewBoardBtn = document.getElementById("overlayViewBoardBtn");

    if (timeControlSelect && customMinutes) {
        const preferredPreset = SETTINGS_TIME_TO_PRESET[settingsCache.defaultTime];
        if (preferredPreset && timeControlSelect.querySelector(`option[value="${preferredPreset}"]`)) {
            timeControlSelect.value = preferredPreset;
            const preferredTime = TIME_PRESETS[preferredPreset];
            whiteTimeLeft = preferredTime;
            blackTimeLeft = preferredTime;
        }

        const toggleCustomInput = () => {
            const isCustom = timeControlSelect.value === "custom";
            customMinutes.style.display = isCustom ? "block" : "none";
        };

        timeControlSelect.addEventListener("change", toggleCustomInput);
        toggleCustomInput();
    }

    if (setTimeControlBtn) {
        setTimeControlBtn.addEventListener("click", async () => {
            const newTimeInSeconds = getTimeFromUi();
            if (!newTimeInSeconds) return;

            const hasGameProgress = moveHistory.length > 0 || capturedByWhite.length > 0 || capturedByBlack.length > 0;
            if (hasGameProgress) {
                const confirmReset = await appUi.confirm({
                    title: "Restart this game?",
                    message: "Changing the time control will restart the current match and clear the current board state.",
                    confirmLabel: "Restart game",
                    cancelLabel: "Keep playing",
                    tone: "warning"
                });
                if (!confirmReset) return;
            }

            resetGameState(newTimeInSeconds);
        });
    }

    if (fullscreenToggle) {
        fullscreenToggle.addEventListener("click", toggleFullscreenMode);
    }

    if (drawToggle) {
        drawToggle.addEventListener("click", handleDrawRequest);
    }

    if (resignToggle) {
        resignToggle.addEventListener("click", handleResign);
    }

    if (overlayNewGameBtn) {
        overlayNewGameBtn.addEventListener("click", () => {
            const timeInSeconds = getTimeFromUi() || 600;
            resetGameState(timeInSeconds);
        });
    }

    if (overlayReviewBtn) {
        overlayReviewBtn.addEventListener("click", () => {
            hideGameOverlay();
            if (!coachEnabled) {
                setCoachEnabled(true);
                return;
            }
            scheduleCoachAnalysis({ immediate: true, force: true });
        });
    }

    if (overlayViewBoardBtn) {
        overlayViewBoardBtn.addEventListener("click", () => {
            hideGameOverlay();
        });
    }

    document.addEventListener("fullscreenchange", syncFullscreenUi);
    window.addEventListener("beforeunload", () => coachEngine?.dispose(), { once: true });
    syncFullscreenUi();

    if (shouldNotifyGameStart()) {
        const opponentLabel = getOpponentLabel();
        appUi.notify(`Board ready against ${opponentLabel}.`, {
            title: gameMode === "bot" ? "Bot game ready" : "Local game ready",
            tone: "info",
            duration: 1200
        });
        playUiSound("start");
    }

    updateTimerDisplay();
    uiInitialized = true;
}

function initializeMatchUi() {
    if (matchUiInitialized) return;

    const matchTitle = document.getElementById("matchTitle");
    const whitePlayerLabel = document.getElementById("whitePlayerLabel");
    const blackPlayerLabel = document.getElementById("blackPlayerLabel");
    const playerName = getStoredUserLabel();

    if (matchTitle) {
        matchTitle.textContent = gameMode === "bot" ? `${BOT_LEVELS[botLevel].label} Match` : "Local Match";
    }

    if (whitePlayerLabel) {
        whitePlayerLabel.textContent = gameMode === "bot" ? (playerName || "You") : "White";
    }

    if (blackPlayerLabel) {
        blackPlayerLabel.textContent = gameMode === "bot" ? BOT_LEVELS[botLevel].label : "Black";
    }

    matchUiInitialized = true;
}

function initializeCoachUi() {
    if (coachUiInitialized) return;

    const toggleButton = document.getElementById("coachToggleBtn");
    const refreshButton = document.getElementById("coachRefreshBtn");
    if (toggleButton) {
        toggleButton.addEventListener("click", () => {
            setCoachEnabled(!coachEnabled);
        });
    }
    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            if (!coachEnabled) {
                appUi.notify("Enable analysis first to use Stockfish review.", {
                    title: "Analysis is off",
                    tone: "warning"
                });
                return;
            }
            scheduleCoachAnalysis({ immediate: true, force: true });
        });
    }

    renderCoachPanel();

    coachUiInitialized = true;
}

function ensureCoachEngine() {
    if (coachEngine) return coachEngine;

    try {
        coachEngine = createStockfishCoach({
            onStatus: ({ text, tone }) => updateCoachStatus(text, tone)
        });
        updateCoachStatus("Starting engine", "pending");
    } catch {
        coachEngine = null;
        updateCoachStatus("Engine unavailable", "danger");
    }

    return coachEngine;
}

function setCoachEnabled(nextValue) {
    coachEnabled = Boolean(nextValue);
    localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify(coachEnabled));

    clearCoachAnalysisTimer();

    if (!coachEnabled) {
        coachEngine?.stop();
        coachCurrentAnalysis = null;
        coachCurrentFen = "";
        queuedMoveReview = null;
        pendingMoveReview = null;
        coachLastReview = null;
        renderCoachPanel();
        return;
    }

    ensureCoachEngine();
    renderCoachPanel();
    scheduleCoachAnalysis({ immediate: true, force: true });
}

function getTimeFromUi() {
    const timeControlSelect = document.getElementById("timeControlSelect");
    const customMinutes = document.getElementById("customMinutes");

    if (!timeControlSelect) return 600;

    if (timeControlSelect.value === "custom") {
        const minutes = Number(customMinutes ? customMinutes.value : 0);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
            appUi.notify("Custom time must be between 1 and 180 minutes.", {
                title: "Choose a valid time",
                tone: "warning"
            });
            return null;
        }
        return Math.floor(minutes * 60);
    }

    return TIME_PRESETS[timeControlSelect.value] || 600;
}

function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateTimerDisplay() {
    const whiteTimer = document.getElementById("whiteTimer");
    const blackTimer = document.getElementById("blackTimer");
    const whiteClockBox = document.getElementById("whiteClockBox");
    const blackClockBox = document.getElementById("blackClockBox");

    if (whiteTimer) whiteTimer.textContent = formatTime(whiteTimeLeft);
    if (blackTimer) blackTimer.textContent = formatTime(blackTimeLeft);

    if (whiteClockBox && blackClockBox) {
        whiteClockBox.classList.toggle("active", currentTurn === "white");
        blackClockBox.classList.toggle("active", currentTurn === "black");
    }
}

function startTimer() {
    if (timerRunning || gameFinished) return;

    timerInterval = setInterval(() => {
        if (currentTurn === "white") {
            whiteTimeLeft -= 1;
            if (whiteTimeLeft <= 0) {
                whiteTimeLeft = 0;
                updateTimerDisplay();
                stopTimer();
                showStatusMessage("White ran out of time", 1600);
                showGameOver("Black", "Time out");
                return;
            }
        } else {
            blackTimeLeft -= 1;
            if (blackTimeLeft <= 0) {
                blackTimeLeft = 0;
                updateTimerDisplay();
                stopTimer();
                showStatusMessage("Black ran out of time", 1600);
                showGameOver("White", "Time out");
                return;
            }
        }

        updateTimerDisplay();
    }, 1000);

    timerRunning = true;
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerRunning = false;
}

function resetGameState(timeInSeconds = 600) {
    stopTimer();
    clearBotTurn();
    clearCoachAnalysisTimer();
    coachEngine?.stop();

    currentTurn = "white";
    selectedSquare = null;
    selectedPiece = null;
    moveHistory = [];
    moveNumber = 1;
    capturedByWhite = [];
    capturedByBlack = [];
    moveSequence = [];
    lastMoveMeta = null;
    lastCompletedMove = null;
    pendingPromotionMeta = null;
    currentGameId = null;
    remoteSyncFailed = false;
    gameFinished = false;
    castlingRights = createInitialCastlingRights();
    enPassantTarget = null;
    coachCurrentAnalysis = null;
    coachCurrentFen = "";
    queuedMoveReview = null;
    pendingMoveReview = null;
    coachLastReview = null;
    boardState = cloneBoard(initialBoardState);
    whiteTimeLeft = timeInSeconds;
    blackTimeLeft = timeInSeconds;

    const moveList = document.getElementById("moveList");
    if (moveList) moveList.innerHTML = "";

    hideGameOverlay();

    if (shouldNotifyGameStart()) {
        appUi.notify(`New ${gameMode === "bot" ? "bot" : "local"} game started.`, {
            title: "Game started",
            tone: "info",
            duration: 1100
        });
        playUiSound("start");
    }

    updateTimerDisplay();
    createBoard();
}

function updateTurnLabel() {
    const turnLabel = document.getElementById("currentTurnLabel");
    if (!turnLabel) return;

    if (gameMode === "bot") {
        turnLabel.textContent = currentTurn === humanColor
            ? `${getStoredUserLabel() || "Your"} move`
            : `${BOT_LEVELS[botLevel].label} to move`;
        return;
    }

    turnLabel.textContent = currentTurn === "white" ? "White to move" : "Black to move";
}

async function handleSquareClick(square) {
    if (gameFinished) return;

    if (isBotTurn()) {
        showStatusMessage(`${BOT_LEVELS[botLevel].label} is thinking...`, 900);
        return;
    }

    const row = Number(square.dataset.row);
    const col = Number(square.dataset.col);
    const piece = boardState[row][col];

    if (!selectedPiece) {
        if (
            piece &&
            ((currentTurn === "white" && piece.startsWith("w")) ||
             (currentTurn === "black" && piece.startsWith("b")))
        ) {
            selectedPiece = { piece, row, col };
            selectedSquare = square;
            square.classList.add("selected");
            showLegalMoveHints(piece, row, col);
        }
        return;
    }

    if (piece && piece[0] === selectedPiece.piece[0]) {
        clearSelection();
        selectedPiece = { piece, row, col };
        selectedSquare = square;
        square.classList.add("selected");
        showLegalMoveHints(piece, row, col);
        return;
    }

    if (!isValidMove(selectedPiece.piece, selectedPiece.row, selectedPiece.col, row, col)) {
        playUiSound("error");
        showStatusMessage("Illegal move");
        clearSelection();
        createBoard();
        return;
    }

    const confirmMove = await confirmMoveIfNeeded(selectedPiece, row, col);
    if (!confirmMove) {
        return;
    }

    const moverColor = currentTurn;
    const preMoveAnalysis = coachEnabled && coachCurrentAnalysis && coachCurrentAnalysis.fen === buildFenFromCurrentState()
        ? coachCurrentAnalysis
        : null;
    const moveResult = tryMove(selectedPiece, row, col, {
        promotionChoice: shouldAutoPromote(selectedPiece.piece) ? defaultPromotionForPiece(selectedPiece.piece) : null,
        onPromotionResolved: () => finishTurnAfterSuccessfulMove(moverColor)
    });

    if (!moveResult.moved) {
        playUiSound("error");
        showStatusMessage("Illegal move");
        clearSelection();
        createBoard();
        return;
    }

    clearSelection();

    if (!moveResult.awaitingPromotion) {
        queueMoveReview(preMoveAnalysis, moverColor);
        attachQueuedMoveReview(lastMoveMeta);
        finalizeMoveRecord(lastMoveMeta);
        finishTurnAfterSuccessfulMove(moverColor);
        return;
    }

    queueMoveReview(preMoveAnalysis, moverColor);
}

function tryMove(selected, targetRow, targetCol, options = {}) {
    const { piece, row, col } = selected;
    const { promotionChoice = null, onPromotionResolved = null } = options;
    const currentPosition = getCurrentPosition();
    const specialMeta = getSpecialMoveMetaForBoard(
        boardState,
        piece,
        row,
        col,
        targetRow,
        targetCol,
        currentPosition
    );
    const capturedPiece = specialMeta.enPassantCapture
        ? specialMeta.enPassantCapture.piece
        : boardState[targetRow][targetCol];

    if (!isValidMove(piece, row, col, targetRow, targetCol)) {
        return { moved: false, awaitingPromotion: false };
    }

    boardState[targetRow][targetCol] = piece;
    boardState[row][col] = "";

    if (specialMeta.enPassantCapture) {
        boardState[specialMeta.enPassantCapture.row][specialMeta.enPassantCapture.col] = "";
    }

    if (specialMeta.rookMove) {
        boardState[specialMeta.rookMove.toRow][specialMeta.rookMove.toCol] = specialMeta.rookMove.piece;
        boardState[specialMeta.rookMove.fromRow][specialMeta.rookMove.fromCol] = "";
    }

    lastMoveMeta = {
        fromRow: row,
        fromCol: col,
        toRow: targetRow,
        toCol: targetCol,
        piece,
        captured: capturedPiece || null,
        promotedTo: null,
        castleSide: specialMeta.castleSide || null,
        rookMove: specialMeta.rookMove || null,
        enPassantCapture: specialMeta.enPassantCapture || null
    };

    if (capturedPiece) {
        if (piece.startsWith("w")) {
            capturedByWhite.push(capturedPiece);
        } else {
            capturedByBlack.push(capturedPiece);
        }
    }

    updateCastlingRightsForMove(lastMoveMeta);
    enPassantTarget = getEnPassantTargetForMove(lastMoveMeta);

    const requiresPromotion = (piece === "wp" && targetRow === 0) || (piece === "bp" && targetRow === 7);
    if (!requiresPromotion) {
        pendingPromotionMeta = null;
        return { moved: true, awaitingPromotion: false };
    }

    pendingPromotionMeta = { ...lastMoveMeta, promotedTo: null };

    if (promotionChoice) {
        boardState[targetRow][targetCol] = promotionChoice;
        pendingPromotionMeta.promotedTo = promotionChoice;
        lastMoveMeta = { ...pendingPromotionMeta };
        pendingPromotionMeta = null;
        return { moved: true, awaitingPromotion: false };
    }

    showPromotionUI(piece.startsWith("w") ? "white" : "black", (promoted) => {
        boardState[targetRow][targetCol] = promoted;
        if (pendingPromotionMeta) {
            pendingPromotionMeta.promotedTo = promoted;
            lastMoveMeta = { ...pendingPromotionMeta };
            attachQueuedMoveReview(lastMoveMeta);
            finalizeMoveRecord(pendingPromotionMeta);
            pendingPromotionMeta = null;
        }
        if (typeof onPromotionResolved === "function") {
            onPromotionResolved();
        } else {
            createBoard();
        }
    });

    return { moved: true, awaitingPromotion: true };
}

function finishTurnAfterSuccessfulMove(moverColor) {
    if (gameFinished) return;

    currentTurn = moverColor === "white" ? "black" : "white";

    if (!timerRunning) {
        startTimer();
    }

    updateTimerDisplay();
    createBoard();

    if (!hasAnyLegalMove(currentTurn)) {
        if (isKingInCheck(currentTurn)) {
            showGameOver(capitalizeColor(moverColor), "Checkmate");
        } else {
            showDraw("Stalemate");
        }
        return;
    }

    if (isBotTurn()) {
        scheduleBotTurn();
    }
}

function clearSelection() {
    if (selectedSquare) {
        selectedSquare.classList.remove("selected");
    }
    selectedSquare = null;
    selectedPiece = null;
    clearLegalMoveHints();
}

function getLegalMoves(piece, row, col) {
    const legalMoves = [];

    for (let targetRow = 0; targetRow < 8; targetRow += 1) {
        for (let targetCol = 0; targetCol < 8; targetCol += 1) {
            if (isValidMove(piece, row, col, targetRow, targetCol)) {
                legalMoves.push({ row: targetRow, col: targetCol });
            }
        }
    }

    return legalMoves;
}

function showLegalMoveHints(piece, row, col) {
    clearLegalMoveHints();
    if (settingsCache.showLegal === false) return;

    const legalMoves = getLegalMoves(piece, row, col);
    legalMoves.forEach(({ row: targetRow, col: targetCol }) => {
        const targetSquare = document.querySelector(
            `.square[data-row="${targetRow}"][data-col="${targetCol}"]`
        );

        if (!targetSquare) return;

        targetSquare.classList.add("legal-move-square");

        const hint = document.createElement("div");
        hint.className = "legal-move-hint";

        const hintImg = document.createElement("img");
        hintImg.className = "legal-move-piece";
        hintImg.src = `src/assets/pieces/${pieceMap[piece]}`;
        hintImg.alt = "";
        decorateUiPieceIcon(hintImg, piece);

        hint.appendChild(hintImg);
        targetSquare.appendChild(hint);
    });
}

function clearLegalMoveHints() {
    document.querySelectorAll(".legal-move-hint").forEach((node) => node.remove());
    document.querySelectorAll(".legal-move-square").forEach((node) => {
        node.classList.remove("legal-move-square");
    });
}

function renderCapturedPieces() {
    const whiteContainer = document.getElementById("capturedByWhite");
    const blackContainer = document.getElementById("capturedByBlack");

    if (!whiteContainer || !blackContainer) return;

    whiteContainer.innerHTML = "";
    blackContainer.innerHTML = "";

    capturedByWhite.forEach((piece) => {
        const img = document.createElement("img");
        img.src = `src/assets/pieces/${pieceMap[piece]}`;
        img.alt = piece;
        decorateUiPieceIcon(img, piece, "captured-piece-icon");
        whiteContainer.appendChild(img);
    });

    capturedByBlack.forEach((piece) => {
        const img = document.createElement("img");
        img.src = `src/assets/pieces/${pieceMap[piece]}`;
        img.alt = piece;
        decorateUiPieceIcon(img, piece, "captured-piece-icon");
        blackContainer.appendChild(img);
    });
}

function showPromotionUI(color, callback) {
    const overlay = document.createElement("div");
    overlay.id = "promotion-overlay";

    const container = document.createElement("div");
    container.className = "promotion-container";

    const pieces = color === "white"
        ? ["wq", "wr", "wb", "wn"]
        : ["bq", "br", "bb", "bn"];

    pieces.forEach((piece) => {
        const img = document.createElement("img");
        img.src = `src/assets/pieces/${pieceMap[piece]}`;
        img.className = "promotion-piece";
        img.alt = piece;
        img.onclick = () => {
            document.body.removeChild(overlay);
            callback(piece);
        };
        container.appendChild(img);
    });

    overlay.appendChild(container);
    document.body.appendChild(overlay);
}

function findKing(color) {
    return findKingOnBoard(boardState, color);
}

function isSquareAttacked(targetRow, targetCol, byColor) {
    return isSquareAttackedOnBoard(boardState, byColor, targetRow, targetCol);
}

function isKingInCheck(color) {
    return isKingInCheckOnBoard(boardState, color);
}

function isValidMove(piece, row, col, targetRow, targetCol, skipCheck = false) {
    return isValidMoveOnBoard(boardState, piece, row, col, targetRow, targetCol, skipCheck);
}

function showStatusMessage(message, duration = 1000) {
    const status = document.getElementById("statusMessage");
    if (!status) return;

    status.textContent = message;
    status.style.opacity = 1;
    clearTimeout(showStatusMessage.timer);
    showStatusMessage.timer = setTimeout(() => {
        status.style.opacity = 0;
    }, duration);
}

function updateCoachStatus(text, tone = "idle") {
    const badge = document.getElementById("coachStatusBadge");
    if (!badge) return;

    badge.textContent = text;
    badge.className = `coach-status-badge tone-${tone}`;
}

function renderCoachPanel() {
    document.body.classList.toggle("analysis-enabled", coachEnabled);

    const toggleButton = document.getElementById("coachToggleBtn");
    const refreshButton = document.getElementById("coachRefreshBtn");
    const bestMoveElement = document.getElementById("coachBestMove");
    const bestLineElement = document.getElementById("coachBestLine");
    const evalElement = document.getElementById("coachEval");
    const topMovesElement = document.getElementById("coachTopMoves");
    const turnHintElement = document.getElementById("coachTurnHint");
    const reviewBadge = document.getElementById("coachReviewBadge");
    const feedbackElement = document.getElementById("coachFeedbackText");

    if (!bestMoveElement || !bestLineElement || !evalElement || !topMovesElement || !turnHintElement || !reviewBadge || !feedbackElement) {
        return;
    }

    if (toggleButton) {
        toggleButton.textContent = coachEnabled ? "Disable analysis" : "Enable analysis";
        toggleButton.setAttribute("aria-pressed", String(coachEnabled));
    }

    if (refreshButton) {
        refreshButton.disabled = !coachEnabled;
    }

    if (!coachEnabled) {
        updateCoachStatus("Analysis off", "idle");
        bestMoveElement.textContent = "Disabled";
        bestLineElement.textContent = "Stockfish stays off during normal play. Enable analysis only when you want to review a position.";
        evalElement.textContent = "Eval: --";
        turnHintElement.textContent = `${currentTurn === "white" ? "White" : "Black"} to move`;
        topMovesElement.innerHTML = '<p class="coach-supporting-text">Turn analysis on to ask for the best move in the current position.</p>';
        reviewBadge.textContent = "Off";
        reviewBadge.className = "coach-review-badge tone-neutral";
        feedbackElement.textContent = "This keeps bot and live games free from engine help until you choose to review.";
        return;
    }

    if (coachCurrentAnalysis?.lines?.length) {
        const bestLine = coachCurrentAnalysis.lines[0];
        bestMoveElement.textContent = formatEngineMove(bestLine?.pv?.[0] || coachCurrentAnalysis.bestMove, coachCurrentAnalysis.fen);
        bestLineElement.textContent = describePreferredIdea(bestLine?.pv?.[0] || coachCurrentAnalysis.bestMove, coachCurrentAnalysis.fen);
        evalElement.textContent = `Eval: ${formatEvaluationLabel(bestLine, coachCurrentAnalysis.sideToMove)}`;
        turnHintElement.textContent = `${coachCurrentAnalysis.sideToMove === "w" ? "White" : "Black"} to move`;
        renderCoachTopMoves(topMovesElement, coachCurrentAnalysis);
    } else {
        bestMoveElement.textContent = "Waiting...";
        bestLineElement.textContent = "The engine will suggest the strongest continuation for the side to move.";
        evalElement.textContent = "Eval: --";
        turnHintElement.textContent = `${currentTurn === "white" ? "White" : "Black"} to move`;
        topMovesElement.innerHTML = '<p class="coach-supporting-text">Analysis lines will appear here once the engine finishes.</p>';
    }

    const review = coachLastReview || {
        label: "Opening",
        tone: "neutral",
        text: "Make a move and the engine will explain whether it was best, solid, or a missed opportunity."
    };

    reviewBadge.textContent = review.label;
    reviewBadge.className = `coach-review-badge tone-${review.tone}`;
    feedbackElement.textContent = review.text;
}

function renderCoachTopMoves(container, analysis) {
    container.innerHTML = "";

    analysis.lines.forEach((line, index) => {
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
        container.appendChild(item);
    });
}

function clearCoachAnalysisTimer() {
    if (coachAnalysisTimer) {
        clearTimeout(coachAnalysisTimer);
        coachAnalysisTimer = null;
    }
}

function scheduleCoachAnalysis({ immediate = false, force = false } = {}) {
    if (!coachEnabled) return;

    ensureCoachEngine();
    if (!coachEngine) return;

    const fen = buildFenFromCurrentState();
    if (!force && fen === coachCurrentFen) {
        renderCoachPanel();
        return;
    }

    clearCoachAnalysisTimer();
    const runAnalysis = () => analyzeCurrentPosition(fen);

    if (immediate) {
        runAnalysis();
        return;
    }

    coachAnalysisTimer = setTimeout(runAnalysis, 120);
}

async function analyzeCurrentPosition(fen) {
    if (!coachEnabled) return;

    ensureCoachEngine();
    if (!coachEngine) return;

    coachCurrentFen = fen;

    try {
        const analysis = await coachEngine.analyze({
            fen,
            depth: COACH_DEPTH,
            multiPv: COACH_MULTI_PV
        });

        if (!analysis || analysis.fen !== coachCurrentFen) {
            return;
        }

        coachCurrentAnalysis = analysis;
        resolvePendingMoveReview(analysis);
        renderCoachPanel();
    } catch (error) {
        if (error?.message === "Analysis superseded" || error?.message === "Analysis stopped") {
            return;
        }

        updateCoachStatus("Engine unavailable", "danger");
        coachLastReview = {
            label: "Offline",
            tone: "mistake",
            text: "Stockfish could not analyze this position right now."
        };
        renderCoachPanel();
    }
}

function queueMoveReview(preMoveAnalysis, moverColor) {
    if (!coachEnabled) {
        queuedMoveReview = null;
        return;
    }

    queuedMoveReview = preMoveAnalysis
        ? { preMoveAnalysis, moverColor }
        : null;
}

function attachQueuedMoveReview(moveMeta) {
    if (!queuedMoveReview || !moveMeta) return;

    pendingMoveReview = {
        ...queuedMoveReview,
        playedMoveUci: buildMoveUci(moveMeta),
        playedNotation: buildNotation(moveMeta),
        playedPiece: moveMeta.piece
    };

    queuedMoveReview = null;
}

function resolvePendingMoveReview(postMoveAnalysis) {
    if (!coachEnabled) {
        pendingMoveReview = null;
        return;
    }

    if (!pendingMoveReview || !postMoveAnalysis) return;

    const review = buildMoveReview(pendingMoveReview, postMoveAnalysis);
    if (review) {
        coachLastReview = review;
    }
    pendingMoveReview = null;
}

function buildMoveReview(preMoveContext, postMoveAnalysis) {
    const beforeLine = preMoveContext.preMoveAnalysis?.lines?.[0];
    const afterLine = postMoveAnalysis?.lines?.[0];
    if (!beforeLine || !afterLine) return null;

    const bestMove = beforeLine.pv?.[0] || preMoveContext.preMoveAnalysis.bestMove;
    const playedMove = preMoveContext.playedMoveUci;
    const moverPerspectiveBefore = toMoverPerspectiveScore(
        scoreLineToWhiteCentipawns(beforeLine, preMoveContext.preMoveAnalysis.sideToMove),
        preMoveContext.moverColor
    );
    const moverPerspectiveAfter = toMoverPerspectiveScore(
        scoreLineToWhiteCentipawns(afterLine, postMoveAnalysis.sideToMove),
        preMoveContext.moverColor
    );
    const centipawnLoss = Math.max(0, Math.round(moverPerspectiveBefore - moverPerspectiveAfter));
    const quality = classifyMoveQuality(playedMove, bestMove, centipawnLoss);
    const preferredIdea = describePreferredIdea(bestMove, preMoveContext.preMoveAnalysis.fen);
    const playedIdea = describePlayedMove(preMoveContext.playedPiece, preMoveContext.playedMoveUci);

    return {
        label: quality.label,
        tone: quality.tone,
        text: buildReviewText({
            quality,
            playedNotation: preMoveContext.playedNotation,
            playedMove,
            bestMove,
            moveFen: preMoveContext.preMoveAnalysis.fen,
            centipawnLoss,
            preferredIdea,
            playedIdea,
            postMoveAnalysis
        })
    };
}

function buildReviewText({ quality, playedNotation, playedMove, bestMove, moveFen, centipawnLoss, preferredIdea, playedIdea, postMoveAnalysis }) {
    const notation = playedNotation || formatEngineMove(playedMove, moveFen || buildFenFromCurrentState());
    const bestLabel = formatEngineMove(bestMove, moveFen || buildFenFromCurrentState());
    const afterLine = postMoveAnalysis?.lines?.[0];
    const opponentMate = afterLine?.scoreType === "mate" && afterLine.scoreValue > 0;

    if (playedMove === bestMove) {
        return `${notation} matches the engine's top choice. ${preferredIdea}`;
    }

    if (opponentMate) {
        return `${notation} allows a forcing mating attack. The engine preferred ${bestLabel}. ${preferredIdea}`;
    }

    if (quality.tone === "good" || quality.tone === "excellent") {
        return `${notation} is fully playable. ${playedIdea} The engine still preferred ${bestLabel}. ${preferredIdea}`;
    }

    if (quality.tone === "inaccuracy") {
        return `${notation} keeps the game going, but it gives up about ${centipawnLoss} centipawns. The engine preferred ${bestLabel}. ${preferredIdea}`;
    }

    if (quality.tone === "mistake" || quality.tone === "blunder") {
        return `${notation} drops the position noticeably. ${playedIdea} Better was ${bestLabel}. ${preferredIdea}`;
    }

    return `${notation} was not the engine's first choice. Better was ${bestLabel}. ${preferredIdea}`;
}

function classifyMoveQuality(playedMove, bestMove, centipawnLoss) {
    if (playedMove === bestMove || centipawnLoss <= 20) {
        return { label: "Best", tone: "best" };
    }
    if (centipawnLoss <= 60) {
        return { label: "Excellent", tone: "excellent" };
    }
    if (centipawnLoss <= 120) {
        return { label: "Good", tone: "good" };
    }
    if (centipawnLoss <= 220) {
        return { label: "Inaccuracy", tone: "inaccuracy" };
    }
    if (centipawnLoss <= 450) {
        return { label: "Mistake", tone: "mistake" };
    }
    return { label: "Blunder", tone: "blunder" };
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

    if (piece[1] === "r" || piece[1] === "q") {
        return "It increases pressure on key files, diagonals, or weak squares.";
    }

    return "It keeps the position under the best control.";
}

function describePlayedMove(piece, moveUci) {
    if (!piece || !moveUci) return "It changes the position, but the engine saw a stronger continuation.";

    const parsedMove = parseUciMove(moveUci);

    if (piece[1] === "k" && parsedMove && Math.abs(parsedMove.toCol - parsedMove.fromCol) === 2) {
        return "Castling is usually healthy for king safety,";
    }

    if (piece[1] === "p") {
        return "Pawn moves are permanent,";
    }

    if (piece[1] === "q") {
        return "Queen moves can lose time early,";
    }

    if (piece[1] === "n" || piece[1] === "b") {
        return "Piece activity matters a lot here,";
    }

    return "It changes the balance of the position,";
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

function toMoverPerspectiveScore(whiteScore, moverColor) {
    return moverColor === "white" ? whiteScore : -whiteScore;
}

function buildMoveUci(moveMeta) {
    if (!moveMeta) return "";

    const from = toAlgebraic(moveMeta.fromRow, moveMeta.fromCol);
    const to = toAlgebraic(moveMeta.toRow, moveMeta.toCol);
    const promotion = moveMeta.promotedTo ? moveMeta.promotedTo[1] : "";
    return `${from}${to}${promotion}`;
}

function formatEngineMove(moveUci, fen = buildFenFromCurrentState()) {
    const position = parseFenPosition(fen);
    if (!position) return "--";

    return formatMoveOnBoard(moveUci, position.board, position.enPassantTarget);
}

function formatEnginePv(pv, fen, moveLimit = 4) {
    const position = parseFenPosition(fen);
    if (!position) return "";

    const board = cloneBoard(position.board);
    let enPassantTarget = cloneEnPassantTarget(position.enPassantTarget);

    return (pv || []).slice(0, moveLimit).map((moveUci) => {
        const notation = formatMoveOnBoard(moveUci, board, enPassantTarget);
        const parsed = parseUciMove(moveUci);
        if (parsed) {
            const moveMeta = createMoveMetaFromBoard(board, parsed, enPassantTarget);
            if (moveMeta) {
                applySimpleMoveToBoard(board, moveMeta);
                enPassantTarget = getEnPassantTargetForMove(moveMeta);
            } else {
                enPassantTarget = null;
            }
        } else {
            enPassantTarget = null;
        }
        return notation;
    }).filter(Boolean).join("  ");
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

function applySimpleMoveToBoard(board, moveMeta) {
    if (!board || !moveMeta) return;

    board[moveMeta.fromRow][moveMeta.fromCol] = "";
    board[moveMeta.toRow][moveMeta.toCol] = moveMeta.promotedTo || moveMeta.piece;

    if (moveMeta.enPassantCapture) {
        board[moveMeta.enPassantCapture.row][moveMeta.enPassantCapture.col] = "";
    }

    if (moveMeta.rookMove) {
        board[moveMeta.rookMove.fromRow][moveMeta.rookMove.fromCol] = "";
        board[moveMeta.rookMove.toRow][moveMeta.rookMove.toCol] = moveMeta.rookMove.piece;
    }
}

function buildFenFromCurrentState() {
    const boardFen = boardState.map((row) => {
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

        if (empty > 0) {
            output += String(empty);
        }

        return output;
    }).join("/");

    const activeColor = currentTurn === "white" ? "w" : "b";
    const castlingFen = getCastlingFen();
    const enPassantFen = getEnPassantFen();
    const halfmoveClock = String(getHalfmoveClock());
    const fullmoveNumber = String(Math.floor(moveSequence.length / 2) + 1);

    return `${boardFen} ${activeColor} ${castlingFen} ${enPassantFen} ${halfmoveClock} ${fullmoveNumber}`;
}

function getCastlingFen() {
    let value = "";

    if (!castlingRights.white.kingMoved && !castlingRights.white.rookH && boardState[7][4] === "wk" && boardState[7][7] === "wr") {
        value += "K";
    }
    if (!castlingRights.white.kingMoved && !castlingRights.white.rookA && boardState[7][4] === "wk" && boardState[7][0] === "wr") {
        value += "Q";
    }
    if (!castlingRights.black.kingMoved && !castlingRights.black.rookH && boardState[0][4] === "bk" && boardState[0][7] === "br") {
        value += "k";
    }
    if (!castlingRights.black.kingMoved && !castlingRights.black.rookA && boardState[0][4] === "bk" && boardState[0][0] === "br") {
        value += "q";
    }

    return value || "-";
}

function getEnPassantFen() {
    if (!enPassantTarget) return "-";
    return toAlgebraic(enPassantTarget.targetRow, enPassantTarget.targetCol);
}

function getHalfmoveClock() {
    let count = 0;

    for (let index = moveSequence.length - 1; index >= 0; index -= 1) {
        const move = moveSequence[index];
        if (!move) break;
        if (move.piece?.[1] === "p" || move.captured) {
            break;
        }
        count += 1;
    }

    return count;
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

function hasAnyLegalMove(color) {
    return generateLegalMovesForState(boardState, color, getCurrentPosition()).length > 0;
}

function showGameOver(winnerColor, reason = "Checkmate") {
    gameFinished = true;
    stopTimer();
    clearBotTurn();
    clearCoachAnalysisTimer();
    coachEngine?.stop();

    const text = document.getElementById("overlayText");
    if (text) {
        text.textContent = `${reason} - ${winnerColor} wins`;
    }
    playUiSound("end");
    showGameOverlay();

    saveGameResult(winnerColor);
}

function showDraw(reason = "Draw") {
    gameFinished = true;
    stopTimer();
    clearBotTurn();
    clearCoachAnalysisTimer();
    coachEngine?.stop();

    const text = document.getElementById("overlayText");
    if (text) {
        text.textContent = reason;
    }
    playUiSound("end");
    showGameOverlay();

    saveGameResult("Draw");
}

function showGameOverlay() {
    const overlay = document.getElementById("gameOverlay");
    if (overlay) {
        overlay.classList.remove("hidden");
    }
}

function hideGameOverlay() {
    const overlay = document.getElementById("gameOverlay");
    if (overlay) {
        overlay.classList.add("hidden");
    }
}

function toAlgebraic(row, col) {
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    return files[col] + (8 - row);
}

function finalizeMoveRecord(moveMeta) {
    if (!moveMeta) return;

    const { piece, fromRow, fromCol, toRow, toCol, captured, promotedTo, castleSide, rookMove, enPassantCapture } = moveMeta;
    const moveList = document.getElementById("moveList");
    if (!moveList) return;

    const notation = buildNotation(moveMeta);
    const pieceImg = document.createElement("img");
    pieceImg.src = `src/assets/pieces/${pieceMap[piece]}`;
    pieceImg.alt = piece;
    decorateUiPieceIcon(pieceImg, piece, "move-piece-icon");

    if (currentTurn === "white") {
        const rowDiv = document.createElement("div");
        rowDiv.className = "move-row";

        const numberDiv = document.createElement("div");
        numberDiv.className = "move-number";
        numberDiv.textContent = `${moveNumber}.`;

        const whiteCell = document.createElement("div");
        whiteCell.className = "move-cell";
        whiteCell.appendChild(pieceImg);
        whiteCell.append(notation);

        const blackCell = document.createElement("div");
        blackCell.className = "move-cell";

        rowDiv.appendChild(numberDiv);
        rowDiv.appendChild(whiteCell);
        rowDiv.appendChild(blackCell);
        moveList.appendChild(rowDiv);
        moveHistory.push(rowDiv);
    } else {
        const lastRow = moveHistory[moveHistory.length - 1];
        if (lastRow) {
            const blackCell = lastRow.children[2];
            blackCell.appendChild(pieceImg);
            blackCell.append(notation);
        }
        moveNumber += 1;
    }

    moveSequence.push({
        fromRow,
        fromCol,
        toRow,
        toCol,
        piece,
        captured,
        promotedTo,
        castleSide,
        rookMove,
        enPassantCapture
    });

    lastCompletedMove = {
        fromRow,
        fromCol,
        toRow,
        toCol,
        piece,
        captured,
        promotedTo,
        castleSide,
        rookMove,
        enPassantCapture
    };

    playUiSound(captured ? "capture" : "move");
    syncRemoteGame();
}

async function apiFetch(path, options = {}) {
    const token = localStorage.getItem("token");
    if (!token) return null;

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

async function startRemoteGameIfNeeded() {
    if (currentGameId || remoteSyncFailed) return;

    const response = await apiFetch("/api/games/start", {
        method: "POST",
        body: JSON.stringify({
            opponent: getOpponentLabel(),
            moves: moveSequence
        })
    });

    if (!response || !response.ok) {
        remoteSyncFailed = true;
        return;
    }

    const data = await response.json();
    currentGameId = data.id;
}

async function syncRemoteGame({ final = false, winner = null } = {}) {
    if (remoteSyncFailed) return;

    await startRemoteGameIfNeeded();
    if (!currentGameId) return;

    const response = await apiFetch(`/api/games/${currentGameId}`, {
        method: "PATCH",
        body: JSON.stringify({
            opponent: getOpponentLabel(),
            moves: moveSequence,
            status: final ? "finished" : "in_progress",
            result: final ? (winner || "finished") : null
        })
    });

    if (!response || !response.ok) {
        remoteSyncFailed = true;
    }
}

function saveGameResult(winnerColor) {
    const user = getStoredUserLabel() || "Guest";

    const gameData = {
        user,
        date: new Date().toISOString(),
        winner: winnerColor,
        opponent: getOpponentLabel(),
        moves: moveSequence,
        moveCount: moveSequence.length,
        movesHtml: document.getElementById("moveList")?.innerHTML || ""
    };

    const existingGames = JSON.parse(localStorage.getItem("royalmindHistory")) || [];
    existingGames.push(gameData);
    localStorage.setItem("royalmindHistory", JSON.stringify(existingGames));

    syncRemoteGame({ final: true, winner: winnerColor });
}

function scheduleBotTurn() {
    if (!isBotTurn() || gameFinished) return;

    clearBotTurn();
    showStatusMessage(`${BOT_LEVELS[botLevel].label} is thinking...`, 900);

    botMoveTimeout = setTimeout(() => {
        playBotMove();
    }, BOT_LEVELS[botLevel].thinkTime);
}

function clearBotTurn() {
    if (botMoveTimeout) {
        clearTimeout(botMoveTimeout);
        botMoveTimeout = null;
    }
}

function playBotMove() {
    if (!isBotTurn() || gameFinished) return;

    const move = chooseBotMove(botLevel);
    if (!move) {
        if (isKingInCheck(botColor)) {
            showGameOver("White", "Checkmate");
        } else {
            showDraw("Stalemate");
        }
        return;
    }

    const moverColor = currentTurn;
    const preMoveAnalysis = coachEnabled && coachCurrentAnalysis && coachCurrentAnalysis.fen === buildFenFromCurrentState()
        ? coachCurrentAnalysis
        : null;
    const moveResult = tryMove(
        { piece: move.piece, row: move.fromRow, col: move.fromCol },
        move.toRow,
        move.toCol,
        {
            promotionChoice: move.promotedTo || defaultPromotionForPiece(move.piece),
            onPromotionResolved: () => finishTurnAfterSuccessfulMove(moverColor)
        }
    );

    if (!moveResult.moved) return;

    if (!moveResult.awaitingPromotion) {
        queueMoveReview(preMoveAnalysis, moverColor);
        attachQueuedMoveReview(lastMoveMeta);
        finalizeMoveRecord(lastMoveMeta);
        finishTurnAfterSuccessfulMove(moverColor);
        return;
    }

    queueMoveReview(preMoveAnalysis, moverColor);
}

function chooseBotMove(level) {
    const position = getCurrentPosition();
    const legalMoves = generateLegalMovesForState(position.board, botColor, position);
    if (legalMoves.length === 0) return null;

    if (level === "easy") {
        const captureMoves = legalMoves.filter((move) => !!move.captured);
        const pool = captureMoves.length > 0 && Math.random() < 0.4 ? captureMoves : legalMoves;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    if (level === "medium") {
        const scoredMoves = legalMoves.map((move) => ({
            move,
            score: evaluateMoveForBot(move, position) + (move.captured ? PIECE_VALUES[move.captured[1]] : 0)
        }));

        scoredMoves.sort((a, b) => b.score - a.score);
        const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length));
        return topMoves[Math.floor(Math.random() * topMoves.length)].move;
    }

    let bestScore = -Infinity;
    let bestMove = legalMoves[0];

    for (const move of legalMoves) {
        const nextPosition = applyMoveToState(position.board, move, position);
        const score = minimax(nextPosition, BOT_LEVELS.hard.depth - 1, false, -Infinity, Infinity);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
}

function minimax(position, depth, maximizingPlayer, alpha, beta) {
    const sideToMove = maximizingPlayer ? botColor : humanColor;
    const legalMoves = generateLegalMovesForState(position.board, sideToMove, position);

    if (depth <= 0 || legalMoves.length === 0) {
        if (legalMoves.length === 0) {
            if (isKingInCheckOnBoard(position.board, sideToMove)) {
                return maximizingPlayer ? -100000 : 100000;
            }
            return 0;
        }
        return evaluateBoardForBot(position);
    }

    if (maximizingPlayer) {
        let bestScore = -Infinity;
        for (const move of legalMoves) {
            const score = minimax(applyMoveToState(position.board, move, position), depth - 1, false, alpha, beta);
            bestScore = Math.max(bestScore, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return bestScore;
    }

    let bestScore = Infinity;
    for (const move of legalMoves) {
        const score = minimax(applyMoveToState(position.board, move, position), depth - 1, true, alpha, beta);
        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
    }
    return bestScore;
}

function evaluateMoveForBot(move, position = getCurrentPosition()) {
    const nextPosition = applyMoveToState(position.board, move, position);
    return evaluateBoardForBot(nextPosition);
}

function evaluateBoardForBot(position) {
    const state = position.board;
    let score = 0;

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = state[row][col];
            if (!piece) continue;
            const value = PIECE_VALUES[piece[1]] || 0;
            score += piece.startsWith("b") ? value : -value;
        }
    }

    const mobility =
        generateLegalMovesForState(state, botColor, position).length -
        generateLegalMovesForState(state, humanColor, position).length;
    return score + (mobility * 4);
}

function buildNotation(moveMeta) {
    const { piece, fromRow, toRow, toCol, captured, promotedTo } = moveMeta;
    const isPawn = piece[1] === "p";
    if (moveMeta.castleSide) {
        return moveMeta.castleSide === "king" ? "O-O" : "O-O-O";
    }
    const pieceLetter = isPawn ? "" : piece[1].toUpperCase();
    const captureMark = captured ? "x" : "";
    const targetSquare = toAlgebraic(toRow, toCol);
    const promotionMark = promotedTo ? `=${promotedTo[1].toUpperCase()}` : "";
    const pawnPrefix = isPawn && captured ? toAlgebraic(fromRow, moveMeta.fromCol)[0] : "";
    return `${pawnPrefix}${pieceLetter}${captureMark}${targetSquare}${promotionMark}`;
}

function isLastMoveSquare(row, col) {
    if (!lastCompletedMove) return false;
    return (
        (lastCompletedMove.fromRow === row && lastCompletedMove.fromCol === col) ||
        (lastCompletedMove.toRow === row && lastCompletedMove.toCol === col)
    );
}

function shouldHighlightLastMove() {
    if (!lastCompletedMove) return false;
    if (gameMode !== "bot") return true;
    return lastCompletedMove.piece?.startsWith("b");
}

async function toggleFullscreenMode() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch (error) {
        showStatusMessage("Fullscreen is not available here.", 1400);
    }
}

function syncFullscreenUi() {
    const fullscreenToggle = document.getElementById("fullscreenToggle");
    const isFullscreen = !!document.fullscreenElement;

    document.body.classList.toggle("is-fullscreen", isFullscreen);

    if (fullscreenToggle) {
        fullscreenToggle.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
        fullscreenToggle.setAttribute("aria-pressed", String(isFullscreen));
    }
}

async function handleDrawRequest() {
    if (gameFinished) return;
    const confirmed = await appUi.confirm({
        title: gameMode === "bot" ? "End the bot match?" : "Declare a draw?",
        message: gameMode === "bot"
            ? "This will end the current bot match as a draw."
            : "This will finish the current match and mark it as a draw.",
        confirmLabel: "Confirm draw",
        cancelLabel: "Keep playing",
        tone: "warning"
    });
    if (!confirmed) return;
    showDraw(gameMode === "bot" ? "Draw" : "Draw agreed");
}

async function handleResign() {
    if (gameFinished) return;
    const confirmed = await appUi.confirm({
        title: "Resign this game?",
        message: "You can start a new match anytime, but this game will end immediately as a resignation.",
        confirmLabel: "Resign game",
        cancelLabel: "Keep playing",
        tone: "danger"
    });
    if (!confirmed) return;
    const winner = currentTurn === "white" ? "Black" : "White";
    showGameOver(winner, "Resignation");
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

function getStoredSettings() {
    try {
        return JSON.parse(localStorage.getItem("royalmindSettings")) || {};
    } catch {
        return {};
    }
}

function getStoredUserLabel() {
    const fullName = [storedUser?.firstName, storedUser?.lastName].filter(Boolean).join(" ").trim();
    return storedUser?.displayName || storedUser?.username || fullName || storedUser?.email || null;
}

function getStoredCoachPreference() {
    try {
        return JSON.parse(localStorage.getItem(COACH_STORAGE_KEY)) === true;
    } catch {
        return false;
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

function shouldRequireMoveConfirmation() {
    return settingsCache.moveConfirm === true;
}

function shouldPlaySounds() {
    return settingsCache.notifySounds !== false;
}

function shouldNotifyGameStart() {
    return settingsCache.notifyGameStart !== false;
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
        start: { frequency: 520, duration: 0.1, type: "triangle", gain: 0.03 },
        move: { frequency: 440, duration: 0.08, type: "triangle", gain: 0.026 },
        capture: { frequency: 240, duration: 0.12, type: "square", gain: 0.025 },
        error: { frequency: 190, duration: 0.09, type: "sawtooth", gain: 0.02 },
        end: { frequency: 660, duration: 0.16, type: "triangle", gain: 0.03 }
    };

    const tone = tones[kind] || tones.move;

    try {
        if (context.state === "suspended") {
            context.resume().catch(() => {});
        }

        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        const now = context.currentTime;

        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.frequency, now);
        if (kind === "end") {
            oscillator.frequency.linearRampToValueAtTime(520, now + tone.duration);
        }

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

function getPieceName(piece) {
    const type = piece?.[1];
    if (type === "p") return "pawn";
    if (type === "n") return "knight";
    if (type === "b") return "bishop";
    if (type === "r") return "rook";
    if (type === "q") return "queen";
    if (type === "k") return "king";
    return "piece";
}

function getMovePreview(selected, targetRow, targetCol) {
    const position = getCurrentPosition();
    const specialMeta = getSpecialMoveMetaForBoard(
        boardState,
        selected.piece,
        selected.row,
        selected.col,
        targetRow,
        targetCol,
        position
    );
    const capturedPiece = specialMeta.enPassantCapture
        ? specialMeta.enPassantCapture.piece
        : boardState[targetRow][targetCol];

    return {
        targetSquare: toAlgebraic(targetRow, targetCol),
        capturedPiece
    };
}

async function confirmMoveIfNeeded(selected, targetRow, targetCol) {
    if (!shouldRequireMoveConfirmation()) return true;

    const preview = getMovePreview(selected, targetRow, targetCol);
    const pieceName = getPieceName(selected.piece);
    const message = preview.capturedPiece
        ? `Confirm ${pieceName} capture on ${preview.targetSquare}?`
        : `Confirm ${pieceName} move to ${preview.targetSquare}?`;

    return appUi.confirm({
        title: "Confirm move",
        message,
        confirmLabel: "Play move",
        cancelLabel: "Keep selecting",
        tone: "info"
    });
}

function applyAppearanceSettings() {
    const body = document.body;
    if (!body) return;

    const boardTheme = `${BOARD_THEME_CLASS_PREFIX}${normalizeAppearanceToken(settingsCache.boardTheme, "classic-wood")}`;
    const pieceStyle = `${PIECE_STYLE_CLASS_PREFIX}${normalizeAppearanceToken(settingsCache.pieceStyle, "royal-set")}`;
    const animationClass = settingsCache.animatePieces === false ? "pieces-static" : "pieces-animated";

    [BOARD_THEME_CLASS_PREFIX, PIECE_STYLE_CLASS_PREFIX].forEach((prefix) => {
        Array.from(body.classList)
            .filter((className) => className.startsWith(prefix))
            .forEach((className) => body.classList.remove(className));
    });

    body.classList.remove("pieces-static", "pieces-animated");
    body.classList.add(boardTheme, pieceStyle, animationClass);
}

function shouldShowCoordinates() {
    return settingsCache.boardCoordinates !== "Hide";
}

function shouldAutoPromote(piece) {
    const pieceColor = piece.startsWith("w") ? "white" : "black";
    if (gameMode === "bot" && pieceColor === botColor) return true;
    return settingsCache.autoQueen === true;
}

function defaultPromotionForPiece(piece) {
    return piece.startsWith("w") ? "wq" : "bq";
}

function getOpponentLabel() {
    return gameMode === "bot" ? BOT_LEVELS[botLevel].label : "Local";
}

function isBotTurn() {
    return gameMode === "bot" && currentTurn === botColor;
}

function capitalizeColor(color) {
    return color.charAt(0).toUpperCase() + color.slice(1);
}

function cloneBoard(state) {
    return state.map((row) => row.slice());
}

function cloneCastlingRights(rights = createInitialCastlingRights()) {
    return JSON.parse(JSON.stringify(rights));
}

function cloneEnPassantTarget(target) {
    return target ? { ...target } : null;
}

function createInitialCastlingRights() {
    return {
        white: { kingMoved: false, rookA: false, rookH: false },
        black: { kingMoved: false, rookA: false, rookH: false }
    };
}

function getCurrentPosition() {
    return {
        board: boardState,
        castlingRights: cloneCastlingRights(castlingRights),
        enPassantTarget: cloneEnPassantTarget(enPassantTarget)
    };
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

function isSquareAttackedOnBoard(state, byColor, targetRow, targetCol) {
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = state[row][col];
            if (!piece) continue;

            if (
                (byColor === "white" && piece.startsWith("w")) ||
                (byColor === "black" && piece.startsWith("b"))
            ) {
                if (isValidMoveOnBoard(state, piece, row, col, targetRow, targetCol, true)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isKingInCheckOnBoard(state, color) {
    const kingPos = findKingOnBoard(state, color);
    if (!kingPos) return false;
    const enemyColor = color === "white" ? "black" : "white";
    return isSquareAttackedOnBoard(state, enemyColor, kingPos.row, kingPos.col);
}

function isValidMoveOnBoard(state, piece, row, col, targetRow, targetCol, skipCheck = false, context = getCurrentPosition()) {
    if (row === targetRow && col === targetCol) return false;

    const color = piece.startsWith("w") ? "white" : "black";
    const target = state[targetRow][targetCol];
    if (target && target.startsWith(piece[0])) return false;

    const type = piece[1];
    let valid = false;

    switch (type) {
        case "p": {
            const dir = color === "white" ? -1 : 1;
            const startRow = color === "white" ? 6 : 1;

            if (col === targetCol && target === "") {
                if (row + dir === targetRow) valid = true;
                if (row === startRow && row + (2 * dir) === targetRow && state[row + dir][col] === "") {
                    valid = true;
                }
            }

            if (Math.abs(col - targetCol) === 1 && row + dir === targetRow) {
                if (target && !target.startsWith(piece[0])) {
                    valid = true;
                } else if (canCaptureEnPassant(state, piece, row, col, targetRow, targetCol, context)) {
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
            if (Math.abs(targetRow - row) === Math.abs(targetCol - col)) {
                const rStep = targetRow > row ? 1 : -1;
                const cStep = targetCol > col ? 1 : -1;
                valid = true;
                for (let r = row + rStep, c = col + cStep; r !== targetRow && c !== targetCol; r += rStep, c += cStep) {
                    if (state[r][c] !== "") {
                        valid = false;
                        break;
                    }
                }
            }
            break;

        case "r":
            if (row === targetRow || col === targetCol) {
                valid = true;
                if (row === targetRow) {
                    const step = targetCol > col ? 1 : -1;
                    for (let c = col + step; c !== targetCol; c += step) {
                        if (state[row][c] !== "") {
                            valid = false;
                            break;
                        }
                    }
                } else {
                    const step = targetRow > row ? 1 : -1;
                    for (let r = row + step; r !== targetRow; r += step) {
                        if (state[r][col] !== "") {
                            valid = false;
                            break;
                        }
                    }
                }
            }
            break;

        case "q": {
            const dr = Math.abs(targetRow - row);
            const dc = Math.abs(targetCol - col);
            if (dr === dc) {
                const rStep = targetRow > row ? 1 : -1;
                const cStep = targetCol > col ? 1 : -1;
                valid = true;
                for (let r = row + rStep, c = col + cStep; r !== targetRow && c !== targetCol; r += rStep, c += cStep) {
                    if (state[r][c] !== "") {
                        valid = false;
                        break;
                    }
                }
            } else if (row === targetRow || col === targetCol) {
                valid = true;
                if (row === targetRow) {
                    const step = targetCol > col ? 1 : -1;
                    for (let c = col + step; c !== targetCol; c += step) {
                        if (state[row][c] !== "") {
                            valid = false;
                            break;
                        }
                    }
                } else {
                    const step = targetRow > row ? 1 : -1;
                    for (let r = row + step; r !== targetRow; r += step) {
                        if (state[r][col] !== "") {
                            valid = false;
                            break;
                        }
                    }
                }
            }
            break;
        }

        case "k": {
            const dr = Math.abs(targetRow - row);
            const dc = Math.abs(targetCol - col);
            valid = dr <= 1 && dc <= 1;
            if (!valid && dr === 0 && dc === 2 && !skipCheck) {
                valid = canCastleOnBoard(state, color, targetCol > col ? "king" : "queen", context);
            }
            break;
        }

        default:
            return false;
    }

    if (valid && !skipCheck) {
        const specialMeta = getSpecialMoveMetaForBoard(state, piece, row, col, targetRow, targetCol, context);
        const nextPosition = applyMoveToState(
            state,
            {
                piece,
                fromRow: row,
                fromCol: col,
                toRow: targetRow,
                toCol: targetCol,
                captured: specialMeta.enPassantCapture ? specialMeta.enPassantCapture.piece : (state[targetRow][targetCol] || null),
                promotedTo: null,
                castleSide: specialMeta.castleSide || null,
                rookMove: specialMeta.rookMove || null,
                enPassantCapture: specialMeta.enPassantCapture || null
            },
            context
        );

        if (isKingInCheckOnBoard(nextPosition.board, color)) {
            valid = false;
        }
    }

    return valid;
}

function generateLegalMovesForState(state, color, context = getCurrentPosition()) {
    const moves = [];
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = state[row][col];
            if (!piece) continue;
            if (color === "white" && !piece.startsWith("w")) continue;
            if (color === "black" && !piece.startsWith("b")) continue;

            for (let targetRow = 0; targetRow < 8; targetRow += 1) {
                for (let targetCol = 0; targetCol < 8; targetCol += 1) {
                    if (!isValidMoveOnBoard(state, piece, row, col, targetRow, targetCol, false, context)) continue;
                    const specialMeta = getSpecialMoveMetaForBoard(state, piece, row, col, targetRow, targetCol, context);
                    const captured = specialMeta.enPassantCapture
                        ? specialMeta.enPassantCapture.piece
                        : (state[targetRow][targetCol] || null);
                    const promotedTo =
                        (piece === "wp" && targetRow === 0) || (piece === "bp" && targetRow === 7)
                            ? defaultPromotionForPiece(piece)
                            : null;

                    moves.push({
                        piece,
                        fromRow: row,
                        fromCol: col,
                        toRow: targetRow,
                        toCol: targetCol,
                        captured,
                        promotedTo,
                        castleSide: specialMeta.castleSide || null,
                        rookMove: specialMeta.rookMove || null,
                        enPassantCapture: specialMeta.enPassantCapture || null
                    });
                }
            }
        }
    }
    return moves;
}

function applyMoveToState(state, move, context = getCurrentPosition()) {
    const nextBoard = cloneBoard(state);
    const nextRights = cloneCastlingRights(context.castlingRights);
    const nextEnPassant = cloneEnPassantTarget(context.enPassantTarget);

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
        castlingRights: nextRights,
        enPassantTarget: getEnPassantTargetForMove(move, nextEnPassant)
    };
}

function canCaptureEnPassant(state, piece, row, col, targetRow, targetCol, context) {
    const target = context.enPassantTarget;
    if (!target) return false;
    return (
        target.targetRow === targetRow &&
        target.targetCol === targetCol &&
        Math.abs(col - targetCol) === 1 &&
        target.pawnColor !== (piece.startsWith("w") ? "white" : "black") &&
        state[target.captureRow][target.captureCol] === target.capturedPiece
    );
}

function canCastleOnBoard(state, color, side, context) {
    const rights = context.castlingRights?.[color];
    if (!rights || rights.kingMoved) return false;
    if (isKingInCheckOnBoard(state, color)) return false;

    const row = color === "white" ? 7 : 0;
    const kingPiece = color === "white" ? "wk" : "bk";
    const rookPiece = color === "white" ? "wr" : "br";
    const rookCol = side === "king" ? 7 : 0;
    const pathCols = side === "king" ? [5, 6] : [1, 2, 3];
    const kingPassCols = side === "king" ? [5, 6] : [3, 2];

    if (state[row][4] !== kingPiece || state[row][rookCol] !== rookPiece) return false;
    if ((side === "king" && rights.rookH) || (side === "queen" && rights.rookA)) return false;
    if (pathCols.some((colIndex) => state[row][colIndex] !== "")) return false;
    if (kingPassCols.some((colIndex) => isSquareAttackedOnBoard(state, color === "white" ? "black" : "white", row, colIndex))) {
        return false;
    }

    return true;
}

function getSpecialMoveMetaForBoard(state, piece, fromRow, fromCol, toRow, toCol, context) {
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

    if (piece[1] === "p" && fromCol !== toCol && state[toRow][toCol] === "" && canCaptureEnPassant(state, piece, fromRow, fromCol, toRow, toCol, context)) {
        return {
            castleSide: null,
            rookMove: null,
            enPassantCapture: {
                row: context.enPassantTarget.captureRow,
                col: context.enPassantTarget.captureCol,
                piece: context.enPassantTarget.capturedPiece
            }
        };
    }

    return {
        castleSide: null,
        rookMove: null,
        enPassantCapture: null
    };
}

function updateCastlingRightsForMove(move, rights = castlingRights) {
    const movingColor = move.piece.startsWith("w") ? "white" : "black";
    const opponentColor = movingColor === "white" ? "black" : "white";

    if (move.piece[1] === "k") {
        rights[movingColor].kingMoved = true;
    }

    if (move.piece[1] === "r") {
        if (move.fromRow === (movingColor === "white" ? 7 : 0) && move.fromCol === 0) {
            rights[movingColor].rookA = true;
        }
        if (move.fromRow === (movingColor === "white" ? 7 : 0) && move.fromCol === 7) {
            rights[movingColor].rookH = true;
        }
    }

    if (move.captured === (opponentColor === "white" ? "wr" : "br")) {
        const captureRow = move.enPassantCapture ? move.enPassantCapture.row : move.toRow;
        const captureCol = move.enPassantCapture ? move.enPassantCapture.col : move.toCol;
        if (captureRow === (opponentColor === "white" ? 7 : 0) && captureCol === 0) {
            rights[opponentColor].rookA = true;
        }
        if (captureRow === (opponentColor === "white" ? 7 : 0) && captureCol === 7) {
            rights[opponentColor].rookH = true;
        }
    }
}

function getEnPassantTargetForMove(move) {
    if (move.piece[1] !== "p") return null;
    if (Math.abs(move.toRow - move.fromRow) !== 2) return null;

    const direction = move.piece.startsWith("w") ? -1 : 1;
    const targetRow = move.fromRow + direction;
    return {
        targetRow,
        targetCol: move.fromCol,
        captureRow: move.toRow,
        captureCol: move.toCol,
        pawnColor: move.piece.startsWith("w") ? "white" : "black",
        capturedPiece: move.piece
    };
}
