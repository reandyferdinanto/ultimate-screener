const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const { atr, ema, mfi, rsi } = require('indicatorts');
const { ADX } = require('technicalindicators');

const MONGODB_URI = "mongodb+srv://reandy:XuISHforC8mWVEKd@cluster0.ybmffcl.mongodb.net/ultimate_screener?retryWrites=true&w=majority&appName=Cluster0";

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

function pivotPoints(high, low, close) {
  const p = (high + low + close) / 3;
  return {
    p,
    r1: 2 * p - low,
    s1: 2 * p - high,
    r2: p + (high - low),
    s2: p - (high - low),
    r3: high + 2 * (p - low),
    s3: low - 2 * (high - p),
  };
}

async function analyzeTicker(stock) {
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 60);
    const result = await yahooFinance.chart(stock.ticker, { period1, interval: "1d" });
    
    if (!result || !result.quotes || result.quotes.length < 30) return null;
    const quotes = result.quotes.filter(q => q.close !== null);
    if (quotes.length < 30) return null;

    const closes = quotes.map(q => q.close);
    const highs = quotes.map(q => q.high);
    const lows = quotes.map(q => q.low);
    const volumes = quotes.map(q => q.volume);
    
    const lastIdx = quotes.length - 1;
    const last = quotes[lastIdx];
    const prev = quotes[lastIdx - 1];
    const price = last.close;
    const prevPrice = prev.close;
    const priceChange = ((price - prevPrice) / prevPrice) * 100;
    
    if (price <= 50) return null;

    const ema20Arr = ema(closes, { period: 20 });
    const lastEma20 = ema20Arr[ema20Arr.length - 1];
    const dist20 = ((price - lastEma20) / lastEma20) * 100;

    const mfiArr = mfi(highs, lows, closes, volumes, { period: 14 });
    const lastMfi = mfiArr[mfiArr.length - 1];

    const rsiArr = rsi(closes, { period: 14 });
    const lastRsi = rsiArr[rsiArr.length - 1];

    const ma20Vol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volRatio = last.volume / ma20Vol;

    // Secret Sauce refinement: Ensure volume spike is a BUY volume (close > open or close > prev close)
    const isBuyVolume = last.close >= last.open || last.close > prev.close;

    const consolidationScore = Math.abs(closes[lastIdx] - closes[lastIdx - 2]) / closes[lastIdx] * 100;

    // LOGIC: ONLY SECRET SAUCE
    const isSecretSauce = 
        volRatio > 1.2 && 
        isBuyVolume && 
        priceChange >= 0.5 && priceChange <= 5.0 && 
        lastMfi > 60 && lastMfi < 88 &&
        lastRsi > 45 && lastRsi < 65 &&
        dist20 > -3 && dist20 < 8 && // Stricter EMA20 support check
        consolidationScore < 4.0;

    if (isSecretSauce) {
        const atrResult = atr(highs, lows, closes, { period: 14 });
        const currentAtr = atrResult.atrLine[atrResult.atrLine.length - 1] || (price * 0.03);
        const pivots = pivotPoints(prev.high, prev.low, prev.close);

        const sl = Math.round(price - (currentAtr * 2)); 
        const tp = Math.round(price * 1.20); 

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "Secret Sauce (AI Predict)", 
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: tp,
            stopLossPrice: sl,
            daysHeld: 0,
            priceHistory: [{ date: new Date(), price: price }],
            metadata: { 
                strategyRank: 500, 
                volRatio: volRatio.toFixed(2),
                priceChange: priceChange.toFixed(2),
                pivots,
                mfi: lastMfi,
                rsi: lastRsi,
                dist20: dist20.toFixed(2),
                consolidationScore: consolidationScore.toFixed(2)
            }
        };
    }

    // LOGIC: THE PERFECT RETEST (High Conviction)
    const isRetestZone = dist20 >= -1.0 && dist20 <= 3.5;
    const isBouncing = last.close > prev.close && last.volume > (ma20Vol * 0.8);
    const isAboveEma20 = price > lastEma20;

    if (isRetestZone && isBouncing && isAboveEma20) {
        const sl = Math.round(lastEma20 * 0.96);
        const risk = ((price - sl) / price) * 100;
        
        if (risk > 5.5) return null;

        let category = "EMA Bounce";
        if (lastMfi > 70 && volRatio > 1.2) category = "ELITE BOUNCE";
        else if (lastMfi > 60 || volRatio > 1.0) category = "BUY ON DIP";
        else category = "TURNAROUND";

        // Calculate detailed insights
        const volScore = Math.min(100, Math.round((volRatio / 1.5) * 50 + (lastMfi / 85) * 50));
        const fluxStatus = lastMfi > 60 ? "BULLISH (Accumulation)" : "RECOVERING (Absorption)";
        const sqzStatus = consolidationScore < 3.0 ? "COMPRESSION (Tight)" : "EXPANSION (Releasing)";

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: category, 
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.12), 
            stopLossPrice: sl,
            daysHeld: 0,
            priceHistory: [{ date: new Date(), price: price }],
            metadata: { 
                strategyRank: 100,
                dist20: dist20.toFixed(2),
                volRatio: volRatio.toFixed(2),
                mfi: lastMfi,
                rsi: lastRsi,
                verdict: category,
                // New insight fields
                volConviction: volScore,
                fluxStatus: fluxStatus,
                squeezeStatus: sqzStatus
            }
        };
    }

    // LOGIC: CVD DIVERGENCE + EMA PULLBACK + ADX
    // ADX Calculation using technicalindicators
    const adxCalculator = new ADX({
        period: 14,
        high: highs,
        low: lows,
        close: closes
    });
    const adxResults = adxCalculator.getResult();
    const lastAdxObj = adxResults[adxResults.length - 1];
    const lastAdx = lastAdxObj ? lastAdxObj.adx : 0;
    const adxThreshold = 20;

    // CVD Calculation (Proxy: Cumulative Volume Delta)
    const deltas = quotes.map(q => q.close > q.open ? q.volume : (q.close < q.open ? -q.volume : 0));
    const cvdArr = [];
    let currentCvd = 0;
    for (let d of deltas) {
        currentCvd += d;
        cvdArr.push(currentCvd);
    }

    // Trend (EMA9 vs EMA20)
    const ema9Arr = ema(closes, { period: 9 });
    const lastEma9 = ema9Arr[ema9Arr.length - 1];
    
    // Divergence Check (Bullish: Price LL, CVD HL)
    const lookback = 5; // Relaxed from 10 to capture local pullbacks
    const recentLows = lows.slice(-lookback - 1, -1);
    const priceLL = last.low < Math.min(...recentLows);

    const recentCvds = cvdArr.slice(-lookback - 1, -1);
    const cvdHL = cvdArr[cvdArr.length - 1] > Math.min(...recentCvds);
    
    const bullDiv = priceLL && cvdHL;

    // Pullback Condition: Price is near or below EMA9/EMA20
    const isBullTrend = lastEma9 > lastEma20;
    const pullbackBuy = isBullTrend && (last.low <= lastEma9 * 1.02 || last.low <= lastEma20 * 1.02);

    // Final Signal
    const divergenceSignal = pullbackBuy && (lastAdx > adxThreshold) && (bullDiv || (last.low < prev.low && last.close > last.open));

    if (divergenceSignal) {
        // SL/TP logic based on swing lows
        const recentLows5 = lows.slice(-5);
        const swingLow = Math.min(...recentLows5);
        const sl = Math.round(swingLow * 0.98); 
        const risk = price - sl;
        const tp = Math.round(price + (risk * 3)); // RR 3.0

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "CVD Divergence",
            entryDate: new Date(),
            entryPrice: price,
            currentPrice: price,
            targetPrice: tp,
            stopLossPrice: sl,
            daysHeld: 0,
            priceHistory: [{ date: new Date(), price: price }],
            metadata: {
                strategyRank: 400,
                adx: lastAdx.toFixed(1),
                divergence: bullDiv ? "Bullish CVD" : "Price Pullback",
                ema9: lastEma9.toFixed(2),
                ema20: lastEma20.toFixed(2)
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
    console.log(`Starting High Conviction & Secret Sauce Scan for ${stocks.length} stocks...`);
    
    const results = [];
    const batchSize = 10;
    for (let i = 0; i < stocks.length; i += batchSize) {
        const batch = stocks.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(s => analyzeTicker(s)));
        const foundInBatch = batchResults.filter(r => r !== null);
        results.push(...foundInBatch);
        if (i % 100 === 0) console.log(`Progress: ${i}/${stocks.length} | Signals Found: ${results.length}`);
        await new Promise(r => setTimeout(r, 200)); 
    }

    if (results.length > 0) {
      console.log(`Scanner found ${results.length} potential signals. Merging with existing data...`);
      
      for (const newSignal of results) {
        // Check if we already have a pending signal for this ticker
        const existing = await StockSignal.findOne({ 
          ticker: newSignal.ticker, 
          status: 'pending',
          signalSource: newSignal.signalSource
        });

        if (existing) {
          // Update existing signal's current price and history
          existing.currentPrice = newSignal.currentPrice;
          
          // Only add to history if price changed significantly or enough time passed
          const lastHistory = existing.priceHistory[existing.priceHistory.length - 1];
          if (!lastHistory || lastHistory.price !== newSignal.currentPrice) {
            existing.priceHistory.push({ date: new Date(), price: newSignal.currentPrice });
          }

          // Update days held (hours)
          const hoursHeld = Math.floor((new Date() - new Date(existing.entryDate)) / (1000 * 60 * 60));
          existing.daysHeld = hoursHeld;

          // Check for success/failure
          if (existing.currentPrice >= existing.targetPrice) {
            existing.status = 'success';
          } else if (existing.stopLossPrice && existing.currentPrice <= existing.stopLossPrice) {
            existing.status = 'failed';
          }

          await existing.save();
        } else {
          // New signal
          await StockSignal.create(newSignal);
        }
      }
      
      console.log(`Success: Processed ${results.length} scanner results.`);
    } else {
      console.log("No new signals found.");
    }
    
    // Update all other pending signals that weren't in current results to keep prices fresh
    const allPending = await StockSignal.find({ status: 'pending' });
    console.log(`Updating ${allPending.length} pending signals for fresh prices...`);
    for (const sig of allPending) {
        try {
          const quote = await yahooFinance.quote(sig.ticker);
          if (quote && quote.regularMarketPrice) {
            const price = quote.regularMarketPrice;
            sig.currentPrice = price;
            
            const lastH = sig.priceHistory[sig.priceHistory.length - 1];
            if (!lastH || lastH.price !== price) {
              sig.priceHistory.push({ date: new Date(), price: price });
            }

            const hours = Math.floor((new Date() - new Date(sig.entryDate)) / (1000 * 60 * 60));
            sig.daysHeld = hours;

            if (sig.currentPrice >= sig.targetPrice) sig.status = 'success';
            else if (sig.stopLossPrice && sig.currentPrice <= sig.stopLossPrice) sig.status = 'failed';
            
            await sig.save();
          }
        } catch (e) {
          // Silence quote errors for specific tickers
        }
    }

  } finally {
    await mongoose.disconnect();
  }
}
run();
