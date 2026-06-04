import { NextResponse } from "next/server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getIdxStocksUniverse } from "@/lib/idx-stock-file";
import { getLatestScreenerSnapshot, saveScreenerSnapshot } from "@/lib/screener-cache";
import { getPgScreenerSignals } from "@/lib/pg-screener-signals";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function deriveSignalCategory(source = "", metadata?: any) {
  if (metadata?.category) return String(metadata.category);
  const normalized = source.toUpperCase();
  if (normalized.includes("EMA BOUNCE")) return "EMA_BOUNCE";
  if (normalized.includes("TECHNICAL BREAKOUT")) return "TECHNICAL_BREAKOUT";
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

function deriveSignalVector(source = "", metadata?: any) {
  if (metadata?.vector) return String(metadata.vector);
  const normalized = source.toUpperCase();
  if (normalized.includes("SQZ_EMA20_EARLY_RELEASE")) return "SQZ_EMA20_EARLY_RELEASE";
  if (normalized.includes("POWER IGNITION")) return "POWER_IGNITION_BREAKOUT";
  if (normalized.includes("TIGHT-FLAT")) return "TIGHT_FLAT_ACCUMULATION";
  if (normalized.includes("WINNER SIMILARITY")) return "WINNER_SIMILARITY_WATCHLIST";
  if (normalized.includes("EMA20_BREAKOUT_RETEST")) return "EMA20_BREAKOUT_RETEST_MOMENTUM";
  if (normalized.includes("EMA9_20")) return "EMA9_20_BULLISH_CROSS";
  if (normalized.includes("RSI")) return "RSI_OVERSOLD_20EMA_RECLAIM";
  if (normalized.includes("20/60")) return "EMA20_60_SWING_BOUNCE";
  if (normalized.includes("COOLDOWN")) return "EXTENDED_EMA20_COOLDOWN";
  if (normalized.includes("EMA BOUNCE")) return "EMA20_RECLAIM";
  if (normalized.includes("TURNAROUND")) return "TURNAROUND_FLUX_IMPROVING";
  if (normalized.includes("ARAHUNTER")) return "ARAHUNTER";
  if (normalized.includes("SQUEEZE DIVERGENCE") && normalized.includes("15M")) return "SQZ_BULL_DIV_15M_ROOM";
  if (normalized.includes("SQUEEZE DIVERGENCE") && normalized.includes("1H")) return "SQZ_BULL_DIV_1H_ROOM";
  if (normalized.includes("SQUEEZE DIVERGENCE") && normalized.includes("4H")) return "SQZ_BULL_DIV_4H_ROOM";
  if (normalized.includes("SQUEEZE DIVERGENCE")) return "SQZ_BULL_DIV_1D_ROOM";
  if (normalized.includes("EXPLOSION")) return "SQUEEZE_RELEASE";
  return normalized.replace(/^CONVICTION:\s*/, "").replace(/^SIGNAL:\s*/, "") || "GENERAL";
}

function deriveSqueezeDivergenceTimeframe(vector = "", metadata?: any) {
  const normalizedVector = String(vector || "").toUpperCase();
  const metadataTimeframe = String(metadata?.timeframe || "").toLowerCase();
  if (metadataTimeframe === "15m" || normalizedVector.includes("15M")) return "15m";
  if (metadataTimeframe === "1h" || normalizedVector.includes("1H")) return "1h";
  if (metadataTimeframe === "4h" || normalizedVector.includes("4H")) return "4h";
  return "1d";
}

function hoursSince(value?: Date | string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round(((Date.now() - date.getTime()) / 36_000) / 10));
}

function isFinitePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function tickerLookupKeys(value?: string) {
  const ticker = String(value || "").trim().toUpperCase();
  if (!ticker) return [];
  const raw = ticker.replace(/\.JK$/, "");
  return Array.from(new Set([ticker, raw, `${raw}.JK`].filter(Boolean)));
}

