const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });
const { ema, rma, sma, atr, rsi, mfi } = require('indicatorts');
const { RSI: RSICalc } = require('technicalindicators');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

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

// --- HELPER: ATR Calculation ---
function calculateATR(quotes, period = 14) {
    const result = [];
    for (let i = 0; i < quotes.length; i++) {
        if (i === 0) { result.push(quotes[i].high - quotes[i].low); continue; }
        const tr = Math.max(
            quotes[i].high - quotes[i].low,
            Math.abs(quotes[i].high - quotes[i - 1].close),
            Math.abs(quotes[i].low - quotes[i - 1].close)
        );
        if (i < period) {
            result.push(tr);
        } else if (i === period) {
            const avg = result.slice(0, period).reduce((a, b) => a + b, 0) / period;
            result.push(avg);
        } else {
            result.push((result[result.length - 1] * (period - 1) + tr) / period);
        }
    }
    return result;
}

// --- HELPER: Higher Low Check ---
function hasHigherLows(lows, count = 3) {
    const recent = lows.slice(-count);
    if (recent.length < count) return false;
    for (let i = 1; i < recent.length; i++) {
        if (recent[i] < recent[i - 1] * 0.995) return false; // Allow 0.5% tolerance
    }
    return true;
}

// --- ANALYSIS ---
async function analyzeTicker(stock) {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 90); // Extended from 60 to 90 for SMA50 accuracy
    const result = await yahooFinance.chart(stock.ticker, { period1, interval: "1d" });
    
    if (!result || !result.quotes || result.quotes.length < 50) return null;
    const quotes = result.quotes.filter(q => q.close !== null && q.high !== null && q.low !== null);
    if (quotes.length < 50) return null;

    const closes = quotes.map(q => q.close);
    const highs = quotes.map(q => q.high);
    const lows = quotes.map(q => q.low);
    const volumes = quotes.map(q => q.volume);
    const lastIdx = quotes.length - 1;
    const last = quotes[lastIdx];
    const prev = quotes[lastIdx - 1];
    const price = last.close;
    
    if (price <= 50) return null; // Filter out "penny" stocks

    // ===== CORE TECHNICALS =====
    const ema20Arr = ema(closes, { period: 20 });
    const sma50Arr = sma(closes, { period: 50 });
    const lastEma20 = ema20Arr[ema20Arr.length - 1];
    const lastSma50 = sma50Arr[sma50Arr.length - 1];
    const dist20 = ((price - lastEma20) / lastEma20) * 100;
    
    const mfiArr = mfi(highs, lows, closes, volumes, { period: 14 });
    const lastMfi = mfiArr[mfiArr.length - 1];

    const rsiArr = RSICalc.calculate({ period: 14, values: closes });
    const lastRsi = rsiArr[rsiArr.length - 1];

    const ma20Vol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = last.volume / ma20Vol;

    // ===== NEW: SMA50 TREND FILTER (Eliminates downtrend stocks) =====
    const isAboveSma50 = price > lastSma50;

    // ===== NEW: ATR COMPRESSION (Pre-breakout #1 predictor) =====
    const atrValues = calculateATR(quotes, 14);
    const atr5 = atrValues.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const atr20 = atrValues.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const atrCompressionRatio = atr20 > 0 ? atr5 / atr20 : 1;
    const isCompressed = atrCompressionRatio < 0.75;

    // ===== NEW: 3-DAY VOLUME BUILDUP =====
    const vol3days = volumes.slice(-3);
    const isVolumeBuildup = vol3days[2] >= ma20Vol * 1.1 &&
        vol3days.every((v, i) => i === 0 || v >= vol3days[i - 1] * 0.85);

    // ===== NEW: HIGHER LOW STRUCTURE =====
    const recentLows = lows.slice(-5);
    const hasHL = hasHigherLows(recentLows, 3);

    // ===== NEW: CANDLE QUALITY =====
    const bodySize = Math.abs(last.close - last.open);
    const totalRange = last.high - last.low;
    const bodyRatio = totalRange > 0 ? bodySize / totalRange : 0;
    const isGreenCandle = last.close > last.open;
    const isQualityCandle = bodyRatio > 0.45 && isGreenCandle;

    // ===== NEW: MACD HISTOGRAM CHECK (via simple approximation) =====
    const ema12 = ema(closes, { period: 12 });
    const ema26 = ema(closes, { period: 26 });
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const macdHistImproving = macdLine[lastIdx] > macdLine[lastIdx - 1] && 
                              macdLine[lastIdx - 1] > macdLine[lastIdx - 2];

    // 1. SECRET SAUCE v2 (Accumulation + Compression + Trend)
    const consolidationScore = Math.abs(closes[lastIdx] - closes[lastIdx - 3]) / closes[lastIdx] * 100;
    
    const isSecretSauce = 
        isAboveSma50 &&                              // [NEW] Must be in uptrend
        (isCompressed || consolidationScore < 3.5) && // [NEW] ATR compression OR tight price
        (isVolumeBuildup || volRatio > 1.3) &&        // [UPGRADED] 3-day buildup OR strong spike
        last.close > prev.close && 
        lastMfi > 55 && lastMfi < 85 &&
        lastRsi >= 45 && lastRsi <= 68 &&             // [NEW] RSI sweet spot
        dist20 > -2 && dist20 < 5 && 
        isQualityCandle;                              // [NEW] Quality green candle

    if (isSecretSauce) {
        // Score: weighted composite
        let ssScore = 0;
        ssScore += isCompressed ? 30 : 10;            // ATR compression bonus
        ssScore += hasHL ? 25 : 0;                    // Higher low bonus  
        ssScore += isVolumeBuildup ? 20 : 10;          // Volume buildup bonus
        ssScore += macdHistImproving ? 15 : 0;         // MACD momentum bonus
        ssScore += bodyRatio > 0.6 ? 10 : 5;           // Strong candle bonus

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "Secret Sauce",
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.15),
            stopLossPrice: Math.round(Math.min(price * 0.94, lastEma20 * 0.97)),
            relevanceScore: 500 + ssScore,
            metadata: { 
                volRatio: volRatio.toFixed(2), 
                mfi: lastMfi.toFixed(1), 
                rsi: lastRsi.toFixed(1),
                dist20: dist20.toFixed(2), 
                consolidationScore: consolidationScore.toFixed(2),
                atrCompression: atrCompressionRatio.toFixed(2),
                hasHigherLows: hasHL,
                volumeBuildup: isVolumeBuildup,
                macdImproving: macdHistImproving,
                bodyRatio: bodyRatio.toFixed(2),
                ssScore,
                strategyRank: 500 + ssScore 
            }
        };
    }

    // 2. SQUEEZE RELEASE (Momentum + Volatility) — with SMA50 filter
    const sqzData = calculateSqueeze(quotes, 20);
    const lastMom = sqzData.momentum[lastIdx];
    const prevMom = sqzData.momentum[lastIdx - 1];
    const wasInSqueeze = sqzData.inSqueeze[lastIdx - 1] || sqzData.inSqueeze[lastIdx - 2];
    const isReleasing = !sqzData.inSqueeze[lastIdx] && wasInSqueeze;
    const momUp = lastMom > prevMom && lastMom > 0;

    if (isReleasing && momUp && volRatio > 1.1 && isAboveSma50) {
        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "Squeeze Explosion",
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.20),
            stopLossPrice: Math.round(price * 0.92),
            metadata: { momentum: lastMom.toFixed(2), volRatio: volRatio.toFixed(2), strategyRank: 600 }
        };
    }

    // 3. EMA BOUNCE v2 (Trend Flow + Quality + Confirmation)
    const isRetest = dist20 >= -0.5 && dist20 <= 2.5;
    const isStrongBounce = last.close > prev.high;       // [NEW] Close above yesterday's high  
    const isBouncing = (last.close > prev.close || isStrongBounce) && 
                       last.volume >= ma20Vol * 1.0;       // [UPGRADED] Volume >= average (was 0.7x)
    const rsiSafe = lastRsi >= 40 && lastRsi <= 65;       // [NEW] RSI guard
    
    if (isRetest && isBouncing && price > lastEma20 && isAboveSma50 && rsiSafe && isQualityCandle) {
        let bounceScore = 100;
        bounceScore += isStrongBounce ? 30 : 0;           // Close > prev.high bonus
        bounceScore += hasHL ? 20 : 0;                    // Higher low bonus
        bounceScore += isCompressed ? 25 : 0;             // Squeeze + bounce = high conviction
        bounceScore += volRatio > 1.5 ? 15 : 0;           // Volume spike bonus

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "EMA Bounce",
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.10),
            stopLossPrice: Math.round(lastEma20 * 0.97),
            relevanceScore: bounceScore,
            metadata: { 
                dist20: dist20.toFixed(2), 
                volRatio: volRatio.toFixed(2), 
                mfi: lastMfi.toFixed(1),
                rsi: lastRsi.toFixed(1),
                atrCompression: atrCompressionRatio.toFixed(2),
                closedAbovePrevHigh: isStrongBounce,
                hasHigherLows: hasHL,
                bodyRatio: bodyRatio.toFixed(2),
                bounceScore,
                strategyRank: bounceScore 
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
