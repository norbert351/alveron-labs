import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedIp } from '../src/ssrf.ts';

test('blocks loopback IPv4', () => {
  assert.equal(isBlockedIp('127.0.0.1'), true);
  assert.equal(isBlockedIp('127.255.255.255'), true);
});

test('blocks private ranges', () => {
  assert.equal(isBlockedIp('10.0.0.1'), true);
  assert.equal(isBlockedIp('172.16.0.1'), true);
  assert.equal(isBlockedIp('172.31.255.255'), true);
  assert.equal(isBlockedIp('192.168.1.1'), true);
  assert.equal(isBlockedIp('169.254.169.254'), true);
});

test('blocks CGNAT and reserved', () => {
  assert.equal(isBlockedIp('100.64.0.1'), true);
  assert.equal(isBlockedIp('224.0.0.1'), true);
  assert.equal(isBlockedIp('0.0.0.0'), true);
  assert.equal(isBlockedIp('198.18.0.1'), true);
});

test('allows public IPs', () => {
  assert.equal(isBlockedIp('8.8.8.8'), false);
  assert.equal(isBlockedIp('1.1.1.1'), false);
  assert.equal(isBlockedIp('172.32.0.1'), false);
  assert.equal(isBlockedIp('192.169.1.1'), false);
});

test('blocks IPv6 loopback, ULA, link-local', () => {
  assert.equal(isBlockedIp('::1'), true);
  assert.equal(isBlockedIp('::'), true);
  assert.equal(isBlockedIp('fc00::1'), true);
  assert.equal(isBlockedIp('fd12:3456::1'), true);
  assert.equal(isBlockedIp('fe80::1'), true);
  assert.equal(isBlockedIp('ff02::1'), true);
});

test('blocks IPv4-mapped loopback', () => {
  assert.equal(isBlockedIp('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIp('::ffff:10.0.0.1'), true);
});
