const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const { calculateSqueezeDeluxe } = require('./utils/squeeze_logic');

const MONGODB_URI = "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

// Schemas
const indonesiaStockSchema = new mongoose.Schema({
  ticker: String,
  active: Boolean,
  sector: String,
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const stockSignalSchema = new mongoose.Schema({
  ticker: { type: String, required: true },
  sector: { type: String, required: true },
  signalSource: { type: String, required: true },
  entryDate: { type: Date, required: true },
  entryPrice: { type: Number, required: true },
  targetPrice: { type: Number, required: true },
  status: { type: String, default: 'pending' },
  relevanceScore: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

async function scan() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const stocks = await IndonesiaStock.find({ active: true });
    console.log(`ARA Hunter: Scanning ${stocks.length} stocks...`);

    const batchSize = 15;
    const candidates = [];

    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      await Promise.all(batch.map(async (stock) => {
        try {
          const history = await yahooFinance.historical(stock.ticker, {
            period1: new Date(Date.now() - 100 * 86400000), // 100 days
            period2: new Date(),
            interval: '1d'
          });

          if (history.length < 40) return;

          const results = calculateSqueezeDeluxe(history);
          if (!results) return;

          const lastIdx = history.length - 1;
          const recentResults = results.slice(-5);
          const recentHistory = history.slice(-5);

          // ARA Hunter Logic:
          // 1. Squeeze in any of the last 4 days (T-1 to T-4)
          let squeezeBefore = false;
          let tightRange = true;
          let totalRange = 0;
          for (let j = 0; j < 4; j++) {
              if (recentResults[j].squeeze.low || recentResults[j].squeeze.mid || recentResults[j].squeeze.high) {
                  squeezeBefore = true;
              }
              const dayRange = (recentHistory[j].high - recentHistory[j].low) / recentHistory[j].close;
              totalRange += dayRange;
          }
          const avgRangeBefore = totalRange / 4;
          
          // 2. Momentum curling up
          const momUp = recentResults[4].momentum > recentResults[3].momentum && 
                        recentResults[3].momentum > recentResults[2].momentum;

          // 3. Volume surge today
          const avgVol20 = history.slice(-21, -1).reduce((sum, h) => sum + h.volume, 0) / 20;
          const volRatio = history[lastIdx].volume / avgVol20;

          // 4. Price change today
          const change = ((history[lastIdx].close / history[lastIdx-1].close) - 1) * 100;

          // Criteria for candidate
          if (squeezeBefore && momUp && volRatio > 2 && change > 5 && avgRangeBefore < 0.10) {
            console.log(`[MATCH] ${stock.ticker} | Change: ${change.toFixed(2)}% | VolRatio: ${volRatio.toFixed(2)}x | Squeeze: YES`);
            candidates.push({
              ticker: stock.ticker,
              sector: stock.sector || 'Unknown',
              change,
              volRatio,
              entryPrice: history[lastIdx].close,
              momentum: recentResults[4].momentum,
              squeeze: recentResults[4].squeeze
            });

            // Save as signal
            await StockSignal.findOneAndUpdate(
              { ticker: stock.ticker, signalSource: 'ARAHunter', entryDate: { $gte: new Date(new Date().setHours(0,0,0,0)) } },
              {
                ticker: stock.ticker,
                sector: stock.sector || 'Unknown',
                signalSource: 'ARAHunter',
                entryDate: new Date(),
                entryPrice: history[lastIdx].close,
                targetPrice: history[lastIdx].close * 1.2, // Arbitrary 20% target
                status: 'pending',
                relevanceScore: volRatio * (change / 10),
                metadata: {
                  volRatio,
                  change,
                  momentum: recentResults[4].momentum,
                  squeezeStatus: recentResults[4].squeeze,
                  avgRangeBefore
                }
              },
              { upsert: true, new: true }
            );
          }
        } catch (e) {
          // ignore individual ticker errors
        }
      }));
      console.log(`Progress: ${i + batch.length}/${stocks.length}`);
    }

    console.log(`ARA Hunter scan completed. Found ${candidates.length} candidates.`);
  } catch (error) {
    console.error('Scan error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

scan();
