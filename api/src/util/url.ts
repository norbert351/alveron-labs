/** Shared URL / domain normalization. Used by discovery, crawler and dedupe. */

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid', 'ref', 'referrer', 'mc_cid', 'mc_eid',
];

/** Add a scheme if missing and return a normalized absolute URL, or null. */
export function normalizeUrl(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    u.hash = '';
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    // Strip a trailing slash on the root path for canonical comparison.
    if (u.pathname === '/') return `${u.protocol}//${u.host}`;
    return u.href;
  } catch {
    return null;
  }
}

/** Registrable-ish domain (lower-cased host without a leading www.). */
export function domainOf(raw: string): string | null {
  const n = normalizeUrl(raw);
  if (!n) return null;
  try {
    const host = new URL(n).hostname.toLowerCase().replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

/** Stable dedupe key for a business: prefer domain, fall back to normalized name+city. */
export function businessDedupeKey(input: { website?: string; name?: string; city?: string; external_id?: string }): string {
  const d = input.website ? domainOf(input.website) : null;
  if (d) return `domain:${d}`;
  const nm = (input.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const city = (input.city || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (nm) return `name:${nm}|${city}`;
  return `ext:${input.external_id || 'unknown'}`;
}

const BAD_HOSTS = new Set(['localhost', 'example.com', 'example.org', 'test.com', 'domain.com']);
const SOCIAL_HOSTS = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'linktr.ee', 'wa.me', 't.me',
];

/** True when the URL looks like a real business website (not a social/profile page). */
export function isLikelyBusinessWebsite(raw: string): boolean {
  const d = domainOf(raw);
  if (!d) return false;
  if (BAD_HOSTS.has(d)) return false;
  if (SOCIAL_HOSTS.some((s) => d === s || d.endsWith('.' + s))) return false;
  // Reject known directory / aggregator hosts that do not represent the business.
  const directoryHosts = ['yelp.com', 'tripadvisor.com', 'opentable.com', 'doordash.com', 'ubereats.com', 'grubhub.com', 'zomato.com', 'just-eat.com', 'booking.com', 'expedia.com', 'agoda.com'];
  if (directoryHosts.some((s) => d === s || d.endsWith('.' + s))) return false;
  return true;
}

/** Same-site check across a domain boundary. */
export function sameSite(a: string, b: string): boolean {
  const da = domainOf(a);
  const db = domainOf(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // Allow www <-> apex and subdomain-of-apex (e.g. shop.example.com vs example.com)
  return da.endsWith('.' + db) || db.endsWith('.' + da);
}
