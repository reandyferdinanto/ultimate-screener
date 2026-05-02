import { NextResponse } from "next/server";
import { loadIdxStocks } from "@/lib/idx-stock-file";
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Get active stocks. To be efficient, we'll pick a decent sample or focus on liquid ones
    // for this feature, but the request was "all stock database".
    // We'll fetch them all but process in parallel batches.
    const stocks = loadIdxStocks();
    const tickers = stocks.map(s => s.ticker);

    // Yahoo Finance can handle multiple tickers in one quote call
    // We'll split into batches of 200 to be safe
    const batchSize = 200;
    let allQuotes: any[] = [];
    
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      try {
        const quotes = await yahooFinance.quote(batch);
        allQuotes = allQuotes.concat(quotes);
      } catch (e) {
        console.error(`Batch ${i} failed`, e);
      }
    }

    // Filter and map results
    const results = allQuotes
      .filter(q => q && q.regularMarketChangePercent !== undefined)
      .map(q => ({
        ticker: q.symbol.replace(".JK", ""),
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
      }));

    // Sort for top 10 gainers and losers
    const topGainers = [...results].sort((a, b) => b.changePercent - a.changePercent).slice(0, 10);
    const topLosers = [...results].sort((a, b) => a.changePercent - b.changePercent).slice(0, 10);

    return NextResponse.json({
      success: true,
      gainers: topGainers,
      losers: topLosers,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (error: any) {
    console.error("Movers API Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
