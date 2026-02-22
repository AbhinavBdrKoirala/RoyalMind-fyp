const express = require('express');
console.log("INDEX FILE LOADED");
const authenticateToken = require('./middleware/authMiddleware');



require('dotenv').config();
const cors = require('cors');
const app = express();

const authRoutes = require('./routes/auth');

const gameRoutes = require("./routes/gameRoutes");
app.use("/api/games", gameRoutes);



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



// app.listen(7000, () => {
//     console.log("Server running on port 7000");
// });
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
