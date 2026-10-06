import { config } from '../config.ts';
import { sleep } from '../util/concurrency.ts';
import type { DiscoveredBusiness, DiscoveryQuery, DiscoveryProvider, ResolvedLocation } from './types.ts';
import { filtersForIndustry } from './industryTaxonomy.ts';

/**
 * OpenStreetMap Overpass discovery provider.
 *
 * Real, credential-free, globally usable. Businesses are sourced from the
 * public OpenStreetMap database (ODbL) via the Overpass API, geocoded with
 * Nominatim. No API key required — so V1 discovery genuinely works without
 * pretending a paid provider is wired up.
 */

const UA = `AlveronLabsResearch/1.0 (${config.discovery.contactEmail})`;

/** Nominatim geocoding with in-process cache. */
const geoCache = new Map<string, ResolvedLocation>();

export function isAny(v?: string): boolean {
  if (!v) return true;
  const s = v.toLowerCase().trim();
  return s === '' || s === 'any' || s === '*' || s === 'worldwide' || s === 'global';
}

export function buildLocationQuery(q: DiscoveryQuery): string {
  return [q.city, q.region, q.country].map((s) => (s || '').trim()).filter((s) => s && !isAny(s)).join(', ');
}

async function nominatimSearch(query: string): Promise<any[]> {
  const url = new URL('/search', config.discovery.nominatimUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url.href, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return (await res.json()) as any[];
  } finally {
    clearTimeout(timer);
  }
}

export async function geocode(query: string): Promise<ResolvedLocation> {
  const cached = geoCache.get(query);
  if (cached) return cached;
  const rows = await nominatimSearch(query);
  if (!rows || rows.length === 0) throw new Error(`No location found for "${query}"`);
  const r = rows[0];
  const addr = r.address || {};
  const loc: ResolvedLocation = {
    query,
    display_name: r.display_name || query,
    country: addr.country,
    region: addr.state || addr.region || addr.county,
    city: addr.city || addr.town || addr.village || addr.municipality || addr.city_district,
    boundingbox: (r.boundingbox || ['-1', '1', '-1', '1']) as [string, string, string, string],
    latitude: Number(r.lat),
    longitude: Number(r.lon),
  };
  geoCache.set(query, loc);
  return loc;
}

/**
 * Global sampling metros used when no country/region/city is supplied
 * (Country = Any, Region = Any). Real geographic sampling — never fabricated.
 */
export const GLOBAL_SAMPLE_METROS: string[] = [
  'New York, United States',
  'Los Angeles, United States',
  'Toronto, Canada',
  'Mexico City, Mexico',
  'São Paulo, Brazil',
  'London, United Kingdom',
  'Berlin, Germany',
  'Madrid, Spain',
  'Paris, France',
  'Amsterdam, Netherlands',
  'Lagos, Nigeria',
  'Nairobi, Kenya',
  'Cape Town, South Africa',
  'Cairo, Egypt',
  'Dubai, United Arab Emirates',
  'Mumbai, India',
  'Singapore',
  'Jakarta, Indonesia',
  'Bangkok, Thailand',
  'Tokyo, Japan',
  'Seoul, South Korea',
  'Sydney, Australia',
  'Auckland, New Zealand',
];

function websiteOf(tags: Record<string, any>): string | undefined {
  const raw = tags.website || tags['contact:website'] || tags.url || tags['contact:url'];
  if (!raw || typeof raw !== 'string') return undefined;
  return raw.trim();
}

function toBusiness(el: any): DiscoveredBusiness | null {
  const tags: Record<string, any> = el.tags || {};
  const name = (tags.name || tags['name:en'] || '').trim();
  if (!name) return null;
  const website = websiteOf(tags);
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const externalId = `${el.type}/${el.id}`;
  return {
    provider: 'overpass',
    external_id: externalId,
    name,
    website,
    country: tags['addr:country'],
    region: tags['addr:state'] || tags['addr:province'],
    city: tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'],
    latitude: typeof lat === 'number' ? lat : undefined,
    longitude: typeof lon === 'number' ? lon : undefined,
    raw: tags,
  };
}

