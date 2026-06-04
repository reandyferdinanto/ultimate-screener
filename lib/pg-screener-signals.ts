import { query } from "@/lib/db-pg";
/* eslint-disable @typescript-eslint/no-explicit-any */

export type PgScreenerSignal = {
  ticker: string;
  signalSource: string;
  strategy: string;
  category: string;
  vector: string;
  status: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLossPrice: number | null;
  currentPrice: number | null;
  currentPriceSource: string;
  deltaPct: number | null;
  riskPct: number | null;
  rewardRisk: number | null;
  relevanceScore: number;
  appearedAt: string | null;
  entryDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastScannedAt: string | null;
  lastQuoteDate: string | null;
  priceHistory: Array<{ date: string; price: number }>;
  daysHeld: number;
  thesis: string | null;
  metadata: Record<string, unknown>;
};

type PgSignalRow = {
  id: string;
  symbol: string;
  timeframe: string;
  timeTs: Date | string;
  action: string;
  state: string;
  entryLow: number | null;
  entryHigh: number | null;
  idealBuy: number | null;
  hardStop: number | null;
  target1: number | null;
  target2: number | null;
  rewardRisk: number | null;
  maxLossPct: number | null;
  payload: Record<string, any>;
  createdAt: Date | string;
  updatedAt: Date | string;
  outcomeStatus: string | null;
  currentPrice: number | null;
  lastQuoteDate: Date | string | null;
  priceHistory: Array<{ date: string; price: number }>;
};

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeSymbol(value: string) {
  const ticker = String(value || "").trim().toUpperCase();
  if (!ticker) return "";
  return ticker.endsWith(".JK") ? ticker : `${ticker}.JK`;
}

function tickerKeys(value: string) {
  const symbol = normalizeSymbol(value);
  const raw = symbol.replace(/\.JK$/, "");
  return [symbol, raw];
}

function dateTime(value: unknown) {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : 0;
}

function deriveScreenerCategory(row: PgSignalRow, payload: Record<string, any>) {
  const syncedCategory = payload?.details?.screener?.split("/")?.[0] ||
    payload?.screenerTradePlan?.screenerCategory ||
    payload?.screenerContext?.category;
  if (syncedCategory) return String(syncedCategory).toUpperCase();

  const text = `${payload?.verdict || ""} ${payload?.tradePlan?.bias || ""} ${payload?.details?.emaBounce || ""} ${row.action || ""}`.toUpperCase();
  if (text.includes("CVD") || text.includes("SILENT ACCUMULATION: BULLISH DIVERGENCE")) return "CVD_DIVERGENCE";
  if (text.includes("SQUEEZE DIVERGENCE")) return "SQUEEZE_DIVERGENCE";
  if (text.includes("COOLDOWN")) return "COOLDOWN";
  if (text.includes("TECHNICAL BREAKOUT") || text.includes("BREAKOUT")) return "TECHNICAL_BREAKOUT";
  if (text.includes("BOTTOM") || text.includes("RECOVERING") || text.includes("TURNAROUND")) return "TURNAROUND";
  if (text.includes("EMA")) return "EMA_BOUNCE";
  if (text.includes("SQUEEZE")) return "SQUEEZE";
  return "EMA_BOUNCE";
}

function deriveScreenerVector(row: PgSignalRow, payload: Record<string, any>, category: string) {
  const syncedVector = payload?.details?.screener?.split("/")?.[1] ||
    payload?.screenerTradePlan?.screenerVector ||
    payload?.screenerContext?.vector;
  if (syncedVector) return String(syncedVector).toUpperCase();

  const bias = String(payload?.tradePlan?.bias || "").trim().toUpperCase();
  if (bias && bias !== "NO_CLEAN_TRIGGER") return bias;
  if (category === "SQUEEZE_DIVERGENCE") return `SQZ_BULL_DIV_${row.timeframe.toUpperCase()}_ROOM`;
  if (category === "CVD_DIVERGENCE") return "CVD_BULLISH_DIVERGENCE";
  if (category === "TURNAROUND") return "TURNAROUND_FLUX_IMPROVING";
  if (category === "TECHNICAL_BREAKOUT") return "POWER_IGNITION_BREAKOUT";
  if (category === "COOLDOWN") return "EXTENDED_EMA20_COOLDOWN";
  return row.state === "TRIGGERED" ? "EMA20_RECLAIM" : "EMA20_SETUP";
}

function deriveStrategy(row: PgSignalRow, payload: Record<string, any>, category: string, vector: string) {
  if (category === "SQUEEZE_DIVERGENCE") return `Squeeze Divergence (${row.timeframe})`;
  if (category === "CVD_DIVERGENCE") return `CVD Divergence (${row.timeframe})`;
  if (category === "TECHNICAL_BREAKOUT") return "Technical Breakout";
  if (category === "COOLDOWN") return "Cooldown: EXTENDED_EMA20_RESET";
  if (category === "TURNAROUND") return "Turnaround: FLUX_IMPROVING";
  if (category === "SQUEEZE") return "Squeeze Explosion";
  return `EMA Bounce: ${vector}`;
}

