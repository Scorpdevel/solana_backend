const config = require("./config");
const axios = require("axios");
const { state, resetState } = require("./state");
const { sql } = require("./db");


let priceCheckInterval = false; // Speichert das Intervall

const prodUrl = 'https://solana-backend-trading.onrender.com'
const devUrl = 'http://localhost:8000'

async function saveBalanceToDB(newBalance) {
    try {
        await sql`
            INSERT INTO balance (sol_balance)
            VALUES (${newBalance})
            ON CONFLICT (id) DO UPDATE SET sol_balance = ${newBalance};
        `;
        console.log(`💾 Neue Balance gespeichert: ${newBalance} SOL`);
    } catch (error) {
        console.error(`❌ Fehler beim Speichern der Balance: ${error.message}`);
    }
}

async function loadBalanceFromDB() {
    try {
        const result = await sql`SELECT sol_balance FROM balance ORDER BY id DESC LIMIT 1`;
        if (result.length > 0) {
            const balance  = result[0].sol_balance;
            console.log(`💰 Geladene Balance aus DB: ${balance} SOL`);
            return balance
        } else {
            // Falls keine Balance vorhanden ist, setze sie auf 100 SOL
            console.log("🆕 Initiale Balance in DB gespeichert: 100 SOL");
            await saveBalanceToDB(10000);
            return 10000.0

        }
    } catch (error) {
        console.error(`❌ Fehler beim Laden der Balance aus der Datenbank: ${error.message}`);
    }
}
async function buyToken(tokenMint) {
    const tradeAmountUSD = config.tradeAmountUSD;
    const tradeFee = config.tradeFee;

    const tokenPrice = state.botResponses.price;

        if (!tokenPrice) {
            console.log(`❌ Kein gültiger Preis für ${tokenMint}. Kauf wird abgebrochen.`);
            return;
        }


    const tokensPurchased = Number(tradeAmountUSD) / Number(tokenPrice);


    // ✅ Berechne die tatsächlichen SOL-Kosten (inkl. Gebühren)
    const totalCost = tradeAmountUSD + tradeFee;

    console.log(`🛒 Berechne Kauf von ${tokenMint}: ${tradeAmountUSD}$  + Fee (${tradeFee} $)`);
    console.log(`💰 Gesamte-Kosten: ${totalCost} $`);
    console.log(`🔹 Erhaltene Token: ${tokensPurchased} ${tokenMint}`);


        const balance =  await loadBalanceFromDB()
           const newBalance =  balance - totalCost
        await saveBalanceToDB(newBalance);

        state.portfolio[tokenMint] = {
            tokenMint: tokenMint,
            amount: Number(tokensPurchased),
            buyPrice: Number(tokenPrice),
            totalCost: Number(totalCost),
            timestamp: Date.now(),
        };

        if (!priceCheckInterval) {
            console.log("🚀 Starte Preisüberwachung...");
            await fetch(`${prodUrl}/start-tracking`, {
                method: "POST",
            });
            priceCheckInterval = true;
        }

    await saveToken(tokenMint, state.botResponses, tokensPurchased);
        console.log(`✅ **SIMULIERTER KAUF** von ${tokenMint} für ${totalCost.toFixed(4)} $ erfolgreich!`);
}

async function saveToken(mint, response, tokensPurchased) {
    try {
        await sql`
            INSERT INTO bot_response (mint, response, amount)
            VALUES (${mint}, ${sql.json(response)}, ${tokensPurchased})
            ON CONFLICT (mint) DO NOTHING;
        `;
        console.log(`✅ Token ${mint} erfolgreich gespeichert.`);
    } catch (error) {
        console.error(`❌ Fehler beim Speichern des Tokens ${mint}: ${error.message}`);
    }
}
//
function evaluateBotResponse() {
    // `price` entfernen und nur die restlichen Werte prüfen
    const botResponse = state.botResponses;
    console.log('hier wird einmal der state gezeigt: ',state)
    const filteredEntries = Object.entries(botResponse).filter(([key]) => key !== "price");

    // Anzahl der `valid: true` Einträge zählen
    const validCount = filteredEntries.filter(([, entry]) => entry?.valid === true).length;

    // Prüfen, ob mindestens 5 Kriterien erfüllt sind
    //return true
    return validCount >= 4;
}



module.exports = { evaluateBotResponse, buyToken};
