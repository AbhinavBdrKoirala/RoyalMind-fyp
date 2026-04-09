const loginForm = document.getElementById("loginForm");
const modeToggle = document.getElementById("modeToggle");
const passwordToggle = document.getElementById("passwordToggle");
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
const verificationFields = document.getElementById("verificationFields");
const verificationCodeInput = document.getElementById("verificationCode");
const verificationHint = document.getElementById("verificationHint");
const resendVerificationBtn = document.getElementById("resendVerificationBtn");
const appUi = window.RoyalMindUI || {
    notify: () => {},
    confirm: async () => false
};

let isRegisterMode = false;
let awaitingVerification = false;
let pendingVerificationEmail = "";

function formatVerificationHelp(data) {
    if (data?.deliveryMethod === "email") {
        return `A 6-digit verification code was sent to ${data.email}.`;
    }

    if (data?.devVerificationCode) {
        return `Email sending is not configured yet. Use this local verification code: ${data.devVerificationCode}`;
    }

    return "Enter the 6-digit verification code sent to your email.";
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

function setMode(registerMode) {
    isRegisterMode = registerMode;
    awaitingVerification = false;
    pendingVerificationEmail = "";

    if (!modeToggle || !submitButton || !formTitle || !formSubtitle) {
        return;
    }

    if (isRegisterMode) {
        formTitle.textContent = "Register";
        formSubtitle.textContent = "Create your account to start playing.";
        submitButton.textContent = "Register";
        modeToggle.textContent = "Already have an account? Log In";
        if (registerFields) registerFields.classList.remove("hidden");
        if (confirmPasswordInput) confirmPasswordInput.classList.remove("hidden");
        if (verificationFields) verificationFields.classList.add("hidden");
        if (resendVerificationBtn) resendVerificationBtn.classList.add("hidden");
        if (verificationCodeInput) verificationCodeInput.required = false;
        if (verificationHint) verificationHint.textContent = "We will send a 6-digit verification code to your email before creating the account.";

        if (firstNameInput) firstNameInput.required = true;
        if (lastNameInput) lastNameInput.required = true;
        if (usernameInput) usernameInput.required = true;
        if (phoneInput) phoneInput.required = true;
        if (countryInput) countryInput.required = true;
        if (confirmPasswordInput) confirmPasswordInput.required = true;
        if (countryInput) countryInput.value = "Nepal";
    } else {
        formTitle.textContent = "Log In";
        formSubtitle.textContent = "Welcome back. Continue your chess journey.";
        submitButton.textContent = "Log In";
        modeToggle.textContent = "No account? Register";
        if (registerFields) registerFields.classList.add("hidden");
        if (confirmPasswordInput) confirmPasswordInput.classList.add("hidden");
        if (verificationFields) verificationFields.classList.add("hidden");
        if (resendVerificationBtn) resendVerificationBtn.classList.add("hidden");
        if (verificationCodeInput) verificationCodeInput.required = false;
        if (verificationCodeInput) verificationCodeInput.value = "";
        if (verificationHint) verificationHint.textContent = "We will send a 6-digit verification code to your email before creating the account.";

        if (firstNameInput) firstNameInput.required = false;
        if (lastNameInput) lastNameInput.required = false;
        if (usernameInput) usernameInput.required = false;
        if (phoneInput) phoneInput.required = false;
        if (countryInput) countryInput.required = false;
        if (confirmPasswordInput) confirmPasswordInput.required = false;
    }
}

function enterVerificationStep(data = {}) {
    awaitingVerification = true;
    pendingVerificationEmail = data.email || (document.getElementById("email")?.value.trim().toLowerCase() || "");

    if (formTitle) formTitle.textContent = "Verify Account";
    if (formSubtitle) formSubtitle.textContent = "Enter the verification code to finish creating your account.";
    if (submitButton) submitButton.textContent = "Verify Code";
    if (modeToggle) modeToggle.textContent = "Back to Log In";
    if (confirmPasswordInput) confirmPasswordInput.classList.add("hidden");
    if (verificationFields) verificationFields.classList.remove("hidden");
    if (verificationCodeInput) {
        verificationCodeInput.required = true;
        verificationCodeInput.value = "";
        verificationCodeInput.focus();
    }
    if (verificationHint) {
        verificationHint.textContent = formatVerificationHelp(data);
    }
    if (resendVerificationBtn) {
        resendVerificationBtn.classList.remove("hidden");
    }
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

if (modeToggle) {
    modeToggle.addEventListener("click", () => {
        setMode(!isRegisterMode);
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

if (loginForm) {
    setMode(false);

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const endpoint = isRegisterMode ? "register" : "login";

        if (isRegisterMode && awaitingVerification) {
            try {
                const response = await postAuthRequest("verify-registration", {
                    email: pendingVerificationEmail || email,
                    code: verificationCodeInput ? verificationCodeInput.value.trim() : ""
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
            } catch (error) {
                console.error(error);
                appUi.notify("Cannot connect to the server right now. Please make sure the backend is running on port 7000.", {
                    title: "Connection problem",
                    tone: "error",
                    duration: 4200
                });
                return;
            }
        }

        if (isRegisterMode) {
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";
            const phone = phoneInput ? phoneInput.value.trim() : "";

            if (password.length < 8) {
                appUi.notify("Password must be at least 8 characters long.", {
                    title: "Check your password",
                    tone: "warning"
                });
                return;
            }

            if (password !== confirmPassword) {
                appUi.notify("The password and confirmation do not match yet.", {
                    title: "Passwords do not match",
                    tone: "warning"
                });
                return;
            }

            if (!/^(?:\+?977)?(?:9[78]\d{8})$/.test(phone.replace(/[\s()-]/g, ""))) {
                appUi.notify("Please enter a valid Nepal mobile number.", {
                    title: "Phone number needed",
                    tone: "warning"
                });
                return;
            }
        }

        try {
            const payload = isRegisterMode
                ? {
                    firstName: firstNameInput ? firstNameInput.value.trim() : "",
                    lastName: lastNameInput ? lastNameInput.value.trim() : "",
                    username: usernameInput ? usernameInput.value.trim() : "",
                    phone: phoneInput ? phoneInput.value.trim() : "",
                    country: countryInput ? countryInput.value : "",
                    email,
                    password
                }
                : { email, password };

            const response = await postAuthRequest(endpoint, payload);

            const raw = await response.text();
            let data = {};

            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                data = { error: raw || "Unexpected server response" };
            }

            if (response.ok) {
                if (isRegisterMode) {
                    appUi.notify("Verification code sent. Enter it to finish your account.", {
                        title: "Check your email",
                        tone: "success"
                    });
                    enterVerificationStep(data);
                    return;
                }

                completeLogin(data, email);
            } else {
                if (!isRegisterMode) {
                    if (data.requiresVerification) {
                        setMode(true);
                        enterVerificationStep(data);
                        appUi.notify(data.error || "Please verify your account first.", {
                            title: "Verification needed",
                            tone: "warning",
                            duration: 3600
                        });
                        return;
                    }
                    appUi.notify(data.error || "Login failed.", {
                        title: "Could not log in",
                        tone: "error",
                        duration: 3600
                    });
                } else {
                    appUi.notify(data.error || "Registration failed.", {
                        title: "Could not register",
                        tone: "error"
                    });
                }
            }

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
    const email = pendingVerificationEmail || document.getElementById("email")?.value.trim().toLowerCase();
    const phone = phoneInput ? phoneInput.value.trim() : "";

    try {
        const response = await postAuthRequest("resend-verification", { email, phone });
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
