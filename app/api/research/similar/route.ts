import { NextResponse } from "next/server";
import { scanSimilarWinners } from "@/lib/yfinance-research-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scanAll = searchParams.get("all") === "true";
  const limit = scanAll ? null : numberParam(searchParams.get("limit"), 120, 1, 957);
  const concurrency = numberParam(searchParams.get("concurrency"), 6, 1, 16);
  const periodYears = numberParam(searchParams.get("periodYears"), 2, 1, 5);

  try {
    const data = await scanSimilarWinners({ limit, concurrency, periodYears });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Similar winners scan error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
