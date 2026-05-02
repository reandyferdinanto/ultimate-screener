import { Pool } from 'pg';

const POSTGRES_URL = process.env.POSTGRES_URL || "postgresql://postgres:password@localhost:5432/stock_analysis";

if (!POSTGRES_URL) {
  throw new Error("Please define the POSTGRES_URL environment variable");
}

const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function query(text: string, params?: any[]) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function initDatabase() {
  try {
    // Create stocks table
    await query(`
      CREATE TABLE IF NOT EXISTS stocks (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100),
        sector VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create stock_history table
    await query(`
      CREATE TABLE IF NOT EXISTS stock_history (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER REFERENCES stocks(id),
        date DATE NOT NULL,
        open NUMERIC(15,4),
        high NUMERIC(15,4),
        low NUMERIC(15,4),
        close NUMERIC(15,4),
        volume BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stock_id, date)
      );
    `);

    // Create analysis_results table
    await query(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER REFERENCES stocks(id),
        analysis_type VARCHAR(50) NOT NULL,
        result JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_stocks_ticker ON stocks(ticker);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_stock_history_stock_date ON stock_history(stock_id, date);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_stock_history_date ON stock_history(date);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_analysis_results_stock_type ON analysis_results(stock_id, analysis_type);`);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

export { pool };
