import fs from "fs";
import path from "path";
import YahooFinance from "yahoo-finance2";
import { loadIdxStocks } from "@/lib/idx-stock-file";

export type ResearchQuote = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  rsi14?: number | null;
  atr14?: number | null;
  atrPct?: number | null;
  volumeRatio20?: number | null;
  bbWidth20?: number | null;
};

export type BreakoutEvent = {
  id?: string;
  threshold: 50 | 100;
  ticker: string;
  symbol: string;
  sidewaysStart: string;
  sidewaysEnd: string;
  breakoutDate: string;
  targetDate: string | null;
  peakDate: string;
  baseDurationDays: number;
  daysToTarget: number | null;
  daysToPeak: number;
  baseLow: number;
  baseHigh: number;
  breakoutClose: number;
  peakHigh: number;
  returnFromBaseLowPct: number;
  returnFromBreakoutPct: number;
  features: Record<string, number | boolean | string | null>;
  riskMetrics?: Record<string, number | string | null>;
  label?: EventLabelValue;
  notes?: string;
  labelUpdatedAt?: string;
};

export type EventLabelValue = "unreviewed" | "winner" | "failed_breakout" | "false_breakout" | "too_late" | "watchlist";

export type EventLabelRecord = {
  eventId: string;
  label: EventLabelValue;
  notes: string;
  updatedAt: string;
};

export type ResearchDataset = {
  ticker: string;
  symbol: string;
  requestedTicker: string;
  periodYears: number;
  downloadedAt: string;
  quoteSummary: Record<string, unknown> | null;
  quotes: ResearchQuote[];
  analysis: {
    events50: BreakoutEvent[];
    events100: BreakoutEvent[];
    eventSummary: Record<string, unknown>;
    aiDigest: string;
  };
};

export type SimilarWinnerCandidate = {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  setupState: "BREAKOUT" | "NEAR_BREAKOUT" | "BASE_FORMING" | "EXTENDED";
  score: number;
  scoreBreakdown: Record<string, number>;
  lastDate: string;
  currentClose: number;
  baseLow: number;
  baseHigh: number;
  distanceToBaseHighPct: number;
  upsideTo50FromBaseLowPct: number;
  upsideTo100FromBaseLowPct: number;
  features: Record<string, number | boolean | string | null>;
  featureScores: Record<string, number>;
  matchedPattern: Record<string, number>;
};

export type SimilarWinnerScanResult = {
  scannedAt: string;
  universeCount: number;
  scanned: number;
  failed: number;
  patternEventCount: number;
  pattern: Record<string, number>;
  candidates: SimilarWinnerCandidate[];
  aiDigest: string;
};

type YahooChartQuote = {
  date?: string | Date;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
};

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"], validation: { logErrors: false } });
const DB_DIR = path.join(process.cwd(), "data", "yfinance-research");
const LABELS_FILE = path.join(DB_DIR, "_event-labels.json");

function ensureDbDir() {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export function readEventLabels() {
  ensureDbDir();
  if (!fs.existsSync(LABELS_FILE)) return {} as Record<string, EventLabelRecord>;
  return JSON.parse(fs.readFileSync(LABELS_FILE, "utf8")) as Record<string, EventLabelRecord>;
}

export function upsertEventLabel(eventId: string, label: EventLabelValue, notes = "") {
  const labels = readEventLabels();
  labels[eventId] = {
    eventId,
    label,
    notes,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(LABELS_FILE, `${JSON.stringify(labels, null, 2)}\n`, "utf8");
  return labels[eventId];
}

export function normalizeIdxTicker(value: string) {
  const raw = String(value || "").trim().toUpperCase().replace(/\.JK$/, "");
  if (!raw) throw new Error("Ticker wajib diisi");
  return `${raw}.JK`;
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function ema(values: number[], period: number) {
  const result = new Array<number | null>(values.length).fill(null);
  if (values.length < period) return result;

  const multiplier = 2 / (period + 1);
  let current = average(values.slice(0, period));
  if (current === null) return result;
  result[period - 1] = current;

  for (let i = period; i < values.length; i += 1) {
    current = ((values[i] - current) * multiplier) + current;
    result[i] = current;
  }

  return result;
}

function sma(values: number[], period: number) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    return average(values.slice(index + 1 - period, index + 1));
  });
}

