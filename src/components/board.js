let selectedSquare = null;
let selectedPiece = null;
let currentTurn = "white";
let promotionSquare = null;
let promotionColor = null;
let moveHistory = [];
let moveNumber = 1;


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
            // ⚡ MARK KING IN CHECK
            const kingColor = piece === "wk" ? "white" : piece === "bk" ? "black" : null;
            if (kingColor && isKingInCheck(kingColor)) {
                square.classList.add("check"); // this adds the red highlight
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
        const opponent = currentTurn === "white" ? "black" : "white";
        recordMove(piece, fromRow, fromCol, toRow, toCol);
        currentTurn = opponent;

        // CHECKMATE CHECK
        if (isKingInCheck(opponent) && !hasAnyLegalMove(opponent)) {
            showGameOver(currentTurn === "white" ? "Black" : "White");
        }
    }else {
    showStatusMessage("Illegal move");
    }

    clearSelection();
    createBoard();
}



// function tryMove(selected, targetRow, targetCol) {
//     const { piece, row, col } = selected;


//     // WHITE PAWN
//     if (piece === "wp") {

//         // Forward one
//         if (targetRow === row - 1 && targetCol === col && boardState[targetRow][targetCol] === "") {
//             boardState[targetRow][targetCol] = piece;
//             boardState[row][col] = "";

//             if (targetRow === 0) {
//                 showPromotionUI("white", promoted => {
//                     boardState[targetRow][targetCol] = promoted;
//                     createBoard();
//                 });
//             }
//             return true;
//         }

//         // Forward two
//         if (
//             row === 6 &&
//             targetRow === 4 &&
//             targetCol === col &&
//             boardState[5][col] === "" &&
//             boardState[4][col] === ""
//         ) {
//             boardState[4][col] = piece;
//             boardState[row][col] = "";
//             return true;
//         }

//         // Capture
//         if (
//             targetRow === row - 1 &&
//             (targetCol === col - 1 || targetCol === col + 1) &&
//             boardState[targetRow][targetCol].startsWith("b")
//         ) {
//             boardState[targetRow][targetCol] = piece;
//             boardState[row][col] = "";

//             if (targetRow === 0) {
//                 showPromotionUI("white", promoted => {
//                     boardState[targetRow][targetCol] = promoted;
//                     createBoard();
//                 });
//             }
//             return true;
//         }
//     }

    

//     // BLACK PAWN
//     if (piece === "bp") {

//         if (targetRow === row + 1 && targetCol === col && boardState[targetRow][targetCol] === "") {
//             boardState[targetRow][targetCol] = piece;
//             boardState[row][col] = "";

//             if (targetRow === 7) {
//                 showPromotionUI("black", promoted => {
//                     boardState[targetRow][targetCol] = promoted;
//                     createBoard();
//                 });
//             }
//             return true;
//         }

//         if (
//             row === 1 &&
//             targetRow === 3 &&
//             targetCol === col &&
//             boardState[2][col] === "" &&
//             boardState[3][col] === ""
//         ) {
//             boardState[3][col] = piece;
//             boardState[row][col] = "";
//             return true;
//         }

//         if (
//             targetRow === row + 1 &&
//             (targetCol === col - 1 || targetCol === col + 1) &&
//             boardState[targetRow][targetCol].startsWith("w")
//         ) {
//             boardState[targetRow][targetCol] = piece;
//             boardState[row][col] = "";

//             if (targetRow === 7) {
//                 showPromotionUI("black", promoted => {
//                     boardState[targetRow][targetCol] = promoted;
//                     createBoard();
//                 });
//             }
//             return true;
//         }
//     }


//     // ROOK (WHITE & BLACK)
//     if (piece === "wr" || piece === "br") {

//         // Must move in straight line
//         if (row !== targetRow && col !== targetCol) {
//             return false;
//         }

//         const rowStep = targetRow > row ? 1 : targetRow < row ? -1 : 0;
//         const colStep = targetCol > col ? 1 : targetCol < col ? -1 : 0;

//         let currentRow = row + rowStep;
//         let currentCol = col + colStep;

//         // Check path blocking
//         while (currentRow !== targetRow || currentCol !== targetCol) {
//             if (boardState[currentRow][currentCol] !== "") {
//                 return false;
//             }
//             currentRow += rowStep;
//             currentCol += colStep;
//         }

//         // Destination square
//         const targetPiece = boardState[targetRow][targetCol];

//         // Cannot capture own piece
//         if (targetPiece !== "" && targetPiece[0] === piece[0]) {
//             return false;
//         }

//         // Move or capture
//         boardState[targetRow][targetCol] = piece;
//         boardState[row][col] = "";
//         return true;
//     }
//     // KNIGHT (WHITE & BLACK)
//     if (piece === "wn" || piece === "bn") {

//         const rowDiff = Math.abs(targetRow - row);
//         const colDiff = Math.abs(targetCol - col);

//         // Knight L-shape
//         const isValidMove =
//             (rowDiff === 2 && colDiff === 1) ||
//             (rowDiff === 1 && colDiff === 2);

//         if (!isValidMove) {
//             return false;
//         }

//         const targetPiece = boardState[targetRow][targetCol];

