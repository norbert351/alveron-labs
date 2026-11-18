import { pool } from '../db.ts';
import { assertSafeUrl } from '../ssrf.ts';

type FindingInput = {
  category: 'company_signal' | 'customer_pain' | 'technical_signal' | 'technology_signal';
  source: string;
  url: string;
  title: string;
  summary: string;
  publishedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type SourceRun = { source: string; status: 'completed' | 'partial' | 'failed' | 'skipped'; fetched: number; stored: number; error?: string };

const timeoutMs = Math.max(5000, Number(process.env.ALVERON_INTELLIGENCE_TIMEOUT_MS || 18000));
const userAgent = 'AlveronLabsResearch/1.0 (+https://github.com/norbert351/alveron-labs)';
const maxResults = Math.min(25, Math.max(1, Number(process.env.ALVERON_INTELLIGENCE_MAX_RESULTS || 10)));

function clean(value: unknown, max = 4000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': userAgent, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function saveFinding(companyId: number, finding: FindingInput): Promise<boolean> {
  const url = safeUrl(finding.url);
  const title = clean(finding.title, 500);
  const summary = clean(finding.summary, 6000);
  if (!url || !title || !summary) return false;
  const result = await pool.query(
    `INSERT INTO company_intelligence_findings
      (company_id, category, source_name, source_url, title, evidence_text, published_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     ON CONFLICT (company_id, source_name, source_url) DO NOTHING
     RETURNING id`,
    [companyId, finding.category, finding.source.slice(0, 120), url, title, summary,
      finding.publishedAt && !Number.isNaN(Date.parse(finding.publishedAt)) ? new Date(finding.publishedAt).toISOString() : null,
      JSON.stringify(finding.metadata || {})]
  );
  return Boolean(result.rowCount);
}

async function runSource(companyId: number, source: string, fn: () => Promise<FindingInput[]>): Promise<SourceRun> {
  try {
    const findings = await fn();
    let stored = 0;
    for (const finding of findings.slice(0, maxResults * 4)) {
      if (await saveFinding(companyId, finding)) stored++;
    }
    return { source, status: 'completed', fetched: findings.length, stored };
  } catch (error) {
    return { source, status: 'failed', fetched: 0, stored: 0, error: error instanceof Error ? error.message.slice(0, 300) : 'Unknown source error' };
  }
}

function searxngEndpoint(): string | null {
  const raw = process.env.ALVERON_SEARXNG_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}

async function searchWeb(query: string, category: FindingInput['category'], sourceLabel: string): Promise<FindingInput[]> {
  const base = searxngEndpoint();
  if (!base) return [];
  const url = new URL(base + '/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');
  const data = await getJson(url.toString());
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.slice(0, maxResults).map((item: any) => ({
    category,
    source: sourceLabel,
    url: item.url,
    title: clean(item.title, 500),
    summary: clean(item.content || item.title, 4000),
    publishedAt: item.publishedDate || null,
    metadata: { engine: item.engine || null, engines: item.engines || [], query },
  })).filter((item: FindingInput) => Boolean(safeUrl(item.url) && item.title && item.summary));
}

async function discoverCompanySignals(company: { id: number; name: string; website: string }): Promise<FindingInput[]> {
  const searches = [
    { q: `"${company.name}" startup launch founder product`, label: 'SearXNG / startup discovery' },
    { q: `"${company.name}" funding investment expansion hiring`, label: 'SearXNG / growth signals' },
    { q: `site:ycombinator.com/companies "${company.name}"`, label: 'SearXNG / YC directory' },
    { q: `site:producthunt.com/products "${company.name}"`, label: 'SearXNG / Product Hunt index' },
    { q: `site:crunchbase.com/organization "${company.name}"`, label: 'SearXNG / Crunchbase index' },
    { q: `site:wellfound.com/company "${company.name}"`, label: 'SearXNG / Wellfound index' },
  ];
  const results = await Promise.all(searches.map((item) => searchWeb(item.q, 'company_signal', item.label)));
  return results.flat();
}

async function discoverCustomerPain(company: { name: string; website: string }): Promise<FindingInput[]> {
  const host = new URL(company.website).hostname.replace(/^www\./, '');
  const searches = [
    { q: `site:reddit.com "${company.name}" OR "${host}" (problem OR issue OR complaint OR alternative)`, label: 'SearXNG / Reddit complaints' },
    { q: `site:g2.com/products "${company.name}" reviews problems`, label: 'SearXNG / G2 reviews' },
    { q: `site:capterra.com "${company.name}" reviews complaints`, label: 'SearXNG / Capterra reviews' },
    { q: `site:trustpilot.com/review "${host}"`, label: 'SearXNG / Trustpilot reviews' },
  ];
  const results = await Promise.all(searches.map((item) => searchWeb(item.q, 'customer_pain', item.label)));
  return results.flat();
}

async function discoverTechnicalSignals(company: { name: string; website: string }): Promise<FindingInput[]> {
  const host = new URL(company.website).hostname.replace(/^www\./, '');
  const findings: FindingInput[] = [];
  const githubQuery = encodeURIComponent(`"${company.name}" OR "${host}"`);
  const github = await getJson(`https://api.github.com/search/issues?q=${githubQuery}+is:issue&sort=updated&order=desc&per_page=${maxResults}`, {
    Accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}),
    'X-GitHub-Api-Version': '2022-11-28',
  });
  for (const item of (Array.isArray(github?.items) ? github.items : [])) {
    findings.push({
      category: 'technical_signal', source: 'GitHub public issues', url: item.html_url,
      title: clean(item.title, 500), summary: clean(item.body || item.title, 4000),
      publishedAt: item.updated_at || item.created_at,
      metadata: { state: item.state, comments: item.comments, repository_url: item.repository_url, labels: (item.labels || []).map((label: any) => label.name) },
    });
  }
  const hnUrl = new URL('https://hn.algolia.com/api/v1/search_by_date');
  hnUrl.searchParams.set('query', company.name);
  hnUrl.searchParams.set('tags', 'story,comment');
  hnUrl.searchParams.set('hitsPerPage', String(maxResults));
  const hn = await getJson(hnUrl.toString());
  for (const item of (Array.isArray(hn?.hits) ? hn.hits : [])) {
    const id = String(item.objectID || '');
    if (!id) continue;
    findings.push({
      category: 'technical_signal', source: 'Hacker News public API',
      url: 'https://news.ycombinator.com/item?id=' + encodeURIComponent(id),
      title: clean(item.story_title || item.title || 'Hacker News discussion', 500),
      summary: clean(item.comment_text || item.story_text || item.title, 4000),
      publishedAt: item.created_at || null,
      metadata: { author: item.author || null, points: item.points || null, num_comments: item.num_comments || null },
    });
  }
  return findings;
}

