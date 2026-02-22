const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        try {
            const response = await fetch("http://localhost:7000/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Save token
                localStorage.setItem("token", data.token);

                alert("Login successful!");

                // Redirect to dashboard
                window.location.href = "dashboard.html";
            } else {
                alert(data.error || "Login failed");
            }

        } catch (error) {
            console.error(error);
            alert("Server error");
        }
    });
}