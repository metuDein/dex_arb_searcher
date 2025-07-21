require('dotenv').config()
const { ethers } = require('ethers');
const axios = require('axios');

// Enhanced Configuration with validated addresses
const CONFIG = {
    networks: {
        ethereum: {
            rpc: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
            dexes: {
                uniswapV2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
                sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'
            }
        },
        polygon: {
            rpc: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
            dexes: {
                quickswap: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
                sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
            }
        },
        arbitrum: {
            rpc: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
            dexes: {
                sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
                uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564'
            }
        },
        bsc: {
            rpc: 'https://bsc-dataseed.binance.org/',
            dexes: {
                pancakeswapV2: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
                sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
            }
        }
    },
    tokenPairs: [
        // Ethereum pairs
        { base: 'WETH', quote: 'USDC', amount: 1 },
        { base: 'WBTC', quote: 'USDT', amount: 0.01 },
        { base: 'LINK', quote: 'USDC', amount: 10 },

        // Polygon pairs
        { base: 'WMATIC', quote: 'USDC', amount: 10 },
        { base: 'WETH', quote: 'USDT', amount: 0.1 },

        // Arbitrum pairs
        { base: 'WETH', quote: 'USDC', amount: 0.1 },

        // BSC pairs
        { base: 'WBNB', quote: 'BUSD', amount: 0.1 }
    ],
    tokenAddresses: {
        // Ethereum
        WETH: {
            ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            polygon: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
            arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            decimals: 18
        },
        USDC: {
            ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            arbitrum: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
            decimals: 6
        },
        WBTC: {
            ethereum: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
            polygon: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
            decimals: 8
        },
        USDT: {
            ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
            bsc: '0x55d398326f99059fF775485246999027B3197955',
            decimals: 6
        },
        LINK: {
            ethereum: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
            decimals: 18
        },

        // Polygon
        WMATIC: {
            polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            decimals: 18
        },

        // BSC
        WBNB: {
            bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            decimals: 18
        },
        BUSD: {
            bsc: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            decimals: 18
        }
    },
    threshold: 0.5, // Minimum profit percentage to alert
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
        parseMode: 'Markdown',
        notificationCooldown: 2000 // 10 seconds between notifications
    },
    scanInterval: 45000 // 45 seconds
};

// Uniswap V2 Router ABI (simplified)
const UNISWAP_V2_ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
];

class TelegramNotifier {
    constructor() {
        this.baseUrl = `https://api.telegram.org/bot${CONFIG.telegram.botToken}`;
        this.lastNotificationTime = 0;
    }

    async sendNotification(message) {
        const now = Date.now();
        if (now - this.lastNotificationTime < CONFIG.telegram.notificationCooldown) {
            console.log('Skipping notification due to cooldown');
            return;
        }

        this.lastNotificationTime = now;

        try {
            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: CONFIG.telegram.chatId,
                text: message,
                parse_mode: CONFIG.telegram.parseMode
            });
            console.log('Telegram notification sent successfully');
        } catch (error) {
            console.error('Failed to send Telegram notification:', error.response?.data || error.message);
        }
    }

    formatOpportunityMessage(opportunity) {
        return `🚀 *Arbitrage Opportunity Detected* 🚀

*Network:* ${opportunity.network}
*Pair:* ${opportunity.pair}
*Buy At:* ${opportunity.buyAt.dex} (${opportunity.buyAt.price})
*Sell At:* ${opportunity.sellAt.dex} (${opportunity.sellAt.price})
*Profit Spread:* ${opportunity.spread}

⏱ _${new Date().toLocaleTimeString()}_`;
    }
}

class DexArbitrageDetector {
    constructor() {
        this.networkDetectors = {};
        this.notifier = new TelegramNotifier();
        this.initializeNetworks();
    }

    initializeNetworks() {
        for (const [networkName, networkConfig] of Object.entries(CONFIG.networks)) {
            try {
                this.networkDetectors[networkName] = new NetworkScanner(
                    networkName,
                    networkConfig,
                    this.notifier
                );
                console.log(`Initialized ${networkName} scanner successfully`);
            } catch (error) {
                console.error(`Failed to initialize ${networkName} scanner:`, error);
            }
        }
    }

