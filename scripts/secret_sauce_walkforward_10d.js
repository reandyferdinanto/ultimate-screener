const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const YahooFinance = require('yahoo-finance2').default;
const { RSI, MFI, SMA, EMA } = require('technicalindicators');
const { buildFormulaFromSamples, normalizeFormula } = require('./secret_sauce_formula_utils');

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://reandy:XuISHforC8mWVEKd@ac-pfdd5xf-shard-00-00.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-01.ybmffcl.mongodb.net:27017,ac-pfdd5xf-shard-00-02.ybmffcl.mongodb.net:27017/ultimate_screener?ssl=true&authSource=admin&replicaSet=atlas-lnuwmi-shard-0&retryWrites=true&w=majority&appName=Cluster0';

const indonesiaStockSchema = new mongoose.Schema({
  ticker: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const IndonesiaStockModel = mongoose.models.IndonesiaStock || mongoose.model('IndonesiaStock', indonesiaStockSchema, 'indonesiastocks');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatDate(date) {
  return date.toISOString().substring(0, 10);
}

function calculateSnapshot(quotes, endIndex) {
  if (endIndex < 49) return null;

  const slice = quotes.slice(0, endIndex + 1).filter((quote) => quote.close != null && quote.high != null && quote.low != null && quote.volume != null);
  if (slice.length < 50) return null;

  const closes = slice.map((quote) => quote.close);
  const highs = slice.map((quote) => quote.high);
  const lows = slice.map((quote) => quote.low);
  const volumes = slice.map((quote) => quote.volume);

  const rsi = RSI.calculate({ period: 14, values: closes });
  const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 });
  const ema20 = EMA.calculate({ period: 20, values: closes });
  const sma50 = SMA.calculate({ period: 50, values: closes });

  const currentPrice = closes[closes.length - 1];
  const currentHigh = highs[highs.length - 1];
  const currentLow = lows[lows.length - 1];
  const currentEma20 = ema20[ema20.length - 1];
  const recentVol = volumes[volumes.length - 1];
  const avgVol10 = volumes.slice(-11, -1).reduce((sum, value) => sum + value, 0) / 10;
  const recentHighs = highs.slice(-5);
  const recentLows = lows.slice(-5);
  const intradayRange = currentHigh - currentLow;

  return {
    price: currentPrice,
    rsi: rsi[rsi.length - 1],
    mfi: mfi[mfi.length - 1],
    ema20: currentEma20,
    rVol: avgVol10 > 0 ? recentVol / avgVol10 : 1,
    distEma20_pct: currentEma20 ? ((currentPrice - currentEma20) / currentEma20) * 100 : 0,
    isAboveSma50: currentPrice > (sma50[sma50.length - 1] || 0),
    compressionPct: currentPrice > 0 ? ((Math.max(...recentHighs) - Math.min(...recentLows)) / currentPrice) * 100 : 0,
    closeNearHighPct: intradayRange > 0 ? ((currentPrice - currentLow) / intradayRange) * 100 : 100,
  };
}

function buildPreBreakoutWindow(quotes, breakoutIdx, windowSize = 10) {
  if (breakoutIdx < 20) return null;

  const start = Math.max(19, breakoutIdx - windowSize);
  const window = [];
  for (let i = start; i < breakoutIdx; i += 1) {
    const snapshot = calculateSnapshot(quotes, i);
    if (!snapshot) continue;

    window.push({
      date: formatDate(quotes[i].date),
      close: Number(quotes[i].close),
      volume: Number(quotes[i].volume || 0),
      rsi: Number(snapshot.rsi.toFixed(2)),
      mfi: Number(snapshot.mfi.toFixed(2)),
      distEma20Pct: Number(snapshot.distEma20_pct.toFixed(2)),
      volRatio: Number(snapshot.rVol.toFixed(2)),
      rangePct: Number(snapshot.compressionPct.toFixed(2)),
      closeNearHighPct: Number(snapshot.closeNearHighPct.toFixed(2)),
    });
  }

  return window.length ? window : null;
}

function summarizeWindow(window) {
  if (!window || window.length === 0) return null;

  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const closes = window.map((item) => item.close);
  const last3 = closes.slice(-3);

  return {
    windowCandles: window.length,
    avgRsi: Number(avg(window.map((item) => item.rsi)).toFixed(2)),
    avgMfi: Number(avg(window.map((item) => item.mfi)).toFixed(2)),
    minDistEma20Pct: Number(Math.min(...window.map((item) => item.distEma20Pct)).toFixed(2)),
    maxDistEma20Pct: Number(Math.max(...window.map((item) => item.distEma20Pct)).toFixed(2)),
    avgVolRatio: Number(avg(window.map((item) => item.volRatio)).toFixed(2)),
    maxVolRatio: Number(Math.max(...window.map((item) => item.volRatio)).toFixed(2)),
    avgCompressionPct: Number(avg(window.map((item) => item.rangePct)).toFixed(2)),
    avgCloseNearHighPct: Number(avg(window.map((item) => item.closeNearHighPct)).toFixed(2)),
    last3TightnessPct: last3.length >= 3 ? Number((((Math.max(...last3) - Math.min(...last3)) / closes[closes.length - 1]) * 100).toFixed(2)) : null,
  };
}

