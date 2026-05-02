/* eslint-disable @typescript-eslint/no-require-imports */
const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const { loadIdxStocks } = require('./idx_stock_file');

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0";

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
  priceHistory: [{ date: Date, price: Number }],
  metadata: Object,
}, { timestamps: true });
const StockSignal = mongoose.models.StockSignal || mongoose.model('StockSignal', stockSignalSchema);
const rejectStats = {};

function reject(reason) {
  rejectStats[reason] = (rejectStats[reason] || 0) + 1;
  return null;
}

function avg(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function sma(values, period) {
  return values.map((_, index) => index < period - 1 ? null : avg(values.slice(index - period + 1, index + 1)));
}

function ema(values, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  let previous = null;
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    if (!Number.isFinite(value)) {
      result.push(previous);
      continue;
    }
    if (previous === null) previous = i < period - 1 ? value : avg(values.slice(i - period + 1, i + 1));
    else previous = (value - previous) * multiplier + previous;
    result.push(previous);
  }
  return result;
}

function rsi(values, period = 14) {
  const result = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(diff, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-diff, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function atr(quotes, period = 14) {
  const tr = quotes.map((quote, index) => {
    if (index === 0) return quote.high - quote.low;
    const prevClose = quotes[index - 1].close;
    return Math.max(quote.high - quote.low, Math.abs(quote.high - prevClose), Math.abs(quote.low - prevClose));
  });
  return tr.map((value, index) => index < period ? avg(tr.slice(0, index + 1)) : ((tr.slice(index - period + 1, index + 1).reduce((sum, item) => sum + item, 0)) / period));
}

function stdev(values) {
  const mean = avg(values);
  return Math.sqrt(avg(values.map(value => Math.pow(value - mean, 2))));
}

function bbWidth(values, period = 20) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    const middle = avg(window);
    const dev = stdev(window);
    return middle > 0 ? (((middle + dev * 2) - (middle - dev * 2)) / middle) * 100 : null;
  });
}

function linearSlopePct(values) {
  if (values.length < 2) return 0;
  const n = values.length;
  const xSum = (n * (n - 1)) / 2;
  const ySum = values.reduce((sum, value) => sum + value, 0);
  const xySum = values.reduce((sum, value, index) => sum + value * index, 0);
  const x2Sum = values.reduce((sum, _, index) => sum + index * index, 0);
  const denominator = (n * x2Sum) - (xSum * xSum);
  if (denominator === 0) return 0;
  const slope = ((n * xySum) - (xSum * ySum)) / denominator;
  const intercept = (ySum - slope * xSum) / n;
  const start = intercept;
  const end = intercept + slope * (n - 1);
  return start > 0 ? ((end - start) / start) * 100 : 0;
}

function higherLowsScore(lows) {
  if (lows.length < 18) return 0;
  const third = Math.floor(lows.length / 3);
  const low1 = Math.min(...lows.slice(0, third));
  const low2 = Math.min(...lows.slice(third, third * 2));
  const low3 = Math.min(...lows.slice(third * 2));
  let score = 65;
  if (low2 >= low1 * 0.99) score += 12;
  if (low3 >= low2 * 0.99) score += 13;
  if (low3 >= low1 * 1.03) score += 10;
  return Math.min(100, score);
}

function bandScore(value, idealLow, idealHigh, softLow, softHigh) {
  if (!Number.isFinite(value)) return 0;
  if (value >= idealLow && value <= idealHigh) return 1;
  if (value < idealLow) return Math.max(0, (value - softLow) / (idealLow - softLow));
  return Math.max(0, (softHigh - value) / (softHigh - idealHigh));
}

function minScore(value, good, bad) {
  if (!Number.isFinite(value)) return 0;
  if (value >= good) return 1;
  if (value <= bad) return 0;
  return (value - bad) / (good - bad);
}

function calculateSimilarity(features) {
  const sidewaysQuality =
    10 * bandScore(features.baseRangePct, 13, 20, 8, 30) +
    7 * bandScore(features.baseSlopePct, -6, 1, -12, 8) +
    8 * minScore(features.higherLowsScore, 85, 60);
  const volumeExpansion =
    8 * bandScore(features.volumeDryUpRatio, 0.4, 1.0, 0.15, 1.6) +
    10 * bandScore(features.breakoutVolumeRatio20, 2, 8, 1, 15) +
    7 * bandScore(features.accumulationVolumeRatio, 1.2, 2.4, 0.8, 3.8);
  const trendStructure =
    8 * bandScore(features.closeVsEma20Pct, 8, 24, 0, 35) +
    7 * bandScore(features.closeVsSma50Pct, 10, 26, 0, 40) +
    5 * bandScore(features.breakoutCloseAboveBaseHighPct, 3, 13, 0, 25);
  const momentum = 15 * bandScore(features.breakoutRsi14, 70, 82, 60, 95);
  const riskCompression =
    8 * bandScore(features.breakoutAtrPct, 3.2, 5.2, 2, 7.5) +
    7 * bandScore(features.breakoutBbWidth20, 15, 34, 8, 40);
  let powerBonus = 0;
  if (features.volumeDryUpRatio <= 0.6 && features.breakoutVolumeRatio20 >= 8 && features.accumulationVolumeRatio >= 2.2 && features.higherLowsScore >= 90) powerBonus += 5;
  if (features.breakoutRsi14 >= 82 && features.breakoutVolumeRatio20 >= 8 && features.breakoutCloseAboveBaseHighPct >= 10) powerBonus += 3;
  return Math.round(Math.min(100, sidewaysQuality + volumeExpansion + trendStructure + momentum + riskCompression + powerBonus));
}

