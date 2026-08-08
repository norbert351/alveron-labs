import { lookup } from 'node:dns/promises';

/**
 * SSRF protection for user-submitted website URLs.
 * Rejects private, loopback, link-local, CGNAT, multicast and reserved addresses,
 * including after DNS resolution and across redirect hops.
 */

export function isBlockedIp(ip: string): boolean {
  const clean = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (clean.includes('.')) {
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  const lower = clean.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are allowed');
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('Internal or local hostnames are not allowed');
  }
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error('DNS resolution failed for host');
  }
  if (!addrs || addrs.length === 0) throw new Error('DNS resolution failed for host');
  for (const { address } of addrs) {
    if (isBlockedIp(address)) {
      throw new Error(`Blocked: ${host} resolves to a private or reserved address`);
    }
  }
  return u;
}
