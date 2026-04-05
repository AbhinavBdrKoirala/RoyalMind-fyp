const token = localStorage.getItem("token");
const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];

const botDialog = document.getElementById("botDialog");
const playBotButton = document.getElementById("playBotButton");
const closeBotDialog = document.getElementById("closeBotDialog");
const botLevelButtons = Array.from(document.querySelectorAll("[data-level]"));
const dashboardGreeting = document.getElementById("dashboardGreeting");
const dashboardSubtext = document.getElementById("dashboardSubtext");
const appUi = window.RoyalMindUI || {
    notify: () => {}
};

if (!token) {
    appUi.notify("Please log in to continue.", {
        title: "Session required",
        tone: "info",
        duration: 1200
    });
    setTimeout(() => {
        window.location.href = "index.html";
    }, 700);
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

function hydrateDashboardIntro(user) {
    if (!dashboardGreeting && !dashboardSubtext) return;

    const displayName = user?.displayName || user?.username || user?.email?.split("@")[0] || "Player";
    const firstName = String(displayName).trim().split(/\s+/)[0] || "Player";
    const settings = user?.settings || {};
    const defaultTime = settings.defaultTime || "Rapid 10+0";

    if (dashboardGreeting) {
        dashboardGreeting.textContent = `Welcome back, ${firstName}`;
    }

    if (dashboardSubtext) {
        dashboardSubtext.textContent = `Your board is ready. Start a ${defaultTime} game, open premium training, or review your recent progress.`;
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
        hydrateDashboardIntro(storedUser);
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
        hydrateDashboardIntro(data.user);
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