function classify(features) {
  const conservative = features.baseRangePct <= 20 && features.baseSlopePct >= -6 && features.baseSlopePct <= 1 &&
    features.volumeDryUpRatio <= 1.0 && features.breakoutVolumeRatio20 >= 2.0 &&
    features.breakoutRsi14 >= 70 && features.breakoutRsi14 <= 82 &&
    features.breakoutAtrPct >= 3.0 && features.breakoutAtrPct <= 5.5 &&
    features.closeVsEma20Pct >= 8 && features.closeVsEma20Pct <= 24 &&
    features.closeVsSma50Pct >= 10 && features.closeVsSma50Pct <= 26 &&
    features.accumulationVolumeRatio >= 1.2 && features.higherLowsScore >= 80 &&
    features.isAboveEma20 && features.isAboveSma50 &&
    features.breakoutCloseAboveBaseHighPct >= 3 && features.breakoutCloseAboveBaseHighPct <= 13;

  const power = features.baseRangePct >= 12 && features.baseRangePct <= 28 &&
    features.volumeDryUpRatio <= 0.9 && features.breakoutVolumeRatio20 >= 8 &&
    features.breakoutRsi14 >= 78 && features.breakoutRsi14 <= 95 &&
    features.closeVsEma20Pct >= 15 && features.closeVsEma20Pct <= 35 &&
    features.closeVsSma50Pct >= 15 && features.closeVsSma50Pct <= 40 &&
    features.accumulationVolumeRatio >= 2.0 && features.higherLowsScore >= 90 &&
    features.isAboveEma20 && features.isAboveSma50;

  if (conservative) return { vector: 'TIGHT_FLAT_ACCUMULATION', label: 'Technical Breakout: Tight-Flat Accumulation' };
  if (power) return { vector: 'POWER_IGNITION_BREAKOUT', label: 'Technical Breakout: Power Ignition' };
  return { vector: 'WINNER_SIMILARITY_WATCHLIST', label: 'Technical Breakout: Winner Similarity' };
}

function classifySetup(features, isBreakingOut) {
  if (!isBreakingOut) {
    return {
      vector: 'NEAR_BREAKOUT_WATCHLIST',
      label: 'Technical Breakout: Near Breakout Watchlist',
      thesis: 'Near-breakout watchlist: winner-like base structure with price close to base high, but breakout is not confirmed yet.',
    };
  }

  const pattern = classify(features);
  return {
    ...pattern,
    thesis: pattern.vector === 'POWER_IGNITION_BREAKOUT'
      ? 'Power ignition breakout: dry base, strong accumulation, high volume expansion, and high RSI.'
      : 'Tight-flat accumulation breakout: controlled base, higher lows, volume expansion, and price above EMA20/SMA50.',
  };
}

