const state = {
    currentToken: null,  // Der aktuell untersuchte Token
    botResponses: {},  // Speichert Antworten der Bots
    portfolio: {},  // Gekaufte Tokens
    solBalance: 100.0, // Initiales Guthaben in SOL (siehe config)
};

function resetState() {
    state.currentToken = null;
    state.botResponses = {};
}

module.exports = { state, resetState };