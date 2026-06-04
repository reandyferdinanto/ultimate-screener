import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import { invalidateScreenerSnapshots } from "@/lib/screener-cache";

let isScanning = false;

export async function POST(): Promise<Response> {
  if (isScanning) {
    return NextResponse.json({ success: false, error: "Scan already in progress" }, { status: 409 });
  }

  isScanning = true;
  const scanStartedAt = new Date();
  const scriptPath = path.join(process.cwd(), "scripts/pg_screener_scan.js");
  const origin = `http://127.0.0.1:${process.env.PORT || "3000"}`;

  return new Promise((resolve) => {
    exec(`node "${scriptPath}" --origin=${origin}`, { maxBuffer: 1024 * 1024 * 20 }, async (error, stdout) => {
      isScanning = false;
      const scanCompletedAt = new Date();
      if (error) {
        console.error(`Scan execution error: ${error}`);
        resolve(NextResponse.json({ success: false, error: error.message, scanStartedAt, scanCompletedAt }, { status: 500 }));
        return;
      }

      try {
        await invalidateScreenerSnapshots();
      } catch (cacheError) {
        console.error("Failed to invalidate screener cache after scan:", cacheError);
      }

      console.log(`Scan completed: ${stdout}`);
      resolve(NextResponse.json({
        success: true,
        message: "Scan completed successfully",
        scanStartedAt,
        scanCompletedAt,
        dataSource: "Postgres signal_events + market_candles via /api/technical",
        latestDataPolicy: "RUN_SCAN fetches fresh Yahoo Finance data through /api/technical and stores screener candidates in local PostgreSQL.",
        stdout: stdout.split("\n").slice(-12).join("\n")
      }));
    });
  });
}

export async function GET() {
    return NextResponse.json({ isScanning });
}
