import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priorityFromScore } from '../src/modules/LeadScoring.ts';

test('priority mapping thresholds', () => {
  assert.equal(priorityFromScore(95), 'High');
  assert.equal(priorityFromScore(75), 'High');
  assert.equal(priorityFromScore(74), 'Medium');
  assert.equal(priorityFromScore(50), 'Medium');
  assert.equal(priorityFromScore(49), 'Low');
  assert.equal(priorityFromScore(0), 'Low');
});
