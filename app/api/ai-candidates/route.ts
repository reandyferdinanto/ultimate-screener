import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const result = await query(`
      SELECT * FROM ai_top_gainers_analysis 
      WHERE ai_verdict = 'SECRET_SAUCE_CANDIDATE'
      ORDER BY created_at DESC 
      LIMIT 40
    `);
    
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('API AI Candidates Error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
