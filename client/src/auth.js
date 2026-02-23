const loginForm = document.getElementById("loginForm");
const modeToggle = document.getElementById("modeToggle");
const passwordToggle = document.getElementById("passwordToggle");
const passwordInput = document.getElementById("password");
const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");
const submitButton = document.getElementById("submitButton");

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
    } else {
        formTitle.textContent = "Log In";
        formSubtitle.textContent = "Welcome back. Continue your chess journey.";
        submitButton.textContent = "Log In";
        modeToggle.textContent = "No account? Register";
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
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const endpoint = isRegisterMode ? "register" : "login";

        try {
            const response = await fetch(`http://localhost:7000/api/auth/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                if (isRegisterMode) {
                    alert("Registration successful. Please log in.");
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