    async scanAllNetworks() {
        try {
            const scanPromises = Object.values(this.networkDetectors).map(
                detector => detector.scanAndNotify()
            );
            await Promise.all(scanPromises);
        } catch (error) {
            console.error('Error scanning networks:', error);
        }
    }
}

class NetworkScanner {
    constructor(network, networkConfig, notifier) {
        this.network = network;
        this.config = networkConfig;
        this.provider = new ethers.JsonRpcProvider(networkConfig.rpc);
        this.notifier = notifier;
    }

    async getPrice(dexName, dexAddress, baseToken, quoteToken, amount) {
        try {
            if (!dexAddress) {
                console.error(`No address found for DEX ${dexName} on ${this.network}`);
                return null;
            }

            const router = new ethers.Contract(
                dexAddress,
                UNISWAP_V2_ROUTER_ABI,
                this.provider
            );

            // Convert amount to proper units with decimals
            const amountIn = ethers.parseUnits(amount.toString(), baseToken.decimals);

            const path = [baseToken.address, quoteToken.address];

            // Call getAmountsOut
            const amounts = await router.getAmountsOut(amountIn, path);

            if (!amounts || amounts.length < 2) {
                console.error(`Invalid response from ${dexName}`);
                return null;
            }

            // Convert output amount to proper units
            const amountOut = ethers.formatUnits(amounts[1], quoteToken.decimals);
            const price = parseFloat(amountOut) / amount; // Price per token

            return {
                price: price,
                dex: dexName
            };
        } catch (error) {
            console.error(`[${this.network}] Error getting price from ${dexName}:`, error.message);
            return null;
        }
    }

    async scanAndNotify() {
        try {
            const opportunities = [];
            const relevantPairs = CONFIG.tokenPairs.filter(pair => {
                // Check if both tokens exist on this network
                const baseToken = CONFIG.tokenAddresses[pair.base]?.[this.network];
                const quoteToken = CONFIG.tokenAddresses[pair.quote]?.[this.network];

                if (!baseToken || !quoteToken) {
                    console.log(`[${this.network}] Skipping pair ${pair.base}/${pair.quote} - tokens not available on this network`);
                    return false;
                }
                return true;
            });

            if (relevantPairs.length === 0) {
                console.log(`[${this.network}] No token pairs configured for this network`);
                return;
            }

            for (const pair of relevantPairs) {
                const baseToken = {
                    address: CONFIG.tokenAddresses[pair.base][this.network],
                    decimals: CONFIG.tokenAddresses[pair.base].decimals,
                    symbol: pair.base
                };
                const quoteToken = {
                    address: CONFIG.tokenAddresses[pair.quote][this.network],
                    decimals: CONFIG.tokenAddresses[pair.quote].decimals,
                    symbol: pair.quote
                };

                const prices = [];

                // Get prices from all DEXes on this network
                for (const [dexName, dexAddress] of Object.entries(this.config.dexes)) {
                    const price = await this.getPrice(
                        dexName,
                        dexAddress,
                        baseToken,
                        quoteToken,
                        pair.amount
                    );
                    if (price) {
                        console.log(`[${this.network}] ${pair.base}/${pair.quote} @ ${dexName}: ${price.price}`);
                        prices.push(price);
                    }
                }

                // Find arbitrage if we have at least 2 prices
                if (prices.length >= 2) {
                    prices.sort((a, b) => a.price - b.price);
                    const lowest = prices[0];
                    const highest = prices[prices.length - 1];
                    const spread = ((highest.price - lowest.price) / lowest.price) * 100;

                    if (spread >= CONFIG.threshold) {
                        const opportunity = {
                            network: this.network,
                            pair: `${pair.base}/${pair.quote}`,
                            buyAt: { dex: lowest.dex, price: lowest.price.toFixed(6) },
                            sellAt: { dex: highest.dex, price: highest.price.toFixed(6) },
                            spread: spread.toFixed(2) + '%'
                        };
                        opportunities.push(opportunity);
                    }
                }
            }

            if (opportunities.length > 0) {
                console.log(`[${this.network}] Found ${opportunities.length} arbitrage opportunities`);
                for (const opportunity of opportunities) {
                    await this.notifier.sendNotification(
                        this.notifier.formatOpportunityMessage(opportunity)
                    );
                }
            } else {
                console.log(`[${this.network}] No arbitrage opportunities found`);
            }
        } catch (error) {
            console.error(`[${this.network}] Error during scan:`, error);
        }
    }
}

