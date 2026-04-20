import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { SettingsModel } from "@/lib/models/Settings";

export async function GET() {
  try {
    await connectToDatabase();
    const settings = await SettingsModel.findOne({ key: "telegram_config" });
    return NextResponse.json({ success: true, data: settings?.value || {} });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    
    await SettingsModel.findOneAndUpdate(
      { key: "telegram_config" },
      { value: body },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, message: "Settings updated" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
