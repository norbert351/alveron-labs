import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../src/db/migrations/006_unified_opportunities.sql', import.meta.url),
  'utf8'
);

test('unified opportunity migration is additive and repeatable', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS opportunity_records/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS opportunity_profiles/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS opportunity_source_runs/i);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS/i);
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|INDEX)\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});

test('unified opportunity schema supports all six planned channels', () => {
  for (const channel of [
    'remote_job',
    'paid_task',
    'agency_contract',
    'business_lead',
    'paid_research',
    'technical_content',
  ]) {
    assert.ok(migration.includes(channel), `missing channel: ${channel}`);
  }
});

test('opportunity schema stores provenance, evidence, fit and review state', () => {
  for (const field of [
    'source_name',
    'source_url',
    'external_id',
    'dedupe_key',
    'required_skills',
    'evidence',
    'fit_score',
    'verification_status',
    'deadline_at',
    'status',
  ]) {
    assert.match(migration, new RegExp('\\b' + field + '\\b', 'i'), `missing field: ${field}`);
  }
});

test('Fastify exposes the profile and scoring endpoints', () => {
  const routes = readFileSync(
    new URL('../src/routes/opportunityRecords.ts', import.meta.url),
    'utf8'
  );
  assert.match(routes, /GET\x27, async|app\.get\('\/api\/opportunity-profile'/);
  assert.match(routes, /app\.put\('\/api\/opportunity-profile'/);
  assert.match(routes, /app\.post\('\/api\/opportunity-records\/:id\/score'/);
});
