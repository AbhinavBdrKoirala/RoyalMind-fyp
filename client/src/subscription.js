const token = localStorage.getItem("token");
const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];
const appUi = window.RoyalMindUI || {
    notify: () => {},
    confirm: async () => false
};

const statusTitle = document.getElementById("subscriptionStatusTitle");
const statusText = document.getElementById("subscriptionStatusText");
const planList = document.getElementById("subscriptionPlanList");
const primaryButton = document.getElementById("subscriptionPrimaryBtn");
const secondaryButton = document.getElementById("subscriptionSecondaryBtn");
const contentStats = document.getElementById("subscriptionContentStats");
const puzzlePreview = document.getElementById("subscriptionPuzzlePreview");
const lessonPreview = document.getElementById("subscriptionLessonPreview");

if (!token) {
    appUi.notify("Please log in to manage subscription access.", {
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

function setLoadingState(label) {
    if (primaryButton) {
        primaryButton.disabled = true;
        primaryButton.textContent = label;
    }
    if (secondaryButton) {
        secondaryButton.classList.add("hidden");
    }
}

function renderPlans(plans) {
    if (!planList) return;
    if (!Array.isArray(plans) || plans.length === 0) {
        planList.innerHTML = '<p class="premium-muted">No plans available right now.</p>';
        return;
    }

    planList.innerHTML = plans.map((plan) => `
        <div class="premium-plan-card">
            <strong>${escapeHtml(plan.name)}</strong>
            <span>${escapeHtml(plan.priceLabel || "")}</span>
            <p>${escapeHtml(plan.description || "")}</p>
        </div>
    `).join("");
}

function renderContentStats(puzzles, lessons) {
    if (!contentStats) return;

    const puzzleListSafe = Array.isArray(puzzles) ? puzzles : [];
    const lessonListSafe = Array.isArray(lessons) ? lessons : [];
    const premiumPuzzleCount = puzzleListSafe.filter((item) => item.isPremium).length;
    const premiumLessonCount = lessonListSafe.filter((item) => item.isPremium).length;

    contentStats.innerHTML = `
        <div class="premium-stat-card">
            <strong>${puzzleListSafe.length}</strong>
            <span>${premiumPuzzleCount} premium puzzle${premiumPuzzleCount === 1 ? "" : "s"} included</span>
        </div>
        <div class="premium-stat-card">
            <strong>${lessonListSafe.length}</strong>
            <span>${premiumLessonCount} premium lesson collection${premiumLessonCount === 1 ? "" : "s"} included</span>
        </div>
    `;
}

function renderPreviewList(target, items, kind) {
    if (!target) return;

    const previewItems = (Array.isArray(items) ? items : []).slice(0, 4);
    if (previewItems.length === 0) {
        target.innerHTML = `<p class="premium-muted">No ${kind} preview is available yet.</p>`;
        return;
    }

    target.innerHTML = previewItems.map((item) => `
        <article class="premium-list-item${item.locked ? " locked" : ""}">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.theme || item.category || kind)}</span>
            <small>${item.locked ? "Premium" : "Open now"}</small>
        </article>
    `).join("");
}

function renderStatus(subscription) {
    const isPremium = !!subscription?.isPremium;
    if (statusTitle) {
        statusTitle.textContent = isPremium
            ? `${subscription.planName || "Premium"} is active`
            : "You are on the free tier";
    }
    if (statusText) {
        statusText.textContent = isPremium
            ? `Premium access is active${subscription.expiresAt ? ` until ${new Date(subscription.expiresAt).toLocaleDateString()}` : ""}.`
            : "Upgrade to unlock premium-only puzzles and YouTube lesson collections.";
    }

    if (primaryButton) {
        primaryButton.disabled = false;
        primaryButton.textContent = isPremium ? "Open Puzzles" : "Activate Premium";
        primaryButton.onclick = async () => {
            if (isPremium) {
                window.location.href = "puzzles.html";
                return;
            }

            setLoadingState("Activating...");
            const response = await apiFetch("/api/subscription/activate", { method: "POST" });
            if (!response) {
                appUi.notify("Unable to activate premium right now.", {
                    title: "Subscription error",
                    tone: "warning"
                });
                await hydrateSubscription();
                return;
            }

            if (response.status === 401 || response.status === 403) {
                redirectToLogin("Your session expired. Please log in again.");
                return;
            }

            if (!response.ok) {
                appUi.notify("Unable to activate premium right now.", {
                    title: "Subscription error",
                    tone: "warning"
                });
                await hydrateSubscription();
                return;
            }

            appUi.notify("Premium access is now active.", {
                title: "Subscription updated",
                tone: "success"
            });
            await hydrateSubscription();
        };
    }

    if (secondaryButton) {
        if (!isPremium) {
            secondaryButton.classList.add("hidden");
            secondaryButton.onclick = null;
            return;
        }

        secondaryButton.classList.remove("hidden");
        secondaryButton.onclick = async () => {
            const confirmed = await appUi.confirm({
                title: "Cancel premium access?",
                message: "This MVP flow will remove premium gating from your account until you activate it again.",
                confirmLabel: "Cancel premium",
                cancelLabel: "Keep premium",
                tone: "warning"
            });
            if (!confirmed) return;

            setLoadingState("Updating...");
            const response = await apiFetch("/api/subscription/me", { method: "DELETE" });
            if (!response) {
                appUi.notify("Unable to cancel premium right now.", {
                    title: "Subscription error",
                    tone: "warning"
                });
                await hydrateSubscription();
                return;
            }

            if (response.status === 401 || response.status === 403) {
                redirectToLogin("Your session expired. Please log in again.");
                return;
            }

            if (!response.ok) {
                appUi.notify("Unable to cancel premium right now.", {
                    title: "Subscription error",
                    tone: "warning"
                });
                await hydrateSubscription();
                return;
            }

            appUi.notify("Premium access cancelled.", {
                title: "Subscription updated",
                tone: "info"
            });
            await hydrateSubscription();
        };
    }
}

async function hydrateSubscription() {
    setLoadingState("Loading...");

    const [plansResponse, meResponse, puzzlesResponse, lessonsResponse] = await Promise.all([
        apiFetch("/api/subscription/plans"),
        apiFetch("/api/subscription/me"),
        apiFetch("/api/premium/puzzles"),
        apiFetch("/api/premium/videos")
    ]);

    if (!plansResponse || !meResponse || !puzzlesResponse || !lessonsResponse) {
        if (statusTitle) statusTitle.textContent = "Subscription unavailable";
        if (statusText) statusText.textContent = "The subscription service could not be loaded right now.";
        if (planList) planList.innerHTML = "";
        if (puzzlePreview) puzzlePreview.innerHTML = "";
        if (lessonPreview) lessonPreview.innerHTML = "";
        return;
    }

    if (
        plansResponse.status === 401 || plansResponse.status === 403 ||
        meResponse.status === 401 || meResponse.status === 403 ||
        puzzlesResponse.status === 401 || puzzlesResponse.status === 403 ||
        lessonsResponse.status === 401 || lessonsResponse.status === 403
    ) {
        redirectToLogin("Your session expired. Please log in again.");
        return;
    }

    if (!plansResponse.ok || !meResponse.ok || !puzzlesResponse.ok || !lessonsResponse.ok) {
        if (statusTitle) statusTitle.textContent = "Subscription unavailable";
        if (statusText) statusText.textContent = "The subscription service could not be loaded right now.";
        if (planList) planList.innerHTML = "";
        if (puzzlePreview) puzzlePreview.innerHTML = "";
        if (lessonPreview) lessonPreview.innerHTML = "";
        return;
    }

    const plansData = await plansResponse.json();
    const meData = await meResponse.json();
    const puzzlesData = await puzzlesResponse.json();
    const lessonsData = await lessonsResponse.json();
    renderPlans(plansData.plans || []);
    renderStatus(meData.subscription || null);
    renderContentStats(puzzlesData.puzzles || [], lessonsData.lessons || []);
    renderPreviewList(puzzlePreview, puzzlesData.puzzles || [], "puzzles");
    renderPreviewList(lessonPreview, lessonsData.lessons || [], "lessons");
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

hydrateSubscription();
