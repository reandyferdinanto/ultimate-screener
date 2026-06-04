import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.AI_DATABASE_URL || 'postgresql://reandyfdatabase:reandyf123456@127.0.0.1:5432/reandyfdatabase',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export const getClient = () => pool.connect();