function rsi(values: number[], period = 14) {
  const result = new Array<number | null>(values.length).fill(null);
  if (values.length <= period) return result;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;
  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(change, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-change, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  return result;
}

function atr(quotes: ResearchQuote[], period = 14) {
  const trueRanges = quotes.map((quote, index) => {
    if (index === 0) return quote.high - quote.low;
    const prevClose = quotes[index - 1].close;
    return Math.max(
      quote.high - quote.low,
      Math.abs(quote.high - prevClose),
      Math.abs(quote.low - prevClose)
    );
  });

  return trueRanges.map((_, index) => {
    if (index + 1 < period) return null;
    return average(trueRanges.slice(index + 1 - period, index + 1));
  });
}

function enrichQuotes(rows: ResearchQuote[]) {
  const closes = rows.map(row => row.close);
  const volumes = rows.map(row => row.volume);
  const ema20 = ema(closes, 20);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(rows, 14);
  const volumeSma20 = sma(volumes, 20);

  return rows.map((row, index) => {
    const closeWindow = closes.slice(Math.max(0, index - 19), index + 1);
    const mean = average(closeWindow) || row.close;
    const stdev = closeWindow.length >= 20
      ? Math.sqrt(closeWindow.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / closeWindow.length)
      : null;
    const currentAtr = atr14[index];
    const currentVolumeAvg = volumeSma20[index];

    return {
      ...row,
      ema20: ema20[index] === null ? null : round(ema20[index] as number, 4),
      sma20: sma20[index] === null ? null : round(sma20[index] as number, 4),
      sma50: sma50[index] === null ? null : round(sma50[index] as number, 4),
      rsi14: rsi14[index] === null ? null : round(rsi14[index] as number, 2),
      atr14: currentAtr === null ? null : round(currentAtr, 4),
      atrPct: currentAtr === null ? null : round((currentAtr / row.close) * 100, 2),
      volumeRatio20: currentVolumeAvg && currentVolumeAvg > 0 ? round(row.volume / currentVolumeAvg, 2) : null,
      bbWidth20: stdev === null ? null : round(((stdev * 4) / mean) * 100, 2),
    };
  });
}

function normalizeYahooQuotes(quotes: YahooChartQuote[]) {
  return enrichQuotes(quotes
    .map((quote): ResearchQuote | null => {
      const open = Number(quote.open);
      const high = Number(quote.high);
      const low = Number(quote.low);
      const close = Number(quote.close);
      if (!quote.date || ![open, high, low, close].every(value => Number.isFinite(value) && value > 0)) return null;

      return {
        date: new Date(quote.date).toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
        volume: Number(quote.volume || 0),
      };
    })
    .filter((quote: ResearchQuote | null): quote is ResearchQuote => Boolean(quote)));
}

function findTargetIndex(quotes: ResearchQuote[], startIndex: number, targetPrice: number, maxLookahead = 180) {
  const end = Math.min(quotes.length - 1, startIndex + maxLookahead);
  for (let i = startIndex; i <= end; i += 1) {
    if (quotes[i].high >= targetPrice) return i;
  }
  return null;
}

function eventFeatures(quotes: ResearchQuote[], baseStart: number, baseEnd: number, breakoutIndex: number) {
  const base = quotes.slice(baseStart, baseEnd + 1);
  const breakout = quotes[breakoutIndex];
  const baseCloses = base.map(item => item.close);
  const baseVolumes = base.map(item => item.volume);
  const baseHigh = Math.max(...base.map(item => item.high));
  const baseLow = Math.min(...base.map(item => item.low));
  const baseMeanClose = average(baseCloses) || breakout.close;
  const firstClose = baseCloses[0];
  const lastClose = baseCloses[baseCloses.length - 1];
  const earlyVolume = average(baseVolumes.slice(0, Math.min(10, baseVolumes.length))) || 0;
  const lateVolume = average(baseVolumes.slice(-Math.min(10, baseVolumes.length))) || 0;
  const baseAvgTradedValue = average(base.map(item => item.close * item.volume)) || 0;
  const breakoutTradedValue = breakout.close * breakout.volume;
  const upVolume = base.reduce((sum, item, index) => {
    if (index === 0) return sum;
    return item.close >= base[index - 1].close ? sum + item.volume : sum;
  }, 0);
  const downVolume = base.reduce((sum, item, index) => {
    if (index === 0) return sum;
    return item.close < base[index - 1].close ? sum + item.volume : sum;
  }, 0);
  const higherLows = base.slice(-10).filter((item, index, recent) => index === 0 || item.low >= recent[index - 1].low * 0.985).length;

  return {
    baseRangePct: round(((baseHigh - baseLow) / baseMeanClose) * 100, 2),
    baseSlopePct: round(((lastClose - firstClose) / firstClose) * 100, 2),
    volumeDryUpRatio: earlyVolume > 0 ? round(lateVolume / earlyVolume, 2) : null,
    breakoutVolumeRatio20: breakout.volumeRatio20 ?? null,
    breakoutCloseAboveBaseHighPct: round(((breakout.close - baseHigh) / baseHigh) * 100, 2),
    breakoutRsi14: breakout.rsi14 ?? null,
    breakoutAtrPct: breakout.atrPct ?? null,
    breakoutBbWidth20: breakout.bbWidth20 ?? null,
    closeVsEma20Pct: breakout.ema20 ? round(((breakout.close - breakout.ema20) / breakout.ema20) * 100, 2) : null,
    closeVsSma50Pct: breakout.sma50 ? round(((breakout.close - breakout.sma50) / breakout.sma50) * 100, 2) : null,
    accumulationVolumeRatio: downVolume > 0 ? round(upVolume / downVolume, 2) : null,
    higherLowsScore: round((higherLows / Math.min(10, base.length)) * 100, 0),
    baseAvgTradedValueB: round(baseAvgTradedValue / 1_000_000_000, 2),
    breakoutTradedValueB: round(breakoutTradedValue / 1_000_000_000, 2),
    liquidityExpansionRatio: baseAvgTradedValue > 0 ? round(breakoutTradedValue / baseAvgTradedValue, 2) : null,
    isAboveEma20: breakout.ema20 ? breakout.close > breakout.ema20 : false,
    isAboveSma50: breakout.sma50 ? breakout.close > breakout.sma50 : false,
  };
}

function eventId(symbol: string, event: Pick<BreakoutEvent, "threshold" | "sidewaysEnd" | "breakoutDate" | "peakDate">) {
  return [symbol, event.threshold, event.sidewaysEnd, event.breakoutDate, event.peakDate].join("|");
}

function postBreakoutRisk(quotes: ResearchQuote[], breakoutIndex: number, targetIndex: number | null, peakIndex: number, baseHigh: number) {
  const breakoutClose = quotes[breakoutIndex].close;
  const beforeTargetEnd = targetIndex ?? peakIndex;
  const beforeTarget = quotes.slice(breakoutIndex, beforeTargetEnd + 1);
  const toPeak = quotes.slice(breakoutIndex, peakIndex + 1);
  const minBeforeTarget = Math.min(...beforeTarget.map(item => item.low));
  const minToPeak = Math.min(...toPeak.map(item => item.low));
  const closeBelowBaseHighDays = toPeak.filter(item => item.close < baseHigh).length;

  return {
    maxDrawdownBeforeTargetPct: round(((minBeforeTarget - breakoutClose) / breakoutClose) * 100, 2),
    maxDrawdownToPeakPct: round(((minToPeak - breakoutClose) / breakoutClose) * 100, 2),
    deepestPullbackBelowBaseHighPct: round(Math.min(0, ((minToPeak - baseHigh) / baseHigh) * 100), 2),
    closeBelowBaseHighDays,
    firstTargetDate: targetIndex === null ? null : quotes[targetIndex].date,
  };
}

function findBreakoutEvents(quotes: ResearchQuote[], threshold: 50 | 100) {
  const events: BreakoutEvent[] = [];
  const baseWindow = 30;
  const maxLookahead = 180;
  let cursor = 60;

  while (cursor < quotes.length - baseWindow - 10) {
    const baseStart = cursor - baseWindow;
    const baseEnd = cursor - 1;
    const base = quotes.slice(baseStart, baseEnd + 1);
    const baseHigh = Math.max(...base.map(item => item.high));
    const baseLow = Math.min(...base.map(item => item.low));
    const baseMeanClose = average(base.map(item => item.close)) || quotes[baseEnd].close;
    const baseRangePct = ((baseHigh - baseLow) / baseMeanClose) * 100;
    const baseSlopePct = ((base[base.length - 1].close - base[0].close) / base[0].close) * 100;
    const avgAtrPct = average(base.map(item => item.atrPct || 0)) || 99;
    const isSideways = baseRangePct <= 28 && Math.abs(baseSlopePct) <= 16 && avgAtrPct <= 8;

    if (!isSideways) {
      cursor += 1;
      continue;
    }

    const breakoutIndex = quotes.findIndex((item, index) =>
      index >= cursor &&
      index <= Math.min(quotes.length - 1, cursor + 20) &&
      item.close >= baseHigh * 1.03 &&
      (item.volumeRatio20 || 0) >= 1.05
    );

    if (breakoutIndex < 0) {
      cursor += 1;
      continue;
    }

    const lookaheadEnd = Math.min(quotes.length - 1, breakoutIndex + maxLookahead);
    let peakIndex = breakoutIndex;
    for (let i = breakoutIndex; i <= lookaheadEnd; i += 1) {
      if (quotes[i].high > quotes[peakIndex].high) peakIndex = i;
    }

    const targetPrice = baseLow * (1 + (threshold / 100));
    const targetIndex = findTargetIndex(quotes, breakoutIndex, targetPrice, maxLookahead);
    const returnFromBaseLowPct = ((quotes[peakIndex].high - baseLow) / baseLow) * 100;

    if (returnFromBaseLowPct >= threshold) {
      events.push({
        threshold,
        ticker: "",
        symbol: "",
        sidewaysStart: quotes[baseStart].date,
        sidewaysEnd: quotes[baseEnd].date,
        breakoutDate: quotes[breakoutIndex].date,
        targetDate: targetIndex === null ? null : quotes[targetIndex].date,
        peakDate: quotes[peakIndex].date,
        baseDurationDays: baseWindow,
        daysToTarget: targetIndex === null ? null : targetIndex - breakoutIndex,
        daysToPeak: peakIndex - breakoutIndex,
        baseLow: round(baseLow, 4),
        baseHigh: round(baseHigh, 4),
        breakoutClose: round(quotes[breakoutIndex].close, 4),
        peakHigh: round(quotes[peakIndex].high, 4),
        returnFromBaseLowPct: round(returnFromBaseLowPct, 2),
        returnFromBreakoutPct: round(((quotes[peakIndex].high - quotes[breakoutIndex].close) / quotes[breakoutIndex].close) * 100, 2),
        features: {
          ...eventFeatures(quotes, baseStart, baseEnd, breakoutIndex),
          ...postBreakoutRisk(quotes, breakoutIndex, targetIndex, peakIndex, baseHigh),
          daysToTarget: targetIndex === null ? null : targetIndex - breakoutIndex,
        },
        riskMetrics: postBreakoutRisk(quotes, breakoutIndex, targetIndex, peakIndex, baseHigh),
      });
      cursor = peakIndex + 20;
      continue;
    }

    cursor += 1;
  }

  return events;
}

function summarizeEvents(events50: BreakoutEvent[], events100: BreakoutEvent[]) {
  const allEvents = [...events50, ...events100];
  const numericKeys = Array.from(new Set(allEvents.flatMap(event =>
    Object.entries(event.features)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([key]) => key)
  )));

  const featureAverages = Object.fromEntries(numericKeys.map(key => [
    key,
    round(average(allEvents.map(event => Number(event.features[key])).filter(Number.isFinite)) || 0, 2),
  ]));

  return {
    event50Count: events50.length,
    event100Count: events100.length,
    bestReturnPct: round(Math.max(0, ...allEvents.map(event => event.returnFromBaseLowPct)), 2),
    fastestTargetDays: Math.min(...allEvents.map(event => event.daysToTarget || 9999)) === 9999
      ? null
      : Math.min(...allEvents.map(event => event.daysToTarget || 9999)),
    featureAverages,
  };
}

