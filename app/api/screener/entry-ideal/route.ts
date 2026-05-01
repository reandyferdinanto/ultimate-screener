import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { IndonesiaStockModel } from "@/lib/models/IndonesiaStock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActiveStock = {
  ticker?: string;
  symbol?: string;
  name?: string;
  sector?: string;
  industry?: string;
};

type TradePlan = {
  state?: string;
  stateLabel?: string;
  entryLow?: number;
  entryHigh?: number;
  idealBuy?: number | null;
  hardStop?: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  takeProfit?: number;
  rewardRisk?: number;
  maxLossPct?: number;
  atrPct?: number | null;
  timeStopBars?: number;
  timeStopRule?: string;
  action?: string;
};

type TechnicalResponse = {
  success?: boolean;
  error?: string;
  ticker?: string;
  data?: Array<{ close?: number; time?: number }>;
  unifiedAnalysis?: {
    verdict?: string;
    riskLevel?: string;
    suggestion?: string;
    score?: { setup?: number; volume?: number };
    tradePlan?: TradePlan;
  };
};

type EntryCandidate = {
  ticker: string;
  name?: string;
  sector?: string;
  strategy: string;
  signalSource: string;
  category: string;
  vector: string;
  currentPrice: number;
  buyArea: number;
  entryLow: number;
  entryHigh: number;
  idealBuy: number;
  tp?: number;
  target1?: number;
  target2?: number;
  sl?: number;
  riskPct: string;
  rewardRisk: number;
  maxLossPct: number;
  atrPct?: number | null;
  state: string;
  stateLabel: string;
  setupScore: number;
  volumeScore: number;
  lastQuoteDate?: string;
  lastScannedAt: string;
  dataFreshness: {
    source: string;
    lastScannedAt: string;
    isLikelyFreshDaily: boolean;
  };
  metadata: Record<string, unknown>;
};

type ScanResult = {
  candidate: EntryCandidate | null;
  error?: string;
};

const DEFAULT_STATES = ["TRIGGERED", "ARMED"];
const REJECTED_STATES = new Set(["CHASE", "INVALID", "EXPIRED"]);

