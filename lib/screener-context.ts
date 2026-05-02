import { connectToDatabase } from "@/lib/db";
import { StockSignalModel } from "@/lib/models/StockSignal";

export interface ScreenerSignalContext {
  ticker: string;
  signalSource: string;
  strategy: string;
  category: string;
  vector: string;
  status: string;
  entryPrice: number | null;
  currentPrice: number | null;
  currentPriceSource: string;
  targetPrice: number | null;
  stopLossPrice: number | null;
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
  thesis: string | null;
  metadata: Record<string, unknown>;
}

function isFinitePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return isFinitePrice(parsed) ? parsed : null;
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateTime(value: unknown) {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : 0;
}

function tickerLookupKeys(value?: string) {
  const ticker = String(value || "").trim().toUpperCase();
  if (!ticker) return [];
  const raw = ticker.replace(/\.JK$/, "");
  return Array.from(new Set([ticker, raw, `${raw}.JK`].filter(Boolean)));
}

function latestHistoryPrice(priceHistory: any[] = []) {
  for (let i = priceHistory.length - 1; i >= 0; i -= 1) {
    const price = toNumber(priceHistory[i]?.price);
    if (price !== null) return price;
  }
  return null;
}

function deriveSignalCategory(source = "", metadata?: Record<string, unknown>) {
  if (metadata?.category) return String(metadata.category);
  const normalized = source.toUpperCase();
  if (normalized.includes("EMA BOUNCE")) return "EMA_BOUNCE";
  if (normalized.includes("COOLDOWN")) return "COOLDOWN";
  if (normalized.includes("ARAHUNTER")) return "ARAHUNTER";
  if (normalized.includes("TURNAROUND")) return "TURNAROUND";
  if (normalized.includes("ELITE")) return "ELITE_BOUNCE";
  if (normalized.includes("BUY ON DIP")) return "BUY_ON_DIP";
  if (normalized.includes("SQUEEZE DIVERGENCE")) return "SQUEEZE_DIVERGENCE";
  if (normalized.includes("SQUEEZE")) return "SQUEEZE";
  if (normalized.includes("CVD")) return "CVD_DIVERGENCE";
  return "TECHNICAL";
}

function deriveSignalVector(source = "", metadata?: Record<string, unknown>) {
  if (metadata?.vector) return String(metadata.vector);
  const normalized = source.toUpperCase();
  if (normalized.includes("SQZ_EMA20_EARLY_RELEASE")) return "SQZ_EMA20_EARLY_RELEASE";
  if (normalized.includes("EMA20_BREAKOUT_RETEST")) return "EMA20_BREAKOUT_RETEST_MOMENTUM";
  if (normalized.includes("EMA9_20")) return "EMA9_20_BULLISH_CROSS";
  if (normalized.includes("RSI")) return "RSI_OVERSOLD_20EMA_RECLAIM";
  if (normalized.includes("20/60")) return "EMA20_60_SWING_BOUNCE";
  if (normalized.includes("COOLDOWN")) return "EXTENDED_EMA20_COOLDOWN";
  if (normalized.includes("EMA BOUNCE")) return "EMA20_RECLAIM";
  if (normalized.includes("TURNAROUND")) return "TURNAROUND_FLUX_IMPROVING";
  if (normalized.includes("ARAHUNTER")) return "ARAHUNTER";
  if (normalized.includes("SQUEEZE DIVERGENCE") && normalized.includes("4H")) return "SQZ_BULL_DIV_4H_ROOM";
  if (normalized.includes("SQUEEZE DIVERGENCE")) return "SQZ_BULL_DIV_1D_ROOM";
  if (normalized.includes("EXPLOSION")) return "SQUEEZE_RELEASE";
  return normalized.replace(/^CONVICTION:\s*/, "").replace(/^SIGNAL:\s*/, "") || "GENERAL";
}

function latestSignalScanDateTime(item: ScreenerSignalContext) {
  return dateTime(item.lastScannedAt) ||
    dateTime(item.updatedAt) ||
    dateTime(item.appearedAt) ||
    dateTime(item.createdAt) ||
    dateTime(item.entryDate);
}

