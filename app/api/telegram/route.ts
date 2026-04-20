import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { botToken, chatId, text } = await req.json();
    
    if (!botToken || !chatId || !text) {
      return NextResponse.json({ success: false, error: "Missing botToken, chatId, or text" }, { status: 400 });
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
      }),
    });

    const data = await res.json();
    
    if (!data.ok) {
      return NextResponse.json({ success: false, error: data.description }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
