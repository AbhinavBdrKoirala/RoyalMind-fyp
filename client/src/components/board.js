let selectedSquare = null;
let selectedPiece = null;
let currentTurn = "white";
let promotionSquare = null;
let promotionColor = null;
let moveHistory = [];
let moveNumber = 1;
let capturedByWhite = [];
let capturedByBlack = [];
let moveSequence = [];
let lastMoveMeta = null;
let pendingPromotionMeta = null;
let timerInterval = null;
let whiteTimeLeft = 600;
let blackTimeLeft = 600;
let timerRunning = false;
let uiInitialized = false;
let currentGameId = null;
let remoteSyncFailed = false;

const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];

const TIME_PRESETS = {
    "bullet-1": 60,
    "blitz-3": 180,
    "blitz-5": 300,
    "rapid-10": 600,
    "rapid-15": 900,
    "classical-30": 1800,
    "classical-60": 3600
};


const initialBoardState = [
    ["br","bn","bb","bq","bk","bb","bn","br"],
    ["bp","bp","bp","bp","bp","bp","bp","bp"],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["wp","wp","wp","wp","wp","wp","wp","wp"],
    ["wr","wn","wb","wq","wk","wb","wn","wr"]
];
let boardState = initialBoardState.map(row => [...row]);

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

    const boardElement = document.getElementById("chessboard");
    boardElement.innerHTML = "";

    const files = currentTurn === "white"
        ? ["a", "b", "c", "d", "e", "f", "g", "h"]
        : ["h", "g", "f", "e", "d", "c", "b", "a"];

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {

            const square = document.createElement("div");
            square.classList.add("square");

            square.dataset.row = row;
            square.dataset.col = col;

            const isLight = (row + col) % 2 === 0;
            square.classList.add(isLight ? "light" : "dark");

            if (row === 7) {
                const fileLabel = document.createElement("span");
                fileLabel.className = "square-label file-label";
                fileLabel.textContent = files[col];
                square.appendChild(fileLabel);
            }

            if (col === 0) {
                const rankLabel = document.createElement("span");
                rankLabel.className = "square-label rank-label";
                rankLabel.textContent = currentTurn === "white"
                    ? String(8 - row)
                    : String(row + 1);
                square.appendChild(rankLabel);
            }

            square.addEventListener("click", () => handleSquareClick(square));

            const piece = boardState[row][col];
            if (piece !== "") {
                const img = document.createElement("img");
                img.src = `src/assets/pieces/${pieceMap[piece]}`;
                img.alt = piece;
                square.appendChild(img);
            }
            // ⚡ MARK KING IN CHECK
            const kingColor = piece === "wk" ? "white" : piece === "bk" ? "black" : null;
            if (kingColor && isKingInCheck(kingColor)) {
                square.classList.add("check"); // this adds the red highlight
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
                const confirmReset = confirm(
                    "Changing time control will restart the current game. The current game will be treated as a loss. Continue?"
                );
                if (!confirmReset) return;
            }

            resetGameState(newTimeInSeconds);
        });
    }

    updateTimerDisplay();
    uiInitialized = true;
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
    if (timerRunning) return;

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

    currentTurn = "white";
    selectedSquare = null;
    selectedPiece = null;
    promotionSquare = null;
    promotionColor = null;
    moveHistory = [];
    moveNumber = 1;
    capturedByWhite = [];
    capturedByBlack = [];
    moveSequence = [];
    lastMoveMeta = null;
    pendingPromotionMeta = null;
    currentGameId = null;
    remoteSyncFailed = false;
    boardState = initialBoardState.map(row => [...row]);
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
    turnLabel.textContent = currentTurn === "white" ? "White to move" : "Black to move";
}

