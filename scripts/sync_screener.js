const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MONGODB_URI = "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

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
    console.log("Starting Sync Screener (Conviction Engine)...");
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
                        // console.log(`[ERROR] ${ticker}: ${res.error}`);
                        return;
                    }

                    if (!res.unifiedAnalysis) {
                        // console.log(`[SKIP] ${ticker}: No analysis`);
                        return;
                    }

                    const analysis = res.unifiedAnalysis;
                    const last = res.data[res.data.length - 1];
                    const prev = res.data[res.data.length - 2];
                    
                    const fluxImproving = last.squeezeDeluxe.flux > prev.squeezeDeluxe.flux;
                    const setupGood = analysis.score.setup >= 80; 
                    
                    const v = analysis.verdict.toUpperCase();
                    
                    // Categorization Logic
                    let finalCategory = "";
                    let extraScore = 0;

                    if (v.includes("ELITE BOUNCE")) {
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

                    if (finalCategory) {
                        console.log(`[FOUND] ${ticker}: ${finalCategory} (Setup: ${analysis.score.setup}, Vol: ${analysis.score.volume})`);
                        
                        // Calculate TP/SL
                        const price = last.close;
                        const sl = Math.floor(last.ema20 * 0.96); 
                        const tp = res.pivots.r1 > price ? res.pivots.r1 : res.pivots.r2;

                        await StockSignal.findOneAndUpdate(
                            { ticker: ticker, status: "pending" },
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
                                    riskLevel: finalCategory === "TURNAROUND" ? "MEDIUM" : analysis.riskLevel,
                                    setupScore: analysis.score.setup,
                                    volScore: analysis.score.volume,
                                    squeezeInsight: analysis.squeezeInsight,
                                    dist20: ((price - last.ema20) / last.ema20 * 100).toFixed(2),
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
