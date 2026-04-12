const crypto = require("crypto");

const DEFAULT_SIGNED_FIELDS = "total_amount,transaction_uuid,product_code";
const DEFAULT_RESPONSE_SIGNED_FIELDS = "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";

function isEsewaTestMode() {
    return String(process.env.ESEWA_TEST_MODE || "").toLowerCase() !== "false";
}

function getEsewaConfig() {
    const testMode = isEsewaTestMode();
    const productCode = process.env.ESEWA_PRODUCT_CODE || (testMode ? "EPAYTEST" : "");
    const secretKey = process.env.ESEWA_SECRET_KEY || (testMode ? "8gBm/:&EnhH.1/q(" : "");

    return {
        testMode,
        productCode,
        secretKey,
        formUrl: process.env.ESEWA_FORM_URL || (
            testMode
                ? "https://rc-epay.esewa.com.np/api/epay/main/v2/form"
                : "https://epay.esewa.com.np/api/epay/main/v2/form"
        ),
        statusUrlBase: process.env.ESEWA_STATUS_URL || (
            testMode
                ? "https://rc.esewa.com.np/api/epay/transaction/status/"
                : "https://esewa.com.np/api/epay/transaction/status/"
        ),
        successBaseUrl: process.env.ESEWA_SUCCESS_BASE_URL || "http://127.0.0.1:7000",
        failureBaseUrl: process.env.ESEWA_FAILURE_BASE_URL || "http://127.0.0.1:7000"
    };
}

function isEsewaConfigured() {
    const config = getEsewaConfig();
    return Boolean(config.productCode && config.secretKey && config.formUrl && config.statusUrlBase);
}

function buildSignedMessage(fields, payload) {
    return fields
        .split(",")
        .map((field) => `${field}=${payload[field] ?? ""}`)
        .join(",");
}

function signEsewaFields(payload, fields = DEFAULT_SIGNED_FIELDS, secretKey = getEsewaConfig().secretKey) {
    const message = buildSignedMessage(fields, payload);
    return crypto
        .createHmac("sha256", secretKey)
        .update(message)
        .digest("base64");
}

function verifyEsewaSignature(payload, signature, fields = DEFAULT_RESPONSE_SIGNED_FIELDS, secretKey = getEsewaConfig().secretKey) {
    const expected = signEsewaFields(payload, fields, secretKey);
    return expected === signature;
}

function decodeEsewaSuccessData(encoded) {
    if (!encoded) return null;

    try {
        const json = Buffer.from(String(encoded), "base64").toString("utf8");
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function formatAmount(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(2).replace(/\.00$/, "") : "0";
}

function buildStatusCheckUrl({ productCode, totalAmount, transactionUuid }) {
    const config = getEsewaConfig();
    const url = new URL(config.statusUrlBase);
    url.searchParams.set("product_code", productCode);
    url.searchParams.set("total_amount", formatAmount(totalAmount));
    url.searchParams.set("transaction_uuid", transactionUuid);
    return url.toString();
}

function buildCallbackUrls(transactionUuid) {
    const config = getEsewaConfig();
    return {
        successUrl: `${config.successBaseUrl.replace(/\/$/, "")}/api/subscription/esewa/success?transaction_uuid=${encodeURIComponent(transactionUuid)}`,
        failureUrl: `${config.failureBaseUrl.replace(/\/$/, "")}/api/subscription/esewa/failure?transaction_uuid=${encodeURIComponent(transactionUuid)}`
    };
}

async function checkEsewaTransactionStatus({ productCode, totalAmount, transactionUuid }) {
    const url = buildStatusCheckUrl({ productCode, totalAmount, transactionUuid });
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();

    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!response.ok) {
        const error = new Error(data.error_message || "Unable to verify eSewa transaction status");
        error.status = response.status;
        error.payload = data;
        throw error;
    }

    return data;
}

module.exports = {
    DEFAULT_RESPONSE_SIGNED_FIELDS,
    DEFAULT_SIGNED_FIELDS,
    buildCallbackUrls,
    checkEsewaTransactionStatus,
    decodeEsewaSuccessData,
    formatAmount,
    getEsewaConfig,
    isEsewaConfigured,
    signEsewaFields,
    verifyEsewaSignature
};
