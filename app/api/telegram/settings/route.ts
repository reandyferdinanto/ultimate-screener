import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { SettingsModel } from "@/lib/models/Settings";

async function validateTelegramToken(botToken: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    throw new Error(json.description || `Telegram API HTTP ${res.status}`);
  }
}

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
    const existing = await SettingsModel.findOne({ key: "telegram_config" });
    const nextValue = {
      ...(existing?.value || {}),
      ...body,
    };

    if (typeof body.botToken === "string") {
      const trimmedToken = body.botToken.trim();
      if (trimmedToken) {
        await validateTelegramToken(trimmedToken);
        nextValue.botToken = trimmedToken;
      } else if (existing?.value?.botToken) {
        nextValue.botToken = existing.value.botToken;
      }
    }

    await SettingsModel.findOneAndUpdate(
      { key: "telegram_config" },
      { value: nextValue },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, message: "Settings updated" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
