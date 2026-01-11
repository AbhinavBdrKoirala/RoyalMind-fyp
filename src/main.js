import { createBoard } from "./components/board.js";

const app = document.getElementById("app");
const board = createBoard();
app.appendChild(board);

console.log("Board initialized");
