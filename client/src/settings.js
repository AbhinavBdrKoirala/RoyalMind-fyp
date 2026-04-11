const token = localStorage.getItem("token");
const appUi = window.RoyalMindUI || {
    notify: () => {}
};

if (!token) {
    appUi.notify("Please log in to open your settings.", {
        title: "Session required",
        tone: "info",
        duration: 1200
    });
    setTimeout(() => {
        window.location.href = "index.html";
    }, 700);
}

const API_BASES = ["http://127.0.0.1:7000", "http://localhost:7000"];

const fields = {
    displayName: document.getElementById("displayName"),
    language: document.getElementById("language"),
    timeZone: document.getElementById("timeZone"),
    autoQueen: document.getElementById("autoQueen"),
    showLegal: document.getElementById("showLegal"),
    moveConfirm: document.getElementById("moveConfirm"),
    defaultTime: document.getElementById("defaultTime"),
    boardTheme: document.getElementById("boardTheme"),
    pieceStyle: document.getElementById("pieceStyle"),
    boardCoordinates: document.getElementById("boardCoordinates"),
    animatePieces: document.getElementById("animatePieces"),
    notifyGameStart: document.getElementById("notifyGameStart"),
    notifyChallenges: document.getElementById("notifyChallenges"),
    notifySounds: document.getElementById("notifySounds"),
    privacyOnline: document.getElementById("privacyOnline"),
    privacyDM: document.getElementById("privacyDM"),
    privacyHistory: document.getElementById("privacyHistory")
};

const saveButton = document.getElementById("saveSettings");
const profileName = document.getElementById("profileName");
const profileMeta = document.getElementById("profileMeta");
const accountEmail = document.getElementById("accountEmail");
const toast = document.getElementById("settingsToast");
const menuLinks = Array.from(document.querySelectorAll(".settings-menu-link"));
const panels = Array.from(document.querySelectorAll(".settings-panel"));
const toggleEmailChangeButton = document.getElementById("toggleEmailChange");
const emailChangePanel = document.getElementById("emailChangePanel");
const newEmailInput = document.getElementById("newEmail");
const emailChangePasswordInput = document.getElementById("emailChangePassword");
const emailChangeCodeInput = document.getElementById("emailChangeCode");
const requestEmailChangeButton = document.getElementById("requestEmailChange");
const resendEmailChangeButton = document.getElementById("resendEmailChange");
const confirmEmailChangeButton = document.getElementById("confirmEmailChange");
const cancelEmailChangeButton = document.getElementById("cancelEmailChange");
const emailChangeHint = document.getElementById("emailChangeHint");
const sendPasswordResetButton = document.getElementById("sendPasswordReset");
const passwordResetStatus = document.getElementById("passwordResetStatus");

const DEFAULTS = {
    displayName: "RoyalMind Player",
    language: "English",
    timeZone: "Local device time",
    autoQueen: true,
    showLegal: true,
    moveConfirm: false,
    defaultTime: "Rapid 10+0",
    boardTheme: "Classic Wood",
    pieceStyle: "Royal Set",
    boardCoordinates: "Show on all games",
    animatePieces: true,
    notifyGameStart: true,
    notifyChallenges: false,
    notifySounds: true,
    privacyOnline: true,
    privacyDM: true,
    privacyHistory: false
};

function formatDeliveryHint(data, fallback) {
    if (data?.deliveryMethod === "email" && data.email) {
        return `A 6-digit code was sent to ${data.email}.`;
    }

    if (data?.devVerificationCode) {
        return `Local test code: ${data.devVerificationCode}`;
    }

    return fallback;
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
}

function getStoredSettings() {
    try {
        return JSON.parse(localStorage.getItem("royalmindSettings")) || {};
    } catch {
        return {};
    }
}

function getDisplayName(user) {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return user?.displayName || user?.username || fullName || user?.email || DEFAULTS.displayName;
}

function getProfileMeta(user) {
    if (user?.username) {
        return `@${user.username}`;
    }

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return fullName || "Your RoyalMind profile";
}

function getUserAwareSettings(user, settings) {
    return {
        ...DEFAULTS,
        ...settings,
        displayName: getDisplayName(user)
    };
}

