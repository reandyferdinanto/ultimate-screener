import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const result = await query(`
      SELECT * FROM ai_top_gainers_analysis 
      ORDER BY date DESC, created_at DESC 
      LIMIT 50
    `);
    
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('API AI Analysis Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
