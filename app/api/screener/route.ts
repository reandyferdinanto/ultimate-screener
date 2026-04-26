import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { SignalPerformanceModel } from "@/lib/models/SignalPerformance";
import { StockSignalModel } from "@/lib/models/StockSignal";
import { IndonesiaStockModel } from "@/lib/models/IndonesiaStock";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const getAll = searchParams.get("all") === "true";
  const priceRange = searchParams.get("priceRange") || "all";
  const dateFilter = searchParams.get("dateFilter") || "all";

  try {
    await connectToDatabase();

    if (getAll) {
      const stocks = await IndonesiaStockModel.find({ active: true }).sort({ ticker: 1 });
      return NextResponse.json({ success: true, data: stocks });
    }

    // Build Price Filter
    let priceFilter = {};
    if (priceRange === "under300") priceFilter = { entryPrice: { $lt: 300 } };
    else if (priceRange === "under500") priceFilter = { entryPrice: { $lt: 500 } };
    else if (priceRange === "above500") priceFilter = { entryPrice: { $gte: 500 } };

    // Build Date Filter
    let dateFilterQuery = {};
    if (dateFilter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      dateFilterQuery = { createdAt: { $gte: startOfDay } };
    } else if (dateFilter === "3d") {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      dateFilterQuery = { createdAt: { $gte: threeDaysAgo } };
    } else if (dateFilter === "7d") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      dateFilterQuery = { createdAt: { $gte: sevenDaysAgo } };
    }

    // Get all pending signals with price + date filter
    const activeSignals = await StockSignalModel.find({ 
        status: "pending",
        ...priceFilter,
        ...dateFilterQuery
    }).lean();

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
        if (signal.signalSource.includes("Secret Sauce")) strategyScore = 500;
        else if (signal.signalSource.includes("CONVICTION:")) strategyScore = 150; 
        else if (signal.signalSource === "Swing Volatilitas Tinggi") strategyScore = 100;

        finalRelevanceScore = strategyScore + (Number(metadata?.breakoutReadiness) || 0) + (Number(metadata?.accumulationBias) || 0);
      }

      const riskPct = signal.entryPrice && signal.stopLossPrice 
        ? (((signal.entryPrice - signal.stopLossPrice) / signal.entryPrice) * 100).toFixed(1)
        : "0.0";
      return {
        ticker: signal.ticker,
        strategy: signal.signalSource,
        signalSource: signal.signalSource,
        winRate: winRate,
        totalSignals: stat.totalSignals,
        successfulSignals: stat.successfulSignals,
        buyArea: signal.entryPrice,
        tp: signal.targetPrice,
        sl: signal.stopLossPrice,
        riskPct: riskPct,
        volRatio: metadata?.volRatio,
        currentPrice: signal.currentPrice || signal.entryPrice,
        priceHistory: (signal.priceHistory || []).map((h: any) => ({ price: h.price })),
        daysHeld: signal.daysHeld,
        relevanceScore: finalRelevanceScore,
        createdAt: signal.createdAt,
        metadata: {
            ...metadata,
            setupScore: metadata?.setupScore || 0,
            volScore: metadata?.volScore || 0
        }
      };
    }));

    // Sort by relevance score descending
    const sortedResults = results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // DIVERSIFY RESULTS: Ensure we see a mix of categories, not just the highest scoring Turnarounds
    const categories = ["ARAHunter", "SCALP", "ELITE BOUNCE", "VOLATILITY EXPLOSION", "BUY ON DIP", "SILENT ACCUMULATION", "TURNAROUND", "EMA BOUNCE", "CVD DIVERGENCE"];
    const diversified: any[] = [];
    const seen = new Set();

    // Pick top 15 from each category to ensure visibility
    categories.forEach(cat => {
        const catResults = sortedResults.filter(r => r.strategy.includes(cat)).slice(0, 15);
        catResults.forEach(r => {
            if (!seen.has(r.ticker)) {
                diversified.push(r);
                seen.has(r.ticker);
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

    // Final sort to keep high conviction at the top but with better variety
    const finalResults = diversified.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return NextResponse.json({ success: true, data: finalResults });
  } catch (error) {
    console.error("Screener Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