// Initialize and run the bot
(async () => {
    try {
        console.log('Starting multi-chain arbitrage scanner...');
        const detector = new DexArbitrageDetector();

        // Initial scan
        await detector.scanAllNetworks();

        // Set up periodic scanning
        setInterval(() => detector.scanAllNetworks(), CONFIG.scanInterval);
    } catch (error) {
        console.error('Failed to initialize bot:', error);
        process.exit(1);
    }
})();

// require('dotenv').config()
// const { ethers } = require('ethers');
// const axios = require('axios');

// // Configuration
// const CONFIG = {
//     networks: {
//         ethereum: {
//             rpc: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
//             dexes: {
//                 uniswapV2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2 Router
//                 sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'  // Sushiswap Router (V2)
//             }
//         }
//     },
//     tokenPairs: [
//         { base: 'WETH', quote: 'USDC', amount: 1 },
//         { base: 'WBTC', quote: 'USDT', amount: 0.01 }
//     ],
//     threshold: 0.5, // Minimum profit percentage to alert
//     telegram: {
//         botToken: process.env.TELEGRAM_BOT_TOKEN,
//         chatId: process.env.TELEGRAM_CHAT_ID,
//         parseMode: 'Markdown',
//         notificationCooldown: 30000 // 30 seconds between notifications
//     }
// };

// // Uniswap V2 Router ABI (simplified - only getAmountsOut needed)
// const UNISWAP_V2_ROUTER_ABI = [
//     "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
// ];

// // Both Uniswap V2 and Sushiswap use the same ABI for this function
// const DEX_ABIS = {
//     uniswapV2: UNISWAP_V2_ROUTER_ABI,
//     sushiswap: UNISWAP_V2_ROUTER_ABI
// };

// class TelegramNotifier {
//     constructor() {
//         this.baseUrl = `https://api.telegram.org/bot${CONFIG.telegram.botToken}`;
//         this.lastNotificationTime = 0;
//     }

//     async sendNotification(message) {
//         const now = Date.now();
//         if (now - this.lastNotificationTime < CONFIG.telegram.notificationCooldown) {
//             console.log('Skipping notification due to cooldown');
//             return;
//         }

//         this.lastNotificationTime = now;

//         try {
//             await axios.post(`${this.baseUrl}/sendMessage`, {
//                 chat_id: CONFIG.telegram.chatId,
//                 text: message,
//                 parse_mode: CONFIG.telegram.parseMode
//             });
//             console.log('Telegram notification sent successfully');
//         } catch (error) {
//             console.error('Failed to send Telegram notification:', error.response?.data || error.message);
//         }
//     }

//     formatOpportunityMessage(opportunity) {
//         return `🚀 *Arbitrage Opportunity Detected* 🚀

// *Pair:* ${opportunity.pair}
// *Buy At:* ${opportunity.buyAt.dex} (${opportunity.buyAt.price})
// *Sell At:* ${opportunity.sellAt.dex} (${opportunity.sellAt.price})
// *Profit Spread:* ${opportunity.spread}

// ⏱ _${new Date().toLocaleTimeString()}_`;
//     }
// }

