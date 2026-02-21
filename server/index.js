const express = require('express');
console.log("INDEX FILE LOADED");
const authenticateToken = require('./middleware/authMiddleware');


const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

app.get('/api/protected', authenticateToken, (req, res) => {
    res.json({
        message: "Protected route accessed successfully",
        userId: req.user.id
    });
});

app.get('/', (req, res) => {
    res.send("RoyalMind Backend Running");
});



app.listen(7000, () => {
    console.log("Server running on port 7000");
});
