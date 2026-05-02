import { NextResponse } from "next/server";
import { downloadResearchDataset, listResearchDatasets, readResearchDataset } from "@/lib/yfinance-research-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function compactDataset(dataset: ReturnType<typeof readResearchDataset>) {
  if (!dataset) return null;
  return {
    ticker: dataset.ticker,
    symbol: dataset.symbol,
    requestedTicker: dataset.requestedTicker,
    periodYears: dataset.periodYears,
    downloadedAt: dataset.downloadedAt,
    candles: dataset.quotes.length,
    firstDate: dataset.quotes[0]?.date || null,
    lastDate: dataset.quotes[dataset.quotes.length - 1]?.date || null,
    latestClose: dataset.quotes[dataset.quotes.length - 1]?.close || null,
    analysis: dataset.analysis,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const full = searchParams.get("full") === "true";

  try {
    if (ticker) {
      const dataset = readResearchDataset(ticker);
      if (!dataset) {
        return NextResponse.json({ success: false, error: "Dataset belum ada. Download ticker dulu." }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: full ? dataset : compactDataset(dataset) });
    }

    const datasets = listResearchDatasets().map(dataset => compactDataset(dataset));
    return NextResponse.json({ success: true, data: datasets });
  } catch (error) {
    console.error("YFinance research GET error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ticker = String(body.ticker || "").trim();
    const periodYears = Number(body.periodYears || 2);

    if (!ticker) {
      return NextResponse.json({ success: false, error: "Ticker wajib diisi" }, { status: 400 });
    }

    const dataset = await downloadResearchDataset(ticker, periodYears);
    return NextResponse.json({ success: true, data: compactDataset(dataset) });
  } catch (error) {
    console.error("YFinance research POST error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
