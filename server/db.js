const { Pool } = require("pg");
const path = require("path");

const shouldOverrideEnv = String(process.env.NODE_ENV || "").toLowerCase() !== "production";
require("dotenv").config({ path: path.join(__dirname, ".env"), override: shouldOverrideEnv });

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

module.exports = pool;
