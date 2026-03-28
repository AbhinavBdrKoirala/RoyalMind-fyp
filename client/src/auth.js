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
const appUi = window.RoyalMindUI || {
    notify: () => {},
    confirm: async () => false
};

let isRegisterMode = false;

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

        if (firstNameInput) firstNameInput.required = true;
        if (lastNameInput) lastNameInput.required = true;
        if (usernameInput) usernameInput.required = true;
        if (phoneInput) phoneInput.required = true;
        if (countryInput) countryInput.required = true;
        if (confirmPasswordInput) confirmPasswordInput.required = true;
    } else {
        formTitle.textContent = "Log In";
        formSubtitle.textContent = "Welcome back. Continue your chess journey.";
        submitButton.textContent = "Log In";
        modeToggle.textContent = "No account? Register";
        if (registerFields) registerFields.classList.add("hidden");
        if (confirmPasswordInput) confirmPasswordInput.classList.add("hidden");

        if (firstNameInput) firstNameInput.required = false;
        if (lastNameInput) lastNameInput.required = false;
        if (usernameInput) usernameInput.required = false;
        if (phoneInput) phoneInput.required = false;
        if (countryInput) countryInput.required = false;
        if (confirmPasswordInput) confirmPasswordInput.required = false;
    }
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

            if (!/^[+]?[0-9()\-\s]{7,20}$/.test(phone)) {
                appUi.notify("Please enter a valid phone number.", {
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
                    appUi.notify("Your account has been created. Log in to start playing.", {
                        title: "Registration successful",
                        tone: "success"
                    });
                    loginForm.reset();
                    setMode(false);
                    return;
                }

                const storedUser = buildStoredUser(data.user, email);
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
            } else {
                if (!isRegisterMode) {
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
