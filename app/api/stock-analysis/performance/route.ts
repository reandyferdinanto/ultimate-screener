import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const period = searchParams.get('period') || '1m';

    let queryText = `
      SELECT 
        ticker,
        AVG(returns) as avg_return,
        AVG(volatility) as avg_volatility,
        MAX(conviction_level) as max_conviction,
        COUNT(*) as analysis_count
      FROM stock_analysis
      WHERE created_at >= NOW() - INTERVAL '1 month'
    `;

    const queryParams = [];

    if (ticker) {
      queryText += ' AND ticker = $1';
      queryParams.push(ticker);
    }

    queryText += ' GROUP BY ticker ORDER BY avg_return DESC';

    const result = await query(queryText, queryParams);

    return NextResponse.json({ performance: result.rows });
  } catch (error) {
    console.error('Error fetching performance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performance' },
      { status: 500 }
    );
  }
}
