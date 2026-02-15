// Protect page
if (!localStorage.getItem("royalmindUser")) {
    window.location.href = "index.html";
}

function goTo(page) {
    window.location.href = page;
}

function logout() {
    localStorage.removeItem("royalmindUser");
    window.location.href = "index.html";
}