//         // Cannot capture own piece
//         if (targetPiece !== "" && targetPiece[0] === piece[0]) {
//             return false;
//         }

//         // Move or capture
//         boardState[targetRow][targetCol] = piece;
//         boardState[row][col] = "";
//         return true;
//     }
//     // BISHOP (WHITE & BLACK)
//     if (piece === "wb" || piece === "bb") {

//         const rowDiff = targetRow - row;
//         const colDiff = targetCol - col;

//         // Must move diagonally
//         if (Math.abs(rowDiff) !== Math.abs(colDiff)) {
//             return false;
//         }

//         const rowStep = rowDiff > 0 ? 1 : -1;
//         const colStep = colDiff > 0 ? 1 : -1;

//         let currentRow = row + rowStep;
//         let currentCol = col + colStep;

//         // Check path blocking
//         while (currentRow !== targetRow && currentCol !== targetCol) {
//             if (boardState[currentRow][currentCol] !== "") {
//                 return false;
//             }
//             currentRow += rowStep;
//             currentCol += colStep;
//         }

//         const targetPiece = boardState[targetRow][targetCol];

//         // Cannot capture own piece
//         if (targetPiece !== "" && targetPiece[0] === piece[0]) {
//             return false;
//         }

//         // Move or capture
//         boardState[targetRow][targetCol] = piece;
//         boardState[row][col] = "";
//         return true;
//     }
//     // QUEEN (WHITE & BLACK)
//     if (piece === "wq" || piece === "bq") {

//         const rowDiff = targetRow - row;
//         const colDiff = targetCol - col;

//         const isStraight = row === targetRow || col === targetCol;
//         const isDiagonal = Math.abs(rowDiff) === Math.abs(colDiff);

//         // Must be straight or diagonal
//         if (!isStraight && !isDiagonal) {
//             return false;
//         }

//         const rowStep = rowDiff === 0 ? 0 : rowDiff > 0 ? 1 : -1;
//         const colStep = colDiff === 0 ? 0 : colDiff > 0 ? 1 : -1;

//         let currentRow = row + rowStep;
//         let currentCol = col + colStep;

//         // Check path blocking
//         while (currentRow !== targetRow || currentCol !== targetCol) {
//             if (boardState[currentRow][currentCol] !== "") {
//                 return false;
//             }
//             currentRow += rowStep;
//             currentCol += colStep;
//         }

//         const targetPiece = boardState[targetRow][targetCol];

//         // Cannot capture own piece
//         if (targetPiece !== "" && targetPiece[0] === piece[0]) {
//             return false;
//         }

//         // Move or capture
//         boardState[targetRow][targetCol] = piece;
//         boardState[row][col] = "";
//         return true;
//     }
//     // KING (WHITE & BLACK)
//     if (piece === "wk" || piece === "bk") {

//         const rowDiff = Math.abs(targetRow - row);
//         const colDiff = Math.abs(targetCol - col);

//         // King moves only one square
//         if (rowDiff > 1 || colDiff > 1) {
//             return false;
//         }

//         const targetPiece = boardState[targetRow][targetCol];

//         // Cannot capture own piece
//         if (targetPiece !== "" && targetPiece[0] === piece[0]) {
//             return false;
//         }

//         // Move or capture
//         boardState[targetRow][targetCol] = piece;
//         boardState[row][col] = "";
//         return true;
//     }


//     return false;
// }
function tryMove(selected, targetRow, targetCol) {
    const { piece, row, col } = selected;

    // 1️⃣ Check if the move is legal
    if (!isValidMove(piece, row, col, targetRow, targetCol)) {
        return false; // move not allowed
    }

    // 2️⃣ Perform the move
    boardState[targetRow][targetCol] = piece;
    boardState[row][col] = "";

    // 3️⃣ Handle pawn promotion
    if ((piece === "wp" && targetRow === 0) || (piece === "bp" && targetRow === 7)) {
        showPromotionUI(piece.startsWith("w") ? "white" : "black", promoted => {
            boardState[targetRow][targetCol] = promoted;
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
function showGameOver(winnerColor) {
    const overlay = document.getElementById("gameOverlay");
    const text = document.getElementById("overlayText");

    text.textContent = `Checkmate — ${winnerColor} wins`;
    overlay.classList.remove("hidden");
}

function toAlgebraic(row, col) {
    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    return files[col] + (8 - row);
}
function recordMove(piece, fromRow, fromCol, toRow, toCol) {
    const moveList = document.getElementById("moveList");

    const from = toAlgebraic(fromRow, fromCol);
    const to = toAlgebraic(toRow, toCol);

    const pieceLetter = piece[1].toUpperCase() === "P" ? "" : piece[1].toUpperCase();
    const notation = pieceLetter + to;

    if (currentTurn === "white") {
        const moveEntry = document.createElement("div");
        moveEntry.textContent = `${moveNumber}. ${notation}`;
        moveHistory.push(moveEntry);
        moveList.appendChild(moveEntry);
    } else {
        const lastMove = moveHistory[moveHistory.length - 1];
        lastMove.textContent += ` ${notation}`;
        moveNumber++;
    }
}



