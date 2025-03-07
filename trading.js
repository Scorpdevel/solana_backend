const config = require("./config");
const axios = require("axios");
const { state, resetState } = require("./state");
const { sql } = require("./db");

async function getTokenPrice(tokenMint) {
    const url = `https://api.jup.ag/price/v2?ids=${tokenMint}`;
    try {

        const response = await axios.get(url);
        const data =  response.data.data[tokenMint]?.price
        console.log("📊 Token-Preis Antwort:", data);
        return data || null; // Preiswert extrahieren
    } catch (error) {
        console.error(`❌ Fehler beim Abrufen des Tokenpreises für ${tokenMint}: ${error.message}`);
        return null;
    }
}

let priceCheckInterval = null; // Speichert das Intervall

async function buyToken(tokenMint) {
    const tradeAmountUSD = config.tradeAmountUSD;
    const tradeFee = config.tradeFee;
    const solPrice = config.solPrice // Später durch API ersetzt

    const tokenPrice = state.botResponses.price;

        if (!tokenPrice) {
            console.log(`❌ Kein gültiger Preis für ${tokenMint}. Kauf wird abgebrochen.`);
            return;
        }


    const tokensPurchased = tradeAmountUSD / tokenPrice;

    // ✅ Berechne die benötigte SOL-Menge für den Kauf
    const tradeAmountSOL = tradeAmountUSD / solPrice;

    // ✅ Berechne die tatsächlichen SOL-Kosten (inkl. Gebühren)
    const totalCostSOL = tradeAmountSOL + tradeFee;

    console.log(`🛒 Berechne Kauf von ${tokenMint}: ${tradeAmountUSD}$ (${tradeAmountSOL.toFixed(4)} SOL) + Fee (${tradeFee} SOL)`);
    console.log(`💰 Gesamt-SOL-Kosten: ${totalCostSOL} SOL`);
    console.log(`🔹 Erhaltene Token: ${tokensPurchased} ${tokenMint}`);

        if (state.solBalance < totalCostSOL) {
            console.log('hier ist die solbalance: ',state.solBalance);
            console.log("❌ Nicht genug SOL-Guthaben für den Kauf.");
            return;
        }

        state.solBalance =  state.solBalance - totalCostSOL
    await saveBalanceToDB(state.solBalance);
        console.log('#das  ist der state', state)

        state.portfolio[tokenMint] = {
            tokenMint: tokenMint,
            amount: Number(tradeAmountSOL),
            buyPrice: Number(tokenPrice),
            totalCost: Number(totalCostSOL),
            timestamp: Date.now(),
        };

        if (!priceCheckInterval) {
            console.log("🚀 Starte Preisüberwachung...");
            priceCheckInterval = setInterval(checkTokenPrices, config.priceCheckInterval);
        }

    await saveToken(tokenMint, state.botResponses);
        console.log(`✅ **SIMULIERTER KAUF** von ${tokenMint} für ${totalCostSOL.toFixed(4)} SOL erfolgreich!`);
}

async function checkTokenPrices() {
    console.log("📊 **Überprüfung der Token-Preise gestartet...**");
    console.log(state)
    console.log(config)

    for (const tokenMint in state.portfolio) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const tokenData = state.portfolio[tokenMint];
        const currentPrice = await getTokenPrice(tokenMint);

        if (!currentPrice) {
            console.log(`❌ Preis für ${tokenMint} konnte nicht abgerufen werden.`);
            continue;
        }

        const priceChangePercent = ((Number(currentPrice) - tokenData.buyPrice) / tokenData.buyPrice) * 100;

        console.log(`🔍 **${tokenMint}** - Gekauft für: ${tokenData.buyPrice}$, Aktuell: ${Number(currentPrice)}$ (${Number(priceChangePercent)}%)`);

        if (priceChangePercent <= config.stopLossPercent) {
            console.log(`🚨 **STOP-LOSS aktiviert für ${tokenMint}!** Verkaufe Token...`);
            sellToken(tokenMint, currentPrice);
        } else if (priceChangePercent >= config.takeProfitPercent) {
            console.log(`🏆 **TAKE-PROFIT erreicht für ${tokenMint}!** Verkaufe Token...`);
            sellToken(tokenMint, currentPrice);
        }
    }
}

async function sellToken(tokenMint, sellPrice) {
    if (!state.portfolio[tokenMint]) return;

    const tokenData = state.portfolio[tokenMint];
    const tradeFee = config.tradeFee;
    const saleAmountSOL = tokenData.amount;
    const totalSaleValueSOL = (saleAmountSOL * sellPrice) / config.solPrice;
    const finalSaleValueSOL = totalSaleValueSOL - tradeFee;

    console.log(`💰 **Verkauf** von ${tokenMint}: ${saleAmountSOL} SOL für ${sellPrice}$.`);
    console.log(`💵 Erlös: ${totalSaleValueSOL} SOL - Gebühren: ${tradeFee} SOL = **${finalSaleValueSOL} SOL**`);

    state.solBalance += finalSaleValueSOL;
    await saveBalanceToDB(state.solBalance);
    delete state.portfolio[tokenMint];

    console.log(`✅ **Token ${tokenMint} verkauft!** Neue Balance: ${state.solBalance} SOL.`);
}

// 📌 Status ausgeben
function getStatus(state) {
    return {
        solBalance: state
    };
}

async function saveToken(mint, response) {
    try {
        await sql`
            INSERT INTO bot_response (mint, response)
            VALUES (${mint}, ${sql.json(response)})
            ON CONFLICT (mint) DO NOTHING;
        `;
        console.log(`✅ Token ${mint} erfolgreich gespeichert.`);
    } catch (error) {
        console.error(`❌ Fehler beim Speichern des Tokens ${mint}: ${error.message}`);
    }
}

function evaluateBotResponse() {
    // `price` entfernen und nur die restlichen Werte prüfen
    const botResponse = state.botResponses;
    console.log('hier wird einmal der state gezeigt: ',state)
    const filteredEntries = Object.entries(botResponse).filter(([key]) => key !== "price");

    // Anzahl der `valid: true` Einträge zählen
    const validCount = filteredEntries.filter(([, entry]) => entry?.valid === true).length;

    // Prüfen, ob mindestens 7 Kriterien erfüllt sind
    return true
   // return validCount >= 9;
}

async function loadBalanceFromDB() {
    try {
        const result = await sql`SELECT sol_balance FROM balance ORDER BY id DESC LIMIT 1`;
        if (result.length > 0) {
            state.solBalance = result[0].sol_balance;
            console.log(`💰 Geladene Balance aus DB: ${state.solBalance} SOL`);
        } else {
            // Falls keine Balance vorhanden ist, setze sie auf 100 SOL
            state.solBalance = 100.0;
            await saveBalanceToDB(state.solBalance);
            console.log("🆕 Initiale Balance in DB gespeichert: 100 SOL");
        }
    } catch (error) {
        console.error(`❌ Fehler beim Laden der Balance aus der Datenbank: ${error.message}`);
    }
}

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



module.exports = { getStatus,evaluateBotResponse, buyToken, loadBalanceFromDB };
