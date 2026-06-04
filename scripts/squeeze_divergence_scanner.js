const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const { loadIdxStocks } = require('./idx_stock_file');
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

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function calculateEMA(values, period) {
    const result = [];
    const multiplier = 2 / (period + 1);
    let previous = Number.NaN;

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (!isFiniteNumber(value)) {
            result.push(Number.NaN);
            continue;
        }

        if (!isFiniteNumber(previous)) {
            const seed = values.slice(Math.max(0, i - period + 1), i + 1).filter(isFiniteNumber);
            previous = seed.length >= period ? seed.reduce((sum, item) => sum + item, 0) / seed.length : value;
        } else {
            previous = value * multiplier + previous * (1 - multiplier);
        }
        result.push(previous);
    }

    return result;
}

function calculateATR(quotes, period = 14) {
    const tr = quotes.map((q, i) => {
        if (i === 0) return q.high - q.low;
        return Math.max(
            q.high - q.low,
            Math.abs(q.high - quotes[i - 1].close),
            Math.abs(q.low - quotes[i - 1].close)
        );
    });

    return tr.map((value, i) => {
        if (i < period) return value;
        const window = tr.slice(i - period + 1, i + 1);
        return window.reduce((sum, item) => sum + item, 0) / window.length;
    });
}

function getRecentHigh(quotes, endIndex, lookback) {
    const start = Math.max(0, endIndex - lookback + 1);
    return Math.max(...quotes.slice(start, endIndex + 1).map(q => q.high).filter(isFiniteNumber));
}

function getRecentLow(quotes, endIndex, lookback) {
    const start = Math.max(0, endIndex - lookback + 1);
    return Math.min(...quotes.slice(start, endIndex + 1).map(q => q.low).filter(isFiniteNumber));
}

function hasFreshBullishDivergence(results, signalIndex, currentIndex, maxBarsApart) {
    const signal = results[signalIndex];
    if (!signal?.isBullDiv) return false;

    const age = currentIndex - signalIndex;
    if (age < 0 || age > maxBarsApart) return false;

    const current = results[currentIndex];
    const previous = results[currentIndex - 1] || current;
    const signalMomentum = signal.momentum;
    const currentMomentum = current.momentum;
    const currentSignal = current.signal;

    const momentumStillConstructive =
        currentMomentum > signalMomentum ||
        currentMomentum > currentSignal ||
        currentMomentum > previous.momentum;
    const notOverheated = currentMomentum < 55;
    const fluxNotDeteriorating = current.flux > -35 || current.flux > previous.flux;

    return momentumStillConstructive && notOverheated && fluxNotDeteriorating;
}

function timeframeConfig(interval) {
    const configs = {
        "15m": {
            lookbackDays: 30,
            fetchInterval: "15m",
            lookbackBars: 28,
            minUpsidePct: 2.0,
            maxPostSignalRunPct: 5.0,
            resistanceLookback: 80,
            swingLowLookback: 28,
            heldHoursPerBar: 0.25,
            vector: "SQZ_BULL_DIV_15M_ROOM",
            dataSource: "YahooFinance.chart(15m)",
            ageSuffix: "B",
        },
        "1h": {
            lookbackDays: 90,
            fetchInterval: "1h",
            lookbackBars: 24,
            minUpsidePct: 3.0,
            maxPostSignalRunPct: 7.0,
            resistanceLookback: 64,
            swingLowLookback: 24,
            heldHoursPerBar: 1,
            vector: "SQZ_BULL_DIV_1H_ROOM",
            dataSource: "YahooFinance.chart(1h)",
            ageSuffix: "B",
        },
        "4h": {
            lookbackDays: 120,
            fetchInterval: "1h",
            aggregateHours: 4,
            lookbackBars: 18,
            minUpsidePct: 4.0,
            maxPostSignalRunPct: 9.0,
            resistanceLookback: 42,
            swingLowLookback: 18,
            heldHoursPerBar: 4,
            vector: "SQZ_BULL_DIV_4H_ROOM",
            dataSource: "YahooFinance.chart(1h aggregated 4h)",
            ageSuffix: "B",
        },
        "1d": {
            lookbackDays: 220,
            fetchInterval: "1d",
            lookbackBars: 8,
            minUpsidePct: 6.0,
            maxPostSignalRunPct: 12.0,
            resistanceLookback: 55,
            swingLowLookback: 12,
            heldHoursPerBar: 24,
            vector: "SQZ_BULL_DIV_1D_ROOM",
            dataSource: "YahooFinance.chart(1d)",
            ageSuffix: "D",
        },
    };

    return configs[interval] || configs["1d"];
}

function jakartaDateParts(value) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(new Date(value));
    const get = type => parts.find(part => part.type === type)?.value || "00";

    return {
        day: `${get("year")}-${get("month")}-${get("day")}`,
        minutes: (Number(get("hour")) * 60) + Number(get("minute")),
    };
}

