const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

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

async function updateFlyerRadarPrices() {
    console.log("Starting FlyerRadar Daily Price Update...");
    try {
        await mongoose.connect(MONGODB_URI);
        
        const items = await FlyerRadar.find({ status: { $ne: 'archived' } });
        console.log(`Found ${items.length} active flyer radar items to update`);
        
        for (const item of items) {
            try {
                const ticker = item.ticker.replace('.JK', '') + '.JK';
                const quote = await yahooFinance.quote(ticker);
                const currentPrice = quote.regularMarketPrice;
                
                if (!currentPrice) {
                    console.log(`[SKIP] ${item.ticker}: No price available`);
                    continue;
                }
                
                item.currentPrice = currentPrice;
                item.priceHistory.push({
                    date: new Date(),
                    price: currentPrice
                });
                
                const entryPrice = item.entryPrice;
                const targetPrice = item.targetPrice;
                const stopLossPrice = item.stopLossPrice || entryPrice * 0.95;
                
                if (currentPrice >= targetPrice) {
                    item.status = 'flying';
                    console.log(`[FLYING] ${item.ticker}: Target hit! ${entryPrice} -> ${currentPrice} (+${(((currentPrice - entryPrice) / entryPrice) * 100).toFixed(1)}%)`);
                } else if (currentPrice <= stopLossPrice) {
                    item.status = 'failed';
                    console.log(`[FAILED] ${item.ticker}: Stop loss triggered! ${entryPrice} -> ${currentPrice} (${(((currentPrice - entryPrice) / entryPrice) * 100).toFixed(1)}%)`);
                } else {
                    const changePct = ((currentPrice - entryPrice) / entryPrice) * 100;
                    if (changePct > 5) {
                        item.status = 'taking_off';
                        console.log(`[TAKING_OFF] ${item.ticker}: Gaining momentum ${changePct.toFixed(1)}%`);
                    } else {
                        item.status = 'silent';
                        console.log(`[SILENT] ${item.ticker}: ${currentPrice} (${changePct.toFixed(1)}%)`);
                    }
                }
                
                await item.save();
                console.log(`[OK] ${item.ticker}: ${entryPrice} -> ${currentPrice}`);
                
            } catch (e) {
                console.log(`[ERROR] ${item.ticker}: ${e.message}`);
            }
            
            await new Promise(r => setTimeout(r, 500));
        }
        
        console.log("FlyerRadar price update complete.");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

updateFlyerRadarPrices();