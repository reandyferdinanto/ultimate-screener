import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const result = await query(
      'SELECT * FROM stock_analysis WHERE ticker = $1 ORDER BY created_at DESC LIMIT 1',
      [ticker]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Analysis not found for this ticker' },
        { status: 404 }
      );
    }

    return NextResponse.json({ analysis: result.rows[0] });
  } catch (error) {
    console.error('Error fetching analysis:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analysis' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const analysisData = await request.json();

    const {
      ticker,
      technical_indicators,
      fundamental_metrics,
      market_conditions,
      risk_assessment,
      conviction_level,
      entry_price,
      target_price,
      stop_loss
    } = analysisData;

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO stock_analysis (
        ticker, technical_indicators, fundamental_metrics, market_conditions,
        risk_assessment, conviction_level, entry_price, target_price, stop_loss
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        ticker,
        JSON.stringify(technical_indicators || {}),
        JSON.stringify(fundamental_metrics || {}),
        JSON.stringify(market_conditions || {}),
        JSON.stringify(risk_assessment || {}),
        conviction_level || 'medium',
        entry_price,
        target_price,
        stop_loss
      ]
    );

    return NextResponse.json({ 
      message: 'Analysis saved successfully',
      analysis: result.rows[0] 
    });
  } catch (error) {
    console.error('Error saving analysis:', error);
    return NextResponse.json(
      { error: 'Failed to save analysis' },
      { status: 500 }
    );
  }
}