// class DexArbitrageDetector {
//     constructor(network = 'ethereum') {
//         this.network = network;
//         this.provider = new ethers.JsonRpcProvider(CONFIG.networks[network].rpc);
//         this.dexes = CONFIG.networks[network].dexes;
//         this.tokenCache = new Map();
//         this.notifier = new TelegramNotifier();
//     }

//     async initialize() {
//         await this._loadTokenData();
//     }

//     async _loadTokenData() {
//         const commonTokens = {
//             WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
//             USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
//             WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
//             USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
//         };

//         for (const [symbol, data] of Object.entries(commonTokens)) {
//             this.tokenCache.set(symbol, data);
//         }
//     }

//     async getPrice(dex, baseToken, quoteToken, amount) {
//         try {
//             const router = new ethers.Contract(
//                 this.dexes[dex],
//                 DEX_ABIS[dex],
//                 this.provider
//             );

//             // Convert amount to proper units with decimals
//             const amountIn = ethers.parseUnits(amount.toString(), baseToken.decimals);

//             const path = [baseToken.address, quoteToken.address];

//             // Call getAmountsOut
//             const amounts = await router.getAmountsOut(amountIn, path);

//             if (!amounts || amounts.length < 2) {
//                 console.error(`Invalid response from ${dex}`);
//                 return null;
//             }

//             // Convert output amount to proper units
//             const amountOut = ethers.formatUnits(amounts[1], quoteToken.decimals);
//             const price = parseFloat(amountOut) / amount; // Price per token

//             return {
//                 price: price,
//                 dex: dex
//             };
//         } catch (error) {
//             console.error(`Error getting price from ${dex}:`, error.message);
//             return null;
//         }
//     }

//     async scanAndNotify() {
//         try {
//             const opportunities = [];

//             for (const pair of CONFIG.tokenPairs) {
//                 const baseToken = this.tokenCache.get(pair.base);
//                 const quoteToken = this.tokenCache.get(pair.quote);

//                 if (!baseToken || !quoteToken) {
//                     console.warn(`Missing token data for ${pair.base}/${pair.quote}`);
//                     continue;
//                 }

//                 const prices = [];

//                 // Get prices from all DEXes
//                 for (const dexName of Object.keys(this.dexes)) {
//                     const price = await this.getPrice(dexName, baseToken, quoteToken, pair.amount);
//                     if (price) {
//                         console.log(`Got price from ${dexName}: ${price.price}`);
//                         prices.push(price);
//                     }
//                 }

//                 // Find arbitrage if we have at least 2 prices
//                 if (prices.length >= 2) {
//                     prices.sort((a, b) => a.price - b.price);
//                     const lowest = prices[0];
//                     const highest = prices[prices.length - 1];
//                     const spread = ((highest.price - lowest.price) / lowest.price) * 100;

//                     if (spread >= CONFIG.threshold) {
//                         const opportunity = {
//                             pair: `${pair.base}/${pair.quote}`,
//                             buyAt: { dex: lowest.dex, price: lowest.price.toFixed(6) },
//                             sellAt: { dex: highest.dex, price: highest.price.toFixed(6) },
//                             spread: spread.toFixed(2) + '%'
//                         };
//                         opportunities.push(opportunity);
//                     }
//                 }
//             }

//             if (opportunities.length > 0) {
//                 console.log('Found arbitrage opportunities:', opportunities);
//                 for (const opportunity of opportunities) {
//                     await this.notifier.sendNotification(
//                         this.notifier.formatOpportunityMessage(opportunity)
//                     );
//                 }
//             } else {
//                 console.log('No arbitrage opportunities found');
//             }
//         } catch (error) {
//             console.error('Error during scan:', error);
//         }
//     }
// }

// // Initialize and run the bot
// (async () => {
//     try {
//         const detector = new DexArbitrageDetector('ethereum');
//         await detector.initialize();

//         console.log('Starting arbitrage scanner with Telegram notifications...');
//         setInterval(() => detector.scanAndNotify(), 10000); // Scan every 10 seconds
//     } catch (error) {
//         console.error('Failed to initialize bot:', error);
//         process.exit(1);
//     }
// })();
