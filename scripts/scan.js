const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });
const { ema, rma, sma, atr, rsi, mfi } = require('indicatorts');
const { RSI: RSICalc } = require('technicalindicators');
const { calculateSqueezeDeluxe } = require('./utils/squeeze_logic');

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

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function getSqueezeLevel(item) {
    if (!item || !item.squeeze) return 0;
    if (item.squeeze.high) return 3;
    if (item.squeeze.mid) return 2;
    if (item.squeeze.low) return 1;
    return 0;
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
    const scanRunAt = new Date();
    const period1 = new Date();
    period1.setDate(period1.getDate() - 320); // Need enough history for 20/60/200 EMA context
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
    const marketDate = last.date ? new Date(last.date) : scanRunAt;
    const marketDateIso = marketDate.toISOString();
    
    if (price <= 50) return null; // Filter out "penny" stocks

    // ===== CORE TECHNICALS =====
    const ema9Arr = ema(closes, { period: 9 });
    const ema20Arr = ema(closes, { period: 20 });
    const ema60Arr = ema(closes, { period: 60 });
    const sma50Arr = sma(closes, { period: 50 });
    const sma200Arr = sma(closes, { period: 200 });
    const lastEma9 = ema9Arr[ema9Arr.length - 1];
    const lastEma20 = ema20Arr[ema20Arr.length - 1];
    const prevEma9 = ema9Arr[ema9Arr.length - 2];
    const prevEma20 = ema20Arr[ema20Arr.length - 2];
    const lastEma60 = ema60Arr[ema60Arr.length - 1];
    const lastSma50 = sma50Arr[sma50Arr.length - 1];
    const lastSma200 = sma200Arr[sma200Arr.length - 1];
    const dist20 = ((price - lastEma20) / lastEma20) * 100;
    const ema20Rising = lastEma20 >= prevEma20;
    
    const mfiArr = mfi(highs, lows, closes, volumes, { period: 14 });
    const lastMfi = mfiArr[mfiArr.length - 1];
    const isMfiExtreme = lastMfi > 85;

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

    // ===== SQUEEZE DELUXE CONTEXT (for EMA20 early/retest vectors) =====
    const sqzDeluxe = calculateSqueezeDeluxe(quotes, 20, 3, 30, false, 25);
    const lastSqz = sqzDeluxe?.[lastIdx];
    const prevSqz = sqzDeluxe?.[lastIdx - 1];
    const prev2Sqz = sqzDeluxe?.[lastIdx - 2];
    const lastSqzMom = lastSqz?.momentum;
    const prevSqzMom = prevSqz?.momentum;
    const prev2SqzMom = prev2Sqz?.momentum;
    const lastSqzFlux = lastSqz?.flux;
    const prevSqzFlux = prevSqz?.flux;
    const currentSqueezeLevel = getSqueezeLevel(lastSqz);
    const prevSqueezeLevel = getSqueezeLevel(prevSqz);
    const recentSqueezeLevels = sqzDeluxe ? sqzDeluxe.slice(Math.max(0, lastIdx - 24), lastIdx + 1).map(getSqueezeLevel) : [];
    const squeezeDays25 = recentSqueezeLevels.filter(level => level > 0).length;
    const squeezeDays10 = recentSqueezeLevels.slice(-10).filter(level => level > 0).length;
    const wasSqueezedRecently = recentSqueezeLevels.slice(-8, -1).some(level => level > 0);
    const releaseLookback = recentSqueezeLevels.slice(-5);
    const squeezeStartingRelease = wasSqueezedRecently && (
        currentSqueezeLevel === 0 ||
        currentSqueezeLevel < prevSqueezeLevel ||
        releaseLookback.some((level, i) => i > 0 && level < releaseLookback[i - 1])
    );
    const sqzMomentumImproving = isFiniteNumber(lastSqzMom) && isFiniteNumber(prevSqzMom) && lastSqzMom > prevSqzMom;
    const sqzMomentumFresh = sqzMomentumImproving && (!isFiniteNumber(prev2SqzMom) || prevSqzMom >= prev2SqzMom * 0.98);
    const sqzFluxImproving = isFiniteNumber(lastSqzFlux) && isFiniteNumber(prevSqzFlux) && lastSqzFlux > prevSqzFlux;
    const sqzNotOverheated = isFiniteNumber(lastSqzMom) && lastSqzMom < 42 && lastRsi <= 68 && lastMfi < 82;

    const findBreakoutRetest = () => {
        const startIdx = Math.max(30, lastIdx - 18);
        let best = null;

        for (let i = startIdx; i <= lastIdx - 2; i++) {
            const baseHigh = Math.max(...highs.slice(Math.max(0, i - 22), i));
            const ema20AtBreakout = ema20Arr[i];
            if (!Number.isFinite(baseHigh) || !Number.isFinite(ema20AtBreakout)) continue;

            const volumeWindow = volumes.slice(Math.max(0, i - 20), i);
            const avgVolume = volumeWindow.length > 0 ? volumeWindow.reduce((a, b) => a + b, 0) / volumeWindow.length : ma20Vol;
            const breakoutVolRatio = avgVolume > 0 ? volumes[i] / avgVolume : 0;
            const breakoutDist20 = ((closes[i] - ema20AtBreakout) / ema20AtBreakout) * 100;
            const brokeStructure = closes[i] > baseHigh * 1.006;
            const startedNearEma20 = breakoutDist20 >= -1.5 && breakoutDist20 <= 7.5;

            if (brokeStructure && startedNearEma20 && breakoutVolRatio >= 1.25) {
                best = { index: i, close: closes[i], volumeRatio: breakoutVolRatio, baseHigh, dist20: breakoutDist20 };
            }
        }

        if (!best) return null;

        const barsSinceBreakout = lastIdx - best.index;
        const retestHeldEma20 = recentTouchedEma20 && price >= lastEma20 * 0.985 && Math.min(...lows.slice(-4)) >= lastEma20 * 0.955;
        const notExtendedFromBreakout = price <= best.close * 1.12;
        const stillAboveBreakoutBase = price >= best.baseHigh * 0.97;

        return retestHeldEma20 && notExtendedFromBreakout && stillAboveBreakoutBase
            ? { ...best, barsSinceBreakout }
            : null;
    };

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
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.15),
            stopLossPrice: Math.round(Math.min(price * 0.94, lastEma20 * 0.97)),
            relevanceScore: 500 + ssScore,
            metadata: { 
                category: "SECRET_SAUCE",
                vector: "ACCUMULATION_COMPRESSION",
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d)",
                lastQuoteDate: marketDateIso,
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

    const recentWindow = quotes.slice(-6);
    const recentTouchedEma20 = recentWindow.some((q, localIdx) => {
        const emaIdx = quotes.length - recentWindow.length + localIdx;
        const e20 = ema20Arr[emaIdx];
        return Number.isFinite(e20) && q.low <= e20 * 1.012 && q.high >= e20 * 0.988;
    });

    // 2. SQUEEZE RELEASE (Momentum + Volatility) — with SMA50 filter
    const sqzData = calculateSqueeze(quotes, 20);
    const lastMom = sqzData.momentum[lastIdx];
    const prevMom = sqzData.momentum[lastIdx - 1];
    const wasInSqueeze = sqzData.inSqueeze[lastIdx - 1] || sqzData.inSqueeze[lastIdx - 2];
    const isReleasing = !sqzData.inSqueeze[lastIdx] && wasInSqueeze;
    const momUp = lastMom > prevMom && lastMom > 0;

    const nearEma20 = dist20 >= -1.8 && dist20 <= 5.2;
    const earlyReleaseNearEma20 =
        isAboveSma50 &&
        Number.isFinite(lastEma60) && lastEma20 > lastEma60 &&
        ema20Rising &&
        nearEma20 &&
        recentTouchedEma20 &&
        squeezeDays25 >= 5 && squeezeDays10 >= 2 &&
        squeezeStartingRelease &&
        sqzMomentumFresh &&
        sqzFluxImproving &&
        sqzNotOverheated &&
        last.close >= prev.close &&
        volRatio >= 0.75 &&
        lastRsi >= 40 && lastMfi >= 42;

    if (earlyReleaseNearEma20) {
        const swingLow = Math.min(...lows.slice(-8));
        const stopLoss = Math.min(swingLow * 0.99, lastEma20 * 0.982);
        const risk = Math.max(price - stopLoss, price * 0.018);
        const target = price + risk * 1.8;
        const earlyScore = 175 + Math.min(30, squeezeDays25) + (sqzFluxImproving ? 15 : 0) + (hasHL ? 10 : 0) + (volRatio > 1.1 ? 10 : 0);

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "EMA Bounce: SQZ_EMA20_EARLY_RELEASE",
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(target),
            stopLossPrice: Math.round(stopLoss),
            relevanceScore: earlyScore,
            metadata: {
                category: "EMA_BOUNCE",
                vector: "SQZ_EMA20_EARLY_RELEASE",
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d) + SqueezeDeluxe",
                lastQuoteDate: marketDateIso,
                thesis: "Long squeeze is starting to release near EMA20 while momentum and flux are improving but not overheated.",
                dist20: dist20.toFixed(2),
                ema20: lastEma20.toFixed(2),
                ema60: Number.isFinite(lastEma60) ? lastEma60.toFixed(2) : "N/A",
                volRatio: volRatio.toFixed(2),
                mfi: lastMfi.toFixed(1),
                rsi: lastRsi.toFixed(1),
                squeezeDays25,
                squeezeDays10,
                squeezeLevel: currentSqueezeLevel,
                squeezeRelease: squeezeStartingRelease,
                squeezeMomentum: lastSqzMom.toFixed(2),
                squeezeSignal: isFiniteNumber(lastSqz?.signal) ? lastSqz.signal.toFixed(2) : "N/A",
                squeezeFlux: lastSqzFlux.toFixed(2),
                fluxImproving: sqzFluxImproving,
                momentumFresh: sqzMomentumFresh,
                recentTouchedEma20,
                hasHigherLows: hasHL,
                rrTarget: "1.8R",
                bounceScore: earlyScore,
                strategyRank: earlyScore
            }
        };
    }

    const breakoutRetest = findBreakoutRetest();
    const breakoutRetestMomentum =
        Boolean(breakoutRetest) &&
        isAboveSma50 &&
        ema20Rising &&
        price > lastEma20 &&
        dist20 >= -1 && dist20 <= 5.5 &&
        sqzMomentumImproving &&
        sqzFluxImproving &&
        sqzNotOverheated &&
        last.close >= prev.close * 0.995 &&
        lastRsi >= 45 && lastRsi <= 68 &&
        lastMfi >= 50 && lastMfi < 82;

    if (breakoutRetestMomentum) {
        const swingLow = Math.min(...lows.slice(-7));
        const stopLoss = Math.min(swingLow * 0.99, lastEma20 * 0.985);
        const risk = Math.max(price - stopLoss, price * 0.016);
        const target = price + risk * 2;
        const retestScore = 210 + (breakoutRetest.volumeRatio >= 2 ? 20 : 10) + (hasHL ? 10 : 0) + (sqzFluxImproving ? 10 : 0);

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "EMA Bounce: EMA20_BREAKOUT_RETEST_MOMENTUM",
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(target),
            stopLossPrice: Math.round(stopLoss),
            relevanceScore: retestScore,
            metadata: {
                category: "EMA_BOUNCE",
                vector: "EMA20_BREAKOUT_RETEST_MOMENTUM",
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d) + SqueezeDeluxe",
                lastQuoteDate: marketDateIso,
                thesis: "Volume breakout started near EMA20, then price retested EMA20/above while momentum and flux improved without saturation.",
                dist20: dist20.toFixed(2),
                ema20: lastEma20.toFixed(2),
                ema60: Number.isFinite(lastEma60) ? lastEma60.toFixed(2) : "N/A",
                volRatio: volRatio.toFixed(2),
                breakoutVolRatio: breakoutRetest.volumeRatio.toFixed(2),
                breakoutBarsAgo: breakoutRetest.barsSinceBreakout,
                breakoutDist20: breakoutRetest.dist20.toFixed(2),
                mfi: lastMfi.toFixed(1),
                rsi: lastRsi.toFixed(1),
                squeezeMomentum: isFiniteNumber(lastSqzMom) ? lastSqzMom.toFixed(2) : "N/A",
                squeezeSignal: isFiniteNumber(lastSqz?.signal) ? lastSqz.signal.toFixed(2) : "N/A",
                squeezeFlux: isFiniteNumber(lastSqzFlux) ? lastSqzFlux.toFixed(2) : "N/A",
                fluxImproving: sqzFluxImproving,
                momentumImproving: sqzMomentumImproving,
                recentTouchedEma20,
                hasHigherLows: hasHL,
                rrTarget: "2R",
                bounceScore: retestScore,
                strategyRank: retestScore
            }
        };
    }

    if (isReleasing && momUp && volRatio > 1.1 && isAboveSma50) {
        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "Squeeze Explosion",
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.20),
            stopLossPrice: Math.round(price * 0.92),
            metadata: {
                category: "SQUEEZE",
                vector: "SQUEEZE_RELEASE",
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d)",
                lastQuoteDate: marketDateIso,
                momentum: lastMom.toFixed(2),
                volRatio: volRatio.toFixed(2),
                strategyRank: 600
            }
        };
    }

    // 3B. COOLDOWN SETUP: extended move from EMA20, shallow pullback, then quiet sideways reset.
    const cooldownLookback = 18;
    const cooldownStartIdx = Math.max(0, lastIdx - cooldownLookback);
    let peakIdx = cooldownStartIdx;
    for (let i = cooldownStartIdx; i <= lastIdx - 2; i++) {
        if (highs[i] > highs[peakIdx]) peakIdx = i;
    }

    const peakHigh = highs[peakIdx];
    const peakEma20 = ema20Arr[peakIdx];
    const peakDist20 = Number.isFinite(peakEma20) && peakEma20 > 0
        ? ((peakHigh - peakEma20) / peakEma20) * 100
        : 0;
    const barsSincePeak = lastIdx - peakIdx;
    const pullbackPct = peakHigh > 0 ? ((peakHigh - price) / peakHigh) * 100 : 0;
    const cooldownWindow = quotes.slice(-7);
    const cooldownHigh = Math.max(...cooldownWindow.map(q => q.high));
    const cooldownLow = Math.min(...cooldownWindow.map(q => q.low));
    const cooldownRangePct = price > 0 ? ((cooldownHigh - cooldownLow) / price) * 100 : 99;
    const recentCloses = closes.slice(-5);
    const closeRangePct = price > 0
        ? ((Math.max(...recentCloses) - Math.min(...recentCloses)) / price) * 100
        : 99;
    const avgVol5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / Math.max(1, volumes.slice(-5).length);
    const atrNow = atrValues[lastIdx] || 0;
    const atrPctNow = price > 0 ? (atrNow / price) * 100 : 99;
    const priorExtension = peakDist20 >= 7.5;
    const controlledPullback = pullbackPct >= 2.5 && pullbackPct <= Math.min(14, Math.max(8, peakDist20 * 0.8));
    const sidewaysReset = barsSincePeak >= 3 && barsSincePeak <= 15 && cooldownRangePct <= 12 && cooldownRangePct <= Math.max(6.5, atrPctNow * 2.8) && closeRangePct <= Math.max(3.8, atrPctNow * 1.6);
    const volatilityCooling = atrCompressionRatio <= 0.95 || cooldownRangePct <= 8;
    const volumeCooling = avgVol5 <= ma20Vol * 1.05 && volRatio <= 1.25;
    const trendStillIntact = isAboveSma50 && ema20Rising && price >= lastEma20 * 0.985 && cooldownLow >= lastEma20 * 0.94;
    const currentPositionOk = dist20 >= -2.2 && dist20 <= 6.5;
    const notDistribution = atrPctNow <= 8 && lastRsi <= 70 && lastMfi < 85 && last.close >= prev.close * 0.985;
    const reaccumulationHint = hasHL || sqzMomentumImproving || sqzFluxImproving || price >= cooldownLow + ((cooldownHigh - cooldownLow) * 0.45);

    if (priorExtension && controlledPullback && sidewaysReset && volatilityCooling && volumeCooling && trendStillIntact && currentPositionOk && notDistribution && reaccumulationHint) {
        const stopLoss = Math.min(cooldownLow * 0.985, lastEma20 * 0.965);
        const risk = Math.max(price - stopLoss, price * 0.018);
        const target = Math.max(peakHigh, price + risk * 1.8);
        const cooldownScore = 165 +
            Math.min(35, peakDist20 * 2) +
            (volumeCooling ? 15 : 0) +
            (volatilityCooling ? 15 : 0) +
            (hasHL ? 12 : 0) +
            (sqzMomentumImproving || sqzFluxImproving ? 10 : 0) -
            Math.max(0, pullbackPct - 8) * 3;

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "Cooldown: EXTENDED_EMA20_RESET",
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(target),
            stopLossPrice: Math.round(stopLoss),
            relevanceScore: Math.round(cooldownScore),
            metadata: {
                category: "COOLDOWN",
                vector: "EXTENDED_EMA20_COOLDOWN",
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d) + EMA20/ATR/Bollinger-style volatility reset",
                lastQuoteDate: marketDateIso,
                thesis: "Price previously stretched far above EMA20, pulled back in a controlled way, then moved sideways with lower volatility/volume while trend support held.",
                peakHigh: peakHigh.toFixed(2),
                peakDist20: peakDist20.toFixed(2),
                barsSincePeak,
                pullbackPct: pullbackPct.toFixed(2),
                cooldownRangePct: cooldownRangePct.toFixed(2),
                closeRangePct: closeRangePct.toFixed(2),
                atrPct: atrPctNow.toFixed(2),
                atrCompression: atrCompressionRatio.toFixed(2),
                avgVol5Ratio: ma20Vol > 0 ? (avgVol5 / ma20Vol).toFixed(2) : "N/A",
                dist20: dist20.toFixed(2),
                ema20: lastEma20.toFixed(2),
                ema20Rising,
                rsi: lastRsi.toFixed(1),
                mfi: lastMfi.toFixed(1),
                hasHigherLows: hasHL,
                volumeCooling,
                volatilityCooling,
                trendStillIntact,
                reaccumulationHint,
                rrTarget: "1.8R / prior high retest",
                cooldownScore: Math.round(cooldownScore),
                strategyRank: Math.round(cooldownScore)
            }
        };
    }

