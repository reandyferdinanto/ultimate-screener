const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
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
  priceHistory: [{
    date: Date,
    price: Number
  }],
  metadata: Object,
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model("StockSignal", stockSignalSchema);

async function analyzeSqueeze(stock, interval = "1d") {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 90);
    
    // Support for 4h via 1h aggregation
    let fetchInterval = interval;
    if (interval === "4h") fetchInterval = "1h";

    const result = await yahooFinance.chart(stock.ticker, { period1, interval: fetchInterval });
    
    if (!result || !result.quotes || result.quotes.length < 60) return null;
    let quotes = result.quotes.filter(q => q.close !== null);
    
    if (interval === "4h") {
        const aggregated = [];
        for (let i = 0; i < quotes.length; i += 4) {
            const chunk = quotes.slice(i, i + 4);
            if (chunk.length > 0) {
                aggregated.push({
                    date: chunk[0].date,
                    open: chunk[0].open,
                    high: Math.max(...chunk.map(c => c.high)),
                    low: Math.min(...chunk.map(c => c.low)),
                    close: chunk[chunk.length - 1].close,
                    volume: chunk.reduce((s, c) => s + (c.volume || 0), 0)
                });
            }
        }
        quotes = aggregated;
    }

    if (quotes.length < 60) return null;

    const results = calculateSqueezeDeluxe(quotes);
    if (!results) return null;

    // REFINED SCANNER LOGIC: Lookback 4 days
    let foundSignal = null;
    const lookbackDays = 4;

    for (let j = 0; j < lookbackDays; j++) {
        const idx = results.length - 1 - j;
        if (idx < 1) continue;

        const s = results[idx];
        const p = results[idx - 1];
        const quoteAtSignal = quotes[idx];
        const currentPrice = quotes[quotes.length - 1].close;

        // Squeeze & Divergence Condition
        const isDivergence = s.isBullDiv;
        const inSqueeze = s.squeeze.low || s.squeeze.mid || s.squeeze.high;
        const isFired = !inSqueeze && (results[idx-1].squeeze.low || results[idx-1].squeeze.mid);
        const isHighConviction = s.isHighConviction || (isDivergence && isFired);
        
        const momImproving = s.momentum > p.momentum;

        if ((isDivergence && inSqueeze) || isHighConviction) {
            // Price Check
            const priceDev = Math.abs((currentPrice - quoteAtSignal.close) / quoteAtSignal.close) * 100;

            if (j === 0 || priceDev <= 3.0) {
                foundSignal = {
                    ticker: stock.ticker,
                    sector: stock.sector || "Unknown",
                    signalSource: `Squeeze Divergence (${interval})`,
                    entryDate: quoteAtSignal.date,
                    entryPrice: quoteAtSignal.close,
                    currentPrice: currentPrice,
                    targetPrice: Math.round(currentPrice * 1.15),
                    stopLossPrice: Math.round(currentPrice * 0.93),
                    status: 'pending',
                    daysHeld: j * (interval === "4h" ? 4 : 24),
                    priceHistory: [{ date: quoteAtSignal.date, price: quoteAtSignal.close }],
                    metadata: {
                        strategyRank: isHighConviction ? 800 : 600,
                        momentum: s.momentum.toFixed(2),
                        flux: s.flux.toFixed(2),
                        squeezeLevel: s.squeeze.high ? "EXTREME" : (s.squeeze.mid ? "TIGHT" : "STANDARD"),
                        isHighConviction: isHighConviction,
                        divergence: "Bullish Momentum",
                        status: isHighConviction ? "SQUEEZE_RELEASE_DIV" : "SQUEEZE_PREP_DIV",
                        age: j === 0 ? "TODAY" : `${j}D_AGO`
                    }
                };
                break;
            }
        }
    }

    return foundSignal;
  } catch (err) {
    return null;
  }
}

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    const stocks = await IndonesiaStock.find({ active: true });
    console.log(`Starting Squeeze Divergence Scan for \${stocks.length} stocks...`);
    
    const timeframes = ["1d", "4h"];
    const results = [];
    
    for (const tf of timeframes) {
        console.log(`Scanning timeframe: \${tf}`);
        const batchSize = 15;
        for (let i = 0; i < stocks.length; i += batchSize) {
            const batch = stocks.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(s => analyzeSqueeze(s, tf)));
            const foundInBatch = batchResults.filter(r => r !== null);
            results.push(...foundInBatch);
            if (i % 150 === 0) console.log(`Progress [\${tf}]: \${i}/\${stocks.length} | Signals: \${results.length}`);
            await new Promise(r => setTimeout(r, 200)); 
        }
    }

    if (results.length > 0) {
      console.log(`Scanner found ${results.length} Squeeze Divergence signals.`);
      for (const newSignal of results) {
        const existing = await StockSignal.findOne({ 
          ticker: newSignal.ticker, 
          status: 'pending',
          signalSource: newSignal.signalSource
        });

        if (!existing) {
          await StockSignal.create(newSignal);
          console.log(`[NEW SIGNAL] ${newSignal.ticker} - Squeeze Divergence`);
        }
      }
    } else {
      console.log("No new Squeeze Divergence signals found.");
    }

  } finally {
    await mongoose.disconnect();
  }
}
run();