function latestHistoryPrice(priceHistory: any[] = []) {
  for (let i = priceHistory.length - 1; i >= 0; i -= 1) {
    const price = Number(priceHistory[i]?.price);
    if (isFinitePrice(price)) return price;
  }
  return null;
}

function dateTime(value: unknown) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(String(value));
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function signalDateTime(item: any) {
  return dateTime(item.appearedAt) ||
    dateTime(item.createdAt) ||
    dateTime(item.entryDate) ||
    dateTime(item.updatedAt) ||
    dateTime(item.lastScannedAt);
}

const ACTIVE_MARKET_MINUTES_PER_DAY = 330;
const D2_ACTIVE_MARKET_MINUTES = ACTIVE_MARKET_MINUTES_PER_DAY * 2;

function jakartaParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return {
    weekday: get("weekday"),
    minutes: (Number(get("hour")) * 60) + Number(get("minute")),
  };
}

function isActiveIdxSession(value: Date) {
  const { weekday, minutes } = jakartaParts(value);
  if (["Sat", "Sun"].includes(weekday)) return false;
  return (minutes >= 9 * 60 && minutes < 12 * 60) ||
    (minutes >= (13 * 60) + 30 && minutes < 16 * 60);
}

function countActiveMarketMinutes(startTime: number, endTime: number) {
  if (!startTime || !endTime || endTime <= startTime) return 0;
  const stepMinutes = 15;
  let activeMinutes = 0;

  for (let cursor = startTime; cursor < endTime; cursor += stepMinutes * 60 * 1000) {
    const nextCursor = Math.min(cursor + stepMinutes * 60 * 1000, endTime);
    if (isActiveIdxSession(new Date(cursor))) {
      activeMinutes += Math.round((nextCursor - cursor) / (60 * 1000));
    }
  }

  return activeMinutes;
}

function buildEvaluationState(appearedAt: unknown, entryPrice: number, currentPrice: number, latestDataAt?: unknown) {
  const appearedTime = dateTime(appearedAt);
  const latestMarketDataTime = dateTime(latestDataAt);
  const evaluationEndTime = appearedTime && latestMarketDataTime
    ? Math.min(Date.now(), Math.max(appearedTime, latestMarketDataTime))
    : 0;
  const activeMarketMinutes = appearedTime && evaluationEndTime
    ? countActiveMarketMinutes(appearedTime, evaluationEndTime)
    : null;
  const activeMarketHours = activeMarketMinutes === null ? null : Math.floor(activeMarketMinutes / 60);
  const remainingActiveHours = activeMarketMinutes === null
    ? null
    : Math.max(0, Math.ceil((D2_ACTIVE_MARKET_MINUTES - activeMarketMinutes) / 60));
  const deltaPct = isFinitePrice(entryPrice) && isFinitePrice(currentPrice)
    ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2))
    : null;

  if (appearedTime === 0 || latestMarketDataTime === 0 || activeMarketMinutes === null || deltaPct === null) {
    return {
      status: "WAITING_DATA",
      label: "Menunggu data harga",
      description: "Evaluasi D+2 hanya menghitung jam bursa aktif. Hari libur atau data IHSG/quote yang tidak bergerak tidak ikut dihitung.",
      ageHours: activeMarketHours,
      activeMarketHours,
      dueAt: null,
    };
  }

  if (activeMarketMinutes < D2_ACTIVE_MARKET_MINUTES) {
    return {
      status: "WATCHING_D2",
      label: `D+2 bursa dalam ${remainingActiveHours} jam aktif`,
      description: "Sinyal masih dalam masa observasi jam bursa. Weekend, hari libur, dan quote yang tidak bergerak tidak mempercepat evaluasi.",
      ageHours: activeMarketHours,
      activeMarketHours,
      dueAt: null,
    };
  }

  if (deltaPct < 0) {
    return {
      status: "FAILED_D2",
      label: "D+2 gagal bertahan",
      description: "Setelah 2 hari bursa aktif harga berada di bawah entry, sinyal perlu dianggap gagal atau dihindari.",
      ageHours: activeMarketHours,
      activeMarketHours,
      dueAt: null,
    };
  }

  return {
    status: "CONTINUE_D2",
    label: "D+2 lanjut dipantau",
    description: "Setelah 2 hari bursa aktif harga masih di atas entry. Sinyal tetap valid selama stop belum ditembus.",
    ageHours: activeMarketHours,
    activeMarketHours,
    dueAt: null,
  };
}