function sortLatestSignalFirst(a: ScreenerSignalContext, b: ScreenerSignalContext) {
  const dateDiff = latestSignalScanDateTime(b) - latestSignalScanDateTime(a);
  if (dateDiff !== 0) return dateDiff;
  return (Number(b.relevanceScore) || 0) - (Number(a.relevanceScore) || 0);
}

function formatSignalContext(signal: any): ScreenerSignalContext {
  const metadata = (signal.metadata || {}) as Record<string, unknown>;
  const signalSource = signal.signalSource === "Squeeze Divergence (${interval})"
    ? (String(metadata.vector || "").includes("4H") ? "Squeeze Divergence (4h)" : "Squeeze Divergence (1d)")
    : String(signal.signalSource || "Technical Signal");
  const category = deriveSignalCategory(signalSource, metadata);
  const vector = deriveSignalVector(signalSource, metadata);
  const entryPrice = toNumber(metadata.firstEntryPrice) ?? toNumber(signal.entryPrice);
  const signalCurrentPrice = toNumber(signal.currentPrice);
  const latestPrice = toNumber(metadata.latestPrice);
  const latestHistory = latestHistoryPrice(signal.priceHistory || []);
  const currentPrice = latestPrice ?? signalCurrentPrice ?? latestHistory ?? entryPrice;
  const currentPriceSource = latestPrice !== null
    ? String(metadata.latestPriceSource || "StockSignal.metadata.latestPrice")
    : (signalCurrentPrice !== null
      ? "StockSignal.currentPrice"
      : (latestHistory !== null ? "StockSignal.priceHistory" : "StockSignal.entryPrice"));
  const targetPrice = toNumber(signal.targetPrice);
  const stopLossPrice = toNumber(signal.stopLossPrice);
  const deltaPct = currentPrice !== null && entryPrice !== null
    ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2))
    : null;
  const riskPct = entryPrice !== null && stopLossPrice !== null
    ? Number((((entryPrice - stopLossPrice) / entryPrice) * 100).toFixed(2))
    : null;
  const rewardRisk = entryPrice !== null && stopLossPrice !== null && targetPrice !== null && entryPrice > stopLossPrice
    ? Number(((targetPrice - entryPrice) / (entryPrice - stopLossPrice)).toFixed(2))
    : null;

  return {
    ticker: String(signal.ticker || ""),
    signalSource,
    strategy: signalSource,
    category,
    vector,
    status: String(signal.status || "pending"),
    entryPrice,
    currentPrice,
    currentPriceSource,
    targetPrice,
    stopLossPrice,
    deltaPct,
    riskPct,
    rewardRisk,
    relevanceScore: Number(signal.relevanceScore || metadata.strategyRank || 0),
    appearedAt: toIso(metadata.firstAppearedAt || metadata.appearedAt || signal.createdAt || signal.entryDate),
    entryDate: toIso(signal.entryDate),
    createdAt: toIso(signal.createdAt),
    updatedAt: toIso(signal.updatedAt),
    lastScannedAt: toIso(metadata.lastScannedAt || metadata.scanRunAt || signal.updatedAt),
    lastQuoteDate: toIso(metadata.lastQuoteDate || signal.updatedAt),
    thesis: metadata.thesis ? String(metadata.thesis) : null,
    metadata,
  };
}

export async function getActiveScreenerSignals(symbol: string, limit = 5) {
  const keys = tickerLookupKeys(symbol);
  if (keys.length === 0) return [];

  try {
    await connectToDatabase();
    const signals = await StockSignalModel.find({
      status: "pending",
      ticker: { $in: keys },
    })
      .sort({ "metadata.lastScannedAt": -1, "metadata.scanRunAt": -1, updatedAt: -1, relevanceScore: -1 })
      .limit(Math.max(limit * 4, 12))
      .lean();

    return signals
      .map(formatSignalContext)
      .sort(sortLatestSignalFirst)
      .slice(0, limit);
  } catch (error) {
    console.warn(`[ScreenerContext] Failed to load active signals for ${symbol}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

export async function getLatestScreenerSignal(symbol: string) {
  const [latest] = await getActiveScreenerSignals(symbol, 1);
  return latest || null;
}
