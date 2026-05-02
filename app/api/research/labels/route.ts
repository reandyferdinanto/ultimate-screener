import { NextResponse } from "next/server";
import { readEventLabels, upsertEventLabel, type EventLabelValue } from "@/lib/yfinance-research-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LABELS = new Set<EventLabelValue>(["unreviewed", "winner", "failed_breakout", "false_breakout", "too_late", "watchlist"]);

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: readEventLabels() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const eventId = String(body.eventId || "").trim();
    const label = String(body.label || "unreviewed") as EventLabelValue;
    const notes = String(body.notes || "");

    if (!eventId) {
      return NextResponse.json({ success: false, error: "eventId wajib diisi" }, { status: 400 });
    }
    if (!LABELS.has(label)) {
      return NextResponse.json({ success: false, error: "Label tidak valid" }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: upsertEventLabel(eventId, label, notes) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
