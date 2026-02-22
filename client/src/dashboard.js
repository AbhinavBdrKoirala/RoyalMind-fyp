const token = localStorage.getItem("token");

if (!token) {
    alert("You must login first");
    window.location.href = "index.html";
}


function goTo(page) {
    window.location.href = page;
}

function logout() {
    localStorage.removeItem("royalmindUser");
    window.location.href = "index.html";
}
fetch("http://localhost:7000/api/protected", {
    method: "GET",
    headers: {
        "Authorization": "Bearer " + token
    }
})
.then(res => res.json())
.then(data => {
    console.log(data);
});