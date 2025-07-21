require('dotenv').config();
const { ethers } = require('ethers');
// const TelegramBot = require('node-telegram-bot-api');
const TelegramBot = require('node')
const fetch = require('node-fetch')


// Telegram setup
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

// RPC Providers
const providers = {
    ethereum: new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_ETH_API_KEY}`),
    bsc: new ethers.providers.JsonRpcProvider(process.env.BSC_RPC_URL),
    polygon: new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL)
};

// DEX Router Addresses
const DEX_ROUTERS = {
    uniswap_v2: {
        ethereum: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        abi: require('./abis/uniswapV2Router.json')
    },
    pancakeswap: {
        bsc: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
        abi: require('./abis/pancakeRouter.json')
    },
    sushiswap: {
        ethereum: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
        polygon: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        abi: require('./abis/sushiRouter.json')
    }
};

// Tokens to monitor (address, symbol, decimals)
const TOKENS_TO_MONITOR = [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6, chains: ['ethereum', 'bsc', 'polygon'] },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6, chains: ['ethereum', 'bsc', 'polygon'] },
    // Add 13+ more tokens
];

// Main function
async function scanForArbitrage() {
    const allPrices = {};

    // Fetch prices for each token on all DEXs/chains
    for (const token of TOKENS_TO_MONITOR) {
        allPrices[token.symbol] = {};

        for (const chain of token.chains) {
            allPrices[token.symbol][chain] = {};

            // Check which DEXs are available on this chain
            const dexes = Object.entries(DEX_ROUTERS)
                .filter(([_, config]) => config[chain])
                .map(([name, _]) => name);

            for (const dex of dexes) {
                const price = await getTokenPrice(token, chain, dex);
                allPrices[token.symbol][chain][dex] = price;
            }
        }
    }

    // Find arbitrage opportunities
    findArbitrageOpportunities(allPrices);
}

async function getTokenPrice(token, chain, dex) {
    const routerAddress = DEX_ROUTERS[dex][chain];
    const routerABI = DEX_ROUTERS[dex].abi;
    const provider = providers[chain];

    const router = new ethers.Contract(routerAddress, routerABI, provider);

    // Use WETH/WBNB as base currency
    const wethAddress = chain === 'bsc' ?
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' : // WBNB
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH

    try {
        const path = [token.address, wethAddress];
        const amountsOut = await router.getAmountsOut(ethers.utils.parseUnits('1', token.decimals), path);
        const price = ethers.utils.formatUnits(amountsOut[1], 18);
        return parseFloat(price);
    } catch (error) {
        console.error(`Error fetching ${token.symbol} price on ${dex} (${chain}):`, error.message);
        return 0;
    }
}

function findArbitrageOpportunities(prices) {
    const MIN_PROFIT_PERCENT = 0.5; // 0.5% minimum profit threshold

    for (const [token, chains] of Object.entries(prices)) {
        for (const [chain, dexes] of Object.entries(chains)) {
            const dexPairs = Object.entries(dexes);

            if (dexPairs.length < 2) continue;

            // Compare all DEX pairs on this chain
            for (let i = 0; i < dexPairs.length; i++) {
                for (let j = i + 1; j < dexPairs.length; j++) {
                    const [dex1, price1] = dexPairs[i];
                    const [dex2, price2] = dexPairs[j];

                    if (price1 > 0 && price2 > 0) {
                        const difference = Math.abs(price1 - price2);
                        const avgPrice = (price1 + price2) / 2;
                        const percentDiff = (difference / avgPrice) * 100;

                        if (percentDiff >= MIN_PROFIT_PERCENT) {
                            const message = `🚀 ARBITRAGE OPPORTUNITY!\n` +
                                `Token: ${token}\n` +
                                `Chain: ${chain}\n` +
                                `${dex1}: ${price1.toFixed(6)}\n` +
                                `${dex2}: ${price2.toFixed(6)}\n` +
                                `Difference: ${percentDiff.toFixed(2)}%\n` +
                                `Time: ${new Date().toISOString()}`;

                            sendTelegramAlert(message);
                        }
                    }
                }
            }
        }
    }
}

function sendTelegramAlert(message) {
    bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message)
        .then(() => console.log('Alert sent'))
        .catch(err => console.error('Telegram error:', err));
}

// Run every 30 seconds
setInterval(scanForArbitrage, 30000);
scanForArbitrage(); // Initial run