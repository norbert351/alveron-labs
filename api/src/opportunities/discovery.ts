import { pool } from '../db.ts';

type ProviderJob = {
  id: string;
  title: string;
  company: string | null;
  url: string;
  description: string | null;
  location: string | null;
  employmentType: string | null;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  deadline: string | null;
  publishedAt: string | null;
  tags: string[];
  source: 'RemoteOK' | 'Remotive' | 'Hacker News';
  isRemote: boolean;
  forcedType?: 'remote_job' | 'paid_task' | 'agency_contract' | 'paid_research' | 'technical_content';
  sourceEvidence?: Array<{ url: string; text: string; type: string }>;
};

type ProviderResult = { source: string; status: string; fetched: number; inserted: number; duplicates: number; error?: string; skipped?: boolean };

const TIMEOUT_MS = 18000;
const REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000;

function text(value: unknown, max = 12000): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

export function safeListingUrl(value: unknown, allowedHost: string): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.hostname !== allowedHost && url.hostname !== 'www.' + allowedHost)) return null;
    return url.toString();
  } catch { return null; }
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 80)).filter((item): item is string => Boolean(item)).slice(0, 40);
}

export function salaryRange(value: unknown): { min: number | null; max: number | null; currency: string | null } {
  if (typeof value === 'number' && Number.isFinite(value)) return { min: value, max: value, currency: 'USD' };
  if (typeof value !== 'string') return { min: null, max: null, currency: null };
  const currency = /\bNGN\b|₦/i.test(value) ? 'NGN' : /\bEUR\b|€/i.test(value) ? 'EUR' : /\bGBP\b|£/i.test(value) ? 'GBP' : /\$|\bUSD\b/i.test(value) ? 'USD' : null;
  const numbers = Array.from(value.replace(/,/g, '').matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?(?![a-z])/gi)).map((match) => Number(match[1]) * (match[2]?.toLowerCase() === 'm' ? 1000000 : match[2]?.toLowerCase() === 'k' ? 1000 : 1)).filter(Number.isFinite);
  return { min: numbers.length ? Math.min(...numbers) : null, max: numbers.length ? Math.max(...numbers) : null, currency };
}

export function classifyOpportunityType(job: ProviderJob): 'remote_job' | 'paid_task' | 'agency_contract' | 'paid_research' | 'technical_content' {
  if (job.forcedType) return job.forcedType;
  const title = job.title.toLowerCase();
  const body = (job.description || '').slice(0, 3000).toLowerCase();
  const combined = title + ' ' + body;
  if (/paid research participant|research participant|paid study participant|user research participant/.test(combined)) return 'paid_research';
  if (/technical writer|developer writer|documentation writer|technical content|developer content writer/.test(title)) return 'technical_content';
  if (/white.?label|agency subcontract|subcontractor|agency partner/.test(combined)) return 'agency_contract';
  if (/freelance|short.term contract|one.off project|fixed.scope project|paid task/.test(combined)) return 'paid_task';
  return 'remote_job';
}

export function normalizeRemoteOk(raw: any): ProviderJob | null {
  const url = safeListingUrl(raw?.url, 'remoteok.com');
  const id = raw?.id == null ? null : String(raw.id);
  const title = text(raw?.position, 300);
  if (!url || !id || !title) return null;
  const salaryMin = Number(raw.salary_min);
  const salaryMax = Number(raw.salary_max);
  const salary = salaryMin > 0 || salaryMax > 0 ? String(raw.salary || '') : null;
  return {
    id, title, company: text(raw.company, 240), url,
    description: text(raw.description), location: text(raw.location, 240),
    employmentType: text(raw.job_type, 80), salary,
    salaryMin: Number.isFinite(salaryMin) && salaryMin > 0 ? salaryMin : null,
    salaryMax: Number.isFinite(salaryMax) && salaryMax > 0 ? salaryMax : null,
    currency: salaryMin > 0 || salaryMax > 0 ? 'USD' : null,
    deadline: null, publishedAt: text(raw.date, 80),
    tags: tags(raw.tags), source: 'RemoteOK', isRemote: true,
  };
}

