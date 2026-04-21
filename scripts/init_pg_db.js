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

      CREATE TABLE IF NOT EXISTS secret_sauce_samples (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(20) NOT NULL,
        breakout_date DATE NOT NULL,
        gain_percentage NUMERIC(5,2),
        is_sustained BOOLEAN DEFAULT TRUE,
        data_1d JSONB,
        data_1h JSONB,
        data_15m JSONB,
        pre_breakout_technicals JSONB,
        pre_breakout_window JSONB NOT NULL DEFAULT '[]'::jsonb,
        pre_breakout_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticker, breakout_date)
      );

      CREATE TABLE IF NOT EXISTS ai_secret_sauce_versions (
        id SERIAL PRIMARY KEY,
        version_label VARCHAR(64) NOT NULL UNIQUE,
        rule_payload JSONB NOT NULL,
        source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        performance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        notes TEXT,
        generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ai_secret_sauce_runs (
        id SERIAL PRIMARY KEY,
        version_id INTEGER NOT NULL REFERENCES ai_secret_sauce_versions(id) ON DELETE CASCADE,
        run_date DATE NOT NULL,
        ticker VARCHAR(20) NOT NULL,
        entry_price NUMERIC(12,2) NOT NULL,
        candidate_rank INTEGER,
        snapshot JSONB NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(version_id, run_date, ticker)
      );

      CREATE TABLE IF NOT EXISTS ai_secret_sauce_backtests (
        id SERIAL PRIMARY KEY,
        run_id INTEGER NOT NULL UNIQUE REFERENCES ai_secret_sauce_runs(id) ON DELETE CASCADE,
        evaluation_date DATE NOT NULL,
        days_observed INTEGER NOT NULL,
        max_gain_pct NUMERIC(8,2) NOT NULL,
        max_drawdown_pct NUMERIC(8,2) NOT NULL,
        final_return_pct NUMERIC(8,2) NOT NULL,
        hit_target BOOLEAN NOT NULL DEFAULT FALSE,
        hit_stop BOOLEAN NOT NULL DEFAULT FALSE,
        outcome VARCHAR(32) NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_secret_sauce_samples_breakout_date ON secret_sauce_samples(breakout_date);
      CREATE INDEX IF NOT EXISTS idx_secret_sauce_versions_generated_at ON ai_secret_sauce_versions(generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_secret_sauce_runs_status ON ai_secret_sauce_runs(status, run_date DESC);
    `;

    await client.query(createQuery);
    await client.query(`
      ALTER TABLE secret_sauce_samples
      ADD COLUMN IF NOT EXISTS pre_breakout_window JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await client.query(`
      ALTER TABLE secret_sauce_samples
      ADD COLUMN IF NOT EXISTS pre_breakout_summary JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    console.log('Tables "ai_top_gainers_analysis" and "ai_meta_summary" created successfully!');

  } catch (err) {
    console.error('Error creating tables:', err.stack);
  } finally {
    await client.end();
  }
}

createTables();
