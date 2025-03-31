require("dotenv").config();
const MTProto = require("@mtproto/core");
const WebSocket = require("ws");
const readlineSync = require("readline-sync");
const { evaluateBotResponse, buyToken, loadBalanceFromDB} = require("./trading");
const { state, resetState } = require("./state");
const { getMarketCap, getTokenPrice, sameNameMatch, getDevPercentage, bundledTradesMatch, getDevCreatedTokens, sameTelegramMatch, sameTwitterMatch, sameWebsiteMatch, getT10HolderPercentage,
    getMarketCapValue, getTraders
} = require("./helper");
const fs = require("fs");

// 🔹 Lade API-Daten aus .env
const api_id = parseInt(process.env.API_ID, 10);
const api_hash = process.env.API_HASH;
const phone_number = process.env.PHONE_NUMBER;
const bot_username_zbot = process.env.BOT_USERNAME_ZBOT;
const bot_username_rick = process.env.BOT_USERNAME_RICK;
const bot_username_ts = process.env.BOT_USERNAME_TS;

let mtproto = null;

// 🔹 Funktion zum Telegram-Login
async function login() {
    if (fs.existsSync("./mtproto-session.json")) {
        console.log("🔄 Vorhandene Session gefunden. Login wird übersprungen!");
        mtproto = new MTProto({
            api_id,
            api_hash,
            storageOptions: { path: "./mtproto-session.json" },
        });
        return; // Keine erneute Anmeldung nötig
    }

    console.log("📲 Keine gültige Session gefunden – neuer Login erforderlich...");
    mtproto = new MTProto({
        api_id,
        api_hash,
        storageOptions: { path: "./mtproto-session.json" },
    });

    try {
        const { phone_code_hash } = await mtproto.call("auth.sendCode", {
            phone_number,
            settings: { _: "codeSettings" },
        });

        const phone_code = readlineSync.question("📩 Gib den Telegram-Code ein: ");
        await mtproto.call("auth.signIn", {
            phone_number,
            phone_code_hash,
            phone_code,
        });

        console.log("✅ Erfolgreich eingeloggt!");
    } catch (error) {
        console.error("❌ Fehler beim Login:", error);
        if (error.error_message.includes("FLOOD_WAIT")) {
            console.error("🛑 Warten erforderlich! Versuche es später erneut.");
            process.exit(1);
        }
        if (error.error_message === "AUTH_KEY_UNREGISTERED") {
            console.error("❌ Auth-Fehler: Deine Sitzung ist ungültig! Lösche `mtproto-session.json` und versuche es erneut.");
            process.exit(1);
        }
        process.exit(1);
    }
}

// 🔹 Funktion zum Abrufen des Bot-Peers
async function getInputPeer(username) {
    try {
        const result = await mtproto.call("contacts.resolveUsername", { username });
        if (result && result.users.length > 0) {
            return {
                _: "inputPeerUser",
                user_id: result.users[0].id,
                access_hash: result.users[0].access_hash,
            };
        } else {
            throw new Error("❌ Bot nicht gefunden! Hast du ihn mit /start angeschrieben?");
        }
    } catch (error) {
        console.error("❌ Fehler beim Abrufen des Peers:", error);
    }
}

// 🔹 Nachricht an einen bestimmten Bot senden
async function sendMessage(botName, message) {
    console.log(`📤 Sende Nachricht an ${botName}: ${message}`);
    try {
        const peer = await getInputPeer(botName);
        if (!peer) {
            console.error(`❌ Konnte Bot ${botName} nicht abrufen. Nachricht wird nicht gesendet.`);
            return;
        }

        await mtproto.call("messages.sendMessage", {
            peer,
            message,
            random_id: Math.floor(Math.random() * 1000000),
        });

        console.log(`✅ Nachricht gesendet an ${botName}`);
    } catch (error) {
        console.error(`❌ Fehler beim Senden der Nachricht an ${botName}:`, error);
    }
}

