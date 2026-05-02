import { NextResponse } from "next/server";
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "^JKSE";

  try {
    const today = new Date();
    const period1 = new Date(today);
    period1.setDate(period1.getDate() - 3); // Get last 3 days
    const period2 = new Date();
    
    const result: any = await yahooFinance.chart(symbol, {
      period1,
      period2,
      interval: "5m",
    });

    const data = result.quotes.map((q: any) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      value: q.close,
    })).filter((q: any) => q.open !== null);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error(`Error fetching data for ${symbol}:`, error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
