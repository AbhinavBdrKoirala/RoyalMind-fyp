const assert = require("node:assert/strict");

const { getJwtSecret } = require("../utils/jwt");
const {
    sanitizeSettings,
    validateGameStartPayload,
    validateGameUpdatePayload,
    validateLoginPayload,
    validateRegisterPayload,
    validateSettingsPayload
} = require("../utils/validation");

let failures = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}`);
        console.error(error.stack);
    }
}

runTest("getJwtSecret returns the configured environment secret", () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-secret";

    try {
        assert.equal(getJwtSecret(), "test-secret");
    } finally {
        process.env.JWT_SECRET = original;
    }
});

runTest("getJwtSecret throws when the secret is missing", () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
        assert.throws(() => getJwtSecret(), /JWT_SECRET is not configured/);
    } finally {
        process.env.JWT_SECRET = original;
    }
});

runTest("validateRegisterPayload normalizes and accepts valid registration data", () => {
    const result = validateRegisterPayload({
        firstName: "  Ada ",
        lastName: " Lovelace ",
        username: "  ada ",
        phone: "+1 555 123 4567",
        country: "United Kingdom",
        email: " Ada@example.com ",
        password: "password123"
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.value, {
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
        phone: "+1 555 123 4567",
        country: "United Kingdom",
        email: "ada@example.com",
        password: "password123",
        displayName: "ada"
    });
});

runTest("validateLoginPayload rejects malformed login data", () => {
    assert.deepEqual(validateLoginPayload({ email: "", password: "" }), {
        ok: false,
        error: "Email and password are required"
    });

    assert.deepEqual(validateLoginPayload({ email: "not-an-email", password: "secret123" }), {
        ok: false,
        error: "Invalid email format"
    });
});

runTest("sanitizeSettings accepts valid persisted settings", () => {
    const result = sanitizeSettings({
        language: "English",
        autoQueen: true,
        privacyHistory: false
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.value, {
        language: "English",
        autoQueen: true,
        privacyHistory: false
    });
});

runTest("validateSettingsPayload rejects invalid setting values", () => {
    assert.deepEqual(validateSettingsPayload({
        displayName: "Player One",
        settings: {
            language: "German"
        }
    }), {
        ok: false,
        error: "Invalid value for language"
    });

    assert.deepEqual(validateSettingsPayload({
        settings: {
            autoQueen: "yes"
        }
    }), {
        ok: false,
        error: "Invalid value for autoQueen"
    });
});

runTest("validateGameStartPayload rejects non-array moves", () => {
    assert.deepEqual(validateGameStartPayload({
        opponent: "Local",
        moves: "e4"
    }), {
        ok: false,
        error: "Moves must be an array"
    });
});

runTest("validateGameUpdatePayload rejects malformed move objects and invalid status", () => {
    assert.deepEqual(validateGameUpdatePayload(12, {
        status: "paused"
    }), {
        ok: false,
        error: "Invalid status"
    });

    assert.deepEqual(validateGameUpdatePayload(12, {
        moves: [
            {
                fromRow: 6,
                fromCol: 4,
                toRow: 4,
                toCol: 4,
                piece: "white-pawn"
            }
        ]
    }), {
        ok: false,
        error: "Move 1 has an invalid piece"
    });
});

if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
}

console.log("\nAll validation tests passed.");