function applyLabelsToEvent(event: BreakoutEvent, labels: Record<string, EventLabelRecord>): BreakoutEvent {
  const id = event.id || eventId(event.symbol, event);
  const label = labels[id];
  return {
    ...event,
    id,
    label: label?.label || "unreviewed",
    notes: label?.notes || "",
    labelUpdatedAt: label?.updatedAt,
  };
}

function hydrateEventMetrics(dataset: ResearchDataset, event: BreakoutEvent): BreakoutEvent {
  const baseStart = dataset.quotes.findIndex(quote => quote.date === event.sidewaysStart);
  const baseEnd = dataset.quotes.findIndex(quote => quote.date === event.sidewaysEnd);
  const breakoutIndex = dataset.quotes.findIndex(quote => quote.date === event.breakoutDate);
  const peakIndex = dataset.quotes.findIndex(quote => quote.date === event.peakDate);
  const targetIndex = event.targetDate ? dataset.quotes.findIndex(quote => quote.date === event.targetDate) : -1;
  if ([baseStart, baseEnd, breakoutIndex, peakIndex].some(index => index < 0)) return event;

  const riskMetrics = postBreakoutRisk(dataset.quotes, breakoutIndex, targetIndex >= 0 ? targetIndex : null, peakIndex, event.baseHigh);
  return {
    ...event,
    id: event.id || eventId(dataset.symbol, event),
    features: {
      ...event.features,
      ...eventFeatures(dataset.quotes, baseStart, baseEnd, breakoutIndex),
      ...riskMetrics,
      daysToTarget: event.daysToTarget,
    },
    riskMetrics: event.riskMetrics || riskMetrics,
  };
}