// 3. EMA BOUNCE v4 (Enhanced dengan Squeeze Deluxe untuk target 5-10%)
    const recentRsi = rsiArr.slice(-10);
    const recentOversold = recentRsi.some(v => Number.isFinite(v) && v <= 35);
    const rsiRecovering = Number.isFinite(lastRsi) && Number.isFinite(rsiArr[rsiArr.length - 2]) &&
        (lastRsi >= 40 && lastRsi <= 68) && lastRsi >= rsiArr[rsiArr.length - 2];
    const closedAboveEma20 = prev.close <= prevEma20 && last.close > lastEma20;
    const reclaimedEma20 = last.close > lastEma20 && (closedAboveEma20 || recentTouchedEma20);
    const ema9Above20 = lastEma9 > lastEma20;
    const ema9Cross20 = prevEma9 <= prevEma20 && ema9Above20;
    const ema20Above60 = Number.isFinite(lastEma60) ? lastEma20 > lastEma60 : true;
    const priceAbove200 = Number.isFinite(lastSma200) ? price > lastSma200 : true;
    const pullbackZone = dist20 >= -1.2 && dist20 <= 3.5;
    const isStrongBounce = last.close > prev.high;
    const isBouncing = (last.close > prev.close || isStrongBounce || closedAboveEma20) && last.volume >= ma20Vol * 0.9;
    const pdfEntryConfirmed = reclaimedEma20 && (recentOversold || rsiRecovering);
    const trendStackValid = ema20Rising && ema9Above20 && ema20Above60 && priceAbove200;

    // ENHANCED: Tambahan filter untuk daily trading yang lebih cepat
    const hasSqueezeSetup = squeezeDays25 >= 5 && (squeezeStartingRelease || currentSqueezeLevel > 0);
    const hasHighConvictionSqueeze = sqzMomentumFresh && sqzFluxImproving && sqzNotOverheated && lastSqzMom > 15 && lastSqzMom < 45;
    const upsidePotentialCheck = consolidationScore < 4.0 && isCompressed;
    const volumeConfirmation = volRatio > 1.0 || isVolumeBuildup;
    const breakoutLikely = atrCompressionRatio < 0.8 && hasHL;

    let emaBounceVector = "EMA20_RECLAIM";
    if (recentOversold && closedAboveEma20) emaBounceVector = "RSI_OVERSOLD_20EMA_RECLAIM";
    else if (ema9Cross20) emaBounceVector = "EMA9_20_BULLISH_CROSS";
    else if (ema20Above60) emaBounceVector = "EMA20_60_SWING_BOUNCE";
    else if (hasSqueezeSetup && hasHighConvictionSqueeze) emaBounceVector = "SQZ_EMA20_HIGH_PROBABILITY";

    if (pullbackZone && isBouncing && pdfEntryConfirmed && trendStackValid && isAboveSma50 && !isMfiExtreme && lastRsi <= 68) {
        const swingLow = Math.min(...lows.slice(-6));
        const stopLoss = Math.min(swingLow * 0.99, lastEma20 * 0.985);
        const risk = Math.max(price - stopLoss, price * 0.015);

        // ENHANCED: Dynamic target calculation dengan squeeze deluxe integration
        let target;
        let confidenceLevel = 'LOW';
        let baseRewardMultiplier = 1.5;

        // HIGH CONFIDENCE: Jika ada squeeze setup dengan momentum baik
        if (hasSqueezeSetup && hasHighConvictionSqueeze && upsidePotentialCheck) {
            baseRewardMultiplier = 3.0; // Target 7-10%
            confidenceLevel = 'HIGH';
        }
        // MEDIUM CONFIDENCE: Teknikal bagus dengan beberapa faktor pendukung
        else if ((hasSqueezeSetup || sqzFluxImproving) && volumeConfirmation && breakoutLikely) {
            baseRewardMultiplier = 2.2; // Target 5-7%
            confidenceLevel = 'MEDIUM';
        }
        // STANDARD: EMA bounce biasa
        else {
            baseRewardMultiplier = 1.5; // Target 3-5%
            confidenceLevel = 'STANDARD';
        }

        target = price + risk * baseRewardMultiplier;
        let bounceScore = 110;
        // Base score untuk EMA bounce
        bounceScore += recentOversold ? 15 : 0;
        bounceScore += closedAboveEma20 ? 15 : 0;
        bounceScore += ema9Cross20 ? 10 : 0;
        bounceScore += ema20Above60 ? 10 : 0;
        bounceScore += priceAbove200 ? 5 : 0;
        bounceScore += isStrongBounce ? 5 : 0;

        // BONUS: Squeeze deluxe integration
        bounceScore += hasSqueezeSetup ? 25 : 0;
        bounceScore += hasHighConvictionSqueeze ? 40 : 0;
        bounceScore += sqzFluxImproving ? 15 : 0;
        bounceScore += sqzMomentumFresh ? 20 : 0;
        bounceScore += upsidePotentialCheck ? 15 : 0;
        bounceScore += breakoutLikely ? 10 : 0;
        bounceScore += volumeConfirmation ? 10 : 0;

        // Premium untuk high confidence
        if (confidenceLevel === 'HIGH') {
            bounceScore += 50; // Bonus signifikan
        } else if (confidenceLevel === 'MEDIUM') {
            bounceScore += 25;
        }

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: `EMA Bounce: ${emaBounceVector}`,
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(target),
            stopLossPrice: Math.round(stopLoss),
            relevanceScore: bounceScore,
            metadata: {
                category: "EMA_BOUNCE",
                vector: emaBounceVector,
                confidenceLevel: confidenceLevel,
                expectedReturn: `${Math.round((target - price) / price * 100)}%`,
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d) + SqueezeDeluxe Enhanced",
                lastQuoteDate: marketDateIso,
                pdfRule: "RSI oversold/recovering + close/reclaim above 20 EMA; Enhanced with Squeeze Deluxe for 5-10% targets",
                dist20: dist20.toFixed(2),
                ema9: lastEma9.toFixed(2),
                ema20: lastEma20.toFixed(2),
                ema60: Number.isFinite(lastEma60) ? lastEma60.toFixed(2) : "N/A",
                sma200: Number.isFinite(lastSma200) ? lastSma200.toFixed(2) : "N/A",
                volRatio: volRatio.toFixed(2),
                mfi: lastMfi.toFixed(1),
                rsi: lastRsi.toFixed(1),
                recentOversold,
                rsiRecovering,
                reclaimedEma20,
                closedAboveEma20,
                ema9Cross20,
                ema9Above20,
                ema20Rising,
                ema20Above60,
                priceAbove200,
                atrCompression: atrCompressionRatio.toFixed(2),
                closedAbovePrevHigh: isStrongBounce,
                hasHigherLows: hasHL,
                bodyRatio: bodyRatio.toFixed(2),
                squeezeDays25,
                squeezeDays10,
                squeezeMomentum: isFiniteNumber(lastSqzMom) ? lastSqzMom.toFixed(2) : "N/A",
                squeezeSignal: isFiniteNumber(lastSqz?.signal) ? lastSqz.signal.toFixed(2) : "N/A",
                squeezeFlux: isFiniteNumber(lastSqzFlux) ? lastSqzFlux.toFixed(2) : "N/A",
                fluxImproving: sqzFluxImproving,
                momentumFresh: sqzMomentumFresh,
                hasSqueezeSetup,
                hasHighConvictionSqueeze,
                upsidePotentialCheck,
                breakoutLikely,
                volumeConfirmation,
                rrTarget: `${baseRewardMultiplier}R`,
                bounceScore,
                strategyRank: bounceScore
            }
        };
    }

    // 4. EMA BOUNCE: FAST DAILY SETUP (High Probability Early Entry)
    // Enhanced untuk daily trading yang lebih cepat jalan
    const fastDailySetup =
        isAboveSma50 &&
        ema20Rising &&
        price > lastEma20 * 0.99 &&
        dist20 >= -2.5 && dist20 <= 6 &&
        sqzMomentumImproving &&
        sqzFluxImproving &&
        hasHighConvictionSqueeze &&
        lastRsi >= 45 && lastRsi <= 65 &&
        lastMfi >= 50 && lastMfi <= 75 &&
        volRatio >= 0.85 &&
        consolidationScore < 3.8 &&
        atrCompressionRatio < 0.85 &&
        last.close >= prev.close * 0.995 &&
        bodyRatio > 0.4;

    if (fastDailySetup) {
        const swingLow = Math.min(...lows.slice(-5));
        const stopLoss = Math.min(swingLow * 0.992, lastEma20 * 0.975);
        const risk = Math.max(price - stopLoss, price * 0.012);

        // Target agresif untuk setup cepat (2.5-4R)
        const rewardMultiplier = hasSqueezeSetup ? 3.5 : 2.8;
        const target = price + risk * rewardMultiplier;
        const fastScore = 180 + (sqzFluxImproving ? 25 : 0) + (sqzMomentumFresh ? 30 : 0) + (hasSqueezeSetup ? 35 : 0);

        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "EMA Bounce: FAST_DAILY_HIGH_PROB",
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(target),
            stopLossPrice: Math.round(stopLoss),
            relevanceScore: fastScore,
            metadata: {
                category: "EMA_BOUNCE_DAILY",
                vector: "FAST_DAILY_SQUEEZE_MOMENTUM",
                confidenceLevel: "FAST_HIGH_PROB",
                expectedReturn: `${Math.round((target - price) / price * 100)}%`,
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d) + SqueezeDeluxe Fast Daily",
                lastQuoteDate: marketDateIso,
                thesis: "High probability daily setup with early squeeze momentum, volume confirmation, and tight consolidation. Target next 1-2 days.",
                dist20: dist20.toFixed(2),
                ema20: lastEma20.toFixed(2),
                ema60: Number.isFinite(lastEma60) ? lastEma60.toFixed(2) : "N/A",
                volRatio: volRatio.toFixed(2),
                mfi: lastMfi.toFixed(1),
                rsi: lastRsi.toFixed(1),
                squeezeMomentum: isFiniteNumber(lastSqzMom) ? lastSqzMom.toFixed(2) : "N/A",
                squeezeSignal: isFiniteNumber(lastSqz?.signal) ? lastSqz.signal.toFixed(2) : "N/A",
                squeezeFlux: isFiniteNumber(lastSqzFlux) ? lastSqzFlux.toFixed(2) : "N/A",
                fluxImproving: sqzFluxImproving,
                momentumFresh: sqzMomentumFresh,
                hasSqueezeSetup,
                hasHighConvictionSqueeze,
                consolidationScore: consolidationScore.toFixed(2),
                atrCompression: atrCompressionRatio.toFixed(2),
                bodyRatio: bodyRatio.toFixed(2),
                rrTarget: `${rewardMultiplier}R`,
                fastScore,
                strategyRank: fastScore
            }
        };
    }

    // 5. EMA BOUNCE: FORMING SETUP (Watchlist Tier)
    // Add early momentum/flux improvement before full confirmation
    const formingEmaBounce =
        isAboveSma50 &&
        ema20Rising &&
        price > lastEma20 * 0.99 &&
        dist20 >= -3.5 && dist20 <= 8 &&
        sqzMomentumImproving &&
        sqzFluxImproving &&
        lastRsi >= 42 && lastMfi >= 45 &&
        last.close >= prev.close * 0.992;

    if (formingEmaBounce) {
        const formingScore = 140 + (sqzFluxImproving ? 20 : 0) + (sqzMomentumImproving ? 15 : 0);
        return {
            ticker: stock.ticker,
            sector: stock.sector || "Unknown",
            signalSource: "EMA Bounce: FORMING",
            entryDate: marketDate,
            entryPrice: price,
            currentPrice: price,
            targetPrice: Math.round(price * 1.08),
            stopLossPrice: Math.round(lastEma20 * 0.965),
            relevanceScore: formingScore,
            metadata: {
                category: "EMA_BOUNCE_WATCHLIST",
                vector: "SQZ_EMA20_COIL_MOMENTUM_UP",
                appearedAt: marketDateIso,
                scanRunAt: scanRunAt.toISOString(),
                dataSource: "YahooFinance.chart(1d) + SqueezeDeluxe",
                lastQuoteDate: marketDateIso,
                thesis: "Squeeze forming with improving momentum/flux near EMA20 but not yet confirmed breakout/retest.",
                dist20: dist20.toFixed(2),
                ema20: lastEma20.toFixed(2),
                volRatio: volRatio.toFixed(2),
                mfi: lastMfi.toFixed(1),
                rsi: lastRsi.toFixed(1),
                squeezeMomentum: isFiniteNumber(lastSqzMom) ? lastSqzMom.toFixed(2) : "N/A",
                squeezeSignal: isFiniteNumber(lastSqz?.signal) ? lastSqz.signal.toFixed(2) : "N/A",
                squeezeFlux: isFiniteNumber(lastSqzFlux) ? lastSqzFlux.toFixed(2) : "N/A",
                fluxImproving: sqzFluxImproving,
                momentumImproving: sqzMomentumImproving,
                rrTarget: "1.2R",
                formingScore: formingScore,
                strategyRank: formingScore
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
          const firstAppearedAt = existing.metadata?.firstAppearedAt || existing.metadata?.appearedAt || existing.createdAt || existing.entryDate;
          existing.currentPrice = newSignal.currentPrice;
          existing.targetPrice = newSignal.targetPrice;
          existing.stopLossPrice = newSignal.stopLossPrice;
          existing.relevanceScore = newSignal.relevanceScore;
          existing.priceHistory = [
            ...(existing.priceHistory || []),
            { date: new Date(), price: newSignal.currentPrice }
          ].slice(-60);
          existing.metadata = {
            ...(existing.metadata || {}),
            ...(newSignal.metadata || {}),
            appearedAt: firstAppearedAt instanceof Date ? firstAppearedAt.toISOString() : firstAppearedAt,
            firstEntryPrice: existing.metadata?.firstEntryPrice || existing.entryPrice,
            latestPrice: newSignal.currentPrice,
            firstAppearedAt: firstAppearedAt instanceof Date ? firstAppearedAt.toISOString() : firstAppearedAt,
            lastScannedAt: new Date().toISOString()
          };
          const hours = Math.floor((new Date() - new Date(existing.entryDate)) / (1000 * 60 * 60));
          existing.daysHeld = hours;
          await existing.save();
        }
      }
    }
    if (results.length > 0) {
      const activeEmaBounceTickers = results
        .filter(signal => String(signal.signalSource || '').toUpperCase().includes('EMA BOUNCE'))
        .map(signal => signal.ticker);

      await StockSignal.updateMany(
        {
          status: 'pending',
          signalSource: /EMA Bounce/i,
          ticker: { $nin: activeEmaBounceTickers }
        },
        {
          $set: {
            status: 'archived',
            'metadata.archivedAt': new Date().toISOString(),
            'metadata.archiveReason': 'No longer qualifies latest 20 EMA scan'
          }
        }
      );

      const activeCooldownTickers = results
        .filter(signal => String(signal.signalSource || '').toUpperCase().includes('COOLDOWN'))
        .map(signal => signal.ticker);

      await StockSignal.updateMany(
        {
          status: 'pending',
          signalSource: /Cooldown/i,
          ticker: { $nin: activeCooldownTickers }
        },
        {
          $set: {
            status: 'archived',
            'metadata.archivedAt': new Date().toISOString(),
            'metadata.archiveReason': 'No longer qualifies latest cooldown reset scan'
          }
        }
      );
    }
    console.log("Scan complete.");
  } finally {
    await mongoose.disconnect();
  }
}
run();
