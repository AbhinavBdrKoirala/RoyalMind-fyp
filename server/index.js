const express = require("express");
const path = require("path");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const authenticateToken = require("./middleware/authMiddleware");
const { getJwtSecret } = require("./utils/jwt");
const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/gameRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const premiumContentRoutes = require("./routes/premiumContentRoutes");
const pool = require("./db");
const { cleanupExpiredAuthState, ensureAuthSchema } = require("./utils/authStore");
const { pruneRateLimitBuckets } = require("./utils/authSecurity");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/premium", premiumContentRoutes);

getJwtSecret();

pool.query("SELECT 1")
    .then(() => console.log("Database connection OK"))
    .catch((err) => console.error("Database connection error:", err.message));

ensureAuthSchema()
    .then(() => cleanupExpiredAuthState())
    .catch((err) => console.error("Auth bootstrap error:", err.message));

setInterval(() => {
    pruneRateLimitBuckets();
    cleanupExpiredAuthState().catch((err) => console.error("Scheduled auth cleanup error:", err.message));
}, 15 * 60 * 1000).unref();

app.get("/api/protected", authenticateToken, (req, res) => {
    res.json({
        message: "Protected route accessed successfully",
        userId: req.user.id
    });
});

app.get("/", (req, res) => {
    res.send("RoyalMind Backend Running");
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
