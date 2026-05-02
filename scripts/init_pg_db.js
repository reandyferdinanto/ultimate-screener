const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham',
});

async function createTables() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database for schema creation.');

    const createQuery = `
      CREATE TABLE IF NOT EXISTS ai_top_gainers_analysis (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        gain_percentage NUMERIC(5,2) NOT NULL,
        raw_technical_data JSONB NOT NULL,
        ai_verdict VARCHAR(255),
        ai_analysis_full JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (ticker, date)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_analysis_ticker ON ai_top_gainers_analysis(ticker);
      CREATE INDEX IF NOT EXISTS idx_ai_analysis_date ON ai_top_gainers_analysis(date);

      CREATE TABLE IF NOT EXISTS ai_meta_summary (
        id SERIAL PRIMARY KEY,
        summary_date DATE NOT NULL UNIQUE,
        analyzed_tickers TEXT[] NOT NULL,
        common_patterns JSONB NOT NULL,
        screener_suggestions JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

    `;

    await client.query(createQuery);
    console.log('Tables "ai_top_gainers_analysis" and "ai_meta_summary" created successfully!');

  } catch (err) {
    console.error('Error creating tables:', err.stack);
  } finally {
    await client.end();
  }
}

createTables();
