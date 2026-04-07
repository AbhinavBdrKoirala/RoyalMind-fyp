const token = localStorage.getItem("token");
const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
const appUi = window.RoyalMindUI || {
    notify: () => {}
};

const lessonGrid = document.getElementById("lessonGrid");
const lessonMembershipNote = document.getElementById("lessonMembershipNote");
const lessonSummary = document.getElementById("lessonSummary");

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

function getLocalePreferences() {
    try {
        const settings = JSON.parse(localStorage.getItem("royalmindSettings")) || {};
        const localeMap = {
            English: "en-US",
            Spanish: "es-ES",
            French: "fr-FR"
        };

        return {
            locale: localeMap[settings.language] || "en-US",
            timeZone: settings.timeZone && settings.timeZone !== "Local device time" ? settings.timeZone : undefined
        };
    } catch {
        return { locale: "en-US", timeZone: undefined };
    }
}

function formatDateTimeLabel(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const { locale, timeZone } = getLocalePreferences();
    return date.toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timeZone ? { timeZone } : {})
    });
}

function getLessonTone(category) {
    const value = String(category || "").toLowerCase();
    if (value.includes("opening")) return "openings";
    if (value.includes("tactic")) return "tactics";
    if (value.includes("endgame")) return "endgames";
    if (value.includes("strategy")) return "strategy";
    if (value.includes("attack")) return "attack";
    if (value.includes("defense")) return "defense";
    return "general";
}

function getLessonMonogram(category) {
    return String(category || "Lesson")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "LS";
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
        <article class="premium-card lesson-card lesson-tone-${escapeAttribute(getLessonTone(lesson.category))}${lesson.locked ? " locked" : ""}">
            <div class="lesson-card-media" aria-hidden="true">
                <span class="lesson-card-monogram">${escapeHtml(getLessonMonogram(lesson.category))}</span>
            </div>
            <div class="premium-card-head">
                <div>
                    <p class="premium-section-label">${escapeHtml(lesson.category || "Lesson")}</p>
                    <h2>${escapeHtml(lesson.title)}</h2>
                </div>
                <span class="premium-badge${lesson.locked ? " premium" : ""}">${lesson.locked ? "Premium" : "Open"}</span>
            </div>
            <p class="premium-muted">${escapeHtml(lesson.description || "")}</p>
            <div class="lesson-card-meta">
                <span>${lesson.locked ? "Subscriber collection" : "Free collection"}</span>
                <span>${lesson.openedCount > 0 ? `Opened ${lesson.openedCount}x` : escapeHtml(lesson.category || "General study")}</span>
            </div>
            ${lesson.lastOpenedAt ? `<p class="premium-footnote">Last opened ${escapeHtml(formatDateTimeLabel(lesson.lastOpenedAt))}</p>` : ""}
            <div class="premium-actions-row lesson-card-actions">
                ${lesson.locked
                    ? '<a class="premium-primary-link" href="subscription.html">Unlock Premium</a><a class="premium-secondary-link" href="subscription.html">View Plan</a>'
                    : `<a class="premium-primary-link" data-open-lesson-id="${lesson.id}" href="${escapeAttribute(lesson.youtubeUrl || lesson.previewUrl || "#")}" target="_blank" rel="noreferrer">Open on YouTube</a><a class="premium-secondary-link" href="subscription.html">See Premium</a>`
                }
            </div>
        </article>
    `).join("");
}

function renderLessonSummary(lessons) {
    if (!lessonSummary) return;

    const items = Array.isArray(lessons) ? lessons : [];
    const premiumCount = items.filter((lesson) => lesson.isPremium).length;
    const categories = new Set(items.map((lesson) => lesson.category).filter(Boolean));

    lessonSummary.innerHTML = `
        <article class="premium-stat-card">
            <strong>${items.length}</strong>
            <span>Collections ready to explore</span>
        </article>
        <article class="premium-stat-card">
            <strong>${premiumCount}</strong>
            <span>Premium lesson paths</span>
        </article>
        <article class="premium-stat-card">
            <strong>${categories.size}</strong>
            <span>Study categories</span>
        </article>
    `;
}

async function trackLessonOpen(lessonId) {
    const response = await apiFetch(`/api/premium/videos/${lessonId}/open`, {
        method: "POST"
    });

    if (!response) return null;
    if (response.status === 401 || response.status === 403) {
        redirectToLogin("Your session expired. Please log in again.");
        return null;
    }
    if (!response.ok) return null;

    const data = await response.json();
    return data.progress || null;
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
    renderLessonSummary(data.lessons || []);
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

lessonGrid?.addEventListener("click", async (event) => {
    const link = event.target.closest("[data-open-lesson-id]");
    if (!link) return;

    event.preventDefault();

    const lessonId = link.dataset.openLessonId;
    const href = link.getAttribute("href") || "#";
    if (!lessonId || href === "#") return;

    window.open(href, "_blank", "noopener,noreferrer");
    await trackLessonOpen(lessonId);
    initLessons();
});

initLessons();
