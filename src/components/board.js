export function createBoard() {
  const board = document.createElement("div");
  board.className = "board";

  for (let i = 0; i < 16; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    board.appendChild(cell);
  }

  return board;
}