function latestDataDateTime(item: any) {
  return dateTime(item.lastQuoteDate) ||
    dateTime(item.lastScannedAt) ||
    dateTime(item.updatedAt) ||
    signalDateTime(item);
}

function latestSignalScanDateTime(item: any) {
  return dateTime(item.lastScannedAt) ||
    dateTime(item.updatedAt) ||
    dateTime(item.appearedAt) ||
    dateTime(item.createdAt) ||
    dateTime(item.entryDate);
}

function sortLatestSignalScanFirst(a: any, b: any) {
  const dateDiff = latestSignalScanDateTime(b) - latestSignalScanDateTime(a);
  if (dateDiff !== 0) return dateDiff;
  return (Number(b.relevanceScore) || 0) - (Number(a.relevanceScore) || 0);
}

function passesCachedPriceRange(item: any, priceRange: string) {
  if (priceRange === "all") return true;
  const entryPrice = Number(item.buyArea ?? item.entryPrice);
  if (!Number.isFinite(entryPrice)) return false;
  if (priceRange === "under300") return entryPrice < 300;
  if (priceRange === "under500") return entryPrice < 500;
  if (priceRange === "above500") return entryPrice >= 500;
  return true;
}

function passesCachedDateFilter(item: any, dateFilter: string) {
  if (dateFilter === "all") return true;

  const updatedAt = dateTime(item.updatedAt) ||
    dateTime(item.lastScannedAt) ||
    dateTime(item.metadata?.lastScannedAt) ||
    dateTime(item.metadata?.scanRunAt);
  if (!updatedAt) return false;

  const start = new Date();
  if (dateFilter === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (dateFilter === "3d") {
    start.setDate(start.getDate() - 3);
  } else if (dateFilter === "7d") {
    start.setDate(start.getDate() - 7);
  } else {
    return true;
  }

  return updatedAt >= start.getTime();
}

function passesCachedCategoryFilter(item: any, categoryFilter?: string | null) {
  if (!categoryFilter) return true;
  const target = categoryFilter.toUpperCase();
  return String(item.category || "").toUpperCase() === target ||
    String(item.vector || "").toUpperCase() === target ||
    String(item.strategy || "").toUpperCase().includes(target);
}

function screenerResultKey(item: any) {
  const ticker = String(item.ticker || "").toUpperCase();
  const source = String(item.signalSource || item.strategy || "").toUpperCase();
  const category = String(item.category || item.metadata?.category || "").toUpperCase();
  const vector = String(item.vector || item.metadata?.vector || "").toUpperCase();
  if (category === "SQUEEZE_DIVERGENCE" || source.includes("SQUEEZE DIVERGENCE") || vector.includes("SQZ_BULL_DIV")) {
    return `${ticker}:${source || vector}`;
  }
  return ticker;
}

function diversifyResults(sortedResults: any[]) {
  const categories = [
    "ARAHunter",
    "SCALP",
    "ELITE BOUNCE",
    "VOLATILITY EXPLOSION",
    "BUY ON DIP",
    "COOLDOWN",
    "TURNAROUND",
    "EMA BOUNCE",
    "CVD DIVERGENCE",
    "Technical Breakout",
    "Squeeze Divergence",
    "Squeeze Explosion",
    "The Perfect Retest"
  ];
  const diversified: any[] = [];
  const seen = new Set();

  ["15M", "1H", "4H", "1D"].forEach(tf => {
    const timeframeResults = sortedResults
      .filter(r => {
        const source = String(r.strategy || r.signalSource || "").toUpperCase();
        const vector = String(r.vector || r.metadata?.vector || "").toUpperCase();
        const category = String(r.category || r.metadata?.category || "").toUpperCase();
        return category === "SQUEEZE_DIVERGENCE" &&
          (source.includes(tf) || vector.includes(tf));
      })
      .slice(0, 20);

    timeframeResults.forEach(r => {
      const key = screenerResultKey(r);
      if (!seen.has(key)) {
        diversified.push(r);
        seen.add(key);
      }
    });
  });

  categories.forEach(cat => {
    const catResults = sortedResults.filter(r => String(r.strategy || "").toUpperCase().includes(cat.toUpperCase())).slice(0, 20);
    catResults.forEach(r => {
      const key = screenerResultKey(r);
      if (!seen.has(key)) {
        diversified.push(r);
        seen.add(key);
      }
    });
  });

  sortedResults.forEach(r => {
    const key = screenerResultKey(r);
    if (!seen.has(key) && diversified.length < 150) {
      diversified.push(r);
      seen.add(key);
    }
  });

  return diversified.sort(sortLatestSignalScanFirst);
}

function applyCachedRequestFilters(items: any[], priceRange: string, dateFilter: string, categoryFilter?: string | null) {
  return diversifyResults(
    items
      .filter(item => passesCachedPriceRange(item, priceRange))
      .filter(item => passesCachedDateFilter(item, dateFilter))
      .filter(item => passesCachedCategoryFilter(item, categoryFilter))
      .sort(sortLatestSignalScanFirst)
  );
}

function normalizeYahooSymbol(value?: string) {
  const ticker = String(value || "").trim().toUpperCase();
  if (!ticker) return "";
  const raw = ticker.replace(/\.JK$/, "");
  return `${raw}.JK`;
}

function parseIntegerParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
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

function quoteTimeToIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date
    ? value
    : (typeof value === "number" ? new Date(value * 1000) : new Date(String(value)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchLiveQuote(ticker: string) {
  const symbol = normalizeYahooSymbol(ticker);
  if (!symbol) return null;

  try {
    const quote: any = await yahooFinance.quote(symbol);
    const price = Number(
      quote?.regularMarketPrice ??
      quote?.postMarketPrice ??
      quote?.preMarketPrice
    );
    if (!isFinitePrice(price)) return null;

    return {
      ticker,
      symbol,
      price,
      quoteTime: quoteTimeToIso(quote?.regularMarketTime ?? quote?.postMarketTime ?? quote?.preMarketTime) || new Date().toISOString()
    };
  } catch (error) {
    console.warn(`[Screener] Yahoo quote failed for ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function enrichWithLivePrices(items: any[], concurrency: number) {
  const quotes = await mapWithConcurrency(items, concurrency, item => fetchLiveQuote(item.ticker));
  let refreshed = 0;

  const data = items.map((item, index) => {
    const quote = quotes[index];
    if (!quote) return item;

    refreshed += 1;
    const entryPrice = Number(item.buyArea);
    const deltaPct = isFinitePrice(entryPrice)
      ? Number((((quote.price - entryPrice) / entryPrice) * 100).toFixed(2))
      : null;
    const priceHistory = Array.isArray(item.priceHistory) ? [...item.priceHistory] : [];
    const lastHistoryPrice = Number(priceHistory[priceHistory.length - 1]?.price);
    const nextHistory = isFinitePrice(lastHistoryPrice) && lastHistoryPrice === quote.price
      ? priceHistory
      : [...priceHistory, { date: quote.quoteTime, price: quote.price }].slice(-60);

    return {
      ...item,
      currentPrice: quote.price,
      currentPriceSource: "YahooFinance.quote",
      deltaPct,
      priceHistory: nextHistory,
      lastQuoteDate: quote.quoteTime,
      dataFreshness: {
        ...(item.dataFreshness || {}),
        source: "YahooFinance.quote live refresh",
        lastQuoteDate: quote.quoteTime,
        quoteAgeHours: hoursSince(quote.quoteTime),
        isLikelyFreshDaily: true
      },
      metadata: {
        ...(item.metadata || {}),
        latestPrice: quote.price,
        latestPriceSource: "YahooFinance.quote",
        lastQuoteDate: quote.quoteTime
      }
    };
  });

  return { data, refreshed, failed: items.length - refreshed };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const getAll = searchParams.get("all") === "true";
  const priceRange = searchParams.get("priceRange") || "all";
  const dateFilter = searchParams.get("dateFilter") || "all";
  const categoryFilter = searchParams.get("category");
  const livePrices = searchParams.get("livePrices") !== "false";
  const quoteConcurrency = parseIntegerParam(searchParams.get("quoteConcurrency"), 8, 1, 16);
  const useCache = searchParams.get("cache") !== "false";
  const shouldWriteFullCache = priceRange === "all" && dateFilter === "all" && !categoryFilter;

  try {
    if (getAll) {
      const stocks = await getIdxStocksUniverse();
      return NextResponse.json({ success: true, data: stocks });
    }

    if (useCache) {
      let cached = null;
      try {
        cached = await getLatestScreenerSnapshot();
      } catch (cacheError) {
        console.error("Failed to read Postgres screener cache; falling back to signal_events:", cacheError);
      }

      if (cached) {
        const cachedData = applyCachedRequestFilters(cached.data as any[], priceRange, dateFilter, categoryFilter);
        const latestScannedAt = cachedData
          .map(item => item.lastScannedAt ? new Date(item.lastScannedAt).getTime() : 0)
          .filter(Number.isFinite)
          .sort((a, b) => b - a)[0];
        const latestDataAt = cachedData
          .map(latestDataDateTime)
          .filter(Number.isFinite)
          .sort((a, b) => b - a)[0];
        const latestSignalAt = cachedData
          .map(latestSignalScanDateTime)
          .filter(Number.isFinite)
          .sort((a, b) => b - a)[0];

        return NextResponse.json({
          success: true,
          data: cachedData,
          scanMeta: {
            ...(cached.scanMeta || {}),
            source: "Postgres screener cache. Klik Scan terbaru untuk mengambil data pasar terbaru.",
            priceSource: "Cached DB snapshot",
            sortBy: "latest_signal_scan_date",
            livePriceRefreshed: 0,
            livePriceFailed: 0,
            cacheHit: true,
            cacheGeneratedAt: cached.generatedAt,
            cacheExpiresAt: cached.expiresAt,
            latestDataAt: latestDataAt ? new Date(latestDataAt).toISOString() : null,
            isLatestDataFresh: latestDataAt ? (Date.now() - latestDataAt) <= 36 * 60 * 60 * 1000 : false,
            latestSignalAt: latestSignalAt ? new Date(latestSignalAt).toISOString() : null,
            isLatestSignalFresh: latestSignalAt ? (Date.now() - latestSignalAt) <= 36 * 60 * 60 * 1000 : false,
            latestScannedAt: latestScannedAt ? new Date(latestScannedAt).toISOString() : null,
            isLatestScanFresh: latestScannedAt ? (Date.now() - latestScannedAt) <= 36 * 60 * 60 * 1000 : false
          }
        });
      }
    }

    const pgSignals = await getPgScreenerSignals(1_000);
    const results = pgSignals
      .filter(signal => passesCachedPriceRange({ buyArea: signal.entryPrice }, priceRange))
      .filter(signal => passesCachedDateFilter(signal, dateFilter))
      .map(signal => {
        const entryPrice = Number(signal.entryPrice);
        const currentPrice = Number(signal.currentPrice);
        const evaluation = buildEvaluationState(
          signal.appearedAt,
          entryPrice,
          currentPrice,
          signal.lastQuoteDate || signal.lastScannedAt
        );
        const quoteAgeHours = hoursSince(signal.lastQuoteDate || signal.lastScannedAt || undefined);

        return {
          ticker: signal.ticker,
          strategy: signal.strategy,
          signalSource: signal.signalSource,
          winRate: "0.00",
          totalSignals: 0,
          successfulSignals: 0,
          buyArea: signal.entryPrice,
          tp: signal.targetPrice,
          sl: signal.stopLossPrice,
          riskPct: signal.riskPct === null ? null : signal.riskPct.toFixed(1),
          volRatio: (signal.metadata as any)?.volRatio,
          currentPrice: signal.currentPrice,
          currentPriceSource: signal.currentPriceSource,
          deltaPct: signal.deltaPct,
          evaluation,
          priceHistory: signal.priceHistory,
          daysHeld: signal.daysHeld,
          relevanceScore: signal.relevanceScore,
          category: signal.category,
          vector: signal.vector,
          appearedAt: signal.appearedAt,
          createdAt: signal.createdAt,
          entryDate: signal.entryDate,
          updatedAt: signal.updatedAt,
          lastScannedAt: signal.lastScannedAt,
          lastQuoteDate: signal.lastQuoteDate,
          dataFreshness: {
            source: "Postgres.signal_events + market_candles",
            lastQuoteDate: signal.lastQuoteDate,
            lastScannedAt: signal.lastScannedAt,
            quoteAgeHours,
            isLikelyFreshDaily: quoteAgeHours === null ? false : quoteAgeHours <= 36
          },
          metadata: signal.metadata
        };
      });

    // Latest qualifying signal scan first; relevance is only a tie-breaker.
    const categoryFilteredResults = categoryFilter
      ? results.filter((item: any) => {
        const target = categoryFilter.toUpperCase();
        return String(item.category || "").toUpperCase() === target ||
          String(item.vector || "").toUpperCase() === target ||
          String(item.strategy || "").toUpperCase().includes(target);
      })
      : results;

    const sortedResults = categoryFilteredResults.sort(sortLatestSignalScanFirst);

    // Final sort keeps the table ordered by latest qualifying signal scan.
    let finalResults = diversifyResults(sortedResults);
    const livePriceMeta = livePrices
      ? await enrichWithLivePrices(finalResults, quoteConcurrency)
      : { data: finalResults, refreshed: 0, failed: 0 };
    finalResults = livePriceMeta.data.sort(sortLatestSignalScanFirst);

    const latestScannedAt = finalResults
      .map(item => item.lastScannedAt ? new Date(item.lastScannedAt).getTime() : 0)
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const latestDataAt = finalResults
      .map(latestDataDateTime)
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const latestSignalAt = finalResults
      .map(latestSignalScanDateTime)
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];

    const scanMeta: Record<string, any> = {
      source: "Postgres signal_events. Klik Scan terbaru untuk refresh YahooFinance.chart ke PostgreSQL lokal.",
      priceSource: livePrices ? "YahooFinance.quote" : "Stored DB fallback",
      sortBy: "latest_signal_scan_date",
      livePriceRefreshed: livePriceMeta.refreshed,
      livePriceFailed: livePriceMeta.failed,
      cacheHit: false,
      latestDataAt: latestDataAt ? new Date(latestDataAt).toISOString() : null,
      isLatestDataFresh: latestDataAt ? (Date.now() - latestDataAt) <= 36 * 60 * 60 * 1000 : false,
      latestSignalAt: latestSignalAt ? new Date(latestSignalAt).toISOString() : null,
      isLatestSignalFresh: latestSignalAt ? (Date.now() - latestSignalAt) <= 36 * 60 * 60 * 1000 : false,
      latestScannedAt: latestScannedAt ? new Date(latestScannedAt).toISOString() : null,
      isLatestScanFresh: latestScannedAt ? (Date.now() - latestScannedAt) <= 36 * 60 * 60 * 1000 : false
    };

    if (shouldWriteFullCache) {
      try {
        const cacheWrite = await saveScreenerSnapshot({ data: finalResults, scanMeta });
        scanMeta.cacheGeneratedAt = cacheWrite.generatedAt;
        scanMeta.cacheExpiresAt = cacheWrite.expiresAt;
      } catch (cacheError) {
        console.error("Failed to write screener cache:", cacheError);
      }
    }

    return NextResponse.json({
      success: true,
      data: finalResults,
      scanMeta
    });
  } catch (error) {
    console.error("Screener Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