// 🔹 Warten auf Antwort eines bestimmten Bots mit Timeout
async function  waitForBotResponse(botName) {
    console.log(`📡 Warte auf Antwort von ${botName}...`);

    return new Promise((resolve) => {
        let resolved = false; // 🔹 Flag, um mehrfaches `resolve()` zu verhindern

        const timeout = setTimeout(() => {
            if (!resolved) {
                console.warn(`⏳ Timeout: Keine Antwort von ${botName} innerhalb von 7 Sekunden.`);
                mtproto.updates.removeAllListeners("updates"); // 🔹 Listener entfernen
                resolved = true;
                resolve(null);
            }
        }, 10000);

        // 🔹 Entferne vorherige Listener, um Memory Leaks zu vermeiden
        mtproto.updates.removeAllListeners("updates");

        // 🔹 Setze die maximale Anzahl von Listeners höher (optional)
        mtproto.updates.setMaxListeners(20);

        mtproto.updates.on("updates", (updates) => {
            updates.updates.forEach((update) => {
                if (resolved) return; // Falls schon aufgelöst, tue nichts mehr

                if (update._ === "updateNewMessage") {
                    clearTimeout(timeout); // Timeout abbrechen
                    resolved = true; // Markiere als abgeschlossen
                    mtproto.updates.removeAllListeners("updates"); // 🔹 Listener sofort entfernen

                    let receivedMessage = update.message.message || "";
                    let extractedLinks = [];
                    let mediaInfo = "";

                    // 📌 Prüfen, ob die Nachricht Medien enthält
                    if (update.message.media) {
                        mediaInfo = "[MEDIA-Nachricht erhalten]";

                        if (update.message.media._ === "messageMediaPhoto") {
                            mediaInfo = "📸 Foto erhalten";
                        } else if (update.message.media._ === "messageMediaDocument") {
                            mediaInfo = "📄 Dokument erhalten";
                        } else if (update.message.media._ === "messageMediaVideo") {
                            mediaInfo = "🎥 Video erhalten";
                        } else {
                            mediaInfo = `[Unbekannter Medientyp: ${update.message.media._}]`;
                        }

                        // Falls die Media-Nachricht eine URL enthält, extrahiere sie
                        if (update.message.media.webpage && update.message.media.webpage.url) {
                            extractedLinks.push(update.message.media.webpage.url);
                        }
                    }

                    // 📌 Prüfen, ob die Nachricht Hyperlinks enthält
                    if (update.message.entities) {
                        update.message.entities.forEach((entity) => {
                            if (entity._ === "messageEntityTextUrl") {
                                extractedLinks.push(entity.url);
                            }
                        });
                    }

                  /*  if (mediaInfo && receivedMessage) {
                        receivedMessage += ` ${mediaInfo}`;
                    } else if (mediaInfo) {
                        receivedMessage = mediaInfo;
                    } */

                    console.log(`📩 Antwort von ${botName}: ${receivedMessage}`);

                   /* if (extractedLinks.length > 0) {
                        console.log(`🔗 Enthaltene Links: ${extractedLinks.join(", ")}`);
                    }*/

                    resolve({ receivedMessage, extractedLinks, mediaType: mediaInfo });
                }
            });
        });
    });
}