function applySettings(settings, user = parseStoredUser()) {
    const next = getUserAwareSettings(user, settings);

    if (fields.displayName) fields.displayName.value = next.displayName;
    if (fields.language) fields.language.value = next.language;
    if (fields.timeZone) fields.timeZone.value = next.timeZone;
    if (fields.autoQueen) fields.autoQueen.checked = next.autoQueen;
    if (fields.showLegal) fields.showLegal.checked = next.showLegal;
    if (fields.moveConfirm) fields.moveConfirm.checked = next.moveConfirm;
    if (fields.defaultTime) fields.defaultTime.value = next.defaultTime;
    if (fields.boardTheme) fields.boardTheme.value = next.boardTheme;
    if (fields.pieceStyle) fields.pieceStyle.value = next.pieceStyle;
    if (fields.boardCoordinates) fields.boardCoordinates.value = next.boardCoordinates;
    if (fields.animatePieces) fields.animatePieces.checked = next.animatePieces;
    if (fields.notifyGameStart) fields.notifyGameStart.checked = next.notifyGameStart;
    if (fields.notifyChallenges) fields.notifyChallenges.checked = next.notifyChallenges;
    if (fields.notifySounds) fields.notifySounds.checked = next.notifySounds;
    if (fields.privacyOnline) fields.privacyOnline.checked = next.privacyOnline;
    if (fields.privacyDM) fields.privacyDM.checked = next.privacyDM;
    if (fields.privacyHistory) fields.privacyHistory.checked = next.privacyHistory;

    if (profileName) profileName.textContent = next.displayName || DEFAULTS.displayName;
    if (profileMeta) profileMeta.textContent = getProfileMeta(user);
    if (accountEmail) accountEmail.textContent = user?.email || "player@royalmind.app";
}

function readSettings() {
    return {
        displayName: fields.displayName ? fields.displayName.value.trim() || DEFAULTS.displayName : DEFAULTS.displayName,
        language: fields.language ? fields.language.value : DEFAULTS.language,
        timeZone: fields.timeZone ? fields.timeZone.value : DEFAULTS.timeZone,
        autoQueen: !!fields.autoQueen?.checked,
        showLegal: !!fields.showLegal?.checked,
        moveConfirm: !!fields.moveConfirm?.checked,
        defaultTime: fields.defaultTime ? fields.defaultTime.value : DEFAULTS.defaultTime,
        boardTheme: fields.boardTheme ? fields.boardTheme.value : DEFAULTS.boardTheme,
        pieceStyle: fields.pieceStyle ? fields.pieceStyle.value : DEFAULTS.pieceStyle,
        boardCoordinates: fields.boardCoordinates ? fields.boardCoordinates.value : DEFAULTS.boardCoordinates,
        animatePieces: !!fields.animatePieces?.checked,
        notifyGameStart: !!fields.notifyGameStart?.checked,
        notifyChallenges: !!fields.notifyChallenges?.checked,
        notifySounds: !!fields.notifySounds?.checked,
        privacyOnline: !!fields.privacyOnline?.checked,
        privacyDM: !!fields.privacyDM?.checked,
        privacyHistory: !!fields.privacyHistory?.checked
    };
}

function buildSettingsPayload(settings) {
    const { displayName, ...rest } = settings;
    return {
        displayName,
        settings: rest
    };
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

function showToast(message, tone = "info", title = "Settings") {
    if (toast) {
        toast.textContent = message;
    }

    appUi.notify(message, {
        title,
        tone
    });
}

function getCurrentUser() {
    return parseStoredUser() || {};
}

function setEmailChangePanelOpen(open) {
    if (!emailChangePanel) return;
    emailChangePanel.classList.toggle("hidden", !open);
    if (!open) {
        if (newEmailInput) newEmailInput.value = "";
        if (emailChangePasswordInput) emailChangePasswordInput.value = "";
        if (emailChangeCodeInput) emailChangeCodeInput.value = "";
        if (emailChangeHint) emailChangeHint.textContent = "We will send a 6-digit code to your new email address.";
        resendEmailChangeButton?.classList.add("hidden");
    }
}

async function handleAuthFailure(response) {
    if (!response || (response.status !== 401 && response.status !== 403)) {
        return false;
    }

    localStorage.removeItem("token");
    window.location.href = "index.html";
    return true;
}

async function saveSettings() {
    const settings = readSettings();

    localStorage.setItem("royalmindSettings", JSON.stringify(settings));
    if (profileName) profileName.textContent = settings.displayName;

    const response = await apiFetch("/api/auth/settings", {
        method: "PUT",
        body: JSON.stringify(buildSettingsPayload(settings))
    });

    if (!response) {
        showToast("Saved locally. Backend is unavailable right now.", "warning", "Offline save");
        return;
    }

    if (await handleAuthFailure(response)) {
        return;
    }

    if (!response.ok) {
        let message = "Unable to save settings.";
        try {
            const data = await response.json();
            message = data.error || message;
        } catch {
            // ignore invalid json
        }
        showToast(message, "error", "Could not save");
        return;
    }

    const data = await response.json();
    if (data?.user) {
        const nextUser = {
            ...data.user,
            settings: data.user.settings || {}
        };
        storeUser(nextUser);
        localStorage.setItem("royalmindSettings", JSON.stringify({
            displayName: nextUser.displayName,
            ...nextUser.settings
        }));
        applySettings(nextUser.settings, nextUser);
    }

    showToast("Settings saved to your account.", "success", "All set");
}

function bindMenuHighlight() {
    menuLinks.forEach(link => {
        link.addEventListener("click", () => {
            menuLinks.forEach(item => item.classList.remove("active"));
            link.classList.add("active");
        });
    });

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const id = entry.target.getAttribute("id");
            if (!id) return;
            menuLinks.forEach(item => {
                item.classList.toggle("active", item.getAttribute("href") === `#${id}`);
            });
        });
    }, { rootMargin: "-40% 0px -55% 0px" });

    panels.forEach(panel => observer.observe(panel));
}

