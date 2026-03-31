const express = require("express");
const path = require("path");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, ".env"), override: true });

const authenticateToken = require("./middleware/authMiddleware");
const { getJwtSecret } = require("./utils/jwt");
const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/gameRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const premiumContentRoutes = require("./routes/premiumContentRoutes");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/premium", premiumContentRoutes);

getJwtSecret();

pool.query("SELECT 1")
    .then(() => console.log("Database connection OK"))
    .catch((err) => console.error("Database connection error:", err.message));

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