function firstDefined(...values: unknown[]) {
  return values.find(value => value !== undefined && value !== null && value !== "");
}

function compactScreenerMetadata(
  row: PgSignalRow,
  payload: Record<string, any>,
  category: string,
  vector: string,
  setupScore: number,
  volumeScore: number,
  currentPrice: number | null,
  lastQuoteDate: string | null,
  latestScan: string | null
) {
  const details = payload?.details || {};
  const tradePlan = payload?.tradePlan || {};
  const screenerTradePlan = payload?.screenerTradePlan || {};

  return {
    category,
    vector,
    timeframe: row.timeframe,
    state: row.state,
    action: row.action,
    setupScore,
    volScore: volumeScore,
    latestPrice: currentPrice,
    latestPriceSource: row.currentPrice ? "Postgres.market_candles" : "Postgres.signal_events",
    lastQuoteDate,
    lastScannedAt: latestScan,
    dataSource: "Postgres.signal_events",
    mfi: firstDefined(payload?.mfi, details.mfi),
    rsi: firstDefined(payload?.rsi, details.rsi),
    kdj: firstDefined(payload?.kdj, details.kdj),
    atrp: firstDefined(payload?.atrp, details.atrp, tradePlan.atrPct),
    dist20: firstDefined(payload?.dist20, details.dist20, details.distEma20),
    volRatio: firstDefined(payload?.volRatio, details.volRatio),
    consolidationScore: firstDefined(payload?.consolidationScore, details.consolidationScore),
    fluxStatus: firstDefined(payload?.fluxStatus, details.flux),
    squeezeStatus: firstDefined(payload?.squeezeStatus, details.squeeze),
    confidenceLevel: firstDefined(payload?.confidenceLevel, screenerTradePlan.confidenceLevel),
    expectedReturn: firstDefined(payload?.expectedReturn, screenerTradePlan.expectedReturn),
    rewardRisk: firstDefined(row.rewardRisk, tradePlan.rewardRisk, details.rewardRisk),
    emaFast: details.emaFast,
    emaSwing: details.emaSwing,
    peakStatus: details.peakStatus,
    execution: details.execution,
    bottomReversal: details.bottomReversal,
    emaSupport: details.emaSupport,
    screenerSyncStatus: details.screenerSyncStatus,
    screenerStatusText: details.screenerStatusText,
  };
}

function mapStatus(row: PgSignalRow) {
  if (row.outcomeStatus === "target") return "success";
  if (row.outcomeStatus === "stop" || row.outcomeStatus === "time_stop") return "failed";
  return "pending";
}

function mapPgSignal(row: PgSignalRow): PgScreenerSignal {
  const payload = row.payload || {};
  const plan = payload.tradePlan || {};
  const category = deriveScreenerCategory(row, payload);
  const vector = deriveScreenerVector(row, payload, category);
  const signalSource = deriveStrategy(row, payload, category, vector);
  const entryPrice = toNumber(row.idealBuy) ?? toNumber(plan.idealBuy);
  const targetPrice = toNumber(row.target1) ?? toNumber(plan.target1) ?? toNumber(plan.takeProfit);
  const stopLossPrice = toNumber(row.hardStop) ?? toNumber(plan.hardStop) ?? toNumber(plan.stopLoss);
  const currentPrice = toNumber(row.currentPrice) ?? entryPrice;
  const deltaPct = currentPrice !== null && entryPrice !== null
    ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2))
    : null;
  const riskPct = entryPrice !== null && stopLossPrice !== null
    ? Number((((entryPrice - stopLossPrice) / entryPrice) * 100).toFixed(2))
    : toNumber(row.maxLossPct);
  const rewardRisk = toNumber(row.rewardRisk) ?? toNumber(plan.rewardRisk);
  const appearedAt = toIso(payload?.screenerContext?.appearedAt || row.timeTs);
  const lastQuoteDate = toIso(row.lastQuoteDate || row.timeTs);
  const latestScan = toIso(row.updatedAt || row.createdAt);
  const setupScore = Number(payload?.score?.setup || 0);
  const volumeScore = Number(payload?.score?.volume || 0);
  const relevanceScore = Number(payload?.screenerContext?.relevanceScore || payload?.screenerTradePlan?.strategyRank || setupScore + volumeScore || 0);

  return {
    ticker: normalizeSymbol(row.symbol),
    signalSource,
    strategy: signalSource,
    category,
    vector,
    status: mapStatus(row),
    entryPrice,
    targetPrice,
    stopLossPrice,
    currentPrice,
    currentPriceSource: row.currentPrice ? "Postgres.market_candles" : "Postgres.signal_events",
    deltaPct,
    riskPct,
    rewardRisk,
    relevanceScore,
    appearedAt,
    entryDate: toIso(row.timeTs),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    lastScannedAt: latestScan,
    lastQuoteDate,
    priceHistory: Array.isArray(row.priceHistory) ? row.priceHistory : [],
    daysHeld: appearedAt ? Math.max(0, Math.floor((Date.now() - dateTime(appearedAt)) / 86_400_000)) : 0,
    thesis: payload?.suggestion ? String(payload.suggestion) : null,
    metadata: compactScreenerMetadata(row, payload, category, vector, setupScore, volumeScore, currentPrice, lastQuoteDate, latestScan),
  };
}

