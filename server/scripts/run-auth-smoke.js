const path = require("path");
const { spawn } = require("child_process");

const serverDir = path.join(__dirname, "..");
const serverEntry = path.join(serverDir, "index.js");
const smokeEntry = path.join(__dirname, "auth-smoke-test.js");
const smokePort = process.env.AUTH_SMOKE_PORT || "7001";
const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(smokeBaseUrl);
            if (response.ok) {
                return;
            }
        } catch {
            // keep waiting
        }

        await wait(500);
    }

    throw new Error(`Timed out waiting for auth smoke test server on ${smokeBaseUrl}`);
}

async function main() {
    const serverProcess = spawn(process.execPath, [serverEntry], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: smokePort,
            MAIL_FORCE_DEV: "true"
        },
        stdio: ["ignore", "pipe", "pipe"]
    });

    serverProcess.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
    });

    serverProcess.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
    });

    try {
        await waitForServer();

        const smokeProcess = spawn(process.execPath, [smokeEntry], {
            cwd: serverDir,
            env: {
                ...process.env,
                AUTH_SMOKE_BASE_URL: smokeBaseUrl
            },
            stdio: "inherit"
        });

        const exitCode = await new Promise((resolve, reject) => {
            smokeProcess.on("error", reject);
            smokeProcess.on("exit", resolve);
        });

        if (exitCode !== 0) {
            process.exitCode = exitCode || 1;
        }
    } finally {
        if (!serverProcess.killed) {
            serverProcess.kill();
        }
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
