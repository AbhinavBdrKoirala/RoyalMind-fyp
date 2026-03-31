const token = localStorage.getItem("token");
const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
const appUi = window.RoyalMindUI || {
    notify: () => {}
};

const lessonGrid = document.getElementById("lessonGrid");
const lessonMembershipNote = document.getElementById("lessonMembershipNote");

if (!token) {
    appUi.notify("Please log in to access lessons.", {
        title: "Session required",
        tone: "info",
        duration: 1200
    });
    setTimeout(() => {
        window.location.href = "index.html";
    }, 700);
}

function redirectToLogin(message) {
    localStorage.removeItem("token");
    appUi.notify(message || "Please log in to continue.", {
        title: "Session required",
        tone: "info",
        duration: 1200
    });
    setTimeout(() => {
        window.location.href = "index.html";
    }, 700);
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

function renderLessons(lessons, isPremium) {
    if (lessonMembershipNote) {
        lessonMembershipNote.textContent = isPremium
            ? "Premium lesson collections are unlocked."
            : "Free users can preview the free lesson collection. Premium lessons are locked.";
    }

    if (!lessonGrid) return;
    if (!Array.isArray(lessons) || lessons.length === 0) {
        lessonGrid.innerHTML = '<article class="premium-card"><p class="premium-muted">No lesson collections are available yet.</p></article>';
        return;
    }

    lessonGrid.innerHTML = lessons.map((lesson) => `
        <article class="premium-card lesson-card${lesson.locked ? " locked" : ""}">
            <div class="premium-card-head">
                <div>
                    <p class="premium-section-label">${escapeHtml(lesson.category || "Lesson")}</p>
                    <h2>${escapeHtml(lesson.title)}</h2>
                </div>
                <span class="premium-badge${lesson.locked ? " premium" : ""}">${lesson.locked ? "Premium" : "Open"}</span>
            </div>
            <p class="premium-muted">${escapeHtml(lesson.description || "")}</p>
            <div class="premium-actions-row">
                ${lesson.locked
                    ? '<a class="premium-primary-link" href="subscription.html">Unlock Premium</a>'
                    : `<a class="premium-primary-link" href="${escapeAttribute(lesson.youtubeUrl || lesson.previewUrl || "#")}" target="_blank" rel="noreferrer">Open on YouTube</a>`
                }
            </div>
        </article>
    `).join("");
}

async function initLessons() {
    const response = await apiFetch("/api/premium/videos");
    if (!response) {
        if (lessonGrid) {
            lessonGrid.innerHTML = '<article class="premium-card"><p class="premium-muted">Unable to load lesson collections right now.</p></article>';
        }
        return;
    }

    if (response.status === 401 || response.status === 403) {
        redirectToLogin("Your session expired. Please log in again.");
        return;
    }

    if (!response.ok) {
        if (lessonGrid) {
            lessonGrid.innerHTML = '<article class="premium-card"><p class="premium-muted">Unable to load lesson collections right now.</p></article>';
        }
        return;
    }

    const data = await response.json();
    renderLessons(data.lessons || [], !!data.isPremium);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

initLessons();