export function normalizeRemotive(raw: any): ProviderJob | null {
  const url = safeListingUrl(raw?.url, 'remotive.com');
  const id = raw?.id == null ? null : String(raw.id);
  const title = text(raw?.title, 300);
  if (!url || !id || !title) return null;
  const salary = salaryRange(raw.salary);
  return {
    id, title, company: text(raw.company_name, 240), url,
    description: text(raw.description), location: text(raw.candidate_required_location, 240),
    employmentType: text(raw.job_type, 80), salary: text(raw.salary, 160),
    salaryMin: salary.min, salaryMax: salary.max, currency: salary.currency,
    deadline: null, publishedAt: text(raw.publication_date, 80),
    tags: [text(raw.category, 80), ...tags(raw.tags)].filter((item): item is string => Boolean(item)),
    source: 'Remotive', isRemote: true,
  };
}


const HN_SKILLS = [
  'TypeScript', 'JavaScript', 'React', 'Next.js', 'Node.js', 'Python',
  'PostgreSQL', 'SQL', 'MySQL', 'Docker', 'AWS', 'Go', 'Rust', 'Java',
  'C#', 'PHP', 'Ruby', 'Kubernetes', 'GraphQL', 'Fastify', 'NestJS',
];

export function normalizeHackerNews(
  raw: any,
  opportunityType: 'paid_task' | 'agency_contract' | 'paid_research' | 'technical_content'
): ProviderJob | null {
  const id = raw?.objectID == null ? null : String(raw.objectID);
  const comment = text(raw?.comment_text, 12000);
  if (!id || !comment) return null;
  const actionSignal = /\b(hiring|looking for|seeking|need(?:s)? a|we need|we are looking|we're looking|paying|budget for|contractor wanted|open role|work with)\b/i.test(comment);
  const categorySignals: Record<typeof opportunityType, RegExp> = {
    paid_task: /\b(freelance|contract|fixed[- ]scope|project[- ]based|paid task|hourly)\b/i,
    agency_contract: /\b(subcontract|white[- ]label|agency partner|overflow work|delivery partner)\b/i,
    paid_research: /\b(paid (?:user )?research|paid (?:user )?study|research participant|user study participant)\b/i,
    technical_content: /\b(technical writer|developer writer|documentation writer|developer docs|technical content)\b/i,
  };
  if (!actionSignal || !categorySignals[opportunityType].test(comment)) return null;
  const url = safeListingUrl('https://news.ycombinator.com/item?id=' + encodeURIComponent(id), 'news.ycombinator.com');
  if (!url) return null;
  const storyTitle = text(raw?.story_title, 180);
  const firstSentence = comment.split(/(?<=[.!?])\s+/)[0]?.slice(0, 150) || comment.slice(0, 150);
  const title = [storyTitle, firstSentence].filter(Boolean).join(' | ').slice(0, 300);
  const lowerComment = comment.toLowerCase();
  const foundSkills = HN_SKILLS.filter((skill) => lowerComment.includes(skill.toLowerCase()));
  const author = text(raw?.author, 120);
  return {
    id, title, company: null, url, description: comment,
    location: null,
    employmentType: /\b(contract|freelance|part.time|full.time)\b/i.test(comment) ? 'contract' : null,
    salary: null, salaryMin: null, salaryMax: null, currency: null,
    deadline: null, publishedAt: text(raw?.created_at, 80),
    tags: foundSkills, source: 'Hacker News',
    isRemote: /\b(remote|worldwide|anywhere|distributed)\b/i.test(comment),
    forcedType: opportunityType,
    sourceEvidence: [{
      url,
      text: 'Hacker News comment by ' + (author || 'unknown author') + (storyTitle ? ' in ' + storyTitle : '') + '. Original comment retained for human review.',
      type: 'community_comment',
    }],
  };
}

async function getJson(url: string, userAgent: string): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': userAgent },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Provider returned HTTP ' + response.status);
  return response.json();
}

