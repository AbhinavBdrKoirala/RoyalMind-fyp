let selectedSquare = null;
let selectedPiece = null;
let currentTurn = "white";


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
        }
        return;
    }

    // STEP 2: Clicking your own piece again → reselect
    if (piece !== "" && piece[0] === selectedPiece.piece[0]) {
        clearSelection();
        selectedPiece = { piece, row, col };
        selectedSquare = square;
        square.classList.add("selected");
        return;
    }

    // STEP 3: Try moving
    const moved = tryMove(selectedPiece, row, col);

    if (moved) {
        currentTurn = currentTurn === "white" ? "black" : "white";
    }

    clearSelection();
    createBoard();
}



function tryMove(selected, targetRow, targetCol) {
    const { piece, row, col } = selected;

    if (isValidMove(boardState, piece, row, col, targetRow, targetCol) && isMoveSafe(boardState, piece, row, col, targetRow, targetCol)) {
        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";
        return true;
    }
    

    // WHITE PAWN
    if (piece === "wp") {
        // One step
        if (
            targetRow === row - 1 &&
            targetCol === col &&
            boardState[targetRow][targetCol] === ""
        ) {
            boardState[targetRow][targetCol] = piece;
            boardState[row][col] = "";
            return true;
        }

        // Two steps (first move)
        if (
            row === 6 &&
            targetRow === 4 &&
            targetCol === col &&
            boardState[5][col] === "" &&
            boardState[4][col] === ""
        ) {
            boardState[4][col] = piece;
            boardState[row][col] = "";
            return true;
        }
            // Diagonal capture (white)
        if (
            targetRow === row - 1 &&
            (targetCol === col - 1 || targetCol === col + 1) &&
            boardState[targetRow][targetCol].startsWith("b")
            ) {
            boardState[targetRow][targetCol] = piece;
            boardState[row][col] = "";
            return true;
        }
    }
    

    // BLACK PAWN
    if (piece === "bp") {
        // One step
        if (
            targetRow === row + 1 &&
            targetCol === col &&
            boardState[targetRow][targetCol] === ""
        ) {
            boardState[targetRow][targetCol] = piece;
            boardState[row][col] = "";
            return true;
        }

        // Two steps (first move)
        if (
            row === 1 &&
            targetRow === 3 &&
            targetCol === col &&
            boardState[2][col] === "" &&
            boardState[3][col] === ""
        ) {
            boardState[3][col] = piece;
            boardState[row][col] = "";
            return true;
        }
        // Diagonal capture (black)
        if (
            targetRow === row + 1 &&
            (targetCol === col - 1 || targetCol === col + 1) &&
            boardState[targetRow][targetCol].startsWith("w")
        ) {
            boardState[targetRow][targetCol] = piece;
            boardState[row][col] = "";
            return true;
        }
    }
    // ROOK (WHITE & BLACK)
    if (piece === "wr" || piece === "br") {

        // Must move in straight line
        if (row !== targetRow && col !== targetCol) {
            return false;
        }

        const rowStep = targetRow > row ? 1 : targetRow < row ? -1 : 0;
        const colStep = targetCol > col ? 1 : targetCol < col ? -1 : 0;

        let currentRow = row + rowStep;
        let currentCol = col + colStep;

        // Check path blocking
        while (currentRow !== targetRow || currentCol !== targetCol) {
            if (boardState[currentRow][currentCol] !== "") {
                return false;
            }
            currentRow += rowStep;
            currentCol += colStep;
        }

        // Destination square
        const targetPiece = boardState[targetRow][targetCol];

        // Cannot capture own piece
        if (targetPiece !== "" && targetPiece[0] === piece[0]) {
            return false;
        }

        // Move or capture
        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";
        return true;
    }
    // KNIGHT (WHITE & BLACK)
    if (piece === "wn" || piece === "bn") {

        const rowDiff = Math.abs(targetRow - row);
        const colDiff = Math.abs(targetCol - col);

        // Knight L-shape
        const isValidMove =
            (rowDiff === 2 && colDiff === 1) ||
            (rowDiff === 1 && colDiff === 2);

        if (!isValidMove) {
            return false;
        }

        const targetPiece = boardState[targetRow][targetCol];

        // Cannot capture own piece
        if (targetPiece !== "" && targetPiece[0] === piece[0]) {
            return false;
        }

        // Move or capture
        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";
        return true;
    }
    // BISHOP (WHITE & BLACK)
    if (piece === "wb" || piece === "bb") {

        const rowDiff = targetRow - row;
        const colDiff = targetCol - col;

        // Must move diagonally
        if (Math.abs(rowDiff) !== Math.abs(colDiff)) {
            return false;
        }

        const rowStep = rowDiff > 0 ? 1 : -1;
        const colStep = colDiff > 0 ? 1 : -1;

        let currentRow = row + rowStep;
        let currentCol = col + colStep;

        // Check path blocking
        while (currentRow !== targetRow && currentCol !== targetCol) {
            if (boardState[currentRow][currentCol] !== "") {
                return false;
            }
            currentRow += rowStep;
            currentCol += colStep;
        }

        const targetPiece = boardState[targetRow][targetCol];

        // Cannot capture own piece
        if (targetPiece !== "" && targetPiece[0] === piece[0]) {
            return false;
        }

        // Move or capture
        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";
        return true;
    }
    // QUEEN (WHITE & BLACK)
    if (piece === "wq" || piece === "bq") {

        const rowDiff = targetRow - row;
        const colDiff = targetCol - col;

        const isStraight = row === targetRow || col === targetCol;
        const isDiagonal = Math.abs(rowDiff) === Math.abs(colDiff);

        // Must be straight or diagonal
        if (!isStraight && !isDiagonal) {
            return false;
        }

        const rowStep = rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;
        const colStep = colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

        let currentRow = row + rowStep;
        let currentCol = col + colStep;

        // Check path blocking
        while (currentRow !== targetRow || currentCol !== targetCol) {
            if (boardState[currentRow][currentCol] !== "") {
                return false;
            }
            currentRow += rowStep;
            currentCol += colStep;
        }

        const targetPiece = boardState[targetRow][targetCol];

        // Cannot capture own piece
        if (targetPiece !== "" && targetPiece[0] === piece[0]) {
            return false;
        }

        // Move or capture
        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";
        return true;
    }
    // KING (WHITE & BLACK)
    if (piece === "wk" || piece === "bk") {

        const rowDiff = Math.abs(targetRow - row);
        const colDiff = Math.abs(targetCol - col);

        // King moves only one square
        if (rowDiff > 1 || colDiff > 1) {
            return false;
        }

        const targetPiece = boardState[targetRow][targetCol];

        // Cannot capture own piece
        if (targetPiece !== "" && targetPiece[0] === piece[0]) {
            return false;
        }

        // Move or capture
        boardState[targetRow][targetCol] = piece;
        boardState[row][col] = "";
        return true;
    }


    return false;
}


function clearSelection() {
    if (selectedSquare) {
        selectedSquare.classList.remove("selected");
    }
    selectedSquare = null;
    selectedPiece = null;
}
function findKing(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.type === "king" && piece.color === color) {
                return { row: r, col: c };
            }
        }
    }
    return null;
}

function isKingInCheck(board, color) {
    const kingPos = findKing(board, color);
    if (!kingPos) return false;

    const enemyColor = color === "white" ? "black" : "white";

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === enemyColor) {
                if (isValidMove(board, piece, r, c, kingPos.row, kingPos.col)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isMoveSafe(board, piece, fromRow, fromCol, toRow, toCol) {
    const tempBoard = board.map(row => row.slice());

    tempBoard[toRow][toCol] = piece;
    tempBoard[fromRow][fromCol] = null;

    return !isKingInCheck(tempBoard, piece.color);
}

