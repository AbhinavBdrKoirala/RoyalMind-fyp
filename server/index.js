const express = require('express');
console.log("INDEX FILE LOADED");

const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

app.get('/api/protected', (req, res) => {
    res.json({
        message: "Protected route accessed successfully"
    });
});

app.get('/', (req, res) => {
    res.send("RoyalMind Backend Running");
});

app.get('*', (req, res) => {
    console.log("Request received for:", req.url);
    res.status(404).json({ error: "Route not found in backend" });
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});