function isBreakout(quotes, index) {
  if (index < 1) return false;

  const current = quotes[index];
  const prev = quotes[index - 1];
  if (!current || !prev || current.close == null || prev.close == null || current.high == null || current.low == null) {
    return false;
  }

  const gainPct = ((current.close - prev.close) / prev.close) * 100;
  const range = current.high - current.low;
  const sustainedLevel = range > 0 ? (current.close - current.low) / range : 1;

  return gainPct >= 20 && sustainedLevel > 0.8;
}

function matchesFormula(snapshot, formula) {
  return (
    snapshot.distEma20_pct >= formula.minDistEma20Pct &&
    snapshot.distEma20_pct <= formula.maxDistEma20Pct &&
    snapshot.rVol >= formula.minRvol &&
    snapshot.rsi >= formula.minRsi &&
    snapshot.rsi <= formula.maxRsi &&
    snapshot.mfi >= formula.minMfi &&
    snapshot.compressionPct <= formula.maxCompressionPct &&
    snapshot.closeNearHighPct >= formula.minCloseNearHighPct &&
    snapshot.isAboveSma50 === true  // [NEW] Must be in uptrend
  );
}

async function getTradingDates() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const yesterday = new Date(end);
  yesterday.setDate(yesterday.getDate() - 1);

  const start = new Date(yesterday);
  start.setDate(start.getDate() - 30);

  const chart = await yahooFinance.chart('^JKSE', {
    period1: formatDate(start),
    period2: formatDate(yesterday),
    interval: '1d',
  });

  const dates = (chart.quotes || [])
    .filter((quote) => quote.close != null && quote.date <= yesterday)
    .map((quote) => formatDate(new Date(quote.date)));

  return [...new Set(dates)].slice(-10);
}

async function fetchUniverseQuotes(tickers) {
  const result = new Map();
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - 160);

  const chunkSize = 20;
  for (let i = 0; i < tickers.length; i += chunkSize) {
    const chunk = tickers.slice(i, i + chunkSize);
    console.log(`Fetching historical quotes ${i + chunk.length}/${tickers.length}...`);

    await Promise.all(chunk.map(async (ticker) => {
      try {
        const symbol = ticker.endsWith('.JK') ? ticker : `${ticker}.JK`;
        const chart = await yahooFinance.chart(symbol, {
          period1: formatDate(lookbackStart),
          interval: '1d',
        });
        const quotes = (chart.quotes || []).filter((quote) => quote.close != null && quote.high != null && quote.low != null && quote.volume != null);
        if (quotes.length >= 50) {
          result.set(symbol.replace('.JK', ''), quotes.map((quote) => ({ ...quote, date: new Date(quote.date) })));
        }
      } catch (error) {
        // Ignore per-symbol Yahoo failures.
      }
    }));

    await delay(600);
  }

  return result;
}

function buildBreakoutSamples(quotesByTicker, trackedDates) {
  const trackedSet = new Set(trackedDates);
  const samples = [];
  const breakoutMap = new Map();

  for (const [ticker, quotes] of quotesByTicker.entries()) {
    for (let index = 1; index < quotes.length; index += 1) {
      const breakoutDate = formatDate(quotes[index].date);
      if (!trackedSet.has(breakoutDate) || !isBreakout(quotes, index)) {
        continue;
      }

      const gainPercentage = Number((((quotes[index].close - quotes[index - 1].close) / quotes[index - 1].close) * 100).toFixed(2));
      const preBreakoutWindow = buildPreBreakoutWindow(quotes, index, 10);
      const preBreakoutSummary = summarizeWindow(preBreakoutWindow);
      if (!preBreakoutWindow || !preBreakoutSummary) {
        continue;
      }

      const sample = {
        ticker,
        breakout_date: breakoutDate,
        gain_percentage: gainPercentage,
        pre_breakout_window: preBreakoutWindow,
        pre_breakout_summary: preBreakoutSummary,
      };
      samples.push(sample);

      if (!breakoutMap.has(breakoutDate)) {
        breakoutMap.set(breakoutDate, new Set());
      }
      breakoutMap.get(breakoutDate).add(ticker);
      break;
    }
  }

  samples.sort((a, b) => a.breakout_date.localeCompare(b.breakout_date) || a.ticker.localeCompare(b.ticker));
  return { samples, breakoutMap };
}

