
function getTokenPrice(response){
    const tokenPriceMatch = response.receivedMessage.match(/Token Price: \$(\d+(\.\d+)?)/);
    if (tokenPriceMatch) {
        return  parseFloat(tokenPriceMatch[1]); // Preis als Zahl speichern
    }

    return undefined
}

function getMarketCap(response){
    const marketCapMatch = response.receivedMessage.match(/Market Cap: \$(\d+(\.\d+)?K?)/);
    if (marketCapMatch) {
        let marketCap = marketCapMatch[1];
        if (marketCap.includes("K")) {
            marketCap = parseFloat(marketCap) * 1000; // Falls 'K' vorhanden ist, in vollständige Zahl umrechnen
        } else {
            marketCap = parseFloat(marketCap);
        }

       return  {
           valid: marketCap >= 9000,
           amount: marketCap
       };
    }

    return {
        valid: false,
        amount: null
    }
}

function getDevPercentage(response){
    const devHoldsMatch = response.receivedMessage.match(/Dev bought .* or (\d+(\.\d+)?)%/);
    if (devHoldsMatch) {
        let devHoldPercentage = parseFloat(devHoldsMatch[1]);

       return {
           valid: devHoldPercentage >= 10,
           amount: devHoldPercentage
       }
    }
    return {
        valid: false,
        amount: null
    }
}

function sameWebsiteMatch(response){
    const sameTelegramMatch = response.receivedMessage.match(/This website is the same as (\d+) other tokens/);
    if (sameTelegramMatch) {
        let count = parseInt(sameTelegramMatch[1], 10);
        return {
            valid: count === 0,
            amount: count
        };
    }

    return {
        valid: true,
        amount: null
    };
}

function sameTelegramMatch(response){
    const sameTelegramMatch = response.receivedMessage.match(/This telegram is the same as (\d+) other tokens/);
    if (sameTelegramMatch) {
        let count = parseInt(sameTelegramMatch[1], 10);
        return  {
            valid: count === 0,
            amount: count
        };
    }

    return {
        valid: true,
        amount: null
    };
}

function sameTwitterMatch(response){
    const sameTwitterMatch = response.receivedMessage.match(/This twitter is the same as (\d+) other tokens/);
    if (sameTwitterMatch) {
        let count = parseInt(sameTwitterMatch[1], 10);
        return {
            valid: count === 0,
            amount: count
        };
    }

    return {
        valid: true,
        amount: null
    };
}


function bundledTradesMatch(response){
    const bundledTradesMatch = response.receivedMessage.match(/Bundled! .* (\d+(\.\d+)?)%/);
    if (bundledTradesMatch) {
        let bundledPercentage = parseFloat(bundledTradesMatch[1]);
        return {
            valid: bundledPercentage <= 45,
            amount: bundledPercentage
        };
    }

    return {
        valid: true,
        amount: null
    };
}

function getDevCreatedTokens(response) {
    const devCreatedMatch = response.receivedMessage.match(/Dev created (\d+) other tokens/);
    if (devCreatedMatch) {
        let count = parseInt(devCreatedMatch[1], 10);
        return {
            valid: count >= 5,
            amount: count
        };
    }

    return {
        valid: true,
        amount: null
    };
}


function sameNameMatch(response) {
    const sameNameMatch = response.receivedMessage.match(/This name is the same as (\d+) other tokens/);
    if (sameNameMatch) {
        let count = parseInt(sameNameMatch[1], 10);
        return {
            valid: count <= 3,
            amount: count
        };
    }

    return {
        valid: true,
        amount: null
    };
}

function getT10HolderPercentage(response) {
    const t10Match = response.receivedMessage.match(/T10 (\d+(\.\d+)?)%/);
    if (t10Match) {
        let t10Percentage = parseFloat(t10Match[1]);

        return {
            valid: t10Percentage <= 40,
            amount: t10Percentage
        };
    }

    return {
        valid: true,
        amount: null
    };
}

module.exports = { getTokenPrice, getMarketCap,  getDevPercentage, sameWebsiteMatch, sameTelegramMatch, sameTwitterMatch, bundledTradesMatch, sameNameMatch, getDevCreatedTokens, getT10HolderPercentage };
