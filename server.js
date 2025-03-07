const express = require("express");
const cors = require("cors");
const { spawn} = require("child_process");
const fs = require("fs");
const { loadBalanceFromDB} = require("./trading");
const { state } = require("./state");

const app = express();
const PORT = 8081;

app.use(cors());
app.use(express.json());

let botProcess = null; // Speichert den laufenden Prozess



// 🚀 Endpoint zum Starten des Skripts
app.post("/start-bot", (req, res) => {
    if (botProcess) {
        return res.status(400).json({ message: "Bot läuft bereits!" });
    }

    console.log("🚀 Starte bot.js...");


    // Starte den Bot-Prozess, ohne die Session-Datei zu löschen
    botProcess = spawn("node", ["bot_telegram.js"], { stdio: "inherit" });

    res.json({ message: "Bot gestartet!" });
});

app.get("/", (req, res) => res.send("Express on Vercel"));

// ⏹️ Endpoint zum Stoppen des Skripts
app.post("/stop-bot", (req, res) => {
    if (!botProcess) {
        return res.status(400).json({ message: "Kein Bot läuft!" });
    }

    console.log("🛑 Stoppe bot.js...");
    botProcess.kill();
    botProcess = null;

    res.json({ message: "Bot gestoppt!" });
});

app.get("/status", async (req, res) => {
    try {
        await loadBalanceFromDB(); // Aktuelle Balance aus der Datenbank holen
        console.log("📡 Sende Status:", state.solBalance);
        res.json({ balance: state.solBalance});
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📌 Server starten
app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