async function hydrateSettings() {
    const storedUser = parseStoredUser();
    const storedSettings = getStoredSettings();
    applySettings(storedSettings, storedUser);

    const response = await apiFetch("/api/auth/me", { method: "GET" });
    if (!response) return;

    if (await handleAuthFailure(response)) {
        return;
    }

    if (!response.ok) return;

    const data = await response.json();
    if (!data?.user) return;

    const user = {
        ...data.user,
        settings: data.user.settings || {}
    };

    storeUser(user);
    localStorage.setItem("royalmindSettings", JSON.stringify({
        displayName: user.displayName,
        ...user.settings
    }));
    applySettings(user.settings, user);
}

async function sendPasswordReset() {
    const user = getCurrentUser();
    if (!user.email) {
        showToast("No email is available on your account yet.", "error", "Cannot reset password");
        return;
    }

    const response = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: user.email })
    });

    if (!response) {
        showToast("The backend is unavailable right now.", "error", "Reset unavailable");
        return;
    }

    if (await handleAuthFailure(response)) {
        return;
    }

    const data = await response.json();
    if (!response.ok) {
        showToast(data.error || "Could not send the reset email.", "error", "Reset unavailable");
        return;
    }

    if (passwordResetStatus) {
        passwordResetStatus.textContent = formatDeliveryHint(data, "A reset code has been sent to your email.");
    }

    showToast(data.message || "Password reset code sent.", "success", "Check your email");
}

async function requestEmailChange() {
    const newEmail = newEmailInput?.value.trim().toLowerCase() || "";
    const password = emailChangePasswordInput?.value || "";

    const response = await apiFetch("/api/auth/change-email/request", {
        method: "POST",
        body: JSON.stringify({ newEmail, password })
    });

    if (!response) {
        showToast("The backend is unavailable right now.", "error", "Email update unavailable");
        return;
    }

    if (await handleAuthFailure(response)) {
        return;
    }

    const data = await response.json();
    if (!response.ok) {
        showToast(data.error || "Could not send the email change code.", "error", "Email update failed");
        return;
    }

    if (emailChangeHint) {
        emailChangeHint.textContent = formatDeliveryHint(data, "A confirmation code has been sent to your new email address.");
    }

    resendEmailChangeButton?.classList.remove("hidden");
    showToast(data.message || "Confirmation code sent.", "success", "Check your email");
}

async function resendEmailChange() {
    const response = await apiFetch("/api/auth/change-email/resend", {
        method: "POST",
        body: JSON.stringify({})
    });

    if (!response) {
        showToast("The backend is unavailable right now.", "error", "Email update unavailable");
        return;
    }

    if (await handleAuthFailure(response)) {
        return;
    }

    const data = await response.json();
    if (!response.ok) {
        showToast(data.error || "Could not resend the email change code.", "error", "Resend failed");
        return;
    }

    if (emailChangeHint) {
        emailChangeHint.textContent = formatDeliveryHint(data, "A fresh confirmation code has been sent to your new email address.");
    }

    showToast(data.message || "Confirmation code resent.", "success", "Check your email");
}

async function confirmEmailChange() {
    const code = emailChangeCodeInput?.value.trim() || "";
    const response = await apiFetch("/api/auth/change-email/confirm", {
        method: "POST",
        body: JSON.stringify({ code })
    });

    if (!response) {
        showToast("The backend is unavailable right now.", "error", "Email update unavailable");
        return;
    }

    if (await handleAuthFailure(response)) {
        return;
    }

    const data = await response.json();
    if (!response.ok) {
        showToast(data.error || "Could not confirm the new email.", "error", "Confirmation failed");
        return;
    }

    if (data?.user) {
        const nextUser = {
            ...data.user,
            settings: data.user.settings || {}
        };
        storeUser(nextUser);
        localStorage.setItem("royalmindSettings", JSON.stringify({
            displayName: nextUser.displayName,
            ...nextUser.settings
        }));
        applySettings(nextUser.settings, nextUser);
    }

    setEmailChangePanelOpen(false);
    showToast(data.message || "Email updated successfully.", "success", "Email updated");
}

saveButton?.addEventListener("click", saveSettings);
sendPasswordResetButton?.addEventListener("click", sendPasswordReset);
toggleEmailChangeButton?.addEventListener("click", () => {
    setEmailChangePanelOpen(emailChangePanel?.classList.contains("hidden"));
});
requestEmailChangeButton?.addEventListener("click", requestEmailChange);
resendEmailChangeButton?.addEventListener("click", resendEmailChange);
confirmEmailChangeButton?.addEventListener("click", confirmEmailChange);
cancelEmailChangeButton?.addEventListener("click", () => setEmailChangePanelOpen(false));

applySettings(getStoredSettings(), parseStoredUser());
bindMenuHighlight();
hydrateSettings();