export function applyLabelsToDataset(dataset: ResearchDataset): ResearchDataset {
  const labels = readEventLabels();
  return {
    ...dataset,
    analysis: {
      ...dataset.analysis,
      events50: dataset.analysis.events50.map(event => applyLabelsToEvent(hydrateEventMetrics(dataset, event), labels)),
      events100: dataset.analysis.events100.map(event => applyLabelsToEvent(hydrateEventMetrics(dataset, event), labels)),
    },
  };
}

function getWinnerPattern() {
  const datasets = listResearchDatasets();
  const events = datasets.flatMap(dataset => [...dataset.analysis.events50, ...dataset.analysis.events100]);
  const numericKeys = Array.from(new Set(events.flatMap(event =>
    Object.entries(event.features)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([key]) => key)
  )));

  const pattern = Object.fromEntries(numericKeys.map(key => [
    key,
    round(average(events.map(event => Number(event.features[key])).filter(Number.isFinite)) || 0, 2),
  ]));

  return { pattern, eventCount: events.length };
}

function scoreAgainstPattern(features: Record<string, number | boolean | string | null>, pattern: Record<string, number>) {
  const weights: Record<string, number> = {
    baseRangePct: 13,
    baseSlopePct: 9,
    volumeDryUpRatio: 10,
    breakoutVolumeRatio20: 16,
    breakoutCloseAboveBaseHighPct: 10,
    breakoutRsi14: 9,
    breakoutAtrPct: 8,
    breakoutBbWidth20: 7,
    closeVsEma20Pct: 7,
    closeVsSma50Pct: 5,
    accumulationVolumeRatio: 4,
    baseAvgTradedValueB: 4,
    liquidityExpansionRatio: 6,
    higherLowsScore: 2,
  };
  const breakdown: Record<string, number> = {};
  let totalWeight = 0;
  let weightedScore = 0;

  Object.entries(weights).forEach(([key, weight]) => {
    const value = Number(features[key]);
    const target = Number(pattern[key]);
    if (!Number.isFinite(value) || !Number.isFinite(target)) return;

    const tolerance = Math.max(Math.abs(target) * 0.75, key.includes("Ratio") ? 0.75 : 6);
    const score = Math.max(0, 100 - ((Math.abs(value - target) / tolerance) * 100));
    breakdown[key] = round(score, 0);
    totalWeight += weight;
    weightedScore += score * weight;
  });

  const booleanBonus = (features.isAboveEma20 ? 4 : 0) + (features.isAboveSma50 ? 4 : 0);
  const finalScore = totalWeight > 0 ? (weightedScore / totalWeight) + booleanBonus : 0;
  return { score: round(Math.min(100, finalScore), 0), breakdown };
}

