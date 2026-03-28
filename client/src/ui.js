(function () {
    if (window.RoyalMindUI) return;

    const state = {
        root: null,
        toastStack: null,
        confirmBackdrop: null,
        confirmCard: null,
        confirmTitle: null,
        confirmMessage: null,
        cancelButton: null,
        confirmButton: null,
        activeResolve: null,
        lastFocus: null
    };

    function ensureUi() {
        if (state.root || !document.body) return;

        const root = document.createElement("div");
        root.className = "rm-ui-root";
        root.innerHTML = `
            <div class="rm-toast-stack" aria-live="polite" aria-atomic="false"></div>
            <div class="rm-confirm-backdrop hidden" aria-hidden="true">
                <div class="rm-confirm-card" role="dialog" aria-modal="true" aria-labelledby="rmConfirmTitle" aria-describedby="rmConfirmMessage">
                    <div class="rm-confirm-kicker">RoyalMind</div>
                    <h3 id="rmConfirmTitle" class="rm-confirm-title"></h3>
                    <p id="rmConfirmMessage" class="rm-confirm-message"></p>
                    <div class="rm-confirm-actions">
                        <button type="button" class="rm-confirm-button rm-confirm-button-secondary" data-action="cancel">Cancel</button>
                        <button type="button" class="rm-confirm-button rm-confirm-button-primary" data-action="confirm">Continue</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(root);

        state.root = root;
        state.toastStack = root.querySelector(".rm-toast-stack");
        state.confirmBackdrop = root.querySelector(".rm-confirm-backdrop");
        state.confirmCard = root.querySelector(".rm-confirm-card");
        state.confirmTitle = root.querySelector(".rm-confirm-title");
        state.confirmMessage = root.querySelector(".rm-confirm-message");
        state.cancelButton = root.querySelector('[data-action="cancel"]');
        state.confirmButton = root.querySelector('[data-action="confirm"]');

        state.cancelButton?.addEventListener("click", () => closeConfirm(false));
        state.confirmButton?.addEventListener("click", () => closeConfirm(true));
        root.addEventListener("click", (event) => {
            const actionTarget = event.target.closest("[data-action]");
            if (actionTarget?.dataset.action === "cancel") {
                closeConfirm(false);
                return;
            }
            if (actionTarget?.dataset.action === "confirm") {
                closeConfirm(true);
                return;
            }

            if (event.target === state.confirmBackdrop) {
                closeConfirm(false);
            }
        });
        state.confirmBackdrop?.addEventListener("click", (event) => {
            if (event.target === state.confirmBackdrop) {
                closeConfirm(false);
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && state.activeResolve) {
                closeConfirm(false);
            }
        });
    }

    function closeConfirm(result) {
        if (!state.activeResolve || !state.confirmBackdrop) return;

        state.confirmBackdrop.classList.add("hidden");
        state.confirmBackdrop.setAttribute("aria-hidden", "true");
        document.body.classList.remove("rm-dialog-open");

        const resolve = state.activeResolve;
        state.activeResolve = null;
        resolve(result);

        if (state.lastFocus && typeof state.lastFocus.focus === "function") {
            state.lastFocus.focus();
        }
        state.lastFocus = null;
    }

    function notify(message, options = {}) {
        ensureUi();
        if (!state.toastStack) return;

        const tone = options.tone || "info";
        const duration = typeof options.duration === "number" ? options.duration : 2800;

        const toast = document.createElement("div");
        toast.className = `rm-toast rm-toast-${tone}`;

        const titleMarkup = options.title
            ? `<div class="rm-toast-title">${escapeHtml(options.title)}</div>`
            : "";

        toast.innerHTML = `
            <div class="rm-toast-body">
                ${titleMarkup}
                <div class="rm-toast-message">${escapeHtml(message)}</div>
            </div>
            <button type="button" class="rm-toast-close" aria-label="Dismiss message">&times;</button>
        `;

        const removeToast = () => {
            toast.classList.add("is-leaving");
            setTimeout(() => toast.remove(), 180);
        };

        toast.querySelector(".rm-toast-close")?.addEventListener("click", removeToast);
        state.toastStack.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("is-visible");
        });

        if (duration > 0) {
            setTimeout(removeToast, duration);
        }
    }

    function confirm(messageOrOptions) {
        ensureUi();

        const options = typeof messageOrOptions === "string"
            ? { message: messageOrOptions }
            : (messageOrOptions || {});

        const title = typeof options.title === "string" && options.title.trim()
            ? options.title.trim()
            : "Please confirm";
        const message = typeof options.message === "string" && options.message.trim()
            ? options.message.trim()
            : "Review this action before continuing.";

        if (!state.confirmBackdrop || !state.confirmTitle || !state.confirmMessage) {
            return Promise.resolve(false);
        }

        if (state.activeResolve) {
            closeConfirm(false);
        }

        state.lastFocus = document.activeElement;
        state.confirmTitle.textContent = title;
        state.confirmMessage.textContent = message;
        state.cancelButton.textContent = options.cancelLabel || "Cancel";
        state.confirmButton.textContent = options.confirmLabel || "Continue";

        state.confirmCard.classList.remove("rm-confirm-warning", "rm-confirm-danger");
        if (options.tone === "danger") {
            state.confirmCard.classList.add("rm-confirm-danger");
        } else if (options.tone === "warning") {
            state.confirmCard.classList.add("rm-confirm-warning");
        }

        state.confirmBackdrop.classList.remove("hidden");
        state.confirmBackdrop.setAttribute("aria-hidden", "false");
        document.body.classList.add("rm-dialog-open");

        requestAnimationFrame(() => {
            state.confirmButton?.focus();
        });

        return new Promise((resolve) => {
            state.activeResolve = resolve;
        });
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    ensureUi();

    window.RoyalMindUI = {
        notify,
        confirm
    };
})();
