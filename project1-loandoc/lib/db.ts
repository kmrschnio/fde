// lib/db.ts
import { Pool } from 'pg';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// queries: const { rows } = await pool.query(sql, params);