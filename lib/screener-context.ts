import { getPgScreenerSignalsForSymbol, type PgScreenerSignal } from "@/lib/pg-screener-signals";

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

function dateTime(value: unknown) {
  if (!value) return 0;
  const date = new Date(String(value));
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortLatestSignalFirst(a: ScreenerSignalContext, b: ScreenerSignalContext) {
  const aTime = dateTime(a.lastScannedAt) || dateTime(a.updatedAt) || dateTime(a.appearedAt) || dateTime(a.entryDate);
  const bTime = dateTime(b.lastScannedAt) || dateTime(b.updatedAt) || dateTime(b.appearedAt) || dateTime(b.entryDate);
  const dateDiff = bTime - aTime;
  if (dateDiff !== 0) return dateDiff;
  return (Number(b.relevanceScore) || 0) - (Number(a.relevanceScore) || 0);
}

function formatSignalContext(signal: PgScreenerSignal): ScreenerSignalContext {
  return {
    ticker: signal.ticker,
    signalSource: signal.signalSource,
    strategy: signal.strategy,
    category: signal.category,
    vector: signal.vector,
    status: signal.status,
    entryPrice: signal.entryPrice,
    currentPrice: signal.currentPrice,
    currentPriceSource: signal.currentPriceSource,
    targetPrice: signal.targetPrice,
    stopLossPrice: signal.stopLossPrice,
    deltaPct: signal.deltaPct,
    riskPct: signal.riskPct,
    rewardRisk: signal.rewardRisk,
    relevanceScore: signal.relevanceScore,
    appearedAt: signal.appearedAt,
    entryDate: signal.entryDate,
    createdAt: signal.createdAt,
    updatedAt: signal.updatedAt,
    lastScannedAt: signal.lastScannedAt,
    lastQuoteDate: signal.lastQuoteDate,
    thesis: signal.thesis,
    metadata: signal.metadata,
  };
}

export async function getActiveScreenerSignals(symbol: string, limit = 5) {
  try {
    const signals = await getPgScreenerSignalsForSymbol(symbol, Math.max(limit * 4, 12));
    return signals
      .map(formatSignalContext)
      .sort(sortLatestSignalFirst)
      .slice(0, limit);
  } catch (error) {
    console.warn(`[ScreenerContext] Failed to load Postgres signals for ${symbol}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

export async function getLatestScreenerSignal(symbol: string) {
  const [latest] = await getActiveScreenerSignals(symbol, 1);
  return latest || null;
}
