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

const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
let allGames = [];
let filteredGames = [];

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
        reviewMovesList.innerHTML = "<div class=\"history-move-row empty\">No moves available.</div>";
        reviewMovesList.onclick = null;
        return;
    }

    let currentIndex = 0;
    let boardState = getInitialBoard();
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

    const applyMove = (move, forward) => {
        applyMoveToBoard(boardState, move, forward);
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
            applyMove(moves[currentIndex], true);
            currentIndex += 1;
            renderBoard(reviewBoard, boardState);
            updateStep();
            renderMovesList(reviewMovesList, annotatedMoves, currentIndex);
        }, delay);
    };

    reviewControls.onclick = (event) => {
        const action = event.target.getAttribute("data-action");
        if (!action) return;

        if (action === "start") {
            stopAuto();
            boardState = getInitialBoard();
            currentIndex = 0;
            renderBoard(reviewBoard, boardState);
            updateStep();
            renderMovesList(reviewMovesList, annotatedMoves, currentIndex);
            return;
        }

        if (action === "next" && currentIndex < moves.length) {
            stopAuto();
            applyMove(moves[currentIndex], true);
            currentIndex += 1;
            renderBoard(reviewBoard, boardState);
            updateStep();
            renderMovesList(reviewMovesList, annotatedMoves, currentIndex);
        }

        if (action === "prev" && currentIndex > 0) {
            stopAuto();
            currentIndex -= 1;
            applyMove(moves[currentIndex], false);
            renderBoard(reviewBoard, boardState);
            updateStep();
            renderMovesList(reviewMovesList, annotatedMoves, currentIndex);
        }

        if (action === "end") {
            stopAuto();
            boardState = getInitialBoard();
            for (let i = 0; i < moves.length; i += 1) {
                applyMove(moves[i], true);
            }
            currentIndex = moves.length;
            renderBoard(reviewBoard, boardState);
            updateStep();
            renderMovesList(reviewMovesList, annotatedMoves, currentIndex);
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
        boardState = getInitialBoard();
        for (let i = 0; i <= index; i += 1) {
            applyMove(moves[i], true);
        }

        currentIndex = index + 1;
        renderBoard(reviewBoard, boardState);
        updateStep();
        renderMovesList(reviewMovesList, annotatedMoves, currentIndex);
    };

    renderBoard(reviewBoard, boardState);
    updateStep();
    renderMovesList(reviewMovesList, annotatedMoves, currentIndex);

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
