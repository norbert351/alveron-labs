import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const API = 'http://127.0.0.1:3100';
const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const internalToken = envText.match(/^ALVERON_INTERNAL_TOKEN=(.*)$/m)?.[1]?.trim() || '';
const headers = {
  Authorization: 'Bearer ' + internalToken,
  'Content-Type': 'application/json',
};
const externalId = 'ci-' + Date.now();
let createdId: number;

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as any };
}

before(async () => {
  assert.ok(internalToken, 'CI internal token must be configured');
  const health = await fetch(API + '/api/health');
  assert.equal(health.status, 200, 'API must be running against the CI PostgreSQL service');
});

test('opportunity profile can be saved and read', async () => {
  const saved = await request('/api/opportunity-profile', 'PUT', {
    display_name: 'CI test profile',
    skills: ['TypeScript', 'React'],
    experience: { summary: 'Built production web applications', years: 2 },
    preferences: { remoteOnly: true, preferredTypes: ['remote_job'], country: 'Nigeria' },
    constraints: { minimumCompensation: 500, minimumCompensationCurrency: 'USD', allowedCurrencies: ['USD'], blockedTypes: [] },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.profile.skills, ['TypeScript', 'React']);

  const loaded = await request('/api/opportunity-profile');
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.profile.preferences.country, 'Nigeria');
});

test('opportunity records validate, deduplicate, list and update', async () => {
  const payload = {
    opportunity_type: 'remote_job',
    source_name: 'CI Test Feed',
    source_url: 'https://remoteok.com/remote-jobs/' + externalId,
    external_id: externalId,
    title: 'CI Test Opportunity',
    description: 'Build a TypeScript and React application.',
    organization_name: 'CI Test Company',
    location: 'Worldwide',
    is_remote: true,
    compensation_min: 1000,
    compensation_max: 2000,
    compensation_currency: 'USD',
    required_skills: ['TypeScript', 'React'],
    evidence: [{ url: 'https://remoteok.com/remote-jobs/' + externalId, text: 'Original listing' }],
    verification_status: 'partial',
  };

  const created = await request('/api/opportunity-records', 'POST', payload);
  assert.equal(created.status, 201);
  createdId = Number(created.body.opportunity.id);
  assert.ok(createdId > 0);

  const duplicate = await request('/api/opportunity-records', 'POST', payload);
  assert.equal(duplicate.status, 409);

  const listed = await request('/api/opportunity-records?type=remote_job&search=CI%20Test%20Opportunity');
  assert.equal(listed.status, 200);
  assert.ok(listed.body.opportunities.some((item: any) => Number(item.id) === createdId));

  const updated = await request('/api/opportunity-records/' + createdId, 'PATCH', { status: 'qualified' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.opportunity.status, 'qualified');
});

test('matching produces an explainable score and rejects unsafe input', async () => {
  const scored = await request('/api/opportunity-records/' + createdId + '/score', 'POST', {});
  assert.equal(scored.status, 200);
  assert.equal(Number(scored.body.match.score), 100);
  assert.deepEqual(scored.body.match.matched_skills.sort(), ['React', 'TypeScript'].map((s) => s.toLowerCase()).sort());
  assert.equal(scored.body.match.candidate_country, 'Nigeria');

  const unsafe = await request('/api/opportunity-records', 'POST', {
    opportunity_type: 'remote_job',
    source_name: 'Bad Source',
    source_url: 'javascript:alert(1)',
    title: 'Unsafe listing',
  });
  assert.equal(unsafe.status, 400);
});

test('discovery run history endpoint is available', async () => {
  const result = await request('/api/opportunity-discovery/runs?limit=5');
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.runs));
});
