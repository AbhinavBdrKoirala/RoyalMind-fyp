const express = require('express');
console.log("INDEX FILE LOADED");
const authenticateToken = require('./middleware/authMiddleware');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const cors = require('cors');
const app = express();

const authRoutes = require('./routes/auth');
const pool = require('./db');

const gameRoutes = require("./routes/gameRoutes");
app.use("/api/games", gameRoutes);



app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

pool.query('SELECT 1')
    .then(() => console.log('Database connection OK'))
    .catch(err => console.error('Database connection error:', err.message));

app.get('/api/protected', authenticateToken, (req, res) => {
    res.json({
        message: "Protected route accessed successfully",
        userId: req.user.id
    });
});

app.get('/', (req, res) => {
    res.send("RoyalMind Backend Running");
});



// app.listen(7000, () => {
//     console.log("Server running on port 7000");
// });
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
