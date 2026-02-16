if (!localStorage.getItem("royalmindUser")) {
    window.location.href = "index.html";
}

const container = document.getElementById("historyContainer");
const user = localStorage.getItem("royalmindUser");

const games = JSON.parse(localStorage.getItem("royalmindHistory")) || [];

const userGames = games.filter(g => g.user === user);

if (userGames.length === 0) {
    container.innerHTML = "<p>No games played yet.</p>";
} else {
    userGames.reverse().forEach(game => {
        const div = document.createElement("div");
        div.style.background = "#1e1e1e";
        div.style.margin = "20px auto";
        div.style.padding = "15px";
        div.style.width = "600px";
        div.style.borderRadius = "10px";

        div.innerHTML = `
            <h3>${game.date}</h3>
            <p><strong>Winner:</strong> ${game.winner}</p>
            <div>${game.moves}</div>
        `;

        container.appendChild(div);
    });
}
