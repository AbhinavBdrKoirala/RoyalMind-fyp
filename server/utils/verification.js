const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { getJwtSecret } = require("./jwt");

let cachedTransporter = null;
let cachedTransporterKey = "";

const PLACEHOLDER_VALUES = new Set([
    "",
    "yourgmail@gmail.com",
    "your_16_character_app_password",
    "RoyalMind <yourgmail@gmail.com>",
    "replace_with_a_strong_random_secret"
]);

function hasConfiguredValue(value) {
    const normalized = String(value || "").trim();
    return normalized && !PLACEHOLDER_VALUES.has(normalized);
}

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
    const hasGmailConfig = Boolean(
        hasConfiguredValue(process.env.GMAIL_USER) &&
        hasConfiguredValue(process.env.GMAIL_APP_PASSWORD)
    );

    if (hasGmailConfig) {
        return true;
    }

    return Boolean(
        hasConfiguredValue(process.env.SMTP_HOST) &&
        hasConfiguredValue(process.env.SMTP_PORT) &&
        hasConfiguredValue(process.env.SMTP_USER) &&
        hasConfiguredValue(process.env.SMTP_PASS) &&
        hasConfiguredValue(process.env.MAIL_FROM)
    );
}

function getTransporter() {
    const transporterKey = JSON.stringify({
        gmailUser: process.env.GMAIL_USER || "",
        smtpHost: process.env.SMTP_HOST || "",
        smtpPort: process.env.SMTP_PORT || "",
        smtpUser: process.env.SMTP_USER || ""
    });

    if (cachedTransporter && cachedTransporterKey === transporterKey) {
        return cachedTransporter;
    }

    if (hasConfiguredValue(process.env.GMAIL_USER) && hasConfiguredValue(process.env.GMAIL_APP_PASSWORD)) {
        cachedTransporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
        cachedTransporterKey = transporterKey;
        return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    cachedTransporterKey = transporterKey;

    return cachedTransporter;
}

function getMailFromAddress() {
    return process.env.MAIL_FROM || process.env.GMAIL_USER || process.env.SMTP_USER || "";
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
        from: getMailFromAddress(),
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
