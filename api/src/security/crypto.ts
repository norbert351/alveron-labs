import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.ts';

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * The key comes from ENCRYPTION_KEY (32 random bytes, base64).
 * Production refuses to persist tokens without a configured key.
 */

export function encryptionReady(): boolean {
  return Boolean(config.encryptionKey);
}

function keyBytes(): Buffer {
  const key = config.encryptionKey;
  if (!key) {
    throw new Error('ENCRYPTION_KEY is not configured. Refusing to store OAuth tokens without encryption at rest.');
  }
  const buf = Buffer.from(key, 'base64');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes base64-encoded, got ${buf.length} bytes`);
  }
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  const key = keyBytes();
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported encrypted payload format');
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function encryptForTest(plaintext: string): string {
  return encryptSecret(plaintext);
}

/** Constant-time comparison helper */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
