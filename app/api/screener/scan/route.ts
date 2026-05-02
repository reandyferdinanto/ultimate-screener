import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

let isScanning = false;

export async function POST(): Promise<Response> {
  if (isScanning) {
    return NextResponse.json({ success: false, error: "Scan already in progress" }, { status: 409 });
  }

  isScanning = true;
  const scanStartedAt = new Date();
  const scriptPath = path.join(process.cwd(), "scripts/scan.js");
  const squeezeScriptPath = path.join(process.cwd(), "scripts/squeeze_divergence_scanner.js");
  const breakoutScriptPath = path.join(process.cwd(), "scripts/technical_breakout_scanner.js");
  const updateSignalsPath = path.join(process.cwd(), "scripts/update_signals.js");

  return new Promise((resolve) => {
    exec(`node "${scriptPath}" && node "${squeezeScriptPath}" && node "${breakoutScriptPath}" && node "${updateSignalsPath}"`, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
      isScanning = false;
      const scanCompletedAt = new Date();
      if (error) {
        console.error(`Scan execution error: ${error}`);
        resolve(NextResponse.json({ success: false, error: error.message, scanStartedAt, scanCompletedAt }, { status: 500 }));
        return;
      }
      console.log(`Scan completed: ${stdout}`);
      resolve(NextResponse.json({
        success: true,
        message: "Scan completed successfully",
        scanStartedAt,
        scanCompletedAt,
        dataSource: "YahooFinance.chart(1d) + YahooFinance.chart(1h aggregated 4h)",
        latestDataPolicy: "RUN_SCAN fetches fresh Yahoo Finance data, stores only active screener candidates, then evaluates pending signals after D+2.",
        stdout: stdout.split("\n").slice(-12).join("\n")
      }));
    });
  });
}

export async function GET() {
    return NextResponse.json({ isScanning });
}
