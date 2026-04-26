const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const { ema } = require('indicatorts');
const { calculateSqueezeDeluxe } = require('./utils/squeeze_logic');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

const indonesiaStockSchema = new mongoose.Schema({
  ticker: String,
  name: String,
  active: Boolean,
  sector: String,
}, { collection: "indonesiastocks" });
const IndonesiaStock = mongoose.models.IndonesiaStock || mongoose.model("IndonesiaStock", indonesiaStockSchema);

const stockSignalSchema = new mongoose.Schema({
  ticker: String,
  sector: String,
  signalSource: String,
  entryDate: Date,
  entryPrice: Number,
  targetPrice: Number,
  stopLossPrice: Number,
  status: { type: String, default: 'pending' },
  daysHeld: { type: Number, default: 0 },
  currentPrice: Number,
  relevanceScore: Number,
  priceHistory: [{
    date: Date,
    price: Number
  }],
  metadata: Object,
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

async function analyzeTickerScalp(stock) {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 7); 
    const result = await yahooFinance.chart(stock.ticker, { period1, interval: "15m" });
    
    if (!result || !result.quotes || result.quotes.length < 40) return null;
    const quotes = result.quotes.filter(q => q.close !== null);
    if (quotes.length < 40) return null;

    const closes = quotes.map(q => q.close);
    const lastIdx = quotes.length - 1;
    const last = quotes[lastIdx];
    const prev = quotes[lastIdx - 1];
    const price = last.close;

    // 1. EMA 20 Bounce (15m)
    const ema20Arr = ema(closes, { period: 20 });
    const lastEma20 = ema20Arr[lastIdx];
    const dist20 = ((price - lastEma20) / lastEma20) * 100;

    // Price is near EMA 20 (between -0.5% and 2%) and closing above it or bouncing
    const isNearEma20 = dist20 >= -0.5 && dist20 <= 2.0;
    const isBouncing = last.close > last.open || last.close > prev.close;

    // 2. Squeeze Deluxe (15m)
    const sqzRes = calculateSqueezeDeluxe(quotes);
    const lastSqz = sqzRes[lastIdx];
    const prevSqz = sqzRes[lastIdx - 1];

    // Squeeze conditions: in squeeze (low, mid, or high) AND momentum increasing
    const inSqueeze = lastSqz.squeeze.low || lastSqz.squeeze.mid || lastSqz.squeeze.high;
    const momentumRising = lastSqz.momentum > prevSqz.momentum;
    const fluxBullish = lastSqz.flux > 0;

    // Squeeze Score (for ranking)
    let sqzScore = 0;
    if (lastSqz.squeeze.high) sqzScore += 30;
    else if (lastSqz.squeeze.mid) sqzScore += 20;
    else if (lastSqz.squeeze.low) sqzScore += 10;
    
    if (momentumRising) sqzScore += 20;
    if (lastSqz.momentum > 0) sqzScore += 20;
    if (fluxBullish) sqzScore += 30;

    const isScalpSetup = isNearEma20 && isBouncing && (inSqueeze || lastSqz.momentum > -2);

    if (isScalpSetup && sqzScore >= 40) {
        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "SCALP: EMA20 + SQZ", 
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.03), // 3% target for scalp
            stopLossPrice: Math.round(lastEma20 * 0.98), // 2% SL below EMA20
            relevanceScore: sqzScore + 100, // Scalp bonus
            daysHeld: 0,
            priceHistory: [{ date: new Date(), price: price }],
            metadata: { 
                timeframe: "15m",
                dist20: dist20.toFixed(2),
                sqzScore,
                momentum: lastSqz.momentum.toFixed(2),
                flux: lastSqz.flux.toFixed(2),
                squeezeState: lastSqz.squeeze.high ? "HIGH" : (lastSqz.squeeze.mid ? "MID" : "LOW"),
                // Standardized insight fields
                volConviction: sqzScore + 50,
                fluxStatus: lastSqz.flux > 0 ? "BULLISH (Strong Flow)" : "CAUTION (Weakening)",
                squeezeStatus: lastSqz.squeeze.high ? "HIGH COMPRESSION" : (lastSqz.squeeze.mid ? "MID COMPRESSION" : "LOW COMPRESSION")
            }
        };
    }

    return null;
  } catch (err) {
    return null;
  }
}

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const stocks = await IndonesiaStock.find({ active: true });
    console.log(`Starting 15m Scalp Scan for ${stocks.length} stocks...`);
    
    const results = [];
    const batchSize = 10;
    for (let i = 0; i < stocks.length; i += batchSize) {
        const batch = stocks.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(s => analyzeTickerScalp(s)));
        const foundInBatch = batchResults.filter(r => r !== null);
        results.push(...foundInBatch);
        if (i % 100 === 0) console.log(`Progress: ${i}/${stocks.length} | Scalp Signals Found: ${results.length}`);
        await new Promise(r => setTimeout(r, 200)); 
    }

    if (results.length > 0) {
      console.log(`Scanner found ${results.length} scalp signals. Merging...`);
      for (const newSignal of results) {
        const existing = await StockSignal.findOne({ 
          ticker: newSignal.ticker, 
          status: 'pending',
          signalSource: newSignal.signalSource
        });

        if (existing) {
          existing.currentPrice = newSignal.currentPrice;
          existing.relevanceScore = newSignal.relevanceScore;
          existing.metadata = newSignal.metadata;
          await existing.save();
        } else {
          await StockSignal.create(newSignal);
        }
      }
      console.log(`Success: Processed ${results.length} scalp results.`);
    } else {
      console.log("No new scalp signals found.");
    }

  } finally {
    await mongoose.disconnect();
  }
}
run();
