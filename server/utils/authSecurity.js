const rateLimitBuckets = new Map();

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || "unknown";
}

function getThrottleKey(req, suffix = "") {
    const ip = getClientIp(req);
    const bodyEmail = String(req.body?.email || req.body?.newEmail || "").trim().toLowerCase();
    const bodyPhone = String(req.body?.phone || "").trim();
    return [ip, bodyEmail, bodyPhone, suffix].filter(Boolean).join("|");
}

function createRateLimiter({ name, windowMs, max, message, keyBuilder }) {
    return function rateLimitMiddleware(req, res, next) {
        const now = Date.now();
        const key = `${name}:${(keyBuilder || getThrottleKey)(req)}`;
        const existing = rateLimitBuckets.get(key);

        if (!existing || existing.resetAt <= now) {
            rateLimitBuckets.set(key, {
                count: 1,
                resetAt: now + windowMs
            });
            return next();
        }

        existing.count += 1;
        if (existing.count > max) {
            const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
            res.setHeader("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                error: message || "Too many requests. Please wait a moment and try again."
            });
        }

        return next();
    };
}

function pruneRateLimitBuckets() {
    const now = Date.now();
    for (const [key, entry] of rateLimitBuckets.entries()) {
        if (!entry || entry.resetAt <= now) {
            rateLimitBuckets.delete(key);
        }
    }
}

module.exports = {
    createRateLimiter,
    getClientIp,
    getThrottleKey,
    pruneRateLimitBuckets
};
