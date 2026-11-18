import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSourceReachability } from '../src/opportunities/sourceVerification.ts';

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(null, { status, headers });
}

test('source check reports reachable without claiming the listing is open', async () => {
  const result = await checkSourceReachability('https://example.com/job', {
    safeUrl: async (url) => new URL(url),
    fetcher: async () => response(200),
  });
  assert.equal(result.state, 'reachable');
  assert.ok(result.detail.includes('does not prove'));
});

test('source check follows redirects only after validating each destination', async () => {
  const checked: string[] = [];
  let calls = 0;
  const result = await checkSourceReachability('https://example.com/job', {
    safeUrl: async (url) => { checked.push(url); return new URL(url); },
    fetcher: async () => ++calls === 1 ? response(302, { location: 'https://jobs.example.com/current' }) : response(200),
  });
  assert.equal(result.state, 'reachable');
  assert.equal(checked.length, 2);
  assert.equal(calls, 2);
});

test('source check blocks unsafe redirect destinations', async () => {
  const result = await checkSourceReachability('https://example.com/job', {
    safeUrl: async (url) => {
      if (url.includes('127.0.0.1')) throw new Error('Blocked private destination');
      return new URL(url);
    },
    fetcher: async () => response(302, { location: 'http://127.0.0.1/admin' }),
  });
  assert.equal(result.state, 'unsafe');
});

test('source check distinguishes missing listings from inconclusive responses', async () => {
  const missing = await checkSourceReachability('https://example.com/job', { safeUrl: async (url) => new URL(url), fetcher: async () => response(410) });
  const inconclusive = await checkSourceReachability('https://example.com/job', { safeUrl: async (url) => new URL(url), fetcher: async () => response(503) });
  assert.equal(missing.state, 'not_found');
  assert.equal(inconclusive.state, 'inconclusive');
});