function buildLatestSetup(ticker: string, symbol: string, name: string, sector: string, quotes: ResearchQuote[], pattern: Record<string, number>): SimilarWinnerCandidate | null {
  const baseWindow = 30;
  if (quotes.length < baseWindow + 55) return null;

  const lastIndex = quotes.length - 1;
  const baseStart = lastIndex - baseWindow;
  const baseEnd = lastIndex - 1;
  const base = quotes.slice(baseStart, baseEnd + 1);
  const current = quotes[lastIndex];
  const baseLow = Math.min(...base.map(item => item.low));
  const baseHigh = Math.max(...base.map(item => item.high));
  const baseMeanClose = average(base.map(item => item.close)) || current.close;
  const baseRangePct = ((baseHigh - baseLow) / baseMeanClose) * 100;
  const distanceToBaseHighPct = ((current.close - baseHigh) / baseHigh) * 100;
  const features = eventFeatures(quotes, baseStart, baseEnd, lastIndex);
  const { score, breakdown } = scoreAgainstPattern(features, pattern);
  const setupState = current.close >= baseHigh * 1.03
    ? (distanceToBaseHighPct > 22 ? "EXTENDED" : "BREAKOUT")
    : (current.close >= baseHigh * 0.94 ? "NEAR_BREAKOUT" : "BASE_FORMING");
  const stateBonus = setupState === "BREAKOUT" ? 8 : setupState === "NEAR_BREAKOUT" ? 5 : setupState === "BASE_FORMING" && baseRangePct <= 28 ? 2 : -8;
  const breakoutReadiness = Math.max(0, Math.min(100, 100 - Math.abs(distanceToBaseHighPct) * 4));
  const riskScore = Math.max(0, Math.min(100, 100 - (Number(features.breakoutAtrPct || 0) * 8) - Math.max(0, baseRangePct - 24) * 3));
  const liquidityScore = Math.max(0, Math.min(100, (Number(features.baseAvgTradedValueB || 0) * 5) + (Number(features.liquidityExpansionRatio || 0) * 12)));
  const notTooLateScore = setupState === "EXTENDED" ? Math.max(0, 100 - distanceToBaseHighPct * 4) : Math.max(0, Math.min(100, 100 - Math.max(0, distanceToBaseHighPct - 12) * 5));

  return {
    ticker,
    symbol,
    name,
    sector,
    setupState,
    score: Math.max(0, Math.min(100, round(score + stateBonus, 0))),
    scoreBreakdown: {
      similarityScore: round(score, 0),
      breakoutReadiness: round(breakoutReadiness, 0),
      riskScore: round(riskScore, 0),
      liquidityScore: round(liquidityScore, 0),
      notTooLateScore: round(notTooLateScore, 0),
      stateBonus,
    },
    lastDate: current.date,
    currentClose: round(current.close, 4),
    baseLow: round(baseLow, 4),
    baseHigh: round(baseHigh, 4),
    distanceToBaseHighPct: round(distanceToBaseHighPct, 2),
    upsideTo50FromBaseLowPct: round(((baseLow * 1.5 - current.close) / current.close) * 100, 2),
    upsideTo100FromBaseLowPct: round(((baseLow * 2 - current.close) / current.close) * 100, 2),
    features,
    featureScores: breakdown,
    matchedPattern: pattern,
  } satisfies SimilarWinnerCandidate;
}