function handleSquareClick(square) {
    const row = Number(square.dataset.row);
    const col = Number(square.dataset.col);
    const piece = boardState[row][col];
    
    // STEP 1: No piece selected yet
    if (!selectedPiece) {
        if (
            piece !== "" &&
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

    // STEP 2: Clicking your own piece again → reselect
    if (piece !== "" && piece[0] === selectedPiece.piece[0]) {
        clearSelection();
        selectedPiece = { piece, row, col };
        selectedSquare = square;
        square.classList.add("selected");
        showLegalMoveHints(piece, row, col);
        return;
    }

    // STEP 3: Try moving
    
    const fromRow = selectedPiece.row;
    const fromCol = selectedPiece.col;
    const movingPiece = selectedPiece.piece;

    const moved = tryMove(selectedPiece, row, col);

    if (moved) {
        if (!pendingPromotionMeta) {
            finalizeMoveRecord(lastMoveMeta);
        }

        currentTurn = currentTurn === "white" ? "black" : "white";
        if (!timerRunning) {
            startTimer();
        }
        updateTimerDisplay();

        const opponent = currentTurn;

        // CHECKMATE CHECK
        if (isKingInCheck(opponent) && !hasAnyLegalMove(opponent)) {
            showGameOver(currentTurn === "white" ? "Black" : "White");
        }
    } else {
        showStatusMessage("Illegal move");
    }


    clearSelection();
    createBoard();
}




function tryMove(selected, targetRow, targetCol) {
    const { piece, row, col } = selected;
    const capturedPiece = boardState[targetRow][targetCol];

    // 1️⃣ Check if the move is legal
    if (!isValidMove(piece, row, col, targetRow, targetCol)) {
        return false; // move not allowed
    }

    // 2️⃣ Perform the move
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

    if (capturedPiece !== "") {
        if (piece.startsWith("w")) {
            capturedByWhite.push(capturedPiece);
        } else {
            capturedByBlack.push(capturedPiece);
        }
    }

    // 3️⃣ Handle pawn promotion
    if ((piece === "wp" && targetRow === 0) || (piece === "bp" && targetRow === 7)) {
        pendingPromotionMeta = { ...lastMoveMeta, promotedTo: null };
        showPromotionUI(piece.startsWith("w") ? "white" : "black", promoted => {
            boardState[targetRow][targetCol] = promoted;
            if (pendingPromotionMeta) {
                pendingPromotionMeta.promotedTo = promoted;
                finalizeMoveRecord(pendingPromotionMeta);
                pendingPromotionMeta = null;
            }
            createBoard();
        });
    }

    return true; // move completed successfully
}


function promotePawn(color) {
    let choice = prompt(
        "Promote pawn to: Q (Queen), R (Rook), B (Bishop), N (Knight)"
    );

    if (!choice) return null;

    choice = choice.toUpperCase();

    if (choice === "Q") return color === "white" ? "wq" : "bq";
    if (choice === "R") return color === "white" ? "wr" : "br";
    if (choice === "B") return color === "white" ? "wb" : "bb";
    if (choice === "N") return color === "white" ? "wn" : "bn";

    alert("Invalid choice. Defaulting to Queen.");
    return color === "white" ? "wq" : "bq";
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

    for (let targetRow = 0; targetRow < 8; targetRow++) {
        for (let targetCol = 0; targetCol < 8; targetCol++) {
            if (isValidMove(piece, row, col, targetRow, targetCol)) {
                legalMoves.push({ row: targetRow, col: targetCol });
            }
        }
    }

    return legalMoves;
}

function showLegalMoveHints(piece, row, col) {
    clearLegalMoveHints();

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
    document.querySelectorAll(".legal-move-hint").forEach(node => node.remove());
    document.querySelectorAll(".legal-move-square").forEach(node => {
        node.classList.remove("legal-move-square");
    });
}

function renderCapturedPieces() {
    const whiteContainer = document.getElementById("capturedByWhite");
    const blackContainer = document.getElementById("capturedByBlack");

    if (!whiteContainer || !blackContainer) return;

    whiteContainer.innerHTML = "";
    blackContainer.innerHTML = "";

    capturedByWhite.forEach(piece => {
        const img = document.createElement("img");
        img.src = `src/assets/pieces/${pieceMap[piece]}`;
        img.alt = piece;
        whiteContainer.appendChild(img);
    });

    capturedByBlack.forEach(piece => {
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
function showPromotion(row, col, color) {
    promotionSquare = { row, col };
    promotionColor = color;

    const modal = document.getElementById("promotionModal");
    const imgs = modal.querySelectorAll("img");

    imgs.forEach(img => {
        const piece = img.dataset.piece;
        img.src = `src/assets/pieces/${color}_${piece === "n" ? "knight" :
                                          piece === "b" ? "bishop" :
                                          piece === "r" ? "rook" :
                                          "queen"}.png`;
    });

    modal.classList.remove("hidden");
}
function showPromotionUI(color, callback) {
    const overlay = document.createElement("div");
    overlay.id = "promotion-overlay";

    const container = document.createElement("div");
    container.className = "promotion-container";

    const pieces = color === "white"
        ? ["wq", "wr", "wb", "wn"]
        : ["bq", "br", "bb", "bn"];

    pieces.forEach(p => {
        const img = document.createElement("img");
        img.src = `src/assets/pieces/${pieceMap[p]}`;
        img.className = "promotion-piece";

        img.onclick = () => {
            document.body.removeChild(overlay);
            callback(p);
        };

        container.appendChild(img);
    });

    overlay.appendChild(container);
    document.body.appendChild(overlay);
}

document.addEventListener("click", e => {
    if (!e.target.matches("#promotionModal img")) return;

    const pieceType = e.target.dataset.piece;
    const colorPrefix = promotionColor === "white" ? "w" : "b";

    boardState[promotionSquare.row][promotionSquare.col] =
        colorPrefix + pieceType;

    document.getElementById("promotionModal").classList.add("hidden");
    createBoard();
});

// =======================
// CHECK DETECTION HELPERS
// =======================

// Find king position
function findKing(color) {
    const kingCode = color === "white" ? "wk" : "bk";

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (boardState[r][c] === kingCode) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

// Check if a square is attacked by opponent
function isSquareAttacked(targetRow, targetCol, byColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r][c];
            if (piece === "") continue;

            if (
                (byColor === "white" && piece.startsWith("w")) ||
                (byColor === "black" && piece.startsWith("b"))
            ) {
                if (isValidMove(piece, r, c, targetRow, targetCol, true)) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Check if king is in check
function isKingInCheck(color) {
    const kingPos = findKing(color);
    if (!kingPos) return false;

    const enemyColor = color === "white" ? "black" : "white";
    return isSquareAttacked(kingPos.row, kingPos.col, enemyColor);
}

// =======================
// VALID MOVE FUNCTION
// =======================
function isValidMove(piece, row, col, targetRow, targetCol, skipCheck = false) {
    if (row === targetRow && col === targetCol) return false; // cannot move to same square

    const color = piece.startsWith("w") ? "white" : "black";
    const target = boardState[targetRow][targetCol];

    // Cannot capture own pieces
    if (target !== "" && target.startsWith(piece[0])) return false;

    const type = piece[1]; // p, n, b, r, q, k
    let valid = false; // flag for valid move

    switch (type) {
        case "p": // pawn
            const dir = color === "white" ? -1 : 1;
            const startRow = color === "white" ? 6 : 1;

            // forward move
            if (col === targetCol && target === "") {
                if (row + dir === targetRow) valid = true;
                if (row === startRow && row + 2*dir === targetRow && boardState[row + dir][col] === "") valid = true;
            }

            // capture
            if (Math.abs(col - targetCol) === 1 && row + dir === targetRow && target !== "" && !target.startsWith(piece[0])) valid = true;
            break;

        case "n": // knight
            const drN = Math.abs(targetRow - row);
            const dcN = Math.abs(targetCol - col);
            if ((drN === 2 && dcN === 1) || (drN === 1 && dcN === 2)) valid = true;
            break;

        case "b": // bishop
            if (Math.abs(targetRow - row) === Math.abs(targetCol - col)) {
                const rStep = targetRow > row ? 1 : -1;
                const cStep = targetCol > col ? 1 : -1;
                let rB = row + rStep, cB = col + cStep;
                valid = true;
                while (rB !== targetRow && cB !== targetCol) {
                    if (boardState[rB][cB] !== "") { valid = false; break; }
                    rB += rStep; cB += cStep;
                }
            }
            break;

        case "r": // rook
            if (row === targetRow || col === targetCol) {
                valid = true;
                if (row === targetRow) {
                    const step = targetCol > col ? 1 : -1;
                    for (let c = col + step; c !== targetCol; c += step) if (boardState[row][c] !== "") { valid = false; break; }
                } else {
                    const step = targetRow > row ? 1 : -1;
                    for (let r = row + step; r !== targetRow; r += step) if (boardState[r][col] !== "") { valid = false; break; }
                }
            }
            break;

        case "q": // queen
            const drQ = Math.abs(targetRow - row);
            const dcQ = Math.abs(targetCol - col);
            if (drQ === dcQ) { // diagonal
                const rStep = targetRow > row ? 1 : -1;
                const cStep = targetCol > col ? 1 : -1;
                let r = row + rStep, c = col + cStep;
                valid = true;
                while (r !== targetRow && c !== targetCol) {
                    if (boardState[r][c] !== "") { valid = false; break; }
                    r += rStep; c += cStep;
                }
            } else if (row === targetRow || col === targetCol) { // straight
                valid = true;
                if (row === targetRow) {
                    const step = targetCol > col ? 1 : -1;
                    for (let c = col + step; c !== targetCol; c += step) if (boardState[row][c] !== "") { valid = false; break; }
                } else {
                    const step = targetRow > row ? 1 : -1;
                    for (let r = row + step; r !== targetRow; r += step) if (boardState[r][col] !== "") { valid = false; break; }
                }
            }
            break;

        case "k": // king
            const drK = Math.abs(targetRow - row);
            const dcK = Math.abs(targetCol - col);
            if (drK <= 1 && dcK <= 1) valid = true;
            break;

        default:
            return false;
    }

    // Prevent moves that leave king in check
    if (valid && !skipCheck) {
        const backupFrom = boardState[row][col];
        const backupTo = boardState[targetRow][targetCol];

        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";

        if (isKingInCheck(color)) valid = false;

        boardState[row][col] = backupFrom;
        boardState[targetRow][targetCol] = backupTo;
    }

    return valid;
}

// =======================
// STATUS MESSAGE FUNCTION
// =======================
function showStatusMessage(message, duration = 1000) {
    const status = document.getElementById("statusMessage");
    status.textContent = message;
    status.style.opacity = 1;

    setTimeout(() => {
        status.style.opacity = 0;
    }, duration);
}


function hasAnyLegalMove(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardState[r][c];
            if (piece === "") continue;

            if (
                (color === "white" && piece.startsWith("w")) ||
                (color === "black" && piece.startsWith("b"))
            ) {
                for (let tr = 0; tr < 8; tr++) {
                    for (let tc = 0; tc < 8; tc++) {
                        if (isValidMove(piece, r, c, tr, tc)) {
                            return true; // at least one legal move exists
                        }
                    }
                }
            }
        }
    }
    return false; // no legal moves
}
function showGameOver(winnerColor, reason = "Checkmate") {
    const overlay = document.getElementById("gameOverlay");
    const text = document.getElementById("overlayText");

    text.textContent = `${reason} - ${winnerColor} wins`;
    overlay.classList.remove("hidden");
    stopTimer();

    saveGameResult(winnerColor);
}


function toAlgebraic(row, col) {
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    return files[col] + (8 - row);
}
function finalizeMoveRecord(moveMeta) {
    if (!moveMeta) return;
    const { piece, fromRow, fromCol, toRow, toCol, captured, promotedTo } = moveMeta;
    const moveList = document.getElementById("moveList");

    const to = toAlgebraic(toRow, toCol);
    const pieceLetter = piece[1] === "p" ? "" : piece[1].toUpperCase();
    const notation = pieceLetter + to;

    const pieceImg = document.createElement("img");
    pieceImg.src = `src/assets/pieces/${pieceMap[piece]}`;

    if (currentTurn === "white") {
        const rowDiv = document.createElement("div");
        rowDiv.className = "move-row";

        const numberDiv = document.createElement("div");
        numberDiv.className = "move-number";
        numberDiv.textContent = moveNumber + ".";

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
        const blackCell = lastRow.children[2];

        blackCell.appendChild(pieceImg);
        blackCell.append(notation);

        moveNumber++;
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
        } catch (error) {
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
            opponent: "Local",
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
    const user = localStorage.getItem("royalmindUser") || "Guest";

    const gameData = {
        user: user,
        date: new Date().toLocaleString(),
        winner: winnerColor,
        moves: moveSequence,
        movesHtml: document.getElementById("moveList").innerHTML
    };

    const existingGames = JSON.parse(localStorage.getItem("royalmindHistory")) || [];

    existingGames.push(gameData);

    localStorage.setItem("royalmindHistory", JSON.stringify(existingGames));

    syncRemoteGame({ final: true, winner: winnerColor });
}