function normalizeSymbol(stock: ActiveStock) {
  const raw = String(stock.symbol || stock.ticker || "").trim().toUpperCase();
  if (!raw) return "";
  return raw.endsWith(".JK") ? raw : `${raw}.JK`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseNumberParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseStateFilter(value: string | null) {
  if (!value) return new Set(DEFAULT_STATES);
  const states = value
    .split(",")
    .map(item => item.trim().toUpperCase())
    .filter(Boolean)
    .filter(state => !REJECTED_STATES.has(state));
  return new Set(states.length > 0 ? states : DEFAULT_STATES);
}

function isInPriceRange(price: number, priceRange: string) {
  if (priceRange === "under300") return price < 300;
  if (priceRange === "under500") return price < 500;
  if (priceRange === "above500") return price >= 500;
  return true;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
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

async function fetchTechnical(url: URL, timeoutMs: number): Promise<TechnicalResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      return { success: false, error: `HTTP_${response.status}` };
    }
    return await response.json() as TechnicalResponse;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "TECHNICAL_FETCH_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}

async function scanStock(
  stock: ActiveStock,
  origin: string,
  interval: string,
  allowedStates: Set<string>,
  minRewardRisk: number,
  maxRiskPct: number,
  priceRange: string,
  timeoutMs: number
): Promise<ScanResult> {
  const symbol = normalizeSymbol(stock);
  if (!symbol) return { candidate: null, error: "EMPTY_SYMBOL" };

  const technicalUrl = new URL("/api/technical", origin);
  technicalUrl.searchParams.set("symbol", symbol);
  technicalUrl.searchParams.set("interval", interval);

  const technical = await fetchTechnical(technicalUrl, timeoutMs);
  if (!technical.success) return { candidate: null, error: technical.error || "TECHNICAL_FAILED" };

  const plan = technical.unifiedAnalysis?.tradePlan;
  const latestBar = technical.data?.[technical.data.length - 1];
  const currentPrice = Number(latestBar?.close);
  const state = String(plan?.state || "").toUpperCase();
  const entryLow = Number(plan?.entryLow);
  const entryHigh = Number(plan?.entryHigh);
  const idealBuy = Number(plan?.idealBuy);
  const rewardRisk = Number(plan?.rewardRisk);
  const maxLossPct = Number(plan?.maxLossPct);

  if (!plan || REJECTED_STATES.has(state) || !allowedStates.has(state)) return { candidate: null };
  if (!isFiniteNumber(currentPrice) || !isFiniteNumber(entryLow) || !isFiniteNumber(entryHigh) || !isFiniteNumber(idealBuy)) return { candidate: null };
  if (currentPrice < entryLow || currentPrice > entryHigh) return { candidate: null };
  if (!isInPriceRange(currentPrice, priceRange)) return { candidate: null };
  if (!isFiniteNumber(rewardRisk) || rewardRisk < minRewardRisk) return { candidate: null };
  if (!isFiniteNumber(maxLossPct) || maxLossPct > maxRiskPct) return { candidate: null };

  const scannedAt = new Date().toISOString();
  const lastQuoteDate = isFiniteNumber(latestBar?.time)
    ? new Date(latestBar.time * 1000).toISOString()
    : undefined;
  const target1 = isFiniteNumber(plan.target1) ? plan.target1 : plan.takeProfit;
  const stopLoss = isFiniteNumber(plan.hardStop) ? plan.hardStop : plan.stopLoss;
  const vector = state === "TRIGGERED"
    ? "VALID_ENTRY_NOW"
    : (state === "ARMED" ? "ARMED_IN_ENTRY_ZONE" : "SETUP_IN_ENTRY_ZONE");

  return {
    candidate: {
      ticker: symbol,
      name: stock.name,
      sector: stock.sector,
      strategy: `ENTRY_IDEAL: ${state}`,
      signalSource: `ENTRY_IDEAL: ${state}`,
      category: "ENTRY_IDEAL",
      vector,
      currentPrice,
      buyArea: idealBuy,
      entryLow,
      entryHigh,
      idealBuy,
      tp: target1,
      target1,
      target2: plan.target2,
      sl: stopLoss,
      riskPct: maxLossPct.toFixed(1),
      rewardRisk,
      maxLossPct,
      atrPct: plan.atrPct,
      state,
      stateLabel: plan.stateLabel || state,
      setupScore: technical.unifiedAnalysis?.score?.setup || 0,
      volumeScore: technical.unifiedAnalysis?.score?.volume || 0,
      lastQuoteDate,
      lastScannedAt: scannedAt,
      dataFreshness: {
        source: "Live /api/technical tradePlan",
        lastScannedAt: scannedAt,
        isLikelyFreshDaily: true
      },
      metadata: {
        source: "Live /api/technical tradePlan",
        verdict: technical.unifiedAnalysis?.verdict,
        riskLevel: technical.unifiedAnalysis?.riskLevel,
        suggestion: technical.unifiedAnalysis?.suggestion,
        action: plan.action,
        timeStopBars: plan.timeStopBars,
        timeStopRule: plan.timeStopRule,
        rewardRisk,
        maxLossPct,
        atrPct: plan.atrPct,
        category: "ENTRY_IDEAL",
        vector
      }
    }
  };
}

function rankState(state: string) {
  if (state === "TRIGGERED") return 0;
  if (state === "ARMED") return 1;
  return 2;
}

export async function GET(req: Request) {
  const { origin, searchParams } = new URL(req.url);
  const interval = searchParams.get("interval") || "1d";
  const priceRange = searchParams.get("priceRange") || "all";
  const minRewardRisk = parseNumberParam(searchParams.get("minRewardRisk"), 1.5, 0, 10);
  const maxRiskPct = parseNumberParam(searchParams.get("maxRiskPct"), 6, 0.5, 25);
  const concurrency = Math.round(parseNumberParam(searchParams.get("concurrency"), 5, 1, 12));
  const timeoutMs = Math.round(parseNumberParam(searchParams.get("timeoutMs"), 25_000, 5_000, 60_000));
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit ? Math.round(parseNumberParam(rawLimit, 0, 1, 2_000)) : null;
  const allowedStates = parseStateFilter(searchParams.get("states"));
  const startedAt = new Date();

  try {
    await connectToDatabase();

    const query = IndonesiaStockModel.find({ active: true })
      .select("ticker symbol name sector industry")
      .sort({ ticker: 1 })
      .lean<ActiveStock[]>();
    if (limit) query.limit(limit);

    const stocks = await query;
    const scanResults = await mapWithConcurrency(stocks, concurrency, stock => scanStock(
      stock,
      origin,
      interval,
      allowedStates,
      minRewardRisk,
      maxRiskPct,
      priceRange,
      timeoutMs
    ));

    const failures = scanResults.filter(result => result.error).length;
    const data = scanResults
      .map(result => result.candidate)
      .filter((candidate): candidate is EntryCandidate => Boolean(candidate))
      .sort((a, b) => {
        const stateDiff = rankState(a.state) - rankState(b.state);
        if (stateDiff !== 0) return stateDiff;
        const rewardDiff = b.rewardRisk - a.rewardRisk;
        if (rewardDiff !== 0) return rewardDiff;
        const riskDiff = a.maxLossPct - b.maxLossPct;
        if (riskDiff !== 0) return riskDiff;
        return b.setupScore - a.setupScore;
      });

    const completedAt = new Date();
    return NextResponse.json({
      success: true,
      data,
      scanMeta: {
        source: "Live /api/technical tradePlan across active IndonesiaStock universe.",
        criteria: {
          states: Array.from(allowedStates),
          interval,
          priceRange,
          minRewardRisk,
          maxRiskPct
        },
        scanned: stocks.length,
        matched: data.length,
        failures,
        scanStartedAt: startedAt.toISOString(),
        latestScannedAt: completedAt.toISOString(),
        isLatestScanFresh: true
      }
    });
  } catch (error) {
    console.error("Entry Ideal Screener Error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
