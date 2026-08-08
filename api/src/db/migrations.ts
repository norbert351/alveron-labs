import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.ts';

const __dirname = dirname(fileURLToPath(import.meta.url)); // src/db

export async function runMigrations() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ DEFAULT now()
     )`
  );
  const appliedRes = await pool.query(`SELECT name FROM schema_migrations`);
  const applied = new Set(appliedRes.rows.map((r) => r.name));

  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`[alveron-api] migration applied: ${file}`);
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error(`[alveron-api] migration failed: ${file}`, err?.message || err);
      throw err;
    } finally {
      client.release();
    }
  }
}