async function analyzeTicker(stock) {
  try {
    const scanRunAt = new Date();
    const period1 = new Date();
    period1.setDate(period1.getDate() - 380);
    const result = await yahooFinance.chart(stock.ticker, { period1, interval: '1d' });
    const quotes = (result?.quotes || []).filter(q => [q.open, q.high, q.low, q.close, q.volume].every(value => value !== null && value !== undefined && Number.isFinite(Number(value))));
    if (quotes.length < 90) return reject('insufficient_quotes');

    const closes = quotes.map(q => Number(q.close));
    const lows = quotes.map(q => Number(q.low));
    const volumes = quotes.map(q => Number(q.volume));
    const lastIdx = quotes.length - 1;
    const last = quotes[lastIdx];
    const price = Number(last.close);
    if (!Number.isFinite(price) || price <= 0) return reject('invalid_price');

    const ema20Arr = ema(closes, 20);
    const sma50Arr = sma(closes, 50);
    const rsi14Arr = rsi(closes, 14);
    const atr14Arr = atr(quotes, 14);
    const bbWidth20Arr = bbWidth(closes, 20);
    const ema20 = Number(ema20Arr[lastIdx]);
    const sma50 = Number(sma50Arr[lastIdx]);
    if (![ema20, sma50].every(Number.isFinite)) return reject('missing_ma');

    const baseLookback = 30;
    const baseStart = Math.max(0, lastIdx - baseLookback);
    const baseQuotes = quotes.slice(baseStart, lastIdx);
    if (baseQuotes.length < 24) return reject('insufficient_base');

    const baseHigh = Math.max(...baseQuotes.map(q => Number(q.high)));
    const baseLow = Math.min(...baseQuotes.map(q => Number(q.low)));
    const baseCloses = baseQuotes.map(q => Number(q.close));
    const baseLows = baseQuotes.map(q => Number(q.low));
    const baseVolumes = baseQuotes.map(q => Number(q.volume));
    const breakoutCloseAboveBaseHighPct = baseHigh > 0 ? ((price - baseHigh) / baseHigh) * 100 : 0;
    const distanceToBaseHighPct = baseHigh > 0 ? ((price - baseHigh) / baseHigh) * 100 : 99;
    const isBreakingOut = price > baseHigh * 1.02;

    const ma20VolPrior = avg(volumes.slice(Math.max(0, lastIdx - 20), lastIdx));
    const baseEarlyVolume = avg(baseVolumes.slice(0, 12));
    const baseLateVolume = avg(baseVolumes.slice(-10));
    const upDayVolumes = baseQuotes.filter(q => q.close >= q.open).map(q => Number(q.volume));
    const downDayVolumes = baseQuotes.filter(q => q.close < q.open).map(q => Number(q.volume));
    const dryUpDenominator = baseEarlyVolume > 0 ? baseEarlyVolume : ma20VolPrior;
    const accumulationDenominator = avg(downDayVolumes) || ma20VolPrior || 1;

    const features = {
      baseRangePct: baseLow > 0 ? ((baseHigh - baseLow) / baseLow) * 100 : 99,
      baseSlopePct: linearSlopePct(baseCloses),
      volumeDryUpRatio: dryUpDenominator > 0 ? baseLateVolume / dryUpDenominator : 1,
      breakoutVolumeRatio20: ma20VolPrior > 0 ? Number(last.volume) / ma20VolPrior : 0,
      breakoutRsi14: Number(rsi14Arr[lastIdx]),
      breakoutAtrPct: price > 0 ? (Number(atr14Arr[lastIdx]) / price) * 100 : 99,
      breakoutBbWidth20: Number(bbWidth20Arr[lastIdx]),
      closeVsEma20Pct: ((price - ema20) / ema20) * 100,
      closeVsSma50Pct: ((price - sma50) / sma50) * 100,
      accumulationVolumeRatio: avg(upDayVolumes) / accumulationDenominator,
      higherLowsScore: higherLowsScore(baseLows),
      breakoutCloseAboveBaseHighPct,
      isAboveEma20: price > ema20,
      isAboveSma50: price > sma50,
      baseHigh,
      baseLow,
    };

    if (!isBreakingOut && !features.isAboveEma20) return reject('watchlist_below_ema20');
    if (isBreakingOut && (!features.isAboveEma20 || !features.isAboveSma50 || features.higherLowsScore < 70)) return reject('breakout_weak_trend_structure');
    const similarityScore = calculateSimilarity(features);
    const nearBreakout = !isBreakingOut && distanceToBaseHighPct >= -12 && distanceToBaseHighPct <= 3;
    if (!isBreakingOut && !nearBreakout) return reject('not_near_base_high');
    if (nearBreakout) {
      const structureOk = features.baseRangePct <= 35 &&
        features.baseSlopePct >= -12 && features.baseSlopePct <= 8 &&
        features.volumeDryUpRatio <= 1.8 &&
        features.breakoutRsi14 >= 48 && features.breakoutRsi14 <= 88 &&
        features.closeVsEma20Pct >= -3 && features.closeVsEma20Pct <= 25 &&
        features.closeVsSma50Pct >= -2 && features.closeVsSma50Pct <= 35 &&
        features.higherLowsScore >= 60;
      if (!structureOk) return reject('watchlist_structure_filter');
      if (similarityScore < 45) return reject('watchlist_score_under_45');
    }
    const pattern = classifySetup(features, isBreakingOut);
    if (isBreakingOut && similarityScore < 70 && pattern.vector === 'WINNER_SIMILARITY_WATCHLIST') return reject('breakout_score_under_70');

    const swingLow = Math.min(...lows.slice(-8));
    const stopLoss = Math.round(Math.min(baseHigh * 0.97, ema20 * 0.98, swingLow * 0.99));
    const risk = Math.max(price - stopLoss, price * 0.03);
    const targetFromBase100 = baseLow * 2;
    const targetPrice = Math.round(Math.max(targetFromBase100, price + risk * 2));
    const marketDate = last.date ? new Date(last.date) : scanRunAt;
    const marketDateIso = marketDate.toISOString();

    return {
      ticker: stock.ticker,
      sector: stock.sector || 'Unknown',
      signalSource: pattern.label,
      entryDate: marketDate,
      entryPrice: Math.round(price),
      currentPrice: Math.round(price),
      targetPrice,
      stopLossPrice: stopLoss,
      relevanceScore: similarityScore,
      priceHistory: [{ date: marketDate, price: Math.round(price) }],
      metadata: {
        category: 'TECHNICAL_BREAKOUT',
        vector: pattern.vector,
        appearedAt: marketDateIso,
        scanRunAt: scanRunAt.toISOString(),
        dataSource: 'YahooFinance.chart(1d) + TECHNICAL-BREAKOUT-PATTERNS.md',
        lastQuoteDate: marketDateIso,
        thesis: pattern.thesis,
        isConfirmedBreakout: isBreakingOut,
        distanceToBaseHighPct: distanceToBaseHighPct.toFixed(2),
        similarityScore,
        setupScore: similarityScore,
        volScore: Math.round(Math.min(100, features.breakoutVolumeRatio20 * 12)),
        strategyRank: similarityScore,
        baseRangePct: features.baseRangePct.toFixed(2),
        baseSlopePct: features.baseSlopePct.toFixed(2),
        volumeDryUpRatio: features.volumeDryUpRatio.toFixed(2),
        breakoutVolumeRatio20: features.breakoutVolumeRatio20.toFixed(2),
        breakoutRsi14: features.breakoutRsi14.toFixed(2),
        breakoutAtrPct: features.breakoutAtrPct.toFixed(2),
        breakoutBbWidth20: features.breakoutBbWidth20.toFixed(2),
        closeVsEma20Pct: features.closeVsEma20Pct.toFixed(2),
        closeVsSma50Pct: features.closeVsSma50Pct.toFixed(2),
        accumulationVolumeRatio: features.accumulationVolumeRatio.toFixed(2),
        higherLowsScore: features.higherLowsScore,
        breakoutCloseAboveBaseHighPct: features.breakoutCloseAboveBaseHighPct.toFixed(2),
        baseHigh: Math.round(baseHigh),
        baseLow: Math.round(baseLow),
        rrTarget: '100% from base low or 2R, whichever is higher',
      },
    };
  } catch {
    return reject('fetch_or_runtime_error');
  }
}

