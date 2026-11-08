import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyOpportunityType, normalizeRemotive, normalizeRemoteOk, safeListingUrl, salaryRange } from '../src/opportunities/discovery.ts';

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


test('salary parser handles ranges, shorthand and missing compensation', () => {
  assert.deepEqual(salaryRange('$45k - $60k'), { min: 45000, max: 60000, currency: 'USD' });
  assert.deepEqual(salaryRange('€2,000 - €3,500 monthly'), { min: 2000, max: 3500, currency: 'EUR' });
  assert.deepEqual(salaryRange('Competitive'), { min: null, max: null, currency: null });
});

test('provider listing URLs are restricted to HTTPS and their source domain', () => {
  assert.equal(safeListingUrl('https://remoteok.com/jobs/123', 'remoteok.com'), 'https://remoteok.com/jobs/123');
  assert.equal(safeListingUrl('http://remoteok.com/jobs/123', 'remoteok.com'), null);
  assert.equal(safeListingUrl('https://evil.example/jobs/123', 'remoteok.com'), null);
});

test('RemoteOK and Remotive records normalize source links and required fields', () => {
  const remoteOk = normalizeRemoteOk({
    id: 123, position: 'TypeScript Engineer', company: 'Example',
    url: 'https://remoteok.com/remote-jobs/123', salary_min: 80000, salary_max: 100000,
    tags: ['typescript', 'react'], description: '<p>Build web apps</p>',
  });
  assert.ok(remoteOk);
  assert.equal(remoteOk.source, 'RemoteOK');
  assert.equal(remoteOk.salaryMin, 80000);
  assert.deepEqual(remoteOk.tags, ['typescript', 'react']);

  const remotive = normalizeRemotive({
    id: 456, title: 'Technical Writer', company_name: 'Docs Co',
    url: 'https://remotive.com/remote-jobs/writing/technical-writer-456',
    description: '<p>Write developer docs</p>', salary: '$50k - $70k',
    category: 'Writing', tags: ['documentation'],
  });
  assert.ok(remotive);
  assert.equal(remotive.salaryMin, 50000);
  assert.equal(remotive.salaryMax, 70000);
  assert.equal(classifyOpportunityType(remotive), 'technical_content');
});

test('provider classifier defaults ambiguous roles to remote jobs', () => {
  const job = normalizeRemoteOk({
    id: 99, position: 'Software Engineer', company: 'Example',
    url: 'https://remoteok.com/remote-jobs/99', tags: ['typescript'],
  });
  assert.ok(job);
  assert.equal(classifyOpportunityType(job), 'remote_job');
});
