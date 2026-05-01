const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

// Schemas
const stockSignalSchema = new mongoose.Schema({
    ticker: String,
    status: String,
    entryPrice: Number,
    targetPrice: Number,
    stopLossPrice: Number,
    currentPrice: Number,
    signalSource: String,
    metadata: mongoose.Schema.Types.Mixed,
    relevanceScore: Number,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { collection: "stocksignals" });

const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

const indonesiaStockSchema = new mongoose.Schema({
    ticker: String, name: String, active: Boolean, sector: String, lastPrice: Number
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const flyerRadarSchema = new mongoose.Schema({
    ticker: String,
    sector: String,
    signalSource: String,
    entryDate: Date,
    entryPrice: Number,
    targetPrice: Number,
    stopLossPrice: Number,
    status: String,
    currentPrice: Number,
    relevanceScore: Number,
    priceHistory: [{
        date: Date,
        price: Number
    }],
    metadata: mongoose.Schema.Types.Mixed,
}, { collection: "flyerradars", timestamps: true });

const FlyerRadar = mongoose.models.FlyerRadar || mongoose.model("FlyerRadar", flyerRadarSchema);

// Helper functions
function calculateEMA(closes, period) {
    const k = 2 / (period + 1);
    const ema = [];
    for (let i = 0; i < closes.length; i++) {
        if (i === 0) {
            ema.push(closes[i]);
        } else if (i < period) {
            const sum = closes.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
            ema.push(sum);
        } else {
            ema.push(closes[i] * k + ema[i - 1] * (1 - k));
        }
    }
    return ema;
}

function calculateRSI(closes, period = 14) {
    const rsi = [];
    let gains = 0, losses = 0;
    
    for (let i = 0; i < closes.length; i++) {
        if (i === 0) {
            rsi.push(50);
        } else {
            const change = closes[i] - closes[i - 1];
            gains = change > 0 ? (gains * (period - 1) + change) / period : gains * (period - 1) / period;
            losses = change < 0 ? (losses * (period - 1) + Math.abs(change)) / period : losses * (period - 1) / period;
            const rs = gains / (losses || 1);
            rsi.push(100 - (100 / (1 + rs)));
        }
    }
    return rsi;
}

function calculateSqueezeDuration(data, ema20) {
    let duration = 0;
    const lookback = 20;
    
    for (let i = data.length - 1; i >= Math.max(0, data.length - lookback); i--) {
        const candle = data[i];
        const range = Math.max(...data.slice(Math.max(0, i - lookback), i + 1).map(d => d.high)) - 
                     Math.min(...data.slice(Math.max(0, i - lookback), i + 1).map(d => d.low));
        const candleRange = (candle.high - candle.low) / candle.close;
        
        // Tight range indicates squeeze
        if (candleRange < 0.02 || candleRange < range * 0.3) {
            duration++;
        } else {
            break;
        }
    }
    
    return duration;
}

async function runScreener() {
    console.log("Starting Sync Screener (Silent Flyer Focus v3)...");
    try {
        await mongoose.connect(MONGODB_URI);
        const stocks = await IndonesiaStock.find({ active: true });
        console.log(`Scanning ${stocks.length} active stocks...`);

        const chunkSize = 15;
        const silentFlyersFound = [];
        
        for (let i = 0; i < stocks.length; i += chunkSize) {
            const chunk = stocks.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (stock) => {
                try {
                    const ticker = stock.ticker;
                    const symbol = ticker.replace('.JK', '') + '.JK';
                    
                    // Fetch 1 year of daily data
                    const result = await yahooFinance.chart(symbol, {
                        period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                        period2: new Date(),
                        interval: '1d'
                    });
                    
                    if (!result.quotes || result.quotes.length < 60) {
                        return;
                    }
                    
                    const quotes = result.quotes.filter(q => q.close !== null && q.volume > 0);
                    if (quotes.length < 60) return;
                    
                    const closes = quotes.map(q => q.close);
                    const last = quotes[quotes.length - 1];
                    const prev = quotes[quotes.length - 2];
                    const prev5 = quotes[Math.max(0, quotes.length - 6)];
                    
                    // Calculate indicators
                    const ema20 = calculateEMA(closes, 20);
                    const rsi = calculateRSI(closes);
                    
                    const lastEma20 = ema20[ema20.length - 1];
                    const lastRsi = rsi[rsi.length - 1];
                    const lastMfi = 50; // Simplified
                    
                    // Price must be above EMA20 (no downtrend)
                    if (last.close < lastEma20) {
                        return;
                    }
                    
                    // Minimum price filter (< 50 = too illiquid)
                    if (last.close < 50) {
                        return;
                    }
                    
                    // Calculate squeeze duration
                    const squeezeDuration = calculateSqueezeDuration(quotes, lastEma20);
                    
                    // ========== SILENT FLYER CRITERIA ==========
                    // 1. Long squeeze (8+ bars of compression)
                    // 2. RSI supportive (30-65 for bounce potential)
                    // 3. MFI supportive (not extreme)
                    // 4. Above EMA20
                    // 5. Price not overextended (>10% from EMA20)
                    
                    const dist20 = ((last.close - lastEma20) / lastEma20) * 100;
                    const rsiOk = lastRsi >= 30 && lastRsi <= 65;
                    const notOverextended = dist20 < 10;
                    
                    // Check for momentum building (just after squeeze)
                    const recentChange = ((last.close - prev5.close) / prev5.close) * 100;
                    const momImproving = recentChange > 0 && recentChange < 5; // Small positive, not runaway
                    
                    const isSilentFlyer = squeezeDuration >= 8 && rsiOk && notOverextended && momImproving;
                    
                    if (isSilentFlyer) {
                        console.log(`[SILENT FLYER] ${ticker}: Sqz=${squeezeDuration}d, RSI=${lastRsi.toFixed(1)}, Dist=${dist20.toFixed(1)}%, Change=${recentChange.toFixed(1)}%`);
                        
                        // Calculate TP/SL
                        const entryPrice = last.close;
                        // Target: 30%+ for Silent Flyer
                        const targetPrice = Math.round(entryPrice * 1.30);
                        // Stop: Below EMA20
                        const stopLossPrice = Math.round(lastEma20 * 0.97);
                        
                        // Score based on factors
                        let score = 150; // Base score for SILENT FLYER
                        score += Math.min(50, squeezeDuration * 3);
                        score += lastRsi >= 40 && lastRsi <= 55 ? 30 : 10; // Sweet spot bonus
                        score += momImproving ? 20 : 0;
                        score += dist20 <= 3 ? 20 : 0;
                        
                        // Save to StockSignal
                        const scanRunAt = new Date();
                        const query = { ticker: ticker, signalSource: "CONVICTION: SILENT FLYER" };
                        const existing = await StockSignal.findOne(query);
                        const currentPrice = entryPrice;
                        const storedEntryPrice = existing?.entryPrice || currentPrice;
                        const updateData = {
                            ticker: ticker,
                            status: "pending",
                            entryPrice: storedEntryPrice,
                            entryDate: existing ? existing.entryDate : scanRunAt,
                            targetPrice: existing?.targetPrice || Math.round(storedEntryPrice * 1.30),
                            stopLossPrice: existing?.stopLossPrice || stopLossPrice,
                            currentPrice: currentPrice,
                            signalSource: "CONVICTION: SILENT FLYER",
                            relevanceScore: score,
                            priceHistory: [
                                ...((existing?.priceHistory || []).map(h => ({ date: h.date, price: h.price }))),
                                { date: scanRunAt, price: currentPrice }
                            ].slice(-60),
                            metadata: {
                                ...(existing?.metadata || {}),
                                category: "SILENT_FLYER",
                                verdict: `SILENT FLYER: Squeeze ${squeezeDuration}d with momentum building`,
                                riskLevel: "MEDIUM",
                                setupScore: score,
                                volScore: 50,
                                squeezeInsight: `Compression for ${squeezeDuration} bars. RSI ${lastRsi.toFixed(0)}, dist ${dist20.toFixed(1)}%. Momentum ${momImproving ? 'improving' : 'building'}.`,
                                squeezeDuration: squeezeDuration,
                                dist20: dist20.toFixed(2),
                                momentum: recentChange.toFixed(1),
                                flux: "BULLISH",
                                fluxTrend: "Improving",
                                dataSource: "YahooFinance.chart(1d) + SilentFlyerScanner",
                                lastScannedAt: scanRunAt.toISOString(),
                                scanRunAt: scanRunAt.toISOString(),
                                lastQuoteDate: last.date ? new Date(last.date).toISOString() : scanRunAt.toISOString(),
                                firstEntryPrice: existing?.metadata?.firstEntryPrice || storedEntryPrice,
                                latestPrice: currentPrice,
                                firstAppearedAt: existing ? (existing.metadata?.firstAppearedAt || existing.createdAt?.toISOString()) : scanRunAt.toISOString(),
                                appearedAt: existing ? (existing.metadata?.appearedAt || existing.createdAt?.toISOString()) : scanRunAt.toISOString()
                            },
                            sector: stock.sector,
                            updatedAt: scanRunAt
                        };
                        
                        await StockSignal.findOneAndUpdate(query, updateData, { upsert: true, new: true });
                        
                        // Also add to FlyerRadar for immediate tracking
                        const existingRadar = await FlyerRadar.findOne({ ticker: ticker });
                        if (!existingRadar) {
                            await FlyerRadar.create({
                                ticker: ticker,
                                sector: stock.sector,
                                signalSource: "SILENT FLYER",
                                entryDate: new Date(),
                                entryPrice: entryPrice,
                                targetPrice: targetPrice,
                                stopLossPrice: stopLossPrice,
                                status: "silent",
                                currentPrice: entryPrice,
                                relevanceScore: score,
                                priceHistory: [{
                                    date: new Date(),
                                    price: entryPrice
                                }],
                                metadata: {
                                    squeezeDuration,
                                    rsi: lastRsi,
                                    dist20,
                                    changeFromEntry: 0
                                }
                            });
                            console.log(`[RADAR] Added ${ticker} to FlyerRadar`);
                        }
                        
                        silentFlyersFound.push(ticker);
                    }
                    
                    // ========== ELITE BOUNCE CRITERIA ==========
                    const isSqueezeBounce = squeezeDuration >= 5 && 
                                           lastRsi >= 40 && lastRsi <= 68 &&
                                           last.close > lastEma20 &&
                                           dist20 < 5;
                    
                    if (isSqueezeBounce && !isSilentFlyer) {
                        console.log(`[ELITE BOUNCE] ${ticker}: Sqz=${squeezeDuration}d, RSI=${lastRsi.toFixed(1)}`);
                        
                        const entryPrice = last.close;
                        const targetPrice = Math.round(entryPrice * 1.15);
                        const stopLossPrice = Math.round(Math.min(lastEma20, quotes.slice(-5).map(q => q.low)) * 0.98);
                        
                        let score = 130;
                        score += squeezeDuration * 5;
                        
                        const eliteScanRunAt = new Date();
                        const existingElite = await StockSignal.findOne({ ticker: ticker, signalSource: "CONVICTION: ELITE BOUNCE" });
                        const eliteCurrentPrice = entryPrice;
                        const eliteStoredEntryPrice = existingElite?.entryPrice || eliteCurrentPrice;
                        await StockSignal.findOneAndUpdate(
                            { ticker: ticker, signalSource: "CONVICTION: ELITE BOUNCE" },
                            {
                                ticker: ticker,
                                status: "pending",
                                entryPrice: eliteStoredEntryPrice,
                                entryDate: existingElite ? existingElite.entryDate : eliteScanRunAt,
                                targetPrice: existingElite?.targetPrice || Math.round(eliteStoredEntryPrice * 1.15),
                                stopLossPrice: existingElite?.stopLossPrice || stopLossPrice,
                                currentPrice: eliteCurrentPrice,
                                signalSource: "CONVICTION: ELITE BOUNCE",
                                relevanceScore: score,
                                priceHistory: [
                                    ...((existingElite?.priceHistory || []).map(h => ({ date: h.date, price: h.price }))),
                                    { date: eliteScanRunAt, price: eliteCurrentPrice }
                                ].slice(-60),
                                metadata: {
                                    ...(existingElite?.metadata || {}),
                                    category: "ELITE_BOUNCE",
                                    verdict: "ELITE BOUNCE: Squeeze bounce confirmed",
                                    riskLevel: "LOW",
                                    squeezeDuration,
                                    squeezeInsight: `Squeeze ${squeezeDuration}d bounce. RSI ${lastRsi.toFixed(0)}.`,
                                    rsi: lastRsi,
                                    dataSource: "YahooFinance.chart(1d) + SilentFlyerScanner",
                                    lastScannedAt: eliteScanRunAt.toISOString(),
                                    scanRunAt: eliteScanRunAt.toISOString(),
                                    lastQuoteDate: last.date ? new Date(last.date).toISOString() : eliteScanRunAt.toISOString(),
                                    firstEntryPrice: existingElite?.metadata?.firstEntryPrice || eliteStoredEntryPrice,
                                    latestPrice: eliteCurrentPrice,
                                    firstAppearedAt: existingElite ? (existingElite.metadata?.firstAppearedAt || existingElite.createdAt?.toISOString()) : eliteScanRunAt.toISOString(),
                                    appearedAt: existingElite ? (existingElite.metadata?.appearedAt || existingElite.createdAt?.toISOString()) : eliteScanRunAt.toISOString()
                                },
                                updatedAt: eliteScanRunAt
                            },
                            { upsert: true, new: true }
                        );
                    }
                    
                } catch (e) {
                    // Silently skip errors
                }
            }));
            
            console.log(`Processed ${Math.min(i + chunkSize, stocks.length)}/${stocks.length}... | Found ${silentFlyersFound.length} Silent Flyers`);
        }
        
        console.log("\n========================================");
        console.log(`Screener sync complete!`);
        console.log(`Total Silent Flyers: ${silentFlyersFound.length}`);
        console.log(`Tickers: ${silentFlyersFound.slice(0, 20).join(', ')}${silentFlyersFound.length > 20 ? '...' : ''}`);
        console.log("========================================");
        
    } catch (err) {
        console.error("Screener Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

runScreener();
