import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

let isScanning = false;

export async function POST(): Promise<Response> {
  if (isScanning) {
    return NextResponse.json({ success: false, error: "Scan already in progress" }, { status: 409 });
  }

  isScanning = true;
  const scriptPath = path.join(process.cwd(), "scripts/scan.js");

  return new Promise((resolve) => {
    exec(`node ${scriptPath}`, (error, stdout) => {
      isScanning = false;
      if (error) {
        console.error(`Scan execution error: ${error}`);
        resolve(NextResponse.json({ success: false, error: error.message }, { status: 500 }));
        return;
      }
      console.log(`Scan completed: ${stdout}`);
      resolve(NextResponse.json({ success: true, message: "Scan completed successfully" }));
    });
  });
}

export async function GET() {
    return NextResponse.json({ isScanning });
}