async function fetchHistoricalQuotes(ticker: string, periodYears: number) {
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period1.getFullYear() - Math.max(1, Math.min(5, periodYears)));
  const chart = await yahooFinance.chart(ticker, { period1, period2, interval: "1d" });
  return normalizeYahooQuotes((chart.quotes || []) as YahooChartQuote[]);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }));

  return results;
}

function buildAiDigest(dataset: Omit<ResearchDataset, "analysis">, events50: BreakoutEvent[], events100: BreakoutEvent[]) {
  const summary = summarizeEvents(events50, events100);
  return [
    `Ticker ${dataset.ticker} memiliki ${dataset.quotes.length} candle harian periode ${dataset.periodYears} tahun.`,
    `Terdeteksi ${events50.length} event kenaikan >=50% dan ${events100.length} event kenaikan >=100% setelah fase sideways 30 hari.`,
    `Ciri rata-rata event: ${JSON.stringify(summary.featureAverages)}.`,
    `Gunakan event details untuk membandingkan baseRangePct, volumeDryUpRatio, breakoutVolumeRatio20, RSI, ATR%, BB width, dan posisi harga terhadap EMA20/SMA50 sebelum breakout.`,
  ].join("\n");
}

export function datasetPath(ticker: string) {
  const symbol = normalizeIdxTicker(ticker).replace(/\.JK$/, "");
  return path.join(DB_DIR, `${symbol}.json`);
}

