const loginForm = document.getElementById("loginForm");
const modeToggle = document.getElementById("modeToggle");
const passwordToggle = document.getElementById("passwordToggle");
const passwordField = document.querySelector(".password-field");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");
const submitButton = document.getElementById("submitButton");
const registerFields = document.getElementById("registerFields");
const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");
const usernameInput = document.getElementById("username");
const phoneInput = document.getElementById("phone");
const countryInput = document.getElementById("country");
const emailInput = document.getElementById("email");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const verificationFields = document.getElementById("verificationFields");
const verificationCodeInput = document.getElementById("verificationCode");
const verificationHint = document.getElementById("verificationHint");
const resendVerificationBtn = document.getElementById("resendVerificationBtn");
const resetPasswordFields = document.getElementById("resetPasswordFields");
const resetCodeInput = document.getElementById("resetCode");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
const resetHint = document.getElementById("resetHint");
const resendResetBtn = document.getElementById("resendResetBtn");

const appUi = window.RoyalMindUI || {
    notify: () => {}
};

const AUTH_VIEWS = {
    LOGIN: "login",
    REGISTER: "register",
    VERIFY_REGISTRATION: "verify-registration",
    REQUEST_RESET: "request-reset",
    CONFIRM_RESET: "confirm-reset"
};

let currentView = AUTH_VIEWS.LOGIN;
let pendingVerificationEmail = "";
let pendingResetEmail = "";

function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle("hidden", hidden);
}

function setReadOnly(element, readOnly) {
    if (!element) return;
    element.readOnly = !!readOnly;
}

function formatVerificationHelp(data) {
    if (data?.deliveryMethod === "email") {
        return `A 6-digit verification code was sent to ${data.email}.`;
    }

    if (data?.devVerificationCode) {
        return `Email sending is not configured yet. Use this local verification code: ${data.devVerificationCode}`;
    }

    return "Enter the 6-digit verification code sent to your email.";
}

function formatResetHelp(data) {
    if (data?.deliveryMethod === "email") {
        return `A 6-digit password reset code was sent to ${data.email}.`;
    }

    if (data?.devVerificationCode) {
        return `Email sending is not configured yet. Use this local reset code: ${data.devVerificationCode}`;
    }

    return "Enter the 6-digit reset code sent to your email.";
}

function buildStoredUser(user, fallbackEmail) {
    if (!user || typeof user !== "object") {
        return {
            email: fallbackEmail,
            displayName: fallbackEmail,
            settings: {}
        };
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return {
        ...user,
        email: user.email || fallbackEmail,
        displayName: user.displayName || user.username || fullName || user.email || fallbackEmail,
        settings: user.settings && typeof user.settings === "object" ? user.settings : {}
    };
}

function completeLogin(data, fallbackEmail) {
    const storedUser = buildStoredUser(data.user, fallbackEmail);
    localStorage.setItem("token", data.token);
    localStorage.setItem("royalmindUser", JSON.stringify(storedUser));

    if (storedUser.settings) {
        localStorage.setItem("royalmindSettings", JSON.stringify({
            displayName: storedUser.displayName,
            ...storedUser.settings
        }));
    }

    appUi.notify("Welcome back. Taking you to your dashboard.", {
        title: "Login successful",
        tone: "success",
        duration: 900
    });

    setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 650);
}

function resetTransientInputs() {
    if (verificationCodeInput) verificationCodeInput.value = "";
    if (resetCodeInput) resetCodeInput.value = "";
    if (newPasswordInput) newPasswordInput.value = "";
    if (confirmNewPasswordInput) confirmNewPasswordInput.value = "";
}

