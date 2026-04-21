const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.AI_DATABASE_URL || 'postgresql://reandyapp:reandy123456@127.0.0.1:5433/cerita_saham',
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Create table for secret sauce historical samples
    await client.query(`
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
      )
    `);

    await client.query(`
      ALTER TABLE secret_sauce_samples
      ADD COLUMN IF NOT EXISTS pre_breakout_window JSONB NOT NULL DEFAULT '[]'::jsonb
    `);

    await client.query(`
      ALTER TABLE secret_sauce_samples
      ADD COLUMN IF NOT EXISTS pre_breakout_summary JSONB NOT NULL DEFAULT '{}'::jsonb
    `);

    console.log('Table secret_sauce_samples created/verified.');
  } catch (err) {
    console.error('Migration error', err);
  } finally {
    await client.end();
  }
}

migrate();
