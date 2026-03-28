const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/jwt');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());
        req.user = decoded;
        next();
    } catch (error) {
        if (error.message === "JWT_SECRET is not configured") {
            return res.status(500).json({ error: "Authentication is not configured on the server." });
        }
        return res.status(403).json({ error: "Invalid or expired token." });
    }
}

module.exports = authenticateToken;