function aggregateQuotesByHours(quotes, hours) {
    const bucketMinutes = hours * 60;
    const buckets = new Map();

    for (const quote of quotes) {
        const { day, minutes } = jakartaDateParts(quote.date);
        const bucketStart = Math.floor(minutes / bucketMinutes) * bucketMinutes;
        const key = `${day}:${bucketStart}`;
        const existing = buckets.get(key);

        if (!existing) {
            buckets.set(key, {
                date: quote.date,
                open: quote.open,
                high: quote.high,
                low: quote.low,
                close: quote.close,
                volume: quote.volume || 0,
            });
            continue;
        }

        existing.high = Math.max(existing.high, quote.high);
        existing.low = Math.min(existing.low, quote.low);
        existing.close = quote.close;
        existing.volume += quote.volume || 0;
    }

    return Array.from(buckets.values());
}

async function analyzeSqueeze(stock, interval = "1d") {
  try {
    const scanRunAt = new Date();
    const config = timeframeConfig(interval);
    const period1 = new Date();
    period1.setDate(period1.getDate() - config.lookbackDays);

    const result = await yahooFinance.chart(stock.ticker, { period1, interval: config.fetchInterval });
    
    if (!result || !result.quotes || result.quotes.length < 60) return null;
    let quotes = result.quotes.filter(q => q.close !== null);
    
    if (config.aggregateHours) {
        quotes = aggregateQuotesByHours(quotes, config.aggregateHours);
    }

    if (quotes.length < 60) return null;

    const results = calculateSqueezeDeluxe(quotes);
    if (!results) return null;

    const closes = quotes.map(q => q.close);
    const ema20 = calculateEMA(closes, 20);
    const ema60 = calculateEMA(closes, 60);
    const atr = calculateATR(quotes, 14);
    const currentIndex = quotes.length - 1;
    const current = results[currentIndex];
    const previous = results[currentIndex - 1] || current;
    const currentQuote = quotes[currentIndex];
    const currentPrice = currentQuote.close;
    const currentEma20 = ema20[currentIndex];
    const currentEma60 = ema60[currentIndex];
    const currentAtr = atr[currentIndex] || Math.max(currentPrice * 0.025, 1);

    let foundSignal = null;
    const lookbackBars = config.lookbackBars;
    const minUpsidePct = config.minUpsidePct;
    const maxPostSignalRunPct = config.maxPostSignalRunPct;

    for (let j = 0; j < lookbackBars; j++) {
        const idx = results.length - 1 - j;
        if (idx < 1) continue;

        const s = results[idx];
        const p = results[idx - 1];
        const quoteAtSignal = quotes[idx];

        const isFreshDivergence = hasFreshBullishDivergence(results, idx, currentIndex, lookbackBars);
        const inSqueezeAtSignal = s.squeeze.low || s.squeeze.mid || s.squeeze.high;
        const recentlyCompressed = results.slice(Math.max(0, idx - 3), currentIndex + 1)
            .some(item => item.squeeze?.low || item.squeeze?.mid || item.squeeze?.high);
        const firedAfterSignal = results.slice(idx, currentIndex + 1)
            .some((item, localIndex, arr) => localIndex > 0 && !(item.squeeze.low || item.squeeze.mid || item.squeeze.high) && (arr[localIndex - 1].squeeze.low || arr[localIndex - 1].squeeze.mid));
        const momentumRoom = current.momentum > current.signal || current.momentum > previous.momentum;
        const priceAboveSignalLow = currentPrice >= quoteAtSignal.low * 0.98;
        const isHighConviction = s.isHighConviction || (s.isBullDiv && (firedAfterSignal || recentlyCompressed) && momentumRoom);

        if (isFreshDivergence && priceAboveSignalLow && (inSqueezeAtSignal || recentlyCompressed || isHighConviction)) {
            const priceRunFromSignal = ((currentPrice - quoteAtSignal.close) / quoteAtSignal.close) * 100;
            if (priceRunFromSignal > maxPostSignalRunPct) continue;

            const recentHigh = getRecentHigh(quotes, currentIndex, config.resistanceLookback);
            const swingLow = Math.min(getRecentLow(quotes, currentIndex, config.swingLowLookback), quoteAtSignal.low);
            const stopLoss = Math.min(swingLow * 0.985, currentPrice - currentAtr * 1.2);
            const risk = Math.max(currentPrice - stopLoss, currentPrice * 0.025);
            const rrTarget = currentPrice + risk * 1.5;
            const rangeTarget = Math.max(recentHigh, currentPrice + currentAtr * 2.2);
            const targetPrice = Math.max(rrTarget, rangeTarget);
            const upsidePct = ((targetPrice - currentPrice) / currentPrice) * 100;
            const resistanceRoomPct = ((recentHigh - currentPrice) / currentPrice) * 100;
            const rewardRisk = (targetPrice - currentPrice) / risk;
            const emaRoomOk = !isFiniteNumber(currentEma60) || currentPrice < currentEma60 * 1.08 || currentPrice > currentEma20;
            const roomStillOpen = upsidePct >= minUpsidePct && rewardRisk >= 1.5 && resistanceRoomPct > 1.5 && emaRoomOk;

            if (roomStillOpen) {
                foundSignal = {
                    ticker: stock.ticker,
                    sector: stock.sector || "Unknown",
                    signalSource: `Squeeze Divergence (${interval})`,
                    entryDate: quoteAtSignal.date,
                    entryPrice: currentPrice,
                    currentPrice: currentPrice,
                    targetPrice: Math.round(targetPrice),
                    stopLossPrice: Math.round(stopLoss),
                    status: 'pending',
                    daysHeld: j * config.heldHoursPerBar,
                    priceHistory: [{ date: quoteAtSignal.date, price: quoteAtSignal.close }],
                    metadata: {
                        category: "SQUEEZE_DIVERGENCE",
                        vector: config.vector,
                        timeframe: interval,
                        appearedAt: scanRunAt.toISOString(),
                        scanRunAt: scanRunAt.toISOString(),
                        dataSource: config.dataSource,
                        lastQuoteDate: currentQuote.date ? new Date(currentQuote.date).toISOString() : scanRunAt.toISOString(),
                        signalDate: quoteAtSignal.date ? new Date(quoteAtSignal.date).toISOString() : scanRunAt.toISOString(),
                        strategyRank: isHighConviction ? 850 : 650,
                        momentum: s.momentum.toFixed(2),
                        currentMomentum: current.momentum.toFixed(2),
                        currentSignal: current.signal.toFixed(2),
                        flux: s.flux.toFixed(2),
                        currentFlux: current.flux.toFixed(2),
                        squeezeLevel: s.squeeze.high ? "EXTREME" : (s.squeeze.mid ? "TIGHT" : (s.squeeze.low ? "STANDARD" : "RELEASED")),
                        isHighConviction: isHighConviction,
                        divergence: "Bullish Momentum",
                        status: isHighConviction ? "SQUEEZE_RELEASE_DIV_WITH_ROOM" : "SQUEEZE_PREP_DIV_WITH_ROOM",
                        age: j === 0 ? "TODAY" : `${j}${config.ageSuffix}_AGO`,
                        divergenceBarsAgo: j,
                        priceRunFromSignal: priceRunFromSignal.toFixed(2),
                        upsideRoomPct: upsidePct.toFixed(2),
                        resistanceRoomPct: resistanceRoomPct.toFixed(2),
                        rewardRisk: rewardRisk.toFixed(2),
                        recentHigh: recentHigh.toFixed(2),
                        swingLow: swingLow.toFixed(2),
                        ema20: isFiniteNumber(currentEma20) ? currentEma20.toFixed(2) : "N/A",
                        ema60: isFiniteNumber(currentEma60) ? currentEma60.toFixed(2) : "N/A",
                        roomFilter: `Accepted only if upside >= ${minUpsidePct}% and RR >= 1.5; rejects late moves with limited room.`
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
    const stocks = loadIdxStocks();
    await mongoose.connect(MONGODB_URI);
    console.log(`Starting Squeeze Divergence Scan for \${stocks.length} stocks...`);
    
    const timeframes = ["15m", "1h", "4h", "1d"];
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
        } else {
          existing.currentPrice = newSignal.currentPrice;
          existing.targetPrice = newSignal.targetPrice;
          existing.stopLossPrice = newSignal.stopLossPrice;
          existing.relevanceScore = newSignal.metadata.strategyRank;
          existing.priceHistory = [
            ...(existing.priceHistory || []),
            { date: new Date(), price: newSignal.currentPrice }
          ].slice(-60);
          existing.metadata = {
            ...(existing.metadata || {}),
            ...(newSignal.metadata || {}),
            firstEntryPrice: existing.metadata?.firstEntryPrice || existing.entryPrice,
            latestPrice: newSignal.currentPrice,
            firstAppearedAt: existing.createdAt || existing.entryDate,
            lastScannedAt: new Date().toISOString()
          };
          await existing.save();
        }
      }
    } else {
      console.log("No new Squeeze Divergence signals found.");
    }

    for (const tf of timeframes) {
      const activeTickers = results
        .filter(signal => signal.signalSource === `Squeeze Divergence (${tf})`)
        .map(signal => signal.ticker);

      await StockSignal.updateMany(
        {
          status: 'pending',
          $or: [
            { signalSource: `Squeeze Divergence (${tf})` },
            {
              signalSource: 'Squeeze Divergence (${interval})',
              ...(tf === '4h'
                ? { 'metadata.vector': /4H/i }
                : (tf === '1d' ? { 'metadata.vector': { $not: /(15M|1H|4H)/i } } : { 'metadata.vector': new RegExp(tf.toUpperCase(), 'i') }))
            }
          ],
          ticker: { $nin: activeTickers }
        },
        {
          $set: {
            status: 'archived',
            'metadata.archivedAt': new Date().toISOString(),
            'metadata.archiveReason': 'No longer qualifies latest Squeeze Deluxe divergence room filter'
          }
        }
      );
    }

  } finally {
    await mongoose.disconnect();
  }
}
run();
