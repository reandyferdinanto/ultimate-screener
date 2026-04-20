const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const { ema, rma, sma, atr, rsi, mfi } = require('indicatorts');

const MONGODB_URI = "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

// --- MODELS ---
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

// --- UTILS (Shared logic from lib/indicators) ---
function calculateStdev(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(0); continue; }
    const window = data.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    result.push(Math.sqrt(variance));
  }
  return result;
}

function calculateLinreg(data, period) {
  const result = [];
  const xSum = (period * (period - 1)) / 2;
  const x2Sum = (period * (period - 1) * (2 * period - 1)) / 6;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(0); continue; }
    let ySum = 0, xySum = 0;
    for (let j = 0; j < period; j++) {
      const val = data[i - (period - 1) + j];
      ySum += val; xySum += j * val;
    }
    const divisor = (period * x2Sum - xSum * xSum);
    const b = divisor === 0 ? 0 : (period * xySum - xSum * ySum) / divisor;
    const a = (ySum - b * xSum) / period;
    result.push(a + b * (period - 1));
  }
  return result;
}

function calculateSqueeze(quotes, len = 20) {
  const closes = quotes.map(q => q.close);
  const highs = quotes.map(q => q.high);
  const lows = quotes.map(q => q.low);
  const hl2 = quotes.map(q => (q.high + q.low) / 2);
  
  const smaHl2 = sma(hl2, { period: len });
  const atrRes = atr(highs, lows, closes, { period: len });
  const atrVal = atrRes.atrLine;
  const dev = calculateStdev(closes, len);

  const rawOsc = closes.map((c, i) => {
    const avgVal = (hl2[i] + (smaHl2[i] || hl2[i])) / 2;
    return ((c - avgVal) / (atrVal[i] || 1)) * 100;
  });
  const momentum = calculateLinreg(rawOsc, len);

  const sqzItems = dev.map((d, i) => {
    const a = atrVal[i] || 1;
    return d < a * 1.0; // Simple squeeze (Bollinger inside Keltner)
  });

  return { momentum, inSqueeze: sqzItems };
}

// --- ANALYSIS ---
async function analyzeTicker(stock) {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 60);
    const result = await yahooFinance.chart(stock.ticker, { period1, interval: "1d" });
    
    if (!result || !result.quotes || result.quotes.length < 30) return null;
    const quotes = result.quotes.filter(q => q.close !== null);
    if (quotes.length < 30) return null;

    const closes = quotes.map(q => q.close);
    const volumes = quotes.map(q => q.volume);
    const lastIdx = quotes.length - 1;
    const last = quotes[lastIdx];
    const prev = quotes[lastIdx - 1];
    const price = last.close;
    
    if (price <= 50) return null; // Filter out "penny" stocks

    // Technicals
    const ema20Arr = ema(closes, { period: 20 });
    const lastEma20 = ema20Arr[ema20Arr.length - 1];
    const dist20 = ((price - lastEma20) / lastEma20) * 100;
    
    const mfiArr = mfi(quotes.map(q=>q.high), quotes.map(q=>q.low), closes, volumes, { period: 14 });
    const lastMfi = mfiArr[mfiArr.length - 1];

    const ma20Vol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = last.volume / ma20Vol;

    // 1. IMPROVED STRATEGY: SECRET SAUCE (Accumulation + Tightness)
    const consolidationScore = Math.abs(closes[lastIdx] - closes[lastIdx - 3]) / closes[lastIdx] * 100;
    const isSecretSauce = 
        volRatio > 1.2 && 
        last.close > prev.close && 
        lastMfi > 60 && lastMfi < 85 &&
        dist20 > -2 && dist20 < 6 && 
        consolidationScore < 4.0;

    if (isSecretSauce) {
        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "Secret Sauce",
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.15),
            stopLossPrice: Math.round(price * 0.94),
            metadata: { volRatio, mfi: lastMfi, dist20, consolidationScore, strategyRank: 500 }
        };
    }

    // 2. IMPROVED STRATEGY: SQUEEZE RELEASE (Momentum + Volatility)
    const sqzData = calculateSqueeze(quotes, 20);
    const lastMom = sqzData.momentum[lastIdx];
    const prevMom = sqzData.momentum[lastIdx - 1];
    const wasInSqueeze = sqzData.inSqueeze[lastIdx - 1] || sqzData.inSqueeze[lastIdx - 2];
    const isReleasing = !sqzData.inSqueeze[lastIdx] && wasInSqueeze;
    const momUp = lastMom > prevMom && lastMom > 0;

    if (isReleasing && momUp && volRatio > 1.1) {
        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "Squeeze Explosion",
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.20),
            stopLossPrice: Math.round(price * 0.92),
            metadata: { momentum: lastMom, volRatio, strategyRank: 600 }
        };
    }

    // 3. IMPROVED STRATEGY: EMA BOUNCE (Trend Flow)
    const isRetest = dist20 >= -0.5 && dist20 <= 2.5;
    const isBouncing = last.close > prev.close && last.volume > (ma20Vol * 0.7);
    
    if (isRetest && isBouncing && price > lastEma20) {
        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "EMA Bounce",
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.10),
            stopLossPrice: Math.round(lastEma20 * 0.97),
            metadata: { dist20, volRatio, mfi: lastMfi, strategyRank: 100 }
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
    console.log(`Starting Improved Scan for ${stocks.length} stocks...`);
    
    const results = [];
    const batchSize = 12;
    for (let i = 0; i < stocks.length; i += batchSize) {
        const batch = stocks.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(s => analyzeTicker(s)));
        results.push(...batchResults.filter(r => r !== null));
        if (i % 120 === 0) console.log(`Progress: ${i}/${stocks.length} | Found: ${results.length}`);
        await new Promise(r => setTimeout(r, 150)); 
    }

    if (results.length > 0) {
      console.log(`Processing ${results.length} results...`);
      for (const newSignal of results) {
        const existing = await StockSignal.findOne({ 
          ticker: newSignal.ticker, 
          status: 'pending',
          signalSource: newSignal.signalSource
        });
        if (!existing) {
          await StockSignal.create(newSignal);
        } else {
          existing.currentPrice = newSignal.currentPrice;
          const hours = Math.floor((new Date() - new Date(existing.entryDate)) / (1000 * 60 * 60));
          existing.daysHeld = hours;
          await existing.save();
        }
      }
    }
    console.log("Scan complete.");
  } finally {
    await mongoose.disconnect();
  }
}
run();