async function run() {
  try {
    const stocks = loadIdxStocks();
    await mongoose.connect(MONGODB_URI);
    console.log(`Starting Technical Breakout Scan for ${stocks.length} stocks...`);
    const results = [];
    const batchSize = 8;

    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(stock => analyzeTicker(stock)));
      results.push(...batchResults.filter(Boolean));
      if (i % 120 === 0) console.log(`Breakout progress: ${i}/${stocks.length} | Found: ${results.length}`);
      await new Promise(resolve => setTimeout(resolve, 180));
    }

    console.log(`Technical Breakout candidates before DB sync: ${results.length}`);
    console.log(`Reject stats: ${JSON.stringify(rejectStats)}`);

    for (const newSignal of results) {
      const existing = await StockSignal.findOne({
        ticker: newSignal.ticker,
        status: 'pending',
        'metadata.category': 'TECHNICAL_BREAKOUT',
      });
      if (!existing) {
        await StockSignal.create(newSignal);
      } else {
        const firstAppearedAt = existing.metadata?.firstAppearedAt || existing.metadata?.appearedAt || existing.createdAt || existing.entryDate;
        existing.signalSource = newSignal.signalSource;
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
          firstAppearedAt: firstAppearedAt instanceof Date ? firstAppearedAt.toISOString() : firstAppearedAt,
          firstEntryPrice: existing.metadata?.firstEntryPrice || existing.entryPrice,
          latestPrice: newSignal.currentPrice,
          lastScannedAt: new Date().toISOString(),
        };
        existing.daysHeld = Math.floor((new Date() - new Date(existing.entryDate)) / (1000 * 60 * 60));
        await existing.save();
      }
    }

    const activeTickers = results.map(signal => signal.ticker);
    await StockSignal.updateMany(
      {
        status: 'pending',
        'metadata.category': 'TECHNICAL_BREAKOUT',
        ticker: { $nin: activeTickers },
      },
      {
        $set: {
          status: 'archived',
          'metadata.archivedAt': new Date().toISOString(),
          'metadata.archiveReason': 'No longer qualifies TECHNICAL-BREAKOUT-PATTERNS scan',
        },
      }
    );

    console.log(`Technical Breakout scan complete. Found ${results.length} candidates.`);
  } finally {
    await mongoose.disconnect();
  }
}

run();