function evaluateFormulaForTargetDate(quotesByTicker, formula, snapshotDate, targetDate, breakoutMap) {
  const candidates = [];
  const hits = [];
  const breakoutTickers = breakoutMap.get(targetDate) || new Set();

  for (const [ticker, quotes] of quotesByTicker.entries()) {
    const snapshotIndex = quotes.findIndex((quote) => formatDate(quote.date) === snapshotDate);
    if (snapshotIndex === -1) {
      continue;
    }

    const snapshot = calculateSnapshot(quotes, snapshotIndex);
    if (!snapshot || !matchesFormula(snapshot, formula)) {
      continue;
    }

    candidates.push({
      ticker,
      snapshotDate,
      targetDate,
      snapshot: {
        price: Number(snapshot.price.toFixed(2)),
        rsi: Number(snapshot.rsi.toFixed(2)),
        mfi: Number(snapshot.mfi.toFixed(2)),
        rVol: Number(snapshot.rVol.toFixed(2)),
        distEma20Pct: Number(snapshot.distEma20_pct.toFixed(2)),
        compressionPct: Number(snapshot.compressionPct.toFixed(2)),
        closeNearHighPct: Number(snapshot.closeNearHighPct.toFixed(2)),
      },
    });

    if (breakoutTickers.has(ticker)) {
      hits.push(ticker);
    }
  }

  return {
    targetDate,
    snapshotDate,
    totalCandidates: candidates.length,
    actualBreakouts: breakoutTickers.size,
    hits,
    candidates,
  };
}

function buildWalkforwardSummary(results) {
  const scored = results.filter((result) => result.totalCandidates > 0 || result.totalHits > 0);
  const sortedByQuality = [...scored].sort((a, b) => {
    const aScore = (a.precisionPct || 0) * (a.totalHits + 1);
    const bScore = (b.precisionPct || 0) * (b.totalHits + 1);
    return bScore - aScore;
  });

  return {
    bestRun: sortedByQuality[0] || null,
    latestRun: results[results.length - 1] || null,
  };
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  try {
    const stocks = await IndonesiaStockModel.find({ active: true }, { ticker: 1 }).lean();
    const tickers = stocks.map((stock) => stock.ticker.replace('.JK', ''));
    const tradingDates = await getTradingDates();

    if (tradingDates.length < 3) {
      throw new Error('Not enough recent trading dates found for walk-forward analysis.');
    }

    console.log(`Using trading dates: ${tradingDates.join(', ')}`);
    const quotesByTicker = await fetchUniverseQuotes(tickers);
    const { samples, breakoutMap } = buildBreakoutSamples(quotesByTicker, tradingDates);

    console.log(`Detected ${samples.length} breakout samples across the last ${tradingDates.length} trading days.`);

    const walkforwardResults = [];
    let previousPerformance = null;

    for (let anchorIndex = 0; anchorIndex < tradingDates.length - 1; anchorIndex += 1) {
      const anchorDate = tradingDates[anchorIndex];
      const trainingSamples = samples.filter((sample) => sample.breakout_date <= anchorDate);
      const { formula, sourceSummary, notes } = buildFormulaFromSamples(trainingSamples, previousPerformance);
      const normalizedFormula = normalizeFormula(formula);
      const dailyResults = [];

      for (let targetIndex = anchorIndex + 1; targetIndex < tradingDates.length; targetIndex += 1) {
        const targetDate = tradingDates[targetIndex];
        const snapshotDate = tradingDates[targetIndex - 1];
        dailyResults.push(evaluateFormulaForTargetDate(quotesByTicker, normalizedFormula, snapshotDate, targetDate, breakoutMap));
      }

      const totalCandidates = dailyResults.reduce((sum, day) => sum + day.totalCandidates, 0);
      const totalHits = dailyResults.reduce((sum, day) => sum + day.hits.length, 0);
      const totalActualBreakouts = dailyResults.reduce((sum, day) => sum + day.actualBreakouts, 0);
      const precisionPct = totalCandidates > 0 ? Number(((totalHits / totalCandidates) * 100).toFixed(2)) : 0;
      const recallPct = totalActualBreakouts > 0 ? Number(((totalHits / totalActualBreakouts) * 100).toFixed(2)) : 0;
      const avgDailyCandidates = dailyResults.length > 0 ? Number((totalCandidates / dailyResults.length).toFixed(2)) : 0;

      const run = {
        anchorDate,
        trainingSampleCount: trainingSamples.length,
        formula: normalizedFormula,
        sourceSummary,
        notes,
        evaluationWindow: {
          start: dailyResults[0]?.targetDate || null,
          end: dailyResults[dailyResults.length - 1]?.targetDate || null,
          days: dailyResults.length,
        },
        totalCandidates,
        totalHits,
        totalActualBreakouts,
        precisionPct,
        recallPct,
        avgDailyCandidates,
        dailyResults,
      };

      walkforwardResults.push(run);
      previousPerformance = {
        totalEvaluated: totalCandidates,
        winRate: precisionPct,
      };
      console.log(`Anchor ${anchorDate}: ${totalHits}/${totalCandidates} hits, precision ${precisionPct}%`);
    }

    const summary = buildWalkforwardSummary(walkforwardResults);
    const output = {
      reportType: 'secret_sauce_walkforward_10d',
      generatedAt: new Date().toISOString(),
      tradingDates,
      breakoutSampleCount: samples.length,
      breakoutByDate: Object.fromEntries(tradingDates.map((date) => [date, Array.from(breakoutMap.get(date) || [])])),
      walkforwardResults,
      summary,
    };

    const outputDir = path.join(process.cwd(), 'artifacts', 'secret-sauce-walkforward');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `secret-sauce-walkforward-${new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z')}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

    console.log(outputPath);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to run 10-day Secret Sauce walk-forward:', error);
  process.exit(1);
});
