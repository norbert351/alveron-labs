import { createHash } from 'node:crypto';

export function sha256Short(input: string, len = 16): string {
  return createHash('sha256').update(input).digest('hex').slice(0, len);
}

export function stableId(...parts: (string | number | undefined | null)[]): string {
  return sha256Short(parts.map((p) => String(p ?? '')).join('|'), 20);
}
