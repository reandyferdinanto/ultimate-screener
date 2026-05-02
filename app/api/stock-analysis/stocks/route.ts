import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export async function GET() {
  try {
    const result = await query('SELECT * FROM stocks ORDER BY ticker');
    return NextResponse.json({ stocks: result.rows });
  } catch (error) {
    console.error('Error fetching stocks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stocks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { ticker, name, sector } = await request.json();

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const result = await query(
      'INSERT INTO stocks (ticker, name, sector) VALUES ($1, $2, $3) ON CONFLICT (ticker) DO UPDATE SET name = $2, sector = $3, updated_at = CURRENT_TIMESTAMP RETURNING *',
      [ticker, name, sector]
    );

    return NextResponse.json({ 
      message: 'Stock added/updated successfully',
      stock: result.rows[0] 
    });
  } catch (error) {
    console.error('Error adding stock:', error);
    return NextResponse.json(
      { error: 'Failed to add stock' },
      { status: 500 }
    );
  }
}
