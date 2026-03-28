function getJwtSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret || !secret.trim()) {
        throw new Error("JWT_SECRET is not configured");
    }

    return secret;
}

module.exports = {
    getJwtSecret
};