function applyView(view, data = {}) {
    currentView = view;
    resetTransientInputs();

    const isLogin = view === AUTH_VIEWS.LOGIN;
    const isRegister = view === AUTH_VIEWS.REGISTER;
    const isVerify = view === AUTH_VIEWS.VERIFY_REGISTRATION;
    const isRequestReset = view === AUTH_VIEWS.REQUEST_RESET;
    const isConfirmReset = view === AUTH_VIEWS.CONFIRM_RESET;

    setHidden(registerFields, !isRegister);
    setHidden(confirmPasswordInput, !isRegister);
    setHidden(verificationFields, !isVerify);
    setHidden(resetPasswordFields, !isConfirmReset);
    setHidden(passwordField, isVerify || isRequestReset || isConfirmReset);
    setHidden(forgotPasswordBtn, !isLogin);
    setHidden(resendVerificationBtn, !isVerify);
    setHidden(resendResetBtn, !isConfirmReset);

    if (emailInput) {
        emailInput.required = true;
        emailInput.value = data.email || emailInput.value;
        setReadOnly(emailInput, isVerify || isConfirmReset);
    }

    if (passwordInput) passwordInput.required = isLogin || isRegister;
    if (confirmPasswordInput) confirmPasswordInput.required = isRegister;
    if (verificationCodeInput) verificationCodeInput.required = isVerify;
    if (resetCodeInput) resetCodeInput.required = isConfirmReset;
    if (newPasswordInput) newPasswordInput.required = isConfirmReset;
    if (confirmNewPasswordInput) confirmNewPasswordInput.required = isConfirmReset;

    if (firstNameInput) firstNameInput.required = isRegister;
    if (lastNameInput) lastNameInput.required = isRegister;
    if (usernameInput) usernameInput.required = isRegister;
    if (phoneInput) phoneInput.required = isRegister;
    if (countryInput) countryInput.required = isRegister;

    if (verificationHint) {
        verificationHint.textContent = isVerify
            ? formatVerificationHelp(data)
            : "We will send a 6-digit verification code to your email before creating the account.";
    }

    if (resetHint) {
        resetHint.textContent = isConfirmReset
            ? formatResetHelp(data)
            : "We will send a 6-digit reset code to your email.";
    }

    if (isLogin) {
        formTitle.textContent = "Log In";
        formSubtitle.textContent = "Welcome back. Continue your chess journey.";
        submitButton.textContent = "Log In";
        modeToggle.textContent = "No account? Register";
        pendingVerificationEmail = "";
        pendingResetEmail = "";
        return;
    }

    if (isRegister) {
        formTitle.textContent = "Register";
        formSubtitle.textContent = "Create your account to start playing.";
        submitButton.textContent = "Register";
        modeToggle.textContent = "Already have an account? Log In";
        pendingVerificationEmail = "";
        pendingResetEmail = "";
        if (countryInput) countryInput.value = "Nepal";
        return;
    }

    if (isVerify) {
        pendingVerificationEmail = data.email || pendingVerificationEmail || emailInput?.value.trim().toLowerCase() || "";
        formTitle.textContent = "Verify Account";
        formSubtitle.textContent = "Enter the verification code to finish creating your account.";
        submitButton.textContent = "Verify Code";
        modeToggle.textContent = "Back to Log In";
        if (emailInput) emailInput.value = pendingVerificationEmail;
        verificationCodeInput?.focus();
        return;
    }

    if (isRequestReset) {
        formTitle.textContent = "Reset Password";
        formSubtitle.textContent = "Enter your email and we will send you a reset code.";
        submitButton.textContent = "Send Reset Code";
        modeToggle.textContent = "Back to Log In";
        pendingVerificationEmail = "";
        pendingResetEmail = "";
        return;
    }

    pendingResetEmail = data.email || pendingResetEmail || emailInput?.value.trim().toLowerCase() || "";
    formTitle.textContent = "Enter Reset Code";
    formSubtitle.textContent = "Use the code from your email to set a new password.";
    submitButton.textContent = "Reset Password";
    modeToggle.textContent = "Back to Log In";
    if (emailInput) emailInput.value = pendingResetEmail;
    resetCodeInput?.focus();
}

function validateNepalPhone(phone) {
    return /^(?:\+?977)?(?:9[78]\d{8})$/.test(phone.replace(/[\s()-]/g, ""));
}

