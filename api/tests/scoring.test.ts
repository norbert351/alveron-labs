import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorityFromScore } from '../src/modules/LeadScoring.ts';

test('priority mapping thresholds (calibrated 80/60/40)', () => {
  assert.equal(priorityFromScore(95), 'High');
  assert.equal(priorityFromScore(80), 'High');
  assert.equal(priorityFromScore(79), 'Medium');
  assert.equal(priorityFromScore(60), 'Medium');
  assert.equal(priorityFromScore(59), 'Low');
  assert.equal(priorityFromScore(40), 'Low');
  assert.equal(priorityFromScore(39), 'Poor fit');
  assert.equal(priorityFromScore(0), 'Poor fit');
});
