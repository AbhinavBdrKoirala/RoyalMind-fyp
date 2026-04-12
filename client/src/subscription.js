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
const statusCard = document.getElementById("subscriptionStatusCard");
const paymentNote = document.getElementById("subscriptionPaymentNote");

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

function formatDateLabel(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const { locale, timeZone } = getLocalePreferences();
    return date.toLocaleDateString(locale, {
        dateStyle: "medium",
        ...(timeZone ? { timeZone } : {})
    });
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

function renderPlans(plans, provider) {
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
            <small>${escapeHtml(provider === "esewa" ? `Pay with eSewa in ${plan.currency || "NPR"}` : "Payment provider not set")}</small>
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
            <small>${item.locked ? "Included with Premium" : "Available now"}</small>
        </article>
    `).join("");
}

function submitEsewaCheckout(checkout) {
    if (!checkout?.formUrl || !checkout?.fields) {
        throw new Error("Invalid eSewa checkout payload");
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = checkout.formUrl;
    form.style.display = "none";

    Object.entries(checkout.fields).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
}

function getPaymentResultFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (!payment) return null;

    return {
        payment,
        message: params.get("message") || "",
        status: params.get("status") || "",
        transactionUuid: params.get("transaction_uuid") || ""
    };
}

function clearPaymentParams() {
    const url = new URL(window.location.href);
    ["payment", "message", "status", "transaction_uuid"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", url.toString());
}

function notifyPaymentResult() {
    const result = getPaymentResultFromUrl();
    if (!result) return;

    if (result.payment === "success") {
        appUi.notify("eSewa payment verified and premium access activated.", {
            title: "Payment successful",
            tone: "success",
            duration: 3200
        });
    } else if (result.payment === "failed") {
        appUi.notify(result.status ? `eSewa returned ${result.status}.` : "The eSewa payment was not completed.", {
            title: "Payment not completed",
            tone: "warning",
            duration: 3600
        });
    } else {
        appUi.notify(result.message || "There was a problem verifying the eSewa payment.", {
            title: "Payment error",
            tone: "error",
            duration: 4200
        });
    }

    clearPaymentParams();
}

function renderStatus(subscription, pendingPayment, providerInfo = {}) {
    const isPremium = !!subscription?.isPremium;
    document.body.classList.toggle("premium-active", isPremium);
    statusCard?.classList.toggle("is-active", isPremium);

    if (statusTitle) {
        statusTitle.textContent = isPremium
            ? `${subscription.planName || "Premium"} is active`
            : pendingPayment
                ? "Payment is being verified"
                : "You are on the free tier";
    }

    if (statusText) {
        if (isPremium) {
            statusText.textContent = `Premium access is active${subscription.expiresAt ? ` until ${formatDateLabel(subscription.expiresAt)}` : ""}.`;
        } else if (pendingPayment) {
            statusText.textContent = `Your eSewa payment request ${pendingPayment.transactionUuid} is still pending verification.`;
        } else {
            statusText.textContent = "Upgrade with eSewa to unlock premium-only puzzles and YouTube lesson collections.";
        }
    }

    if (paymentNote) {
        paymentNote.textContent = providerInfo.isEsewaConfigured
            ? `Your payment is verified with eSewa before premium access is activated${providerInfo.testMode ? " (test mode)." : "."}`
            : "eSewa is not configured on the server yet.";
    }

    if (primaryButton) {
        primaryButton.disabled = false;
        primaryButton.textContent = isPremium ? "Open Puzzles" : pendingPayment ? "Refresh Status" : "Pay with eSewa";
        primaryButton.onclick = async () => {
            if (isPremium) {
                window.location.href = "puzzles.html";
                return;
            }

            if (pendingPayment) {
                await hydrateSubscription();
                return;
            }

            setLoadingState("Redirecting...");
            const response = await apiFetch("/api/subscription/esewa/initiate", {
                method: "POST",
                body: JSON.stringify({ planCode: "premium-monthly" })
            });

            if (!response) {
                appUi.notify("Unable to initialize eSewa right now.", {
                    title: "Payment error",
                    tone: "warning"
                });
                await hydrateSubscription();
                return;
            }

            if (response.status === 401 || response.status === 403) {
                redirectToLogin("Your session expired. Please log in again.");
                return;
            }

            const data = await response.json();
            if (!response.ok) {
                appUi.notify(data.error || "Unable to initialize eSewa right now.", {
                    title: "Payment error",
                    tone: "warning",
                    duration: 3600
                });
                await hydrateSubscription();
                return;
            }

            submitEsewaCheckout(data.checkout);
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
                message: "This will remove premium access from your account. It does not refund the payment automatically.",
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
                const data = await response.json().catch(() => ({}));
                appUi.notify("Unable to cancel premium right now.", {
                    title: "Subscription error",
                    tone: "warning"
                });
                if (data.error) {
                    if (statusText) {
                        statusText.textContent = data.error;
                    }
                }
                await hydrateSubscription();
                return;
            }

            const data = await response.json().catch(() => ({}));
            appUi.notify(data.message || "Premium access cancelled.", {
                title: "Subscription updated",
                tone: data.cancelled === false ? "info" : "success"
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
        apiFetch("/api/premium/puzzles?preview=1"),
        apiFetch("/api/premium/videos?preview=1")
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

    renderPlans(plansData.plans || [], plansData.paymentProvider);
    renderStatus(meData.subscription || null, meData.pendingPayment || null, {
        isEsewaConfigured: !!plansData.isEsewaConfigured,
        testMode: !!plansData.testMode
    });
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

notifyPaymentResult();
hydrateSubscription();
