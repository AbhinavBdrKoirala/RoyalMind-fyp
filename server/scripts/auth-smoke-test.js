const baseUrl = process.env.AUTH_SMOKE_BASE_URL || "http://127.0.0.1:7000";

async function post(path, payload, token = "") {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!response.ok) {
        const error = new Error(data.error || `Request failed for ${path}`);
        error.status = response.status;
        error.payload = data;
        throw error;
    }

    return data;
}

function requireDevCode(data, path) {
    if (!data.devVerificationCode) {
        throw new Error(`Expected a development verification code from ${path}. Start the backend with Gmail disabled or MAIL_FORCE_DEV=true for smoke testing.`);
    }

    return data.devVerificationCode;
}

async function main() {
    const stamp = `${Date.now()}`;
    const userOne = {
        firstName: "Smoke",
        lastName: "One",
        username: `smokeone${stamp.slice(-6)}`,
        phone: `98${stamp.slice(-8)}`,
        country: "Nepal",
        email: `smoke.one.${stamp}@example.com`,
        password: "password123"
    };

    const userTwo = {
        firstName: "Smoke",
        lastName: "Two",
        username: `smoketwo${stamp.slice(-5)}`,
        phone: `97${stamp.slice(-8)}`,
        country: "Nepal",
        email: `smoke.two.${stamp}@example.com`,
        password: "password123"
    };

    console.log("Registering two fresh users...");
    const registrationOne = await post("/api/auth/register", userOne);
    const registrationTwo = await post("/api/auth/register", userTwo);
    const codeOne = requireDevCode(registrationOne, "/api/auth/register");
    const codeTwo = requireDevCode(registrationTwo, "/api/auth/register");

    console.log("Verifying both accounts...");
    await post("/api/auth/verify-registration", { email: userOne.email, code: codeOne });
    await post("/api/auth/verify-registration", { email: userTwo.email, code: codeTwo });

    console.log("Logging in first user...");
    const loginOne = await post("/api/auth/login", {
        email: userOne.email,
        password: userOne.password
    });

    console.log("Requesting password reset...");
    const resetRequest = await post("/api/auth/forgot-password", { email: userOne.email });
    const resetCode = requireDevCode(resetRequest, "/api/auth/forgot-password");
    const newPassword = "password456";

    await post("/api/auth/reset-password", {
        email: userOne.email,
        code: resetCode,
        newPassword
    });

    console.log("Logging in with new password...");
    const loginAfterReset = await post("/api/auth/login", {
        email: userOne.email,
        password: newPassword
    });

    console.log("Testing email change...");
    const nextEmail = `smoke.one.updated.${stamp}@example.com`;
    const emailChangeRequest = await post("/api/auth/change-email/request", {
        newEmail: nextEmail,
        password: newPassword
    }, loginOne.token);
    const emailChangeCode = requireDevCode(emailChangeRequest, "/api/auth/change-email/request");

    await post("/api/auth/change-email/confirm", {
        code: emailChangeCode
    }, loginOne.token);

    console.log("Logging in with updated email...");
    await post("/api/auth/login", {
        email: nextEmail,
        password: newPassword
    });

    console.log("Testing logged-in password change...");
    const authenticatedPasswordChange = await post("/api/auth/change-password/request", {}, loginAfterReset.token);
    const authenticatedResetCode = requireDevCode(authenticatedPasswordChange, "/api/auth/change-password/request");
    const finalPassword = "password789";

    await post("/api/auth/change-password/confirm", {
        code: authenticatedResetCode,
        newPassword: finalPassword
    }, loginAfterReset.token);

    console.log("Logging in with the final password...");
    await post("/api/auth/login", {
        email: nextEmail,
        password: finalPassword
    });

    console.log("Auth smoke test completed successfully.");
}

main().catch((error) => {
    console.error("Auth smoke test failed.");
    console.error(error.message);
    if (error.payload) {
        console.error(JSON.stringify(error.payload, null, 2));
    }
    process.exit(1);
});
