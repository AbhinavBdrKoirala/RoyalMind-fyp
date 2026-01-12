let sourcePosition = null;

// 8x8 board state
const boardState = [
  ["r", "n", "b", "q", "k", "b", "n", "r"],
  ["p", "p", "p", "p", "p", "p", "p", "p"],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ["P", "P", "P", "P", "P", "P", "P", "P"],
  ["R", "N", "B", "Q", "K", "B", "N", "R"]
];

export function createBoard() {
  const board = document.createElement("div");
  board.className = "board";

  renderBoard(board);
  return board;
}

function renderBoard(board) {
  board.innerHTML = "";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      cell.dataset.row = row;
      cell.dataset.col = col;

      if ((row + col) % 2 === 0) {
        cell.classList.add("light");
      } else {
        cell.classList.add("dark");
      }

      const piece = boardState[row][col];
      if (piece) {
        cell.textContent = piece;
        cell.classList.add("piece");
      }

      cell.addEventListener("click", () =>
        handleCellClick(row, col)
      );

      board.appendChild(cell);
    }
  }
}

function handleCellClick(row, col) {
  // Select piece
  if (!sourcePosition) {
    if (!boardState[row][col]) return;

    sourcePosition = { row, col };
    highlightCell(row, col);
    return;
  }

  // Move piece (NO validation)
  const { row: srcRow, col: srcCol } = sourcePosition;

  boardState[row][col] = boardState[srcRow][srcCol];
  boardState[srcRow][srcCol] = null;

  sourcePosition = null;

  const board = document.querySelector(".board");
  renderBoard(board);
}

function highlightCell(row, col) {
  const cells = document.querySelectorAll(".cell");
  cells.forEach(cell => cell.classList.remove("source"));

  const selected = document.querySelector(
    `.cell[data-row="${row}"][data-col="${col}"]`
  );

  if (selected) selected.classList.add("source");
}
