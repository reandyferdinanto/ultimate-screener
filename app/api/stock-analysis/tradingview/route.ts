import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'TradingView integration is not implemented yet' },
    { status: 501 }
  );
}