async function runOverpass(query: string): Promise<any> {
  // Fall back across public Overpass mirrors (transient 5xx/504 are common on
  // the public API). Preserves the raw outcome if all mirrors fail.
  let lastErr: Error | null = null;
  for (const mirror of [config.discovery.overpassUrl, 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.discovery.timeoutMs);
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({ data: query }).toString(),
          signal: controller.signal,
        });
        if (res.status === 504 || res.status >= 500 || res.status === 429) {
          const body = await res.text().catch(() => '');
          lastErr = new Error(`Overpass ${mirror} HTTP ${res.status}: ${body.slice(0, 200)}`);
          await sleep(1500 * attempt);
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Overpass ${mirror} HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
        return await res.json();
      } catch (err: any) {
        const aborted = err?.name === 'AbortError' || /abort|timeout/i.test(err?.message || '');
        lastErr = err;
        if (aborted) await sleep(1200 * attempt);
        // otherwise continue to next mirror
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr || new Error('Overpass request failed');
}

/** Build the Overpass QL for one bbox + filter set. */
export function buildOverpassQL(opts: {
  bbox: [string, string, string, string];
  filters: string[];
  websiteRequired: boolean;
  limit: number;
}): string {
  const [s, n, w, e] = opts.bbox;
  const bbox = `(${s},${w},${n},${e})`;
  const lines: string[] = [];
  for (const f of opts.filters) {
    if (opts.websiteRequired) {
      lines.push(`  nwr${f}["website"]${bbox};`);
      lines.push(`  nwr${f}["contact:website"]${bbox};`);
    } else {
      lines.push(`  nwr${f}${bbox};`);
    }
  }
  return `[out:json][timeout:${Math.round(config.discovery.timeoutMs / 1000)}];\n(\n${lines.join('\n')}\n);\nout center ${Math.min(opts.limit, config.discovery.maxResults)};`;
}

function dedupe(biz: DiscoveredBusiness[]): DiscoveredBusiness[] {
  const seen = new Set<string>();
  const out: DiscoveredBusiness[] = [];
  for (const b of biz) {
    const key = b.external_id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

export class OverpassDiscoveryProvider implements DiscoveryProvider {
  readonly name = 'overpass';

  supports(_q: DiscoveryQuery): boolean {
    // Geo-based provider: works with any location, including global sampling.
    return true;
  }

  async discover(q: DiscoveryQuery): Promise<DiscoveredBusiness[]> {
    const { filters } = filtersForIndustry(q.industry);
    const websiteRequired = q.website_required !== false;
    const limit = Math.max(1, q.limit);

    const locationQuery = buildLocationQuery(q);

    // Global sampling when no geography is specified.
    if (!locationQuery) {
      return this.discoverGlobal(q, filters, websiteRequired, limit);
    }

    const loc = await geocode(locationQuery);
    const raw = await runOverpass(
      buildOverpassQL({ bbox: loc.boundingbox, filters, websiteRequired, limit: Math.min(limit * 3, config.discovery.maxResults) })
    );
    const els = (raw?.elements || []) as any[];
    const biz = els
      .map(toBusiness)
      .filter((b): b is DiscoveredBusiness => Boolean(b))
      .map((b) => ({
        ...b,
        country: b.country || loc.country,
        region: b.region || loc.region,
        city: b.city || loc.city,
      }));
    return dedupe(biz).slice(0, limit);
  }

  private async discoverGlobal(
    q: DiscoveryQuery,
    filters: string[],
    websiteRequired: boolean,
    limit: number
  ): Promise<DiscoveredBusiness[]> {
    const metroCount = Math.min(GLOBAL_SAMPLE_METROS.length, Math.max(3, Math.ceil(limit / 6)));
    const perMetro = Math.max(2, Math.ceil(limit / metroCount));
    const out: DiscoveredBusiness[] = [];
    let idx = 0;
    // Deterministic rotation seeded by the industry so repeated calls vary coverage.
    const offset = (q.industry || '').length % GLOBAL_SAMPLE_METROS.length;
    for (let i = 0; i < metroCount && out.length < limit; i++) {
      const metro = GLOBAL_SAMPLE_METROS[(idx + i + offset) % GLOBAL_SAMPLE_METROS.length];
      try {
        const loc = await geocode(metro);
        const raw = await runOverpass(
          buildOverpassQL({ bbox: loc.boundingbox, filters, websiteRequired, limit: perMetro * 3 })
        );
        for (const el of (raw?.elements || []) as any[]) {
          const b = toBusiness(el);
          if (b) out.push({ ...b, country: b.country || loc.country, region: b.region || loc.region, city: b.city || loc.city });
        }
      } catch {
        /* a single metro failing must not abort the global sample */
      }
    }
    return dedupe(out).slice(0, limit);
  }
}

export const overpassProvider = new OverpassDiscoveryProvider();