function validatePasswordMatch(password, confirmation, mismatchTitle) {
    if (password.length < 8) {
        appUi.notify("Password must be at least 8 characters long.", {
            title: "Check your password",
            tone: "warning"
        });
        return false;
    }

    if (password !== confirmation) {
        appUi.notify("The password and confirmation do not match yet.", {
            title: mismatchTitle,
            tone: "warning"
        });
        return false;
    }

    return true;
}

if (modeToggle) {
    modeToggle.addEventListener("click", () => {
        applyView(currentView === AUTH_VIEWS.LOGIN ? AUTH_VIEWS.REGISTER : AUTH_VIEWS.LOGIN);
    });
}

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", () => {
        applyView(AUTH_VIEWS.REQUEST_RESET);
    });
}

if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener("click", () => {
        const showPassword = passwordInput.type === "password";
        passwordInput.type = showPassword ? "text" : "password";
        passwordToggle.classList.toggle("is-visible", showPassword);
        passwordToggle.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
        passwordToggle.setAttribute("title", showPassword ? "Hide password" : "Show password");
    });
}

async function postAuthRequest(endpoint, payload) {
    const apiBases = ["http://127.0.0.1:7000", "http://localhost:7000"];
    let lastError = null;

    for (const base of apiBases) {
        try {
            return await fetch(`${base}/api/auth/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Unable to connect to auth server");
}

if (loginForm) {
    applyView(AUTH_VIEWS.LOGIN);

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput?.value.trim().toLowerCase() || "";
        const password = passwordInput?.value || "";

        try {
            if (currentView === AUTH_VIEWS.VERIFY_REGISTRATION) {
                const response = await postAuthRequest("verify-registration", {
                    email: pendingVerificationEmail || email,
                    code: verificationCodeInput?.value.trim() || ""
                });
                const data = await response.json();

                if (!response.ok) {
                    appUi.notify(data.error || "Verification failed.", {
                        title: "Could not verify account",
                        tone: "error"
                    });
                    return;
                }

                completeLogin(data, pendingVerificationEmail || email);
                return;
            }

            if (currentView === AUTH_VIEWS.REQUEST_RESET) {
                const response = await postAuthRequest("forgot-password", { email });
                const data = await response.json();

                if (!response.ok) {
                    appUi.notify(data.error || "Could not send the reset code.", {
                        title: "Reset failed",
                        tone: "error"
                    });
                    return;
                }

                pendingResetEmail = email;
                appUi.notify(data.message || "Reset code sent.", {
                    title: "Check your email",
                    tone: "success"
                });
                applyView(AUTH_VIEWS.CONFIRM_RESET, {
                    email,
                    deliveryMethod: data.deliveryMethod,
                    devVerificationCode: data.devVerificationCode
                });
                return;
            }

            if (currentView === AUTH_VIEWS.CONFIRM_RESET) {
                const newPassword = newPasswordInput?.value || "";
                const confirmNewPassword = confirmNewPasswordInput?.value || "";
                if (!validatePasswordMatch(newPassword, confirmNewPassword, "Passwords do not match")) {
                    return;
                }

                const response = await postAuthRequest("reset-password", {
                    email: pendingResetEmail || email,
                    code: resetCodeInput?.value.trim() || "",
                    newPassword
                });
                const data = await response.json();

                if (!response.ok) {
                    appUi.notify(data.error || "Could not reset the password.", {
                        title: "Reset failed",
                        tone: "error"
                    });
                    return;
                }

                appUi.notify(data.message || "Password updated.", {
                    title: "Password reset",
                    tone: "success"
                });
                if (passwordInput) passwordInput.value = "";
                applyView(AUTH_VIEWS.LOGIN, { email: pendingResetEmail || email });
                return;
            }

            if (currentView === AUTH_VIEWS.REGISTER) {
                const confirmPassword = confirmPasswordInput?.value || "";
                const phone = phoneInput?.value.trim() || "";
                if (!validatePasswordMatch(password, confirmPassword, "Passwords do not match")) {
                    return;
                }

                if (!validateNepalPhone(phone)) {
                    appUi.notify("Please enter a valid Nepal mobile number.", {
                        title: "Phone number needed",
                        tone: "warning"
                    });
                    return;
                }

                const response = await postAuthRequest("register", {
                    firstName: firstNameInput?.value.trim() || "",
                    lastName: lastNameInput?.value.trim() || "",
                    username: usernameInput?.value.trim() || "",
                    phone,
                    country: countryInput?.value || "Nepal",
                    email,
                    password
                });

                const raw = await response.text();
                let data = {};
                try {
                    data = raw ? JSON.parse(raw) : {};
                } catch {
                    data = { error: raw || "Unexpected server response" };
                }

                if (!response.ok) {
                    appUi.notify(data.error || "Registration failed.", {
                        title: "Could not register",
                        tone: "error"
                    });
                    return;
                }

                pendingVerificationEmail = data.email || email;
                appUi.notify("Verification code sent. Enter it to finish your account.", {
                    title: "Check your email",
                    tone: "success"
                });
                applyView(AUTH_VIEWS.VERIFY_REGISTRATION, data);
                return;
            }

            const response = await postAuthRequest("login", { email, password });
            const raw = await response.text();
            let data = {};

            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                data = { error: raw || "Unexpected server response" };
            }

            if (!response.ok) {
                if (data.requiresVerification) {
                    pendingVerificationEmail = data.email || email;
                    appUi.notify(data.error || "Please verify your account first.", {
                        title: "Verification needed",
                        tone: "warning",
                        duration: 3600
                    });
                    applyView(AUTH_VIEWS.VERIFY_REGISTRATION, data);
                    return;
                }

                appUi.notify(data.error || "Login failed.", {
                    title: "Could not log in",
                    tone: "error",
                    duration: 3600
                });
                return;
            }

            completeLogin(data, email);
        } catch (error) {
            console.error(error);
            appUi.notify("Cannot connect to the server right now. Please make sure the backend is running on port 7000.", {
                title: "Connection problem",
                tone: "error",
                duration: 4200
            });
        }
    });
}

resendVerificationBtn?.addEventListener("click", async () => {
    const email = pendingVerificationEmail || emailInput?.value.trim().toLowerCase() || "";

    try {
        const response = await postAuthRequest("resend-verification", { email });
        const data = await response.json();

        if (!response.ok) {
            appUi.notify(data.error || "Unable to resend the verification code.", {
                title: "Resend failed",
                tone: "error"
            });
            return;
        }

        if (verificationHint) {
            verificationHint.textContent = formatVerificationHelp(data);
        }

        appUi.notify("A fresh verification code has been sent.", {
            title: "Code sent",
            tone: "success"
        });
    } catch (error) {
        console.error(error);
        appUi.notify("Cannot connect to the server right now. Please make sure the backend is running on port 7000.", {
            title: "Connection problem",
            tone: "error",
            duration: 4200
        });
    }
});

resendResetBtn?.addEventListener("click", async () => {
    const email = pendingResetEmail || emailInput?.value.trim().toLowerCase() || "";

    try {
        const response = await postAuthRequest("forgot-password", { email });
        const data = await response.json();

        if (!response.ok) {
            appUi.notify(data.error || "Unable to resend the reset code.", {
                title: "Resend failed",
                tone: "error"
            });
            return;
        }

        if (resetHint) {
            resetHint.textContent = formatResetHelp({
                email,
                deliveryMethod: data.deliveryMethod,
                devVerificationCode: data.devVerificationCode
            });
        }

        appUi.notify("A fresh reset code has been sent.", {
            title: "Code sent",
            tone: "success"
        });
    } catch (error) {
        console.error(error);
        appUi.notify("Cannot connect to the server right now. Please make sure the backend is running on port 7000.", {
            title: "Connection problem",
            tone: "error",
            duration: 4200
        });
    }
});