async function recentRun(source: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT created_at FROM opportunity_source_runs
     WHERE source_name = $1 AND status IN ('completed','partial')
     ORDER BY created_at DESC LIMIT 1`,
    [source]
  );
  if (!result.rowCount) return false;
  return Date.now() - new Date(result.rows[0].created_at).getTime() < REFRESH_WINDOW_MS;
}

async function ingestProvider(
  source: ProviderJob['source'],
  fetchJobs: () => Promise<ProviderJob[]>,
  opportunityType: 'remote_job' | 'paid_task' | 'agency_contract' | 'paid_research' | 'technical_content' = 'remote_job',
  sourceName = source,
  query: Record<string, unknown> = {}
): Promise<ProviderResult> {
  if (await recentRun(sourceName)) return { source: sourceName, status: 'cached', fetched: 0, inserted: 0, duplicates: 0, skipped: true };
  const run = await pool.query(
    `INSERT INTO opportunity_source_runs (source_name, opportunity_type, query, status, started_at)
     VALUES ($1, $2, $3::jsonb, 'running', now()) RETURNING id`,
    [sourceName, opportunityType, JSON.stringify(query)]
  );
  const runId = Number(run.rows[0].id);
  let fetched = 0;
  let inserted = 0;
  let duplicates = 0;
  try {
    const jobs = await fetchJobs();
    fetched = jobs.length;
    for (const job of jobs) {
      const type = classifyOpportunityType(job);
      const dedupeKey = source.toLowerCase() + ':' + job.id;
      const result = await pool.query(
        `INSERT INTO opportunity_records (
          opportunity_type, source_name, source_url, external_id, dedupe_key,
          title, description, organization_name, location, is_remote, employment_type,
          compensation_min, compensation_max, compensation_currency, required_skills,
          evidence, verification_status, discovered_at, source_run_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,
          $16::jsonb,'partial',COALESCE($17::timestamptz,now()),$18
        ) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [
          type, sourceName, job.url, job.id, dedupeKey, job.title, job.description,
          job.company, job.location, job.isRemote, job.employmentType, job.salaryMin, job.salaryMax,
          job.currency, JSON.stringify(job.tags),
          JSON.stringify(job.sourceEvidence || [{ url: job.url, text: 'Original listing supplied by ' + source, type: 'source_listing' }]),
          isoDate(job.publishedAt), runId,
        ]
      );
      if (result.rowCount) inserted++;
      else duplicates++;
    }
    const status = 'completed';
    await pool.query(
      `UPDATE opportunity_source_runs SET status=$2, discovered_count=$3,
       new_count=$4, duplicate_count=$5, completed_at=now() WHERE id=$1`,
      [runId, status, fetched, inserted, duplicates]
    );
    return { source, status, fetched, inserted, duplicates };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error';
    await pool.query(
      `UPDATE opportunity_source_runs SET status='failed', discovered_count=$2,
       new_count=$3, duplicate_count=$4, error=$5, completed_at=now() WHERE id=$1`,
      [runId, fetched, inserted, duplicates, message.slice(0, 1000)]
    );
    return { source: sourceName, status: 'failed', fetched, inserted, duplicates, error: message };
  }
}

