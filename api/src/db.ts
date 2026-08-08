import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { config } from './config.ts';
import { runMigrations } from './db/migrations.ts';

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.databaseUrl });

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDb() {
  const sql = readFileSync(join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  await runMigrations();
  await seedDefaults();
}

async function seedDefaults() {
  const existing = await pool.query(`SELECT key FROM settings WHERE key = 'llm'`);
  if (existing.rowCount === 0) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('llm', $1)`,
      [
        JSON.stringify({
          baseUrl: config.llm.baseUrl,
          apiKey: config.llm.apiKey,
          model: config.llm.model,
        }),
      ]
    );
  }
  const svc = await pool.query(`SELECT key FROM settings WHERE key = 'services'`);
  if (svc.rowCount === 0) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('services', $1)`,
      [
        JSON.stringify([
          { name: 'AI Automation', description: 'Automating repetitive business workflows with AI' },
          { name: 'AI Agents', description: 'Autonomous AI agents for research, support, and operations' },
          { name: 'Custom Software', description: 'Bespoke internal tools and business software' },
          { name: 'SaaS Development', description: 'Multi-tenant SaaS products and platforms' },
          { name: 'Web Applications', description: 'Modern web apps, portals, and dashboards' },
          { name: 'Web3 Solutions', description: 'Smart contracts, dApps, and blockchain integrations' },
        ]),
      ]
    );
  }
  const seq = await pool.query(`SELECT key FROM settings WHERE key = 'follow_up'`);
  if (seq.rowCount === 0) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('follow_up', $1)`,
      [
        JSON.stringify({
          enabled: true,
          days: [0, 4, 9],
          max_follow_ups: 2,
        }),
      ]
    );
  }
}

export async function getSetting(key: string): Promise<any> {
  const res = await pool.query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return res.rowCount ? res.rows[0].value : null;
}

export async function setSetting(key: string, value: unknown) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

export async function logActivity(input: {
  actor?: string;
  action: string;
  entityType?: string;
  entityId?: number;
  detail?: Record<string, unknown>;
}) {
  await pool.query(
    `INSERT INTO activity_logs (actor, action, entity_type, entity_id, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.actor || 'system',
      input.action,
      input.entityType || null,
      input.entityId || null,
      JSON.stringify(input.detail || {}),
    ]
  );
}