export function listResearchDatasets() {
  ensureDbDir();
  return fs.readdirSync(DB_DIR)
    .filter(file => file.endsWith(".json") && !file.startsWith("_"))
    .map(file => readResearchDataset(file.replace(/\.json$/, "")))
    .filter((dataset): dataset is ResearchDataset => Boolean(dataset))
    .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

export function readResearchDataset(ticker: string) {
  const filePath = datasetPath(ticker);
  if (!fs.existsSync(filePath)) return null;
  return applyLabelsToDataset(JSON.parse(fs.readFileSync(filePath, "utf8")) as ResearchDataset);
}

export async function downloadResearchDataset(requestedTicker: string, periodYears = 2) {
  const ticker = normalizeIdxTicker(requestedTicker);
  const period2 = new Date();
  const period1 = new Date(period2);
  period1.setFullYear(period1.getFullYear() - Math.max(1, Math.min(5, periodYears)));

  const [chart, quoteSummary] = await Promise.all([
    yahooFinance.chart(ticker, { period1, period2, interval: "1d" }),
    yahooFinance.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile", "recommendationTrend"],
    }).catch(() => null),
  ]);

  const quotes = normalizeYahooQuotes((chart.quotes || []) as YahooChartQuote[]);

  if (quotes.length < 80) {
    throw new Error(`Data ${ticker} terlalu sedikit (${quotes.length} candle)`);
  }

  const baseDataset = {
    ticker,
    symbol: ticker.replace(/\.JK$/, ""),
    requestedTicker,
    periodYears,
    downloadedAt: new Date().toISOString(),
    quoteSummary: quoteSummary as Record<string, unknown> | null,
    quotes,
  };
  const events50 = findBreakoutEvents(quotes, 50).map(event => ({ ...event, ticker, symbol: baseDataset.symbol, id: eventId(baseDataset.symbol, event) }));
  const events100 = findBreakoutEvents(quotes, 100).map(event => ({ ...event, ticker, symbol: baseDataset.symbol, id: eventId(baseDataset.symbol, event) }));
  const dataset: ResearchDataset = {
    ...baseDataset,
    analysis: {
      events50,
      events100,
      eventSummary: summarizeEvents(events50, events100),
      aiDigest: buildAiDigest(baseDataset, events50, events100),
    },
  };

  ensureDbDir();
  fs.writeFileSync(datasetPath(ticker), `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  return dataset;
}

export async function scanSimilarWinners(options: { limit?: number | null; concurrency?: number; periodYears?: number } = {}) {
  const { pattern, eventCount } = getWinnerPattern();
  if (eventCount === 0) {
    throw new Error("Corpus winner masih kosong. Download beberapa saham pemenang di /research dulu.");
  }

  const universe = loadIdxStocks();
  const stocks = typeof options.limit === "number" && options.limit > 0 ? universe.slice(0, options.limit) : universe;
  const periodYears = options.periodYears || 2;
  const concurrency = Math.max(1, Math.min(16, options.concurrency || 6));
  let failed = 0;

  const scanned = await mapWithConcurrency(stocks, concurrency, async (stock) => {
    try {
      const quotes = await fetchHistoricalQuotes(stock.ticker, periodYears);
      return buildLatestSetup(stock.ticker, stock.symbol, stock.name, stock.sector, quotes, pattern);
    } catch {
      failed += 1;
      return null;
    }
  });

  const candidates = scanned
    .filter((item): item is SimilarWinnerCandidate => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 150);

  return {
    scannedAt: new Date().toISOString(),
    universeCount: universe.length,
    scanned: stocks.length,
    failed,
    patternEventCount: eventCount,
    pattern,
    candidates,
    aiDigest: [
      `Scan mencari saham IDX yang setup terkini mirip dengan ${eventCount} historical winner event di corpus /research.`,
      `Skor membandingkan base range, slope, volume dry-up, volume breakout, RSI, ATR%, BB width, posisi vs EMA20/SMA50, accumulation volume, dan higher lows.`,
      `Prioritaskan score tinggi dengan setupState BREAKOUT atau NEAR_BREAKOUT, tapi tetap validasi fundamental, likuiditas, dan risk management.`,
    ].join("\n"),
  } satisfies SimilarWinnerScanResult;
}