async function importBusinessResearch(): Promise<ProviderResult> {
  const source = 'Alveron Business Research';
  const run = await pool.query(
    `INSERT INTO opportunity_source_runs (source_name, opportunity_type, status, started_at)
     VALUES ($1, 'business_lead', 'running', now()) RETURNING id`,
    [source]
  );
  const runId = Number(run.rows[0].id);
  try {
    const legacy = await pool.query(
      `SELECT ro.id, ro.opportunity_uid, ro.title, ro.description, ro.business_value,
              ro.company_id, c.name AS company_name, c.website
       FROM research_opportunities ro
       JOIN companies c ON c.id = ro.company_id
       WHERE c.website IS NOT NULL AND c.website <> ''
         AND COALESCE(ro.status, 'open') NOT IN ('rejected','closed')`
    );
    let inserted = 0;
    let duplicates = 0;
    for (const row of legacy.rows) {
      let sourceUrl: string;
      try {
        const parsed = new URL(row.website.startsWith('http') ? row.website : 'https://' + row.website);
        if (!['http:', 'https:'].includes(parsed.protocol)) continue;
        sourceUrl = parsed.toString();
      } catch { continue; }
      const externalId = String(row.opportunity_uid || row.id);
      const result = await pool.query(
        `INSERT INTO opportunity_records (
          opportunity_type, source_name, source_url, external_id, dedupe_key,
          title, description, organization_name, company_id, evidence,
          verification_status, status, source_run_id
        ) VALUES ('business_lead',$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'partial','discovered',$10)
        ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [
          source, sourceUrl, externalId, source.toLowerCase() + ':' + externalId,
          text(row.title, 300) || 'Business opportunity for ' + row.company_name,
          text([row.description, row.business_value].filter(Boolean).join('\n\n')),
          row.company_name, row.company_id,
          JSON.stringify([{ url: sourceUrl, text: text(row.description || row.business_value, 1000) || 'Existing Alveron research record', type: 'research_summary' }]),
          runId,
        ]
      );
      if (result.rowCount) inserted++;
      else duplicates++;
    }
    await pool.query(
      `UPDATE opportunity_source_runs SET status='completed', discovered_count=$2,
       new_count=$3, duplicate_count=$4, completed_at=now() WHERE id=$1`,
      [runId, legacy.rowCount, inserted, duplicates]
    );
    return { source, status: 'completed', fetched: legacy.rowCount ?? 0, inserted, duplicates };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown import error';
    await pool.query(
      `UPDATE opportunity_source_runs SET status='failed', error=$2, completed_at=now() WHERE id=$1`,
      [runId, message.slice(0, 1000)]
    );
    return { source, status: 'failed', fetched: 0, inserted: 0, duplicates: 0, error: message };
  }
}

export async function runOpportunityDiscovery() {
  const results: ProviderResult[] = [];
  results.push(await ingestProvider('RemoteOK', async () => {
    const data = await getJson('https://remoteok.com/api', 'AlveronLabsOpportunityResearch/1.0 (+https://github.com/norbert351/alveron-labs)');
    if (!Array.isArray(data)) throw new Error('Unexpected RemoteOK response');
    return data.slice(1).map(normalizeRemoteOk).filter((job): job is ProviderJob => Boolean(job));
  }));
  results.push(await ingestProvider('Remotive', async () => {
    const data = await getJson('https://remotive.com/api/remote-jobs?limit=100', 'AlveronLabsOpportunityResearch/1.0 (+https://github.com/norbert351/alveron-labs)');
    if (!Array.isArray(data?.jobs)) throw new Error('Unexpected Remotive response');
    const jobs = data.jobs as unknown[];
    return jobs.map((raw) => normalizeRemotive(raw)).filter((job): job is ProviderJob => Boolean(job));
  }));
  const hnSince = Math.floor((Date.now() - 45 * 24 * 60 * 60 * 1000) / 1000);
  const hnQueries: Array<{ type: 'paid_task' | 'agency_contract' | 'paid_research' | 'technical_content'; query: string }> = [
    { type: 'paid_task', query: 'freelance developer contract' },
    { type: 'agency_contract', query: 'agency subcontract white label' },
    { type: 'paid_research', query: 'paid research participant user study' },
    { type: 'technical_content', query: 'technical writer developer documentation contract' },
  ];
  for (const item of hnQueries) {
    const sourceName = 'Hacker News / ' + item.type;
    results.push(await ingestProvider('Hacker News', async () => {
      const params = new URLSearchParams({
        query: item.query,
        tags: 'comment',
        numericFilters: 'created_at_i>' + hnSince,
        hitsPerPage: '50',
        page: '0',
      });
      const data = await getJson('https://hn.algolia.com/api/v1/search_by_date?' + params.toString(), 'AlveronLabsOpportunityResearch/1.0 (+https://github.com/norbert351/alveron-labs)');
      if (!Array.isArray(data?.hits)) throw new Error('Unexpected Hacker News Search response');
      const hits = data.hits as unknown[];
      return hits.map((raw) => normalizeHackerNews(raw, item.type)).filter((job): job is ProviderJob => Boolean(job));
    }, item.type, sourceName, { query: item.query, window_days: 45 }));
  }
  results.push(await importBusinessResearch());
  const totals = results.reduce((acc, item) => ({
    fetched: acc.fetched + item.fetched,
    inserted: acc.inserted + item.inserted,
    duplicates: acc.duplicates + item.duplicates,
  }), { fetched: 0, inserted: 0, duplicates: 0 });
  return { results, totals };
}

export async function listOpportunitySourceRuns(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 20));
  const result = await pool.query(
    `SELECT id, source_name, opportunity_type, status, query, discovered_count,
            new_count, duplicate_count, error, started_at, completed_at, created_at
     FROM opportunity_source_runs ORDER BY created_at DESC LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}