async function detectTechnologies(companyId: number, website: string): Promise<FindingInput[]> {
  await assertSafeUrl(website);
  const response = await fetch(website, {
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Company website returned HTTP ' + response.status);
  const html = (await response.text()).slice(0, 2_000_000);
  const headers = Object.fromEntries(response.headers.entries());
  const signatures: Array<[string, RegExp]> = [
    ['Next.js', /__NEXT_DATA__|_next\/static/i], ['React', /react(?:\.production)?\.min\.js|data-reactroot/i],
    ['Vue', /__VUE__|vue(?:\.runtime)?\.min\.js/i], ['Angular', /ng-version=/i],
    ['WordPress', /wp-content|wp-includes/i], ['Shopify', /cdn\.shopify\.com|Shopify\.theme/i],
    ['Webflow', /webflow\.js|data-wf-page/i], ['Cloudflare', /cf-ray|cloudflare/i],
    ['Google Analytics', /googletagmanager\.com|google-analytics\.com/i],
    ['HubSpot', /js\.hs-scripts\.com|hubspot/i], ['Intercom', /widget\.intercom\.io/i],
    ['Stripe', /js\.stripe\.com/i],
  ];
  const found = signatures.filter(([, pattern]) => pattern.test(html) || pattern.test(JSON.stringify(headers))).map(([name]) => name);
  const server = headers.server || null;
  const poweredBy = headers['x-powered-by'] || null;
  return [{
    category: 'technology_signal', source: 'Alveron open technology fingerprint',
    url: website, title: 'Public website technology fingerprint',
    summary: 'Detected technologies: ' + (found.length ? found.join(', ') : 'No known signatures detected') +
      (server ? '. Server header: ' + server : '') + (poweredBy ? '. X-Powered-By: ' + poweredBy : ''),
    metadata: { technologies: found, server, powered_by: poweredBy, method: 'public_html_and_headers', confidence: 'indicative_only' },
  }];
}

export async function runCompanyIntelligence(companyId: number) {
  const companyResult = await pool.query('SELECT id, name, website FROM companies WHERE id = $1 LIMIT 1', [companyId]);
  if (!companyResult.rowCount) throw new Error('Company not found');
  const company = companyResult.rows[0] as { id: number; name: string; website: string };
  const runs: SourceRun[] = [];
  const base = searxngEndpoint();
  if (base) {
    runs.push(await runSource(companyId, 'Company and startup discovery', () => discoverCompanySignals(company)));
    runs.push(await runSource(companyId, 'Customer complaints and reviews', () => discoverCustomerPain(company)));
  } else {
    runs.push({ source: 'SearXNG web research', status: 'skipped', fetched: 0, stored: 0, error: 'Set ALVERON_SEARXNG_URL to your self-hosted SearXNG instance' });
  }
  runs.push(await runSource(companyId, 'GitHub and Hacker News technical signals', () => discoverTechnicalSignals(company)));
  runs.push(await runSource(companyId, 'Open technology fingerprint', () => detectTechnologies(companyId, company.website)));
  const counts = runs.reduce((acc, run) => ({ fetched: acc.fetched + run.fetched, stored: acc.stored + run.stored }), { fetched: 0, stored: 0 });
  return { company: { id: company.id, name: company.name, website: company.website }, runs, totals: counts };
}

export async function listCompanyIntelligenceFindings(companyId: number, limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit) || 100));
  const result = await pool.query(
    `SELECT id, category, source_name, source_url, title, evidence_text, published_at, metadata, created_at
     FROM company_intelligence_findings WHERE company_id = $1
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT $2`,
    [companyId, safeLimit]
  );
  return result.rows;
}


