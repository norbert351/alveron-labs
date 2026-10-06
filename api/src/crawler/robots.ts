import { assertSafeUrl } from '../ssrf.ts';

/**
 * robots.txt parsing + enforcement (spec sections 7, 29).
 *
 * We crawl as a clearly-identified research bot. Only path rules for our
 * user-agent (or `*`) are enforced. Missing robots.txt = allowed.
 */

export interface RobotsRules {
  fetched: boolean;
  allowedAll: boolean;
  disallowAll: boolean;
  /** [path, allow] pairs, longest-match wins. */
  rules: { path: string; allow: boolean }[];
  sitemaps: string[];
  raw?: string;
}

const EMPTY: RobotsRules = { fetched: false, allowedAll: true, disallowAll: false, rules: [], sitemaps: [] };

export function parseRobots(txt: string, userAgent: string): RobotsRules {
  const lines = txt.split(/\r?\n/);
  const groups: { agents: string[]; rules: { path: string; allow: boolean }[] }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; rules: { path: string; allow: boolean }[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if ((field === 'disallow' || field === 'allow') && current) {
      current.rules.push({ path: value, allow: field === 'allow' });
    }
  }

  const ua = userAgent.toLowerCase();
  const exact = groups.filter((g) => g.agents.some((a) => a !== '*' && (ua.includes(a) || a.includes(ua.split('/')[0]))));
  const wildcard = groups.filter((g) => g.agents.includes('*'));
  const chosen = exact.length > 0 ? exact : wildcard;
  const rules = chosen.flatMap((g) => g.rules);

  const disallowAll = rules.some((r) => !r.allow && r.path === '/');
  return {
    fetched: true,
    allowedAll: rules.length === 0,
    disallowAll,
    rules,
    sitemaps,
    raw: txt.slice(0, 20000),
  };
}

/** Longest-match path rule (Google's documented semantics). */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  if (!rules.fetched) return true;
  if (rules.allowedAll) return true;
  if (rules.disallowAll) return false;
  let best: { len: number; allow: boolean } | null = null;
  for (const r of rules.rules) {
    if (r.path === '') continue;
    const pattern = r.path.replace(/\*$/, '');
    if (path.startsWith(pattern)) {
      const len = pattern.length;
      if (!best || len > best.len) best = { len, allow: r.allow };
    }
  }
  return best ? best.allow : true;
}

export async function fetchRobots(origin: string, userAgent: string, timeoutMs = 10000): Promise<RobotsRules> {
  const url = new URL('/robots.txt', origin).href;
  try {
    await assertSafeUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'text/plain' },
        signal: controller.signal,
      });
      if (!res.ok) return { ...EMPTY, fetched: false };
      const txt = (await res.text()).slice(0, 200000);
      return parseRobots(txt, userAgent);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Unreachable robots.txt is treated as "no rules" but recorded as not fetched.
    return EMPTY;
  }
}

export { EMPTY as EMPTY_ROBOTS };
