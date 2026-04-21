const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham',
});

async function insertDummy() {
  try {
    await client.connect();
    
    // Dummy Analysis
    const rawData = JSON.stringify({
      tech_1d: { RSI_14: 75.5, MFI_14: 82.1, RVol: 4.5, current_price: 150 },
      tech_1h: { MACD: 'Golden Cross' },
      tech_15m: { consolidation: 'Breakout' }
    });
    
    const aiFull = JSON.stringify({
      verdict: 'Bullish Breakout',
      key_driver: 'Volume explosion (4.5x) confirmed with Daily MA20 crossover.',
      support: 135,
      resistance: 180,
      trend_1d: 'Strong Bullish',
      trend_1h: 'Accumulation',
      trend_15m: 'Parabolic',
      actionable_insight: 'Hold position with trailing stop at 140. Watch for pullback to MA5.',
      pattern_score: 9
    });

    await client.query(`
      INSERT INTO ai_top_gainers_analysis (ticker, date, gain_percentage, raw_technical_data, ai_verdict, ai_analysis_full)
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
      ON CONFLICT (ticker, date) DO NOTHING
    `, ['GOTO', 22.5, rawData, 'Bullish Breakout', aiFull]);

    // Dummy Summary
    const patterns = JSON.stringify({
      "Volume Profile": "80% of gainers showed >3x relative volume",
      "Indicator Sync": "Most breakouts happened when RSI was entering overbought zone (>70)",
      "Moving Averages": "Price respect detected on EMA 20 across 1H timeframe"
    });
    
    const suggestions = JSON.stringify([
      { name: "The High Vol Runner", logic: "RelativeVolume > 3.0 AND Price > EMA20 AND RSI_1D > 65" },
      { name: "Early Bird Breakout", logic: "MFI_15M < 30 (Oversold) THEN Price cross MA50 15M" }
    ]);

    await client.query(`
      INSERT INTO ai_meta_summary (summary_date, analyzed_tickers, common_patterns, screener_suggestions)
      VALUES (CURRENT_DATE, $1, $2, $3)
      ON CONFLICT (summary_date) DO NOTHING
    `, [['GOTO', 'ASII', 'TLKM'], patterns, suggestions]);

    console.log('Dummy data inserted successfully!');
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

insertDummy();
