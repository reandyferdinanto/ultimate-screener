import { NextResponse } from 'next/server';
import { query } from '@/lib/db-pg';

export async function GET() {
  try {
    const result = await query(`
      SELECT * FROM ai_meta_summary 
      ORDER BY summary_date DESC 
      LIMIT 10
    `);
    
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('API AI Summary Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
