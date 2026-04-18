const crypto = require("crypto");
const dns = require("dns");
const nodemailer = require("nodemailer");
const { getJwtSecret } = require("./jwt");

let cachedTransporter = null;
let cachedTransporterKey = "";

try {
    dns.setDefaultResultOrder("ipv4first");
} catch {
    // Ignore environments that do not support overriding DNS result order.
}

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

function isProductionEnvironment() {
    return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function canUseDevMailFallback() {
    if (String(process.env.MAIL_FORCE_DEV || "").toLowerCase() === "true") {
        return true;
    }

    return !isProductionEnvironment();
}

function shouldForceDevMail() {
    return String(process.env.MAIL_FORCE_DEV || "").toLowerCase() === "true";
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
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
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
    if (shouldForceDevMail()) {
        return {
            delivered: false,
            mode: "dev"
        };
    }

    if (!isMailConfigured()) {
        if (!canUseDevMailFallback()) {
            const error = new Error("Email delivery is not configured on the server.");
            error.code = "EMAIL_NOT_CONFIGURED";
            throw error;
        }

        return {
            delivered: false,
            mode: "dev"
        };
    }

    const transporter = getTransporter();
    await transporter.sendMail({
        from: getMailFromAddress(),
        to: email,
        ...buildCodeEmail({
            displayName,
            code,
            subject: "RoyalMind verification code",
            intro: "Your RoyalMind verification code is:",
            footer: "It expires in 10 minutes."
        })
    });

    return {
        delivered: true,
        mode: "email"
    };
}

async function sendPasswordResetEmail({ email, displayName, code }) {
    if (shouldForceDevMail()) {
        return {
            delivered: false,
            mode: "dev"
        };
    }

    if (!isMailConfigured()) {
        if (!canUseDevMailFallback()) {
            const error = new Error("Email delivery is not configured on the server.");
            error.code = "EMAIL_NOT_CONFIGURED";
            throw error;
        }

        return {
            delivered: false,
            mode: "dev"
        };
    }

    const transporter = getTransporter();
    await transporter.sendMail({
        from: getMailFromAddress(),
        to: email,
        ...buildCodeEmail({
            displayName,
            code,
            subject: "RoyalMind password reset code",
            intro: "Use this code to reset your RoyalMind password:",
            footer: "If you did not request this, you can ignore this email."
        })
    });

    return {
        delivered: true,
        mode: "email"
    };
}

async function sendPendingEmailVerification({ email, displayName, code }) {
    if (shouldForceDevMail()) {
        return {
            delivered: false,
            mode: "dev"
        };
    }

    if (!isMailConfigured()) {
        if (!canUseDevMailFallback()) {
            const error = new Error("Email delivery is not configured on the server.");
            error.code = "EMAIL_NOT_CONFIGURED";
            throw error;
        }

        return {
            delivered: false,
            mode: "dev"
        };
    }

    const transporter = getTransporter();
    await transporter.sendMail({
        from: getMailFromAddress(),
        to: email,
        ...buildCodeEmail({
            displayName,
            code,
            subject: "Confirm your new RoyalMind email",
            intro: "Use this code to confirm your new RoyalMind email address:",
            footer: "It expires in 10 minutes."
        })
    });

    return {
        delivered: true,
        mode: "email"
    };
}

function buildCodeEmail({ displayName, code, subject, intro, footer }) {
    return {
        subject,
        text: [
            `Hello ${displayName || "Player"},`,
            "",
            intro,
            code,
            "",
            footer
        ].join("\n"),
        html: `
            <div style="font-family:Segoe UI,Arial,sans-serif;color:#132017;">
                <p>Hello ${escapeHtml(displayName || "Player")},</p>
                <p>${escapeHtml(intro)}</p>
                <p style="font-size:28px;font-weight:700;letter-spacing:6px;">${escapeHtml(code)}</p>
                <p>${escapeHtml(footer)}</p>
            </div>
        `
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
    sendPasswordResetEmail,
    sendPendingEmailVerification,
    sendVerificationEmail
};
