const config = {
    // 💰 Startkapital in SOL
    initialSolBalance: 100.0,

    // 💲 Wie viel wird pro Trade investiert (in USD)
    tradeAmountUSD: 13,

    // 💸 Trading Fees (pro Kauf & Verkauf)
    tradeFee: 0.005, // 0.005 SOL pro Transaktion

    // 📉 Stop-Loss: Bei wieviel % Verlust wird verkauft?
    stopLossPercent: -40, // -20% Verlust

    // 📈 Take-Profit: Bei wieviel % Gewinn wird verkauft?
    takeProfitPercent: 300, // +300% Gewinn

    // 📡 Solana Preis (später durch API ersetzt)
    solPrice: 130, // 1 SOL = 100 USD (Beispielwert)

    // 📡 Intervall für Preisprüfung der gekauften Tokens (ms)
    priceCheckInterval: 3000, // Alle 10 Sekunden
};

module.exports = config;
