const container = document.getElementById("historyContainer");

const games = JSON.parse(localStorage.getItem("royalmindHistory")) || [];
const user = localStorage.getItem("royalmindUser");
const userGames = user ? games.filter(g => g.user === user) : games;

if (userGames.length === 0) {
    container.innerHTML = "<p>No games played yet.</p>";
} else {
    userGames.reverse().forEach((game, index) => {
        const card = document.createElement("div");
        card.className = "history-card";

        const header = document.createElement("div");
        header.className = "history-card-head";
        header.innerHTML = `
            <div>
                <h3>Game ${userGames.length - index}</h3>
                <p>${game.date}</p>
            </div>
            <div class="history-winner">Winner: ${game.winner}</div>
        `;

        const boardWrap = document.createElement("div");
        boardWrap.className = "history-board-wrap";

        const board = document.createElement("div");
        board.className = "history-board";

        const controls = document.createElement("div");
        controls.className = "history-controls";
        controls.innerHTML = `
            <button class="history-btn" data-action="prev">Rewind</button>
            <span class="history-step">0 / 0</span>
            <button class="history-btn" data-action="next">Play</button>
        `;

        const movesNote = document.createElement("div");
        movesNote.className = "history-moves-note";

        boardWrap.appendChild(board);
        boardWrap.appendChild(controls);
        boardWrap.appendChild(movesNote);

        card.appendChild(header);
        card.appendChild(boardWrap);
        container.appendChild(card);

        const moves = Array.isArray(game.moves) ? game.moves : null;

        if (!moves) {
            movesNote.textContent = "Replay not available for this game.";
            renderBoard(board, getInitialBoard());
            return;
        }

        let currentIndex = 0;
        let boardState = getInitialBoard();
        const stepLabel = controls.querySelector(".history-step");

        const updateStep = () => {
            stepLabel.textContent = `${currentIndex} / ${moves.length}`;
        };

        const applyMove = (move, forward) => {
            if (forward) {
                boardState[move.toRow][move.toCol] = move.promotedTo || move.piece;
                boardState[move.fromRow][move.fromCol] = "";
            } else {
                boardState[move.fromRow][move.fromCol] = move.piece;
                boardState[move.toRow][move.toCol] = move.captured || "";
            }
        };

        controls.addEventListener("click", (event) => {
            const action = event.target.getAttribute("data-action");
            if (!action) return;

            if (action === "next" && currentIndex < moves.length) {
                applyMove(moves[currentIndex], true);
                currentIndex += 1;
                renderBoard(board, boardState);
                updateStep();
            }

            if (action === "prev" && currentIndex > 0) {
                currentIndex -= 1;
                applyMove(moves[currentIndex], false);
                renderBoard(board, boardState);
                updateStep();
            }
        });

        renderBoard(board, boardState);
        updateStep();
    });
}

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
