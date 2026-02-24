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

let isRegisterMode = false;

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
                alert("Password must be at least 8 characters long.");
                return;
            }

            if (password !== confirmPassword) {
                alert("Passwords do not match.");
                return;
            }

            if (!/^[+]?[0-9()\-\s]{7,20}$/.test(phone)) {
                alert("Please enter a valid phone number.");
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

            const response = await fetch(`http://localhost:7000/api/auth/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                if (isRegisterMode) {
                    alert("Registration successful. Please log in.");
                    loginForm.reset();
                    setMode(false);
                    return;
                }

                localStorage.setItem("token", data.token);

                alert("Login successful!");

                window.location.href = "dashboard.html";
            } else {
                if (!isRegisterMode) {
                    const wantsRegister = confirm((data.error || "Login failed.") + " No account found? Register now?");
                    if (wantsRegister) {
                        setMode(true);
                    }
                } else {
                    alert(data.error || "Registration failed");
                }
            }

        } catch (error) {
            console.error(error);
            alert("Server error");
        }
    });
}
