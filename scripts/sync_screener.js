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

async function runScreener() {
    console.log("Starting Sync Screener (Conviction Engine v2)...");
    try {
        await mongoose.connect(MONGODB_URI);
        const stocks = await IndonesiaStock.find({ active: true });
        console.log(`Scanning ${stocks.length} active stocks...`);

        // We'll process in chunks to avoid overwhelming the API
        const chunkSize = 20;
        for (let i = 0; i < stocks.length; i += chunkSize) {
            const chunk = stocks.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (stock) => {
                try {
                    const ticker = stock.ticker;
                    // Use localhost:3004 (Production Next.js Port)
                    const res = await fetch(`http://localhost:3004/api/technical?symbol=${ticker}`).then(r => r.json());
                    
                    if (!res.success) {
                        return;
                    }

                    if (!res.unifiedAnalysis) {
                        return;
                    }

                    const analysis = res.unifiedAnalysis;
                    const last = res.data[res.data.length - 1];
                    const prev = res.data[res.data.length - 2];
                    
                    const fluxImproving = last.squeezeDeluxe.flux > prev.squeezeDeluxe.flux;
                    const setupGood = analysis.score.setup >= 80; 
                    
                    const v = analysis.verdict.toUpperCase();
                    
                    // [NEW] Squeeze + Bounce Confluence (Super High Conviction)
                    const isSqueezeBounce = last.isSqueezeBounce === true;
                    
                    // [NEW] SMA50 trend filter — skip downtrend stocks
                    const isAboveSma50 = last.close > last.sma50;
                    if (!isAboveSma50 && !v.includes("TURNAROUND") && !v.includes("SILENT")) {
                        return; // Skip downtrend stocks (except turnaround/accumulation plays)
                    }
                    
                    // Categorization Logic
                    let finalCategory = "";
                    let extraScore = 0;

                    const isSilentFlyer = (analysis.squeezeDuration > 10 || (isSqueezeBounce && analysis.squeezeDuration > 5)) && 
                                          res.elliott?.trend === 'BULLISH' && 
                                          last.squeezeDeluxe.flux > 0 &&
                                          last.close > last.ema20;

                    if (isSilentFlyer) {
                        finalCategory = "SILENT FLYER";     // The "BNBR/KOTA/LAND" DNA
                        extraScore = 150;
                    } else if (isSqueezeBounce) {
                        finalCategory = "ELITE BOUNCE";     // Squeeze+bounce = highest conviction
                        extraScore = 130;
                    } else if (v.includes("ELITE BOUNCE")) {
                        finalCategory = "ELITE BOUNCE";
                        extraScore = 100;
                    } else if (v.includes("BUY ON DIP")) {
                        finalCategory = "BUY ON DIP";
                        extraScore = 80;
                    } else if (v.includes("TURNAROUND") || (v.includes("MIXED SIGNAL") && setupGood && fluxImproving)) {
                        finalCategory = "TURNAROUND";
                        extraScore = 50;
                    } else if (v.includes("VOLATILITY EXPLOSION")) {
                        finalCategory = "VOLATILITY EXPLOSION";
                        extraScore = 70;
                    } else if (v.includes("SILENT ACCUMULATION")) {
                        finalCategory = "SILENT ACCUMULATION";
                        extraScore = 60;
                    }

                    // ===== QUALITY GATES — Learned from Elite Bounce Postmortem =====
                    if (finalCategory) {
                        const price = last.close;
                        const lastSqz = last.squeezeDeluxe;
                        const momentum = lastSqz?.momentum || 0;
                        const flux = lastSqz?.flux || 0;
                        const volScore = last.volumeScore || 0;

                        // Gate 1: ELITE BOUNCE requires positive momentum (reject MOM < 0)
                        if (finalCategory === "ELITE BOUNCE" && momentum < 0) {
                            console.log(`[REJECT] ${ticker}: ELITE BOUNCE rejected — Momentum ${momentum.toFixed(1)} < 0 (not ready)`);
                            finalCategory = "";
                        }

                        // Gate 2: ELITE BOUNCE requires non-negative flux (reject distribution)
                        if (finalCategory === "ELITE BOUNCE" && flux < -2) {
                            console.log(`[REJECT] ${ticker}: ELITE BOUNCE rejected — Flux ${flux.toFixed(1)} (distribution phase)`);
                            finalCategory = "";
                        }

                        // Gate 3: Minimum volume score (at least 3 of 6 volume indicators bullish)
                        if ((finalCategory === "ELITE BOUNCE" || finalCategory === "BUY ON DIP") && volScore < 3) {
                            console.log(`[REJECT] ${ticker}: ${finalCategory} rejected — Volume Score ${volScore}/6 too weak`);
                            finalCategory = "";
                        }

                        // Gate 4: Minimum price filter (< 50 = too illiquid/spready)
                        if (price < 50 && finalCategory) {
                            console.log(`[REJECT] ${ticker}: Skipped — Price ${price} too low (min 50)`);
                            finalCategory = "";
                        }
                    }

                    if (finalCategory) {
                        const price = last.close;
                        const lastSqz = last.squeezeDeluxe;
                        const momentum = lastSqz?.momentum || 0;
                        const flux = lastSqz?.flux || 0;

                        console.log(`[FOUND] ${ticker}: ${finalCategory} (Setup: ${analysis.score.setup}, Vol: ${analysis.score.volume}, MOM: ${momentum.toFixed(1)}, FLUX: ${flux.toFixed(1)})`);
                        
                        // [FIX] TP Calculation — Fallback to percentage if pivot <= price
                        let tp = res.pivots.r1 > price ? res.pivots.r1 : res.pivots.r2;
                        if (tp <= price) {
                            const multiplier = finalCategory === "SILENT FLYER" ? 1.20 :
                                              (finalCategory === "ELITE BOUNCE" ? 1.12 : 
                                              (finalCategory === "VOLATILITY EXPLOSION" ? 1.15 : 1.10));
                            tp = price * multiplier;
                            console.log(`[TP_FIX] ${ticker}: Pivot TP below price, using ${((multiplier - 1) * 100).toFixed(0)}% fallback = ${Math.round(tp)}`);
                        }
                        // [FIX] Always use "pending" status and allow re-activation of archived signals if it's a SILENT FLYER
                        const query = finalCategory === "SILENT FLYER" ? { ticker: ticker } : { ticker: ticker, status: "pending" };

                        await StockSignal.findOneAndUpdate(
                            query,
                            {
                                ticker: ticker,
                                status: "pending",
                                entryPrice: price,
                                targetPrice: Math.round(tp),
                                stopLossPrice: Math.round(sl),
                                currentPrice: price,
                                signalSource: `CONVICTION: ${finalCategory}`,
                                relevanceScore: analysis.score.setup + analysis.score.volume + extraScore,
                                metadata: {
                                    verdict: analysis.verdict,
                                    riskLevel: (finalCategory === "TURNAROUND" || finalCategory === "SILENT FLYER") ? "MEDIUM" : analysis.riskLevel,
                                    setupScore: analysis.score.setup,
                                    volScore: analysis.score.volume,
                                    squeezeInsight: analysis.squeezeInsight,
                                    squeezeDuration: analysis.squeezeDuration,
                                    elliottTrend: res.elliott?.trend || "NEUTRAL",
                                    dist20: ((price - last.ema20) / last.ema20 * 100).toFixed(2),
                                    momentum: momentum.toFixed(1),
                                    flux: flux.toFixed(1),
                                    volumeScore: last.volumeScore || 0,
                                    volDetails: analysis.volDetails,
                                    fluxTrend: fluxImproving ? "Improving" : "Stagnant"
                                },
                                updatedAt: new Date()
                            },
                            { upsert: true, new: true }
                        );
                    }
                } catch (e) {
                    // console.error(`Error processing ${stock.ticker}: ${e.message}`);
                }
            }));
            console.log(`Processed ${Math.min(i + chunkSize, stocks.length)}/${stocks.length}...`);
        }

        console.log("Screener sync complete.");
    } catch (err) {
        console.error("Screener Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

runScreener();
