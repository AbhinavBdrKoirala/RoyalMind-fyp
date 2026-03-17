const token = localStorage.getItem("token");

if (!token) {
    alert("You must login first");
    window.location.href = "index.html";
}

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

function getStoredSettings() {
    try {
        return JSON.parse(localStorage.getItem("royalmindSettings")) || {};
    } catch {
        return {};
    }
}

function applySettings(settings) {
    const next = { ...DEFAULTS, ...settings };
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
    if (profileMeta) profileMeta.textContent = "Rapid 1240 | Blitz 990";
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

function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2400);
}

function saveSettings() {
    const settings = readSettings();
    localStorage.setItem("royalmindSettings", JSON.stringify(settings));
    if (profileName) profileName.textContent = settings.displayName;
    showToast("Settings saved on this device.");
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

function hydrateAccountDetails() {
    const storedUser = localStorage.getItem("royalmindUser");
    if (profileName && storedUser) {
        profileName.textContent = storedUser;
        if (fields.displayName && !fields.displayName.value.trim()) {
            fields.displayName.value = storedUser;
        }
    }

    if (accountEmail && storedUser && storedUser.includes("@")) {
        accountEmail.textContent = storedUser;
    }
}

saveButton?.addEventListener("click", saveSettings);

applySettings(getStoredSettings());
hydrateAccountDetails();
bindMenuHighlight();