export async function runAllCompanyIntelligence() {
  const companies = await pool.query(
    `SELECT id FROM companies ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 30`
  );
  const results: Array<{ companyId: number; result?: Awaited<ReturnType<typeof runCompanyIntelligence>>; error?: string }> = [];
  for (const row of companies.rows) {
    const companyId = Number(row.id);
    try {
      results.push({ companyId, result: await runCompanyIntelligence(companyId) });
    } catch (error) {
      results.push({ companyId, error: error instanceof Error ? error.message.slice(0, 300) : 'Unknown error' });
    }
  }
  return {
    companies_processed: results.length,
    totals: results.reduce((acc, item) => ({
      fetched: acc.fetched + (item.result?.totals.fetched || 0),
      stored: acc.stored + (item.result?.totals.stored || 0),
    }), { fetched: 0, stored: 0 }),
    results,
  };
}


export async function discoverCompanyCandidates() {
  const base = searxngEndpoint();
  if (!base) return { status: 'skipped' as const, fetched: 0, inserted: 0, error: 'SearXNG is not configured' };
  const searches = [
    { source: 'YC public directory index', query: 'site:ycombinator.com/companies startup company batch' },
    { source: 'Product Hunt public launch index', query: 'site:producthunt.com/products new product launch startup' },
    { source: 'Wellfound public company index', query: 'site:wellfound.com/company startup hiring' },
    { source: 'Crunchbase public company index', query: 'site:crunchbase.com/organization startup funding company' },
  ];
  let fetched = 0;
  let inserted = 0;
  for (const search of searches) {
    try {
      const url = new URL(base + '/search');
      url.searchParams.set('q', search.query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('language', 'en');
      const data = await getJson(url.toString());
      const items = Array.isArray(data?.results) ? data.results.slice(0, maxResults) : [];
      fetched += items.length;
      for (const item of items) {
        const sourceUrl = safeUrl(item.url);
        const title = clean(item.title, 500);
        const evidence = clean(item.content || item.title, 4000);
        if (!sourceUrl || !title || !evidence) continue;
        const result = await pool.query(
          `INSERT INTO company_discovery_candidates (source_name, source_url, title, evidence_text, metadata)
           VALUES ($1,$2,$3,$4,$5::jsonb)
           ON CONFLICT (source_url) DO NOTHING RETURNING id`,
          [search.source, sourceUrl, title, evidence, JSON.stringify({ query: search.query, engine: item.engine || null, engines: item.engines || [] })]
        );
        if (result.rowCount) inserted++;
      }
    } catch {
      // One directory outage must not prevent the remaining discovery sources.
    }
  }
  return { status: 'completed' as const, fetched, inserted };
}

export async function listCompanyDiscoveryCandidates(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit) || 100));
  const result = await pool.query(
    `SELECT id, source_name, source_url, title, evidence_text, status, metadata, discovered_at, reviewed_at
     FROM company_discovery_candidates ORDER BY discovered_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}
