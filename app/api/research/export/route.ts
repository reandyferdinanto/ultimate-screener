import { NextResponse } from "next/server";
import { listResearchDatasets } from "@/lib/yfinance-research-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function csvCell(value: unknown) {
  const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";
  const datasets = listResearchDatasets();

  if (format === "csv") {
    const rows = datasets.flatMap(dataset => [...dataset.analysis.events50, ...dataset.analysis.events100]);
    const headers = [
      "id", "ticker", "threshold", "label", "notes", "sidewaysStart", "sidewaysEnd", "breakoutDate", "targetDate", "peakDate",
      "returnFromBaseLowPct", "returnFromBreakoutPct", "maxDrawdownBeforeTargetPct", "baseRangePct", "volumeDryUpRatio",
      "breakoutVolumeRatio20", "breakoutRsi14", "breakoutAtrPct", "baseAvgTradedValueB", "breakoutTradedValueB", "features"
    ];
    const csv = [
      headers.map(csvCell).join(","),
      ...rows.map(event => headers.map(header => {
        if (header === "features") return csvCell(event.features);
        return csvCell((event as unknown as Record<string, unknown>)[header] ?? event.features?.[header] ?? event.riskMetrics?.[header]);
      }).join(",")),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=research-winner-events.csv",
      },
    });
  }

  return NextResponse.json({
    success: true,
    exportedAt: new Date().toISOString(),
    data: datasets.map(dataset => ({
      ticker: dataset.ticker,
      periodYears: dataset.periodYears,
      downloadedAt: dataset.downloadedAt,
      eventSummary: dataset.analysis.eventSummary,
      events50: dataset.analysis.events50,
      events100: dataset.analysis.events100,
    })),
  });
}
