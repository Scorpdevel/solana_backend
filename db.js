// db.js
require("dotenv").config();
const postgres = require("postgres");

// Verbindung mit Supabase-Datenbank
const sql = postgres(process.env.DATABASE_URL, {
    ssl: "require", // SSL für Supabase erforderlich
});

module.exports = { sql };
