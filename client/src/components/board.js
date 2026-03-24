let selectedSquare = null;
let selectedPiece = null;
let currentTurn = "white";
let moveHistory = [];
let moveNumber = 1;
let capturedByWhite = [];
let capturedByBlack = [];
let moveSequence = [];
let lastMoveMeta = null;
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

const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
const settingsCache = getStoredSettings();
const storedUser = parseStoredUser();

const BOT_LEVELS = {
    easy: { label: "Easy Bot", depth: 1, thinkTime: 420 },
    medium: { label: "Medium Bot", depth: 2, thinkTime: 620 },
    hard: { label: "Hard Bot", depth: 3, thinkTime: 760 }
};

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

export function createBoard() {
    initializeGameUi();
    initializeMatchUi();

    const boardElement = document.getElementById("chessboard");
    if (!boardElement) return;

    boardElement.innerHTML = "";

    const perspective = gameMode === "bot" ? humanColor : currentTurn;
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

            boardElement.appendChild(square);
        }
    }

    updateTurnLabel();
    renderCapturedPieces();
    updateTimerDisplay();
}

function initializeGameUi() {
    if (uiInitialized) return;

    const timeControlSelect = document.getElementById("timeControlSelect");
    const customMinutes = document.getElementById("customMinutes");
    const setTimeControlBtn = document.getElementById("setTimeControlBtn");

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
        setTimeControlBtn.addEventListener("click", () => {
            const newTimeInSeconds = getTimeFromUi();
            if (!newTimeInSeconds) return;

            const hasGameProgress = moveHistory.length > 0 || capturedByWhite.length > 0 || capturedByBlack.length > 0;
            if (hasGameProgress) {
                const confirmReset = confirm("Changing time control will restart the current game. Continue?");
                if (!confirmReset) return;
            }

            resetGameState(newTimeInSeconds);
        });
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

function getTimeFromUi() {
    const timeControlSelect = document.getElementById("timeControlSelect");
    const customMinutes = document.getElementById("customMinutes");

    if (!timeControlSelect) return 600;

    if (timeControlSelect.value === "custom") {
        const minutes = Number(customMinutes ? customMinutes.value : 0);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
            alert("Custom time must be between 1 and 180 minutes.");
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

    currentTurn = "white";
    selectedSquare = null;
    selectedPiece = null;
    moveHistory = [];
    moveNumber = 1;
    capturedByWhite = [];
    capturedByBlack = [];
    moveSequence = [];
    lastMoveMeta = null;
    pendingPromotionMeta = null;
    currentGameId = null;
    remoteSyncFailed = false;
    gameFinished = false;
    boardState = cloneBoard(initialBoardState);
    whiteTimeLeft = timeInSeconds;
    blackTimeLeft = timeInSeconds;

    const moveList = document.getElementById("moveList");
    if (moveList) moveList.innerHTML = "";

    const overlay = document.getElementById("gameOverlay");
    if (overlay) overlay.classList.add("hidden");

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

function handleSquareClick(square) {
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

    const moverColor = currentTurn;
    const moveResult = tryMove(selectedPiece, row, col, {
        promotionChoice: shouldAutoPromote(selectedPiece.piece) ? defaultPromotionForPiece(selectedPiece.piece) : null,
        onPromotionResolved: () => finishTurnAfterSuccessfulMove(moverColor)
    });

    if (!moveResult.moved) {
        showStatusMessage("Illegal move");
        clearSelection();
        createBoard();
        return;
    }

    clearSelection();

    if (!moveResult.awaitingPromotion) {
        finalizeMoveRecord(lastMoveMeta);
        finishTurnAfterSuccessfulMove(moverColor);
    }
}

function tryMove(selected, targetRow, targetCol, options = {}) {
    const { piece, row, col } = selected;
    const { promotionChoice = null, onPromotionResolved = null } = options;
    const capturedPiece = boardState[targetRow][targetCol];

    if (!isValidMove(piece, row, col, targetRow, targetCol)) {
        return { moved: false, awaitingPromotion: false };
    }

    boardState[targetRow][targetCol] = piece;
    boardState[row][col] = "";

    lastMoveMeta = {
        fromRow: row,
        fromCol: col,
        toRow: targetRow,
        toCol: targetCol,
        piece,
        captured: capturedPiece || null,
        promotedTo: null
    };

    if (capturedPiece) {
        if (piece.startsWith("w")) {
            capturedByWhite.push(capturedPiece);
        } else {
            capturedByBlack.push(capturedPiece);
        }
    }

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
        whiteContainer.appendChild(img);
    });

    capturedByBlack.forEach((piece) => {
        const img = document.createElement("img");
        img.src = `src/assets/pieces/${pieceMap[piece]}`;
        img.alt = piece;
        blackContainer.appendChild(img);
    });

    if (capturedByWhite.length === 0) {
        const empty = document.createElement("span");
        empty.className = "captured-empty";
        empty.textContent = "No captures yet";
        whiteContainer.appendChild(empty);
    }

    if (capturedByBlack.length === 0) {
        const empty = document.createElement("span");
        empty.className = "captured-empty";
        empty.textContent = "No captures yet";
        blackContainer.appendChild(empty);
    }
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

function hasAnyLegalMove(color) {
    return generateLegalMovesForState(boardState, color).length > 0;
}

function showGameOver(winnerColor, reason = "Checkmate") {
    gameFinished = true;
    stopTimer();
    clearBotTurn();

    const overlay = document.getElementById("gameOverlay");
    const text = document.getElementById("overlayText");
    if (text) {
        text.textContent = `${reason} - ${winnerColor} wins`;
    }
    if (overlay) {
        overlay.classList.remove("hidden");
    }

    saveGameResult(winnerColor);
}

function showDraw(reason = "Draw") {
    gameFinished = true;
    stopTimer();
    clearBotTurn();

    const overlay = document.getElementById("gameOverlay");
    const text = document.getElementById("overlayText");
    if (text) {
        text.textContent = reason;
    }
    if (overlay) {
        overlay.classList.remove("hidden");
    }

    saveGameResult("Draw");
}

function toAlgebraic(row, col) {
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    return files[col] + (8 - row);
}

function finalizeMoveRecord(moveMeta) {
    if (!moveMeta) return;

    const { piece, fromRow, fromCol, toRow, toCol, captured, promotedTo } = moveMeta;
    const moveList = document.getElementById("moveList");
    if (!moveList) return;

    const notation = buildNotation(moveMeta);
    const pieceImg = document.createElement("img");
    pieceImg.src = `src/assets/pieces/${pieceMap[piece]}`;
    pieceImg.alt = piece;

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
        promotedTo
    });

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
        date: new Date().toLocaleString(),
        winner: winnerColor,
        opponent: getOpponentLabel(),
        moves: moveSequence,
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
        finalizeMoveRecord(lastMoveMeta);
        finishTurnAfterSuccessfulMove(moverColor);
    }
}

