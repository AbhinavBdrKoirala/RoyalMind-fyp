const token = localStorage.getItem("token");
const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];

const botDialog = document.getElementById("botDialog");
const playBotButton = document.getElementById("playBotButton");
const closeBotDialog = document.getElementById("closeBotDialog");
const botLevelButtons = Array.from(document.querySelectorAll("[data-level]"));

if (!token) {
    alert("You must login first");
    window.location.href = "index.html";
}

function parseStoredUser() {
    const raw = localStorage.getItem("royalmindUser");
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return raw.includes("@")
            ? { email: raw, displayName: raw, settings: {} }
            : { username: raw, displayName: raw, settings: {} };
    }
}

function storeUser(user) {
    if (!user || typeof user !== "object") return;
    localStorage.setItem("royalmindUser", JSON.stringify(user));

    if (user.settings) {
        localStorage.setItem("royalmindSettings", JSON.stringify({
            displayName: user.displayName || user.username || user.email || "RoyalMind Player",
            ...user.settings
        }));
    }
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

function goTo(page) {
    window.location.href = page;
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("royalmindUser");
    localStorage.removeItem("royalmindSettings");
    window.location.href = "index.html";
}

function openBotDialog() {
    if (!botDialog) return;
    botDialog.classList.remove("hidden");
    botDialog.setAttribute("aria-hidden", "false");
}

function closeBotModal() {
    if (!botDialog) return;
    botDialog.classList.add("hidden");
    botDialog.setAttribute("aria-hidden", "true");
}

async function hydrateUserSession() {
    const storedUser = parseStoredUser();
    if (storedUser) {
        storeUser(storedUser);
    }

    const response = await apiFetch("/api/auth/me", { method: "GET" });
    if (!response) return;

    if (response.status === 401 || response.status === 403) {
        logout();
        return;
    }

    if (!response.ok) return;

    const data = await response.json();
    if (data?.user) {
        storeUser(data.user);
    }
}

playBotButton?.addEventListener("click", openBotDialog);
closeBotDialog?.addEventListener("click", closeBotModal);

botDialog?.addEventListener("click", (event) => {
    if (event.target === botDialog) {
        closeBotModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeBotModal();
    }
});

botLevelButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const level = button.dataset.level || "easy";
        window.location.href = `game.html?mode=bot&level=${encodeURIComponent(level)}`;
    });
});

hydrateUserSession();

window.goTo = goTo;
window.logout = logout;
