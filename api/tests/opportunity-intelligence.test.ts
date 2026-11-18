import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessOpportunityQuality, buildApplicationDraft, calculateOpportunityPriority, calculateOutcomeAdjustment } from '../src/opportunities/intelligence.ts';

const now = new Date('2026-11-09T10:00:00.000Z');
const base = {
  title: 'TypeScript Developer',
  organization_name: 'Example Studio',
  source_url: 'https://example.com/jobs/1',
  description: 'Build and maintain a TypeScript application with a small distributed engineering team.',
  evidence: [{ url: 'https://example.com/jobs/1', text: 'The company is hiring a TypeScript developer for a remote role.' }],
  compensation_min: 1200,
  compensation_currency: 'USD',
  deadline_at: '2026-11-20T00:00:00.000Z',
  discovered_at: '2026-11-08T10:00:00.000Z',
};

test('quality assessment rewards complete, fresh evidence without claiming external verification', () => {
  const quality = assessOpportunityQuality(base, now);
  assert.equal(quality.score, 100);
  assert.equal(quality.band, 'promising');
  assert.equal(quality.checks.length, 7);
});

test('quality assessment flags expired deadlines, stale listings and missing evidence', () => {
  const quality = assessOpportunityQuality({
    ...base,
    evidence: [],
    deadline_at: '2026-11-01T00:00:00.000Z',
    discovered_at: '2026-10-01T00:00:00.000Z',
  }, now);
  assert.equal(quality.band, 'needs_review');
  assert.ok(quality.blockers.some((item) => item.includes('deadline')));
  assert.ok(quality.blockers.some((item) => item.includes('evidence')));
});

test('priority ranking balances fit, quality, freshness and deadline urgency', () => {
  const urgent = calculateOpportunityPriority({ fitScore: 80, qualityScore: 90, deadlineAt: '2026-11-10T10:00:00.000Z', discoveredAt: '2026-11-08T10:00:00.000Z' }, now);
  const stale = calculateOpportunityPriority({ fitScore: 80, qualityScore: 90, discoveredAt: '2026-09-01T10:00:00.000Z' }, now);
  assert.ok(urgent > stale);
  assert.equal(calculateOpportunityPriority({ fitScore: 100, qualityScore: 100, deadlineAt: '2026-11-01T00:00:00.000Z' }, now), 0);
});

test('application draft uses only profile skills and marks missing skills', () => {
  const draft = buildApplicationDraft({ ...base, required_skills: ['TypeScript', 'React', 'Docker'] }, {
    display_name: 'Candidate',
    skills: ['TypeScript', 'React'],
    experience: { summary: 'I have built frontend applications.' },
  });
  assert.deepEqual(draft.matched_skills, ['TypeScript', 'React']);
  assert.deepEqual(draft.missing_skills, ['Docker']);
  assert.ok(draft.body.includes('I have built frontend applications.'));
  assert.ok(draft.disclaimer.includes('submit manually'));
});

test('outcome feedback stays neutral until enough outcomes exist and is bounded afterward', () => {
  assert.deepEqual(calculateOutcomeAdjustment(['interview', 'won']), { adjustment: 0, sample_size: 2, confidence: 'insufficient' });
  const positive = calculateOutcomeAdjustment(['response_received', 'interview', 'offer', 'won']);
  const negative = calculateOutcomeAdjustment(['rejected', 'no_response', 'lost']);
  assert.ok(positive.adjustment > 0);
  assert.ok(negative.adjustment < 0);
  assert.ok(positive.adjustment <= 8);
});