function chooseBotMove(level) {
    const legalMoves = generateLegalMovesForState(boardState, botColor);
    if (legalMoves.length === 0) return null;

    if (level === "easy") {
        const captureMoves = legalMoves.filter((move) => !!move.captured);
        const pool = captureMoves.length > 0 && Math.random() < 0.4 ? captureMoves : legalMoves;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    if (level === "medium") {
        const scoredMoves = legalMoves.map((move) => ({
            move,
            score: evaluateMoveForBot(move) + (move.captured ? PIECE_VALUES[move.captured[1]] : 0)
        }));

        scoredMoves.sort((a, b) => b.score - a.score);
        const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length));
        return topMoves[Math.floor(Math.random() * topMoves.length)].move;
    }

    let bestScore = -Infinity;
    let bestMove = legalMoves[0];

    for (const move of legalMoves) {
        const nextBoard = applyMoveToState(boardState, move);
        const score = minimax(nextBoard, BOT_LEVELS.hard.depth - 1, false, -Infinity, Infinity);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
}

function minimax(state, depth, maximizingPlayer, alpha, beta) {
    const sideToMove = maximizingPlayer ? botColor : humanColor;
    const legalMoves = generateLegalMovesForState(state, sideToMove);

    if (depth <= 0 || legalMoves.length === 0) {
        if (legalMoves.length === 0) {
            if (isKingInCheckOnBoard(state, sideToMove)) {
                return maximizingPlayer ? -100000 : 100000;
            }
            return 0;
        }
        return evaluateBoardForBot(state);
    }

    if (maximizingPlayer) {
        let bestScore = -Infinity;
        for (const move of legalMoves) {
            const score = minimax(applyMoveToState(state, move), depth - 1, false, alpha, beta);
            bestScore = Math.max(bestScore, score);
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        }
        return bestScore;
    }

    let bestScore = Infinity;
    for (const move of legalMoves) {
        const score = minimax(applyMoveToState(state, move), depth - 1, true, alpha, beta);
        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
    }
    return bestScore;
}

