import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Bloomberg integration is not implemented yet' },
    { status: 501 }
  );
}
