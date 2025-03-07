const axios = require("axios");
const fs = require("fs");
const MTProto = require("@mtproto/core");
const readlineSync = require("readline-sync");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getMint } = require("@solana/spl-token");
const WebSocket = require("ws");
require("dotenv").config();

const api_id = parseInt(process.env.API_ID, 10);
const api_hash = process.env.API_HASH;
const phone_number = process.env.PHONE_NUMBER;
const bot_username_zbot = process.env.BOT_USERNAME_ZBOT;
const bot_username_rick = process.env.BOT_USERNAME_RICK;
const bot_username_ts = process.env.BOT_USERNAME_TS;

const  RPC_URL  = ["https://mainnet.helius-rpc.com/?api-key=e3084810-5840-4452-843e-cf052c44647b",
    "https://mainnet.genesysgo.net",
    "https://api.mainnet-beta.solana.com", "https://ssc-dao.genesysgo.net"];

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


async function getSolanaConnection() {
    for (let rpc of RPC_URL) {
        try {
            const connection = new Connection(rpc, "confirmed");
            console.log(`✅ Verbunden mit: ${rpc}`);
            return connection;
        } catch (error) {
            console.warn(`⚠️ Fehler mit RPC ${rpc}: ${error.message}`);
        }
    }
    throw new Error("❌ Kein funktionierender RPC gefunden!");
}

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
            if (token_mint !== 'Unbekannt') {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                await getTokenCreator(token_mint);
            }else{
                console.log('Token Mint ungültig');
            }

            await new Promise((resolve) => setTimeout(resolve, 10000));
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

const connection =  new Connection(RPC_URL[0], "confirmed");

async function getTokenCreator(tokenMint) {
    try {
        console.log(`🔍 Prüfe Token Mint-Account: ${tokenMint}`);
        const mintPublicKey = new PublicKey(tokenMint);

        // Prüfe, ob der Mint-Account existiert
        const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);
        if (!mintAccountInfo) {
            console.log(`❌ Kein Mint-Account gefunden (Token existiert möglicherweise nicht).`);
            return null;
        }

        // Token-Mint Daten abrufen
        const mintAccount = await getMint(connection, mintPublicKey);
        console.log("📜 Mint-Account Daten:", mintAccount);

        // 1️⃣ Prüfe, ob eine Mint Authority existiert
        if (mintAccount.mintAuthority) {
            const creator = mintAccount.mintAuthority.toBase58();
            console.log(`✅ Token Creator (Mint Authority): ${creator}`);
            return creator;
        }

        // 2️⃣ Falls `mintAuthority = null`, suchen wir die erste Transaktion
        console.log("🔍 Mint Authority entfernt. Suche erste Transaktion...");
        const transactionHistory = await connection.getSignaturesForAddress(mintPublicKey, { limit: 1 });

        if (!transactionHistory || transactionHistory.length === 0) {
            console.log("❌ Keine Transaktionsdaten gefunden.");
            return null;
        }

        const firstTxSignature = transactionHistory[0].signature;
        console.log(`📜 Erste Transaktion gefunden: ${firstTxSignature}`);

        // Abrufen der Transaktionsdetails mit maxSupportedTransactionVersion
        const transactionDetails = await connection.getTransaction(firstTxSignature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
        });

        if (!transactionDetails || !transactionDetails.transaction || !transactionDetails.transaction.message) {
            console.log("❌ Konnte keine gültigen Transaktionsdetails abrufen.");
            return null;
        }

        // Prüfe, ob die Nachricht `MessageV0` ist und ob `staticAccountKeys` existiert
        const accountKeys = transactionDetails.transaction.message.staticAccountKeys;

        if (!Array.isArray(accountKeys) || accountKeys.length === 0) {
            console.log("❌ Keine Account-Keys gefunden oder ungültiges Format.");
            return null;
        }

        // Erster AccountKey ist in der Regel der Ersteller des Tokens
        const creatorWallet = accountKeys[0].toBase58();

        if (!creatorWallet) {
            console.log("❌ Konnte keine Entwickler-Adresse extrahieren.");
            return null;
        }

        console.log(`✅ Token wurde von ${creatorWallet} erstellt!`);
        //await new Promise((resolve) => setTimeout(resolve, 10000));
        await getDeveloperTokenCount(creatorWallet);
        return creatorWallet;
    } catch (error) {
        console.error(`❌ Fehler beim Abrufen des Token Creators: ${error.message || error}`);
        return null;
    }
}

async function getDeveloperTokenCount(developerWallet) {
    let delay = 1000; // Starte mit 1 Sekunde Wartezeit
    let maxRetries = 5; // Maximal 5 Versuche

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`🔍 Überprüfe andere Tokens von Entwickler: ${developerWallet}`);

            const response = await fetch(`${RPC_URL[3]}/getProgramAccounts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getProgramAccounts",
                    params: [
                        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                        {
                            encoding: "jsonParsed",
                            filters: [
                                { dataSize: 165 },
                                { memcmp: { offset: 32, bytes: developerWallet } }
                            ]
                        }
                    ]
                })
            });

            if (response.status === 429) {
                console.warn(`⚠️ Server antwortet mit 429 (Too Many Requests). Warte ${delay / 1000}s...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay *= 2; // Wartezeit verdoppeln (Exponential Backoff)
                continue; // Erneuter Versuch
            }

            const data = await response.json();
            console.log('hier ist data: ',data);
            if (data.result) {
                console.log(`✅ Entwickler hat ${data.result.length} andere Token erstellt.`);
                return data.result.length;
            } else {
                console.log("❌ Keine weiteren Token gefunden.");
                return 0;
            }
        } catch (error) {
            console.error(`❌ Fehler beim Abrufen der Entwickler-Token: ${error.message || error}`);
            return 0;
        }
    }

    console.error("🚨 Maximalversuche erreicht! Abbruch.");
    return 0;
}


login().then(() => {
    subscribe();
}).catch(console.log);