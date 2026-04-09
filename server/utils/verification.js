const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { getJwtSecret } = require("./jwt");

let cachedTransporter = null;

function getVerificationSecret() {
    return process.env.VERIFICATION_SECRET || getJwtSecret();
}

function generateVerificationCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashVerificationCode(code) {
    return crypto
        .createHash("sha256")
        .update(`${code}:${getVerificationSecret()}`)
        .digest("hex");
}

function isMailConfigured() {
    return Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        process.env.MAIL_FROM
    );
}

function getTransporter() {
    if (cachedTransporter) return cachedTransporter;

    cachedTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    return cachedTransporter;
}

async function sendVerificationEmail({ email, displayName, code }) {
    if (!isMailConfigured()) {
        return {
            delivered: false,
            mode: "dev"
        };
    }

    const transporter = getTransporter();
    await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: "RoyalMind verification code",
        text: [
            `Hello ${displayName || "Player"},`,
            "",
            `Your RoyalMind verification code is: ${code}`,
            "",
            "It expires in 10 minutes."
        ].join("\n"),
        html: `
            <div style="font-family:Segoe UI,Arial,sans-serif;color:#132017;">
                <p>Hello ${escapeHtml(displayName || "Player")},</p>
                <p>Your RoyalMind verification code is:</p>
                <p style="font-size:28px;font-weight:700;letter-spacing:6px;">${escapeHtml(code)}</p>
                <p>It expires in 10 minutes.</p>
            </div>
        `
    });

    return {
        delivered: true,
        mode: "email"
    };
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

module.exports = {
    generateVerificationCode,
    hashVerificationCode,
    isMailConfigured,
    sendVerificationEmail
};