function evaluateMoveForBot(move) {
    const nextBoard = applyMoveToState(boardState, move);
    return evaluateBoardForBot(nextBoard);
}

function evaluateBoardForBot(state) {
    let score = 0;

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = state[row][col];
            if (!piece) continue;
            const value = PIECE_VALUES[piece[1]] || 0;
            score += piece.startsWith("b") ? value : -value;
        }
    }

    const mobility = generateLegalMovesForState(state, botColor).length - generateLegalMovesForState(state, humanColor).length;
    return score + (mobility * 4);
}

function buildNotation(moveMeta) {
    const { piece, fromRow, toRow, toCol, captured, promotedTo } = moveMeta;
    const isPawn = piece[1] === "p";
    const pieceLetter = isPawn ? "" : piece[1].toUpperCase();
    const captureMark = captured ? "x" : "";
    const targetSquare = toAlgebraic(toRow, toCol);
    const promotionMark = promotedTo ? `=${promotedTo[1].toUpperCase()}` : "";
    const pawnPrefix = isPawn && captured ? toAlgebraic(fromRow, moveMeta.fromCol)[0] : "";
    return `${pawnPrefix}${pieceLetter}${captureMark}${targetSquare}${promotionMark}`;
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

function isValidMoveOnBoard(state, piece, row, col, targetRow, targetCol, skipCheck = false) {
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

            if (
                Math.abs(col - targetCol) === 1 &&
                row + dir === targetRow &&
                target !== "" &&
                !target.startsWith(piece[0])
            ) {
                valid = true;
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
            break;
        }

        default:
            return false;
    }

    if (valid && !skipCheck) {
        const nextBoard = cloneBoard(state);
        nextBoard[targetRow][targetCol] = piece;
        nextBoard[row][col] = "";
        if (isKingInCheckOnBoard(nextBoard, color)) {
            valid = false;
        }
    }

    return valid;
}

function generateLegalMovesForState(state, color) {
    const moves = [];
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const piece = state[row][col];
            if (!piece) continue;
            if (color === "white" && !piece.startsWith("w")) continue;
            if (color === "black" && !piece.startsWith("b")) continue;

            for (let targetRow = 0; targetRow < 8; targetRow += 1) {
                for (let targetCol = 0; targetCol < 8; targetCol += 1) {
                    if (!isValidMoveOnBoard(state, piece, row, col, targetRow, targetCol)) continue;
                    const captured = state[targetRow][targetCol] || null;
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
                        promotedTo
                    });
                }
            }
        }
    }
    return moves;
}

function applyMoveToState(state, move) {
    const nextBoard = cloneBoard(state);
    nextBoard[move.toRow][move.toCol] = move.promotedTo || move.piece;
    nextBoard[move.fromRow][move.fromCol] = "";
    return nextBoard;
}
