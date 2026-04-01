const token = localStorage.getItem("token");
const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
const appUi = window.RoyalMindUI || {
    notify: () => {}
};

const puzzleMembershipNote = document.getElementById("puzzleMembershipNote");
const puzzleList = document.getElementById("puzzleList");
const puzzleTitle = document.getElementById("puzzleTitle");
const puzzleDescription = document.getElementById("puzzleDescription");
const puzzleBoardWrap = document.getElementById("puzzleBoardWrap");
const puzzleBoard = document.getElementById("puzzleBoard");
const puzzleStatus = document.getElementById("puzzleStatus");
const puzzleSolution = document.getElementById("puzzleSolution");
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
let puzzleBoardState = null;
let selectedSquare = null;
let premiumUnlocked = false;

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

function getSideToMove(fen) {
    return String(fen || "").split(" ")[1] === "b" ? "black" : "white";
}

function shouldShowCoordinates() {
    const settings = getStoredSettings();
    return settings.boardCoordinates !== "Hide";
}

function renderPuzzleList(puzzles) {
    if (!puzzleList) return;
    puzzleList.innerHTML = puzzles.map((puzzle) => `
        <button class="premium-list-item${puzzle.locked ? " locked" : ""}" type="button" data-puzzle-id="${puzzle.id}">
            <strong>${escapeHtml(puzzle.title)}</strong>
            <span>${escapeHtml(puzzle.theme || "Puzzle")} - ${escapeHtml(puzzle.difficulty || "Mixed")}</span>
            <small>${puzzle.locked ? "Premium" : "Open"}</small>
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

function renderPuzzleBoard() {
    if (!puzzleBoard || !Array.isArray(puzzleBoardState)) return;
    puzzleBoard.innerHTML = "";
    const showCoordinates = shouldShowCoordinates();
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

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

            if (showCoordinates && row === 7) {
                const fileLabel = document.createElement("span");
                fileLabel.className = "square-label file-label";
                fileLabel.textContent = files[col];
                square.appendChild(fileLabel);
            }

            if (showCoordinates && col === 0) {
                const rankLabel = document.createElement("span");
                rankLabel.className = "square-label rank-label";
                rankLabel.textContent = String(8 - row);
                square.appendChild(rankLabel);
            }

            const piece = puzzleBoardState[row][col];
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
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    return `${files[col]}${8 - row}`;
}

function buildMoveUci(fromRow, fromCol, toRow, toCol) {
    return `${toAlgebraic(fromRow, fromCol)}${toAlgebraic(toRow, toCol)}`;
}

function handleSquareClick(row, col) {
    if (!currentPuzzle || currentPuzzle.locked || !puzzleBoardState) return;

    const piece = puzzleBoardState[row][col];
    const sideToMove = getSideToMove(currentPuzzle.fen);

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

    if (piece && piece[0] === puzzleBoardState[selectedSquare.row][selectedSquare.col]?.[0]) {
        selectedSquare = { row, col };
        renderPuzzleBoard();
        return;
    }

    submitAttempt(buildMoveUci(selectedSquare.row, selectedSquare.col, row, col));
    selectedSquare = null;
    renderPuzzleBoard();
}

async function submitAttempt(moveUci) {
    const response = await apiFetch(`/api/premium/puzzles/${currentPuzzle.id}/attempt`, {
        method: "POST",
        body: JSON.stringify({ move: moveUci })
    });

    if (!response) {
        setPuzzleMessage("Unable to check that move right now.", "warning");
        return;
    }

    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
        redirectToLogin("Your session expired. Please log in again.");
        return;
    }

    if (!response.ok) {
        setPuzzleMessage(data.error || "Unable to check that move.", "warning");
        return;
    }

    if (data.correct) {
        setPuzzleMessage(data.message || "Correct move.", "success");
        revealSolution(data.solutionMoves || []);
        return;
    }

    setPuzzleMessage(data.message || "Try again.", "warning");
}

function revealSolution(solutionMoves) {
    if (!puzzleSolution) return;
    const line = (solutionMoves || [])
        .map((move) => `${move.slice(0, 2)}-${move.slice(2, 4)}${move[4] ? `=${move[4].toUpperCase()}` : ""}`)
        .join("  ");
    puzzleSolution.textContent = line ? `Solution line: ${line}` : "No stored line.";
    puzzleSolution.classList.remove("hidden");
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
        currentPuzzle = data.puzzle || { locked: true, title: "Premium Puzzle" };
        if (puzzleTitle) puzzleTitle.textContent = currentPuzzle.title || "Premium Puzzle";
        if (puzzleDescription) {
            puzzleDescription.textContent = currentPuzzle.description || "Unlock premium to solve this puzzle.";
        }
        if (puzzleBoardWrap) puzzleBoardWrap.classList.add("hidden");
        if (lockedPuzzleCta) lockedPuzzleCta.classList.remove("hidden");
        if (showSolutionBtn) showSolutionBtn.classList.add("hidden");
        if (puzzleSolution) puzzleSolution.classList.add("hidden");
        clearPuzzleMessage();
        return;
    }

    if (!response.ok || !data.puzzle) {
        setPuzzleMessage(data.error || "Unable to load the selected puzzle.", "warning");
        return;
    }

    currentPuzzle = data.puzzle;
    puzzleBoardState = parseFenBoard(currentPuzzle.fen);
    selectedSquare = null;

    if (puzzleTitle) puzzleTitle.textContent = currentPuzzle.title;
    if (puzzleDescription) {
        puzzleDescription.textContent = currentPuzzle.description || "Find the best move.";
    }
    if (puzzleBoardWrap) puzzleBoardWrap.classList.remove("hidden");
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

    const response = await apiFetch("/api/premium/puzzles");
    if (!response) {
        if (puzzleList) {
            puzzleList.innerHTML = '<p class="premium-muted">Unable to load puzzles right now.</p>';
        }
        return;
    }

    if (response.status === 401 || response.status === 403) {
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

    if (puzzleMembershipNote) {
        puzzleMembershipNote.textContent = premiumUnlocked
            ? "Premium puzzles are unlocked for your account."
            : "You can solve the free puzzle now and unlock premium challenges from the subscription page.";
    }

    renderPuzzleList(data.puzzles || []);
    puzzleList?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-puzzle-id]");
        if (!button) return;
        openPuzzle(button.dataset.puzzleId);
    });

    if (Array.isArray(data.puzzles) && data.puzzles.length > 0) {
        openPuzzle(data.puzzles[0].id);
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