// 🔹 Nachrichten an Bots senden & Antworten prüfen
async function sendTelegramMessage(tokenMint) {
    const bots = [
        { name: bot_username_ts, command: `${tokenMint}` },
        { name: bot_username_zbot, command: tokenMint },
       // { name: bot_username_zbot, command: `/bundle ${tokenMint}` }
    ];
    await new Promise((resolve) => setTimeout(resolve, 5000))
    console.log(`📤 Sende Nachricht an ${bots[1].name}: ${bots[1].command}`);
    await sendMessage(bots[1].name, bots[1].command);
    const response = await waitForBotResponse(bots[1].name);

    state.botResponses['devPercentage'] =  getDevPercentage(response);
    state.botResponses['traders'] = getTraders(response)
    state.botResponses['bundles'] = bundledTradesMatch(response)
    state.botResponses['sameName'] = sameNameMatch(response)

    if (evaluateBotResponse()) {
        console.log("💰 **SIMULIERTER KAUF** wird durchgeführt!");
        console.log("💰 Token wird gekauft!");
        await buyToken(tokenMint);
    /*    console.log(state)

        console.log('30 sekunden werden gewartet um die erste marketcap zu erhalten')
        await new Promise((resolve) => setTimeout(resolve, 30000))

        console.log(`📤 Sende Nachricht an ${bots[0].name}: ${bots[0].command}`);
        await sendMessage(bots[0].name, bots[0].command);
        let response = await waitForBotResponse(bots[0].name);

        if (!response) {
            console.warn(`⚠️ Keine Antwort von ${bots[0].name}. Token wird ignoriert.`);
            return;
        }

        const marketCapFirst = getMarketCapValue(response);

        console.log(`Erhaltene Marketcap nach 30sec: ${marketCapFirst}`)

        console.log('50 sekunden werden gewartet um den zweiten Marketcap zu erhalten')
        await new Promise((resolve) => setTimeout(resolve, 50000))

        console.log(`📤 Sende Nachricht an ${bots[0].name}: ${bots[0].command}`);
        await sendMessage(bots[0].name, bots[0].command);
        response = await waitForBotResponse(bots[0].name);

        if (!response) {
            console.warn(`⚠️ Keine Antwort von ${bots[0].name}. Token wird ignoriert.`);
            return;
        }

        const marketCapSecond = getMarketCapValue(response);
        console.log(`Erhaltene Marketcap nach 50sec: ${marketCapSecond}`)
        const marketCapChanges = marketCapSecond / marketCapFirst
        if(marketCapChanges >= 1.25){
            console.log('erhaltene defi percentage: ', marketCapChanges)
            console.log("💰 **SIMULIERTER KAUF** wird durchgeführt!");
            console.log("💰 Token wird gekauft!");
            state.botResponses['price'] =  getTokenPrice(response);
            await buyToken(tokenMint);
        }else{
            console.log("⛔ Token wird nicht gekauft.");
            console.log('Erhaltene defi percentage: ', marketCapChanges)
        }*/
    } else {
        console.log(state)
        console.log("⛔ Token wird nicht gekauft.");
    }

}

// 🔹 Token-Infos extrahieren
function extractTokenInfo(data) {
    try {
        const token_name = data?.name || "Unbekannt";
        const token_symbol = data?.symbol || "Unbekannt";
        const token_mint = data?.mint || "Unbekannt";

        console.log(`🔥 Neuer Token entdeckt: ${token_name} (${token_symbol}) | Mint: ${token_mint}`);
        return token_mint;
    } catch (error) {
        console.error("❌ Fehler beim Parsen der Nachricht:", error);
        return null;
    }
}

// 🔹 WebSocket Verbindung zu Pump.fun API
async function subscribe() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    let isProcessing = false;

    ws.on("open", () => {
        console.log("✅ Verbunden mit Pump.fun API");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on("message", async (message) => {
        if (isProcessing) return;

        try {
            isProcessing = true;
            const data = JSON.parse(message);
            console.log(`📡 Empfangene Nachricht:`, data);

            const token_mint = extractTokenInfo(data);
            if (token_mint) {
                if (token_mint === "Unbekannt") {
                    console.log("❌ Ungültiger Token, wird ignoriert.");
                    return;
                }
                //await new Promise((resolve) => setTimeout(resolve, 10000))
                await sendTelegramMessage(token_mint);
            }

           // await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (error) {
            console.error("❌ Fehler beim Verarbeiten der Nachricht:", error);
        } finally {
            isProcessing = false;
        }
    });

    ws.on("close", () => {
        console.log("⚠️ Verbindung verloren. Neuer Versuch in 5 Sekunden...");
        setTimeout(subscribe, 5000);
    });

    ws.on("error", (error) => {
        console.error("❌ WebSocket-Fehler:", error);
        ws.close();
    });
}

// 🚀 Starte das Skript
login().then(() => {
    subscribe();
}).catch(console.log);
