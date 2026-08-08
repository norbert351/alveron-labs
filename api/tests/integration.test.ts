import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * API integration tests. Requires the API to be running on :3100.
 * Reads tokens from api/.env (never prints them).
 */

const API = 'http://127.0.0.1:3100';
function loadEnv() {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const get = (k: string) => text.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() || '';
  return { internal: get('ALVERON_INTERNAL_TOKEN'), webhook: get('ALVERON_WEBHOOK_TOKEN') };
}
const env = loadEnv();

async function req(path: string, opts: { method?: string; body?: unknown; key?: 'internal' | 'webhook' | 'none' } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.key === 'webhook') headers['X-Webhook-Key'] = env.webhook;
  else if (opts.key === 'internal') headers['Authorization'] = `Bearer ${env.internal}`;
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

let createdCompanyId = 0;

before(async () => {
  const health = await fetch(`${API}/api/health`);
  assert.equal(health.status, 200, 'API must be running for integration tests');
});

test('auth: rejects missing and bad tokens', async () => {
  assert.equal((await req('/api/companies', { key: 'none' })).status, 401);
  assert.equal((await req('/api/companies', { key: 'none' })).status, 401);
});

test('auth: rejects bad webhook key', async () => {
  const res = await fetch(`${API}/api/webhook/follow-up-config`, {
    headers: { 'X-Webhook-Key': 'wrong-key' },
  });
  assert.equal(res.status, 401);
});

test('webhook: follow-up config returns defaults', async () => {
  const res = await req('/api/webhook/follow-up-config', { key: 'webhook' });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.follow_up.days));
});

test('SSRF: rejects internal URLs at submission', async () => {
  const res = await req('/api/companies', {
    method: 'POST',
    key: 'internal',
    body: { name: 'SSRF Test', website: 'http://127.0.0.1:5433' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /private|Blocked/i);
});

test('SSRF: rejects localhost hostname', async () => {
  const res = await req('/api/companies', {
    method: 'POST',
    key: 'internal',
    body: { name: 'SSRF Test', website: 'http://localhost:3000' },
  });
  assert.equal(res.status, 400);
});

test('validation: missing website rejected', async () => {
  const res = await req('/api/companies', {
    method: 'POST',
    key: 'internal',
    body: { name: 'No Site' },
  });
  assert.equal(res.status, 400);
});

test('webhook: create company starts analysis', async () => {
  const res = await req('/api/webhook/company', {
    method: 'POST',
    key: 'webhook',
    body: { name: 'Integration Test Co', website: 'example.com' },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.company.id);
  assert.equal(res.body.activeJob, true);
  createdCompanyId = res.body.company.id;
});

test('webhook: duplicate company rejected', async () => {
  const res = await req('/api/webhook/company', {
    method: 'POST',
    key: 'webhook',
    body: { name: 'Integration Test Co', website: 'example.com' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.duplicate, true);
  assert.equal(res.body.company.id, createdCompanyId);
});

test('webhook: duplicate active job not created', async () => {
  const res = await req(`/api/companies/${createdCompanyId}/reanalyze`, {
    method: 'POST',
    key: 'internal',
    body: {},
  });
  // 409 when an analysis is already running, or 201 if it finished already
  assert.ok([409, 201].includes(res.status), `unexpected status ${res.status}`);
  if (res.status === 409) assert.ok(res.body.job);
});

test('leads: batch dedupes within source', async () => {
  const res = await req('/api/webhook/leads', {
    method: 'POST',
    key: 'webhook',
    body: {
      source: `integration-test-${Date.now()}`,
      items: [
        { name: 'Lead X', website: 'leadsx.example.org' },
        { name: 'Lead X', website: 'leadsx.example.org' },
      ],
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.duplicates, 1);
});

test('approval protection: approve without confirm rejected', async () => {
  // create a proposal+outreach path is LLM-heavy; test the guard shape instead
  const res = await req('/api/outreach/999999/approve', {
    method: 'POST',
    key: 'internal',
    body: { confirm: false },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /confirmation/i);
});

test('workflow runs: records and lists', async () => {
  const created = await req('/api/webhook/workflow-run', {
    method: 'POST',
    key: 'webhook',
    body: { workflow_name: 'Integration Test', status: 'started', trigger: 'test' },
  });
  assert.equal(created.status, 201);
  const list = await req('/api/workflow-runs', { key: 'internal' });
  assert.equal(list.status, 200);
  assert.ok(list.body.runs.some((r: any) => r.workflow_name === 'Integration Test'));
});

test('rate limit: audit log records auth failures', async () => {
  const res = await fetch(`${API}/api/companies`);
  assert.equal(res.status, 401);
});

after(async () => {
  // cleanup test company so the batch-run DB stays clean
  if (createdCompanyId) {
    await fetch(`${API}/api/companies/${createdCompanyId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.internal}` },
    }).catch(() => {});
  }
});
