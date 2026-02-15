const form = document.getElementById("loginForm");

form.addEventListener("submit", function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    // Simple demo login (replace later with real backend)
    if (username === "admin" && password === "1234") {
        localStorage.setItem("royalmindUser", username);
        window.location.href = "dashboard.html";
    } else {
        alert("Invalid credentials");
    }
});
