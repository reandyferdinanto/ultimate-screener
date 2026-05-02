import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { SignalPerformanceModel } from "@/lib/models/SignalPerformance";
import { StockSignalModel } from "@/lib/models/StockSignal";
import { findIdxStocksByLookupKeysAsync, getIdxStocksUniverse } from "@/lib/idx-stock-file";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function deriveSignalCategory(source = "", metadata?: any) {
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

function deriveSignalVector(source = "", metadata?: any) {
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
  const livePrices = searchParams.get("livePrices") !== "false";
  const quoteConcurrency = parseIntegerParam(searchParams.get("quoteConcurrency"), 8, 1, 16);

  try {
    if (getAll) {
      const stocks = await getIdxStocksUniverse();
      return NextResponse.json({ success: true, data: stocks });
    }

    await connectToDatabase();

    // Build Price Filter
    let priceFilter = {};
    if (priceRange === "under300") priceFilter = { entryPrice: { $lt: 300 } };
    else if (priceRange === "under500") priceFilter = { entryPrice: { $lt: 500 } };
    else if (priceRange === "above500") priceFilter = { entryPrice: { $gte: 500 } };

    // Build Date Filter — use updatedAt (last scan time) instead of createdAt
    // so re-confirmed signals from latest scans are always visible
    let dateFilterQuery = {};
    if (dateFilter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      dateFilterQuery = { updatedAt: { $gte: startOfDay } };
    } else if (dateFilter === "3d") {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      dateFilterQuery = { updatedAt: { $gte: threeDaysAgo } };
    } else if (dateFilter === "7d") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      dateFilterQuery = { updatedAt: { $gte: sevenDaysAgo } };
    }

    // Get all pending signals with price + date filter
    const activeSignals = await StockSignalModel.find({ 
        status: "pending",
        ...priceFilter,
        ...dateFilterQuery
    }).lean();

    const stockLookupKeys = Array.from(new Set(
      activeSignals.flatMap((signal: any) => tickerLookupKeys(signal.ticker))
    ));
    const latestStocks = await findIdxStocksByLookupKeysAsync(stockLookupKeys);
    const latestStockByTicker = new Map<string, any>();
    latestStocks.forEach((stock: any) => {
      tickerLookupKeys(stock.ticker).forEach(key => latestStockByTicker.set(key, stock));
      tickerLookupKeys(stock.symbol).forEach(key => latestStockByTicker.set(key, stock));
    });

    const results = await Promise.all(activeSignals.map(async (signal: any) => {
      // Get historical performance for this ticker
      const stats = await SignalPerformanceModel.aggregate([
        { $match: { ticker: signal.ticker } },
        {
          $group: {
            _id: "$ticker",
            totalSignals: { $sum: 1 },
            successfulSignals: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } }
          }
        }
      ]);

      const stat = stats[0] || { totalSignals: 0, successfulSignals: 0 };
      const winRate = stat.totalSignals > 0 
        ? ((stat.successfulSignals / stat.totalSignals) * 100).toFixed(2)
        : "0.00";

      const metadata = signal.metadata as any;
      const category = deriveSignalCategory(signal.signalSource, metadata);
      const vector = deriveSignalVector(signal.signalSource, metadata);
      const metadataEntryPrice = Number(metadata?.firstEntryPrice);
      const entryPrice = isFinitePrice(metadataEntryPrice) ? metadataEntryPrice : Number(signal.entryPrice);
      const signalSource = signal.signalSource === 'Squeeze Divergence (${interval})'
        ? (vector.includes('4H') ? 'Squeeze Divergence (4h)' : 'Squeeze Divergence (1d)')
        : signal.signalSource;
      const appearedAt = metadata?.firstAppearedAt || metadata?.appearedAt || signal.createdAt || signal.entryDate;
      const stockSnapshot = tickerLookupKeys(signal.ticker)
        .map(key => latestStockByTicker.get(key))
        .find(Boolean);
      const lastScannedAt = metadata?.lastScannedAt || metadata?.scanRunAt || signal.updatedAt;
      const lastQuoteDate = metadata?.lastQuoteDate || stockSnapshot?.updatedAt;
      const quoteAgeHours = hoursSince(lastQuoteDate);
      const mappedPriceHistory = (signal.priceHistory || [])
        .map((h: any) => ({ date: h.date, price: Number(h.price) }))
        .filter((h: any) => isFinitePrice(h.price));
      const masterLastPrice = Number(stockSnapshot?.lastPrice);
      const signalCurrentPrice = Number(signal.currentPrice);
      const latestHistory = latestHistoryPrice(signal.priceHistory || []);
      const currentPrice = isFinitePrice(masterLastPrice)
        ? masterLastPrice
        : (isFinitePrice(signalCurrentPrice)
          ? signalCurrentPrice
          : (latestHistory || entryPrice));
      const deltaPct = isFinitePrice(currentPrice) && isFinitePrice(entryPrice)
        ? Number((((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2))
        : null;

      // Calculate Score: Priority 1: Metadata Scores (Setup + Vol)
      let finalRelevanceScore = 0;
      if (metadata?.setupScore !== undefined && metadata?.volScore !== undefined) {
          finalRelevanceScore = Number(metadata.setupScore) + Number(metadata.volScore);
          // Add Turnaround bonus if applicable
          if (signal.signalSource.includes("TURNAROUND")) finalRelevanceScore += 50;
      } else {
          // Priority 2: Pre-calculated relevanceScore from DB
          finalRelevanceScore = signal.relevanceScore || 0;
      }

      // Priority 3: Fallback calculation for old signal types
      if (!finalRelevanceScore) {
        let strategyScore = 50;
        if (signal.signalSource.includes("CONVICTION:")) strategyScore = 150; 
        else if (signal.signalSource === "Swing Volatilitas Tinggi") strategyScore = 100;

        finalRelevanceScore = strategyScore + (Number(metadata?.breakoutReadiness) || 0) + (Number(metadata?.accumulationBias) || 0);
      }

      const stopLossPrice = Number(signal.stopLossPrice);
      const riskPct = isFinitePrice(entryPrice) && isFinitePrice(stopLossPrice)
        ? (((entryPrice - stopLossPrice) / entryPrice) * 100).toFixed(1)
        : null;
      return {
        ticker: signal.ticker,
        strategy: signalSource,
        signalSource,
        winRate: winRate,
        totalSignals: stat.totalSignals,
        successfulSignals: stat.successfulSignals,
        buyArea: entryPrice,
        tp: signal.targetPrice,
        sl: isFinitePrice(stopLossPrice) ? stopLossPrice : null,
        riskPct: riskPct,
        volRatio: metadata?.volRatio,
        currentPrice,
        currentPriceSource: isFinitePrice(masterLastPrice)
          ? "IndonesiaStock.lastPrice"
          : (isFinitePrice(signalCurrentPrice) ? "StockSignal.currentPrice" : (latestHistory ? "StockSignal.priceHistory" : "StockSignal.entryPrice")),
        deltaPct,
        priceHistory: mappedPriceHistory,
        daysHeld: signal.daysHeld,
        relevanceScore: finalRelevanceScore,
        category,
        vector,
        appearedAt,
        createdAt: signal.createdAt,
        entryDate: signal.entryDate,
        updatedAt: signal.updatedAt,
        lastScannedAt,
        lastQuoteDate,
        dataFreshness: {
            source: metadata?.dataSource || "Stored screener signal",
            lastQuoteDate,
            lastScannedAt,
            quoteAgeHours,
            isLikelyFreshDaily: quoteAgeHours === null ? false : quoteAgeHours <= 36
        },
        metadata: {
            ...metadata,
            category,
            vector,
            setupScore: metadata?.setupScore || 0,
            volScore: metadata?.volScore || 0
        }
      };
    }));

    // Latest qualifying signal scan first; relevance is only a tie-breaker.
    const sortedResults = results.sort(sortLatestSignalScanFirst);

    // DIVERSIFY RESULTS: Ensure we see a mix of categories
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
        "Squeeze Divergence",
        "Squeeze Explosion",
        "The Perfect Retest"
    ];
    const diversified: any[] = [];
    const seen = new Set();

    // Pick top 20 from each category to ensure visibility
    categories.forEach(cat => {
        const catResults = sortedResults.filter(r => r.strategy.toUpperCase().includes(cat.toUpperCase())).slice(0, 20);
        catResults.forEach(r => {
            if (!seen.has(r.ticker)) {
                diversified.push(r);
                seen.add(r.ticker);
            }
        });
    });

    // Add remaining results up to 150 total
    sortedResults.forEach(r => {
        if (!seen.has(r.ticker) && diversified.length < 150) {
            diversified.push(r);
            seen.add(r.ticker);
        }
    });

    // Final sort keeps the table ordered by latest qualifying signal scan.
    let finalResults = diversified.sort(sortLatestSignalScanFirst);
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

    return NextResponse.json({
      success: true,
      data: finalResults,
      scanMeta: {
        source: "Stored StockSignal collection. Press RUN_SCAN to fetch latest YahooFinance.chart(1d) data and update signals.",
        priceSource: livePrices ? "YahooFinance.quote" : "Stored DB fallback",
        sortBy: "latest_signal_scan_date",
        livePriceRefreshed: livePriceMeta.refreshed,
        livePriceFailed: livePriceMeta.failed,
        latestDataAt: latestDataAt ? new Date(latestDataAt).toISOString() : null,
        isLatestDataFresh: latestDataAt ? (Date.now() - latestDataAt) <= 36 * 60 * 60 * 1000 : false,
        latestSignalAt: latestSignalAt ? new Date(latestSignalAt).toISOString() : null,
        isLatestSignalFresh: latestSignalAt ? (Date.now() - latestSignalAt) <= 36 * 60 * 60 * 1000 : false,
        latestScannedAt: latestScannedAt ? new Date(latestScannedAt).toISOString() : null,
        isLatestScanFresh: latestScannedAt ? (Date.now() - latestScannedAt) <= 36 * 60 * 60 * 1000 : false
      }
    });
  } catch (error) {
    console.error("Screener Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
