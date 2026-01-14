let selectedSquare = null;
let selectedPiece = null;

let boardState = [
    ["br","bn","bb","bq","bk","bb","bn","br"],
    ["bp","bp","bp","bp","bp","bp","bp","bp"],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["wp","wp","wp","wp","wp","wp","wp","wp"],
    ["wr","wn","wb","wq","wk","wb","wn","wr"]
];

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
    const boardElement = document.getElementById("chessboard");
    boardElement.innerHTML = "";

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {

            const square = document.createElement("div");
            square.classList.add("square");

            square.dataset.row = row;
            square.dataset.col = col;

            const isLight = (row + col) % 2 === 0;
            square.classList.add(isLight ? "light" : "dark");

            square.addEventListener("click", () => handleSquareClick(square));

            const piece = boardState[row][col];
            if (piece !== "") {
                const img = document.createElement("img");
                img.src = `src/assets/pieces/${pieceMap[piece]}`;
                img.alt = piece;
                square.appendChild(img);
            }

            boardElement.appendChild(square);
        }
    }
}

function handleSquareClick(square) {
    const row = Number(square.dataset.row);
    const col = Number(square.dataset.col);
    const piece = boardState[row][col];

    // Select piece
    if (!selectedPiece) {
        if (piece !== "") {
            selectedPiece = { piece, row, col };
            selectedSquare = square;
            square.classList.add("selected");
        }
        return;
    }

    // Try move
    tryMove(selectedPiece, row, col);
    clearSelection();
    createBoard();
}

function tryMove(selected, targetRow, targetCol) {
    const { piece, row, col } = selected;

    // White pawn movement
    if (
        piece === "wp" &&
        targetRow === row - 1 &&
        targetCol === col &&
        boardState[targetRow][targetCol] === ""
    ) {
        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";
    }
}

function clearSelection() {
    if (selectedSquare) {
        selectedSquare.classList.remove("selected");
    }
    selectedSquare = null;
    selectedPiece = null;
}