async function loadRows(whereSql: string, params: unknown[], limit: number) {
  const { rows } = await query(`
    WITH latest_signals AS (
      SELECT DISTINCT ON (signal_events.symbol, signal_events.timeframe, signal_events.action, signal_events.state)
        signal_events.id,
        signal_events.symbol,
        signal_events.timeframe,
        signal_events.time_ts AS "timeTs",
        signal_events.action,
        signal_events.state,
        signal_events.entry_low::float AS "entryLow",
        signal_events.entry_high::float AS "entryHigh",
        signal_events.ideal_buy::float AS "idealBuy",
        signal_events.hard_stop::float AS "hardStop",
        signal_events.target1::float AS "target1",
        signal_events.target2::float AS "target2",
        signal_events.reward_risk::float AS "rewardRisk",
        signal_events.max_loss_pct::float AS "maxLossPct",
        signal_events.payload,
        signal_events.created_at AS "createdAt",
        signal_events.updated_at AS "updatedAt",
        signal_outcomes.status AS "outcomeStatus",
        latest_candle.close::float AS "currentPrice",
        latest_candle.time_ts AS "lastQuoteDate",
        COALESCE(history.price_history, '[]'::json) AS "priceHistory"
      FROM signal_events
      LEFT JOIN signal_outcomes ON signal_outcomes.signal_id = signal_events.id
      LEFT JOIN LATERAL (
        SELECT close, time_ts
        FROM market_candles
        WHERE market_candles.symbol = signal_events.symbol
          AND market_candles.timeframe = signal_events.timeframe
        ORDER BY time_epoch DESC
        LIMIT 1
      ) latest_candle ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('date', time_ts, 'price', close::float) ORDER BY time_epoch) AS price_history
        FROM (
          SELECT time_epoch, time_ts, close
          FROM market_candles
          WHERE market_candles.symbol = signal_events.symbol
            AND market_candles.timeframe = signal_events.timeframe
          ORDER BY time_epoch DESC
          LIMIT 60
        ) candles
      ) history ON TRUE
      ${whereSql}
      ORDER BY signal_events.symbol, signal_events.timeframe, signal_events.action, signal_events.state, signal_events.time_epoch DESC, signal_events.updated_at DESC
    )
    SELECT *
    FROM latest_signals
    ORDER BY "updatedAt" DESC, "timeTs" DESC
    LIMIT $${params.length + 1}
  `, [...params, limit]);

  return (rows as PgSignalRow[]).map(mapPgSignal);
}

export async function getPgScreenerSignals(limit = 500) {
  return loadRows(`
    WHERE signal_events.state <> 'INVALID'
      AND signal_events.action <> 'SELL / REDUCE'
      AND COALESCE(signal_events.payload->'tradePlan'->>'state', signal_events.state) IN ('SETUP', 'TRIGGERED', 'ARMED')
      AND NOT (
        COALESCE(
          signal_events.payload->'details'->>'screener',
          signal_events.payload->'screenerTradePlan'->>'screenerCategory',
          signal_events.payload->'screenerContext'->>'category',
          ''
        ) ~ '^(SQUEEZE_DIVERGENCE|CVD_DIVERGENCE)'
        AND COALESCE(signal_events.payload->'details'->>'strictScreener', 'false') <> 'true'
      )
  `, [], limit);
}

export async function getPgScreenerSignalsForSymbol(symbol: string, limit = 5) {
  const keys = tickerKeys(symbol);
  if (keys.length === 0) return [];

  return loadRows(`
    WHERE signal_events.symbol = ANY($1)
      AND signal_events.state <> 'INVALID'
      AND signal_events.action <> 'SELL / REDUCE'
      AND COALESCE(signal_events.payload->'tradePlan'->>'state', signal_events.state) IN ('SETUP', 'TRIGGERED', 'ARMED')
      AND NOT (
        COALESCE(
          signal_events.payload->'details'->>'screener',
          signal_events.payload->'screenerTradePlan'->>'screenerCategory',
          signal_events.payload->'screenerContext'->>'category',
          ''
        ) ~ '^(SQUEEZE_DIVERGENCE|CVD_DIVERGENCE)'
        AND COALESCE(signal_events.payload->'details'->>'strictScreener', 'false') <> 'true'
      )
  `, [keys], Math.max(limit * 4, 12));
}
