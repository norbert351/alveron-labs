import { randomUUID } from 'node:crypto';
import { pool } from '../db.ts';
import { config } from '../config.ts';
import { log } from '../log.ts';
import { discover } from '../discovery/index.ts';
import { businessDedupeKey, domainOf, isLikelyBusinessWebsite, normalizeUrl } from '../util/url.ts';
import { stableId } from '../util/hash.ts';
import { pMap, withTimeout } from '../util/concurrency.ts';
import { crawlSite, type CrawlResult } from '../crawler/crawler.ts';
import { emptyDom } from '../crawler/dom.ts';
import { extractSignals, type SiteSignals, type DeterministicFinding } from '../signals/extract.ts';
import { detectProblems } from './analyze.ts';
import { deriveOpportunities, scoreOpportunity, recommendServices, type DerivedOpportunity, type ServiceCatalogEntry } from './derive.ts';
import { AiNotConfiguredError, isAiConfigured, aiStatus } from '../ai/groq.ts';
import { validateProblems, type AiProblem } from './schema.ts';

/**
 * Research engine orchestrator (spec sections 20, 21, 22, 24, 25, 26).
 *
 * One run flows: discovery -> validation -> crawl -> signals -> AI problems ->
 * opportunities -> scoring -> service recommendations -> persistence.
 *
 * Every stage is failure-isolated: one bad company never aborts the run.
 */

export interface ResearchRunInput {
  country?: string;
  region?: string;
  city?: string;
  industry?: string;
  language?: string;
  count?: number;
  website_required?: boolean;
  discovery_provider?: string;
  force?: boolean;
}

export interface ResearchRunRow {
  id: number;
  run_id: string;
  country: string | null;
  region: string | null;
  city: string | null;
  industry: string | null;
  language: string | null;
  website_required: boolean;
  requested_count: number;
  provider: string | null;
  status: string;
  statistics: Record<string, number>;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

function clampCount(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 20;
  return Math.max(1, Math.min(200, Math.floor(v)));
}

function cleanStr(v: unknown, max = 120): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export async function createResearchRun(input: ResearchRunInput): Promise<ResearchRunRow> {
  const runId = `run_${new Date().toISOString().slice(0, 10)}_${randomUUID().slice(0, 8)}`;
  const res = await pool.query(
    `INSERT INTO research_runs (run_id, country, region, city, industry, language, website_required, requested_count, provider, status, statistics)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','{}')
     RETURNING *`,
    [
      runId,
      cleanStr(input.country),
      cleanStr(input.region),
      cleanStr(input.city),
      cleanStr(input.industry),
      cleanStr(input.language, 20),
      input.website_required !== false,
      clampCount(input.count),
      cleanStr(input.discovery_provider, 40) || config.discovery.provider,
    ]
  );
  return rowToRun(res.rows[0]);
}

function rowToRun(r: any): ResearchRunRow {
  return {
    id: r.id,
    run_id: r.run_id,
    country: r.country,
    region: r.region,
    city: r.city,
    industry: r.industry,
    language: r.language,
    website_required: r.website_required,
    requested_count: r.requested_count,
    provider: r.provider,
    status: r.status,
    statistics: typeof r.statistics === 'string' ? JSON.parse(r.statistics) : r.statistics || {},
    error: r.error,
    started_at: r.started_at,
    completed_at: r.completed_at,
    created_at: r.created_at,
  };
}

export async function getResearchRun(runId: string): Promise<ResearchRunRow | null> {
  const res = await pool.query(`SELECT * FROM research_runs WHERE run_id = $1`, [runId]);
  return res.rowCount ? rowToRun(res.rows[0]) : null;
}

export async function listResearchRuns(limit = 50) {
  const res = await pool.query(
    `SELECT * FROM research_runs ORDER BY created_at DESC LIMIT $1`,
    [Math.min(200, Math.max(1, limit))]
  );
  return res.rows.map(rowToRun);
}

export async function getRunResults(runId: string) {
  const res = await pool.query(
    `SELECT rcr.*, c.name AS company_name, c.website, c.domain, c.country, c.region, c.city,
            c.industry AS declared_industry, c.research_status, c.last_researched_at,
            cr.status AS crawl_status, cr.pages_completed, cr.render_used, cr.duration_ms
     FROM research_company_results rcr
     JOIN companies c ON c.id = rcr.company_id
     LEFT JOIN crawl_runs cr ON cr.id = rcr.crawl_run_id
     WHERE rcr.run_id = $1
     ORDER BY rcr.opportunities_count DESC, rcr.problems_count DESC, c.name`,
    [runId]
  );
  return res.rows;
}

export async function getCompanyResearch(companyId: number, runId?: string) {
  const params: any[] = [companyId];
  let runFilter = '';
  if (runId) {
    params.push(runId);
    runFilter = ` AND run_id = $2`;
  }
  const [company, crawl, findings, problems, opps, evidence, scoreRows, services] = await Promise.all([
    pool.query(`SELECT * FROM companies WHERE id = $1`, [companyId]),
    pool.query(`SELECT * FROM crawl_runs WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [companyId]),
    pool.query(`SELECT * FROM research_findings WHERE company_id = $1 ORDER BY severity DESC, id LIMIT 60`, [companyId]),
    pool.query(`SELECT * FROM problems WHERE company_id = $1${runFilter} ORDER BY confidence DESC LIMIT 40`, params),
    pool.query(`SELECT * FROM research_opportunities WHERE company_id = $1 ORDER BY id LIMIT 60`, [companyId]),
    pool.query(`SELECT e.* FROM evidence e JOIN research_findings f ON f.id = e.finding_id WHERE f.company_id = $1 LIMIT 200`, [companyId]),
    pool.query(
      `SELECT os.*, ro.title AS opportunity_title, ro.problem_id
       FROM opportunity_scores os JOIN research_opportunities ro ON ro.id = os.opportunity_id
       WHERE ro.company_id = $1 ORDER BY os.overall_score DESC`,
      [companyId]
    ),
    pool.query(
      `SELECT sr.*, ro.title AS opportunity_title FROM service_recommendations sr
       JOIN research_opportunities ro ON ro.id = sr.opportunity_id
       WHERE ro.company_id = $1`,
      [companyId]
    ),
  ]);
  return {
    company: company.rows[0] || null,
    crawl_run: crawl.rows[0] || null,
    findings: findings.rows,
    problems: problems.rows,
    opportunities: opps.rows,
    evidence: evidence.rows,
    scores: scoreRows.rows,
    service_recommendations: services.rows,
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function recordError(runId: string, companyId: number | null, stage: string, code: string, message: string, detail: any = {}) {
  try {
    await pool.query(
      `INSERT INTO engine_errors (run_id, company_id, stage, code, message, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
      [runId, companyId, stage, code, String(message).slice(0, 800), JSON.stringify(detail)]
    );
  } catch { /* never let logging break the run */ }
}

async function loadServiceCatalog(): Promise<ServiceCatalogEntry[]> {
  const res = await pool.query(`SELECT code, name, description, keywords, categories FROM service_catalog WHERE active = true`);
  return res.rows.map((r: any) => ({
    code: r.code,
    name: r.name,
    description: r.description || '',
    keywords: Array.isArray(r.keywords) ? r.keywords : JSON.parse(r.keywords || '[]'),
    categories: Array.isArray(r.categories) ? r.categories : JSON.parse(r.categories || '[]'),
  }));
}

export interface UpsertCompanyInput {
  name: string;
  website: string;
  provider: string;
  external_id: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  language?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  industry?: string | null;
}

/**
 * Idempotent company upsert. Identity = provider external id, falling back to
 * the normalized domain (spec section 24).
 */
export async function upsertCompany(input: UpsertCompanyInput): Promise<number> {
  const domain = domainOf(input.website);
  const uid = input.external_id ? `${input.provider}:${input.external_id}` : `domain:${domain}`;
  const existing = await pool.query(
    `SELECT id FROM companies WHERE company_uid = $1 OR (domain IS NOT NULL AND domain = $2) LIMIT 1`,
    [uid, domain]
  );
  if (existing.rowCount) {
    const id = existing.rows[0].id;
    await pool.query(
      `UPDATE companies SET
         company_uid = COALESCE(company_uid, $2),
         domain = COALESCE(domain, $3),
         country = COALESCE(country, $4),
         region = COALESCE(region, $5),
         city = COALESCE(city, $6),
         language = COALESCE(language, $7),
         latitude = COALESCE(latitude, $8),
         longitude = COALESCE(longitude, $9),
         industry = COALESCE(industry, $10),
         discovery_source = COALESCE(discovery_source, $11),
         discovery_external_id = COALESCE(discovery_external_id, $12),
         updated_at = now()
       WHERE id = $1`,
      [id, uid, domain, input.country, input.region, input.city, input.language, input.latitude ?? null, input.longitude ?? null, input.industry, input.provider, input.external_id]
    );
    return id;
  }
  const res = await pool.query(
    `INSERT INTO companies (name, website, domain, company_uid, country, region, city, language, latitude, longitude, industry, discovery_source, discovery_external_id, discovered_at, stage, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), 'Discovered', 'discovered')
     RETURNING id`,
    [
      input.name, input.website, domain, uid, input.country, input.region, input.city, input.language,
      input.latitude ?? null, input.longitude ?? null, input.industry, input.provider, input.external_id,
    ]
  );
  return res.rows[0].id;
}

async function ensureWebsite(companyId: number, url: string, country?: string | null, language?: string | null): Promise<number> {
  const domain = domainOf(url);
  if (!domain) throw new Error(`Invalid website URL: ${url}`);
  const res = await pool.query(
    `INSERT INTO websites (company_id, domain, url, is_primary, country, language)
     VALUES ($1,$2,$3,true,$4,$5)
     ON CONFLICT (company_id, domain) DO UPDATE SET url = EXCLUDED.url
     RETURNING id`,
    [companyId, domain, url, country ?? null, language ?? null]
  );
  return res.rows[0].id;
}

async function persistCrawl(runId: string, companyId: number, websiteId: number, crawl: CrawlResult): Promise<number> {
  const failClass = crawl.failureClass || (crawl.status === 'SUCCESS' ? 'SUCCESS' : crawl.status);
  const res = await pool.query(
    `INSERT INTO crawl_runs (run_id, website_id, company_id, root_url, status, failure_class, pages_attempted, pages_completed,
       render_used, robots_allowed, robots_found, sitemap_found, duration_ms, error, started_at, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now() - ($13::int * interval '1 millisecond'), now())
     RETURNING id`,
    [
      runId, websiteId, companyId, crawl.rootUrl, crawl.status, failClass,
      crawl.pagesAttempted, crawl.pages.length, crawl.renderUsed,
      crawl.robots.allowed, crawl.robots.found, crawl.sitemapFound, crawl.durationMs, crawl.error || null,
    ]
  );
  const crawlRunId = res.rows[0].id;

  for (const p of crawl.pages) {
    await pool.query(
      `INSERT INTO pages (crawl_run_id, website_id, company_id, url, final_url, page_type, http_status, content_type,
         language, title, meta_description, depth, rendered, content_length, text_excerpt, content_hash, links_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        crawlRunId, websiteId, companyId, p.url, p.finalUrl, p.pageType, p.httpStatus, p.contentType,
        p.language, p.title?.slice(0, 500) || null, p.metaDescription?.slice(0, 600) || null, p.depth, p.rendered,
        p.contentLength, p.text.slice(0, 4000), p.contentHash, p.linksCount,
      ]
    );
  }
  await pool.query(`UPDATE websites SET last_crawled_at = now() WHERE id = $1`, [websiteId]);
  return crawlRunId;
}

async function persistSignals(runId: string, companyId: number, crawlRunId: number, websiteId: number, signals: SiteSignals): Promise<DeterministicFinding[]> {
  for (const s of signals.signals) {
    await pool.query(
      `INSERT INTO website_signals (crawl_run_id, website_id, company_id, category, signal_key, value, confidence, detection_method, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'programmatic',$8)`,
      [crawlRunId, websiteId, companyId, s.category, s.key, JSON.stringify(s.value ?? null), s.confidence, s.source_url]
    );
  }
  for (const f of signals.findings) {
    const uid = stableId('find', companyId, f.category, f.description);
    const ins = await pool.query(
      `INSERT INTO research_findings (finding_uid, run_id, company_id, crawl_run_id, category, description, severity, confidence, detection_method, source_url, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'programmatic',$9,$10)
       ON CONFLICT (finding_uid) DO UPDATE SET run_id = EXCLUDED.run_id, crawl_run_id = EXCLUDED.crawl_run_id
       RETURNING id`,
      [uid, runId, companyId, crawlRunId, f.category, f.description, f.severity, f.confidence, f.source_url, JSON.stringify(f.evidence)]
    );
    const findingId = ins.rows[0].id;
    await pool.query(`DELETE FROM evidence WHERE finding_id = $1`, [findingId]);
    for (const e of f.evidence) {
      await pool.query(
        `INSERT INTO evidence (finding_id, type, url, text, signal) VALUES ($1,$2,$3,$4,$5)`,
        [findingId, e.type, e.url, e.text, e.signal]
      );
    }
  }
  return signals.findings;
}

async function persistProblems(runId: string, companyId: number, crawlRunId: number, aiRunId: number | null, problems: AiProblem[]): Promise<number[]> {
  const ids: number[] = [];
  for (const p of problems) {
    const uid = stableId('prob', companyId, p.title, p.category);
    const res = await pool.query(
      `INSERT INTO problems (problem_uid, run_id, company_id, crawl_run_id, ai_run_id, title, category, description, confidence, business_impact, requires_verification, origin, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'llm',$12)
       ON CONFLICT (problem_uid) DO UPDATE SET run_id = EXCLUDED.run_id, ai_run_id = EXCLUDED.ai_run_id, evidence = EXCLUDED.evidence
       RETURNING id`,
      [uid, runId, companyId, crawlRunId, aiRunId, p.title, p.category, p.description, p.confidence, p.business_impact, p.requires_verification, JSON.stringify(p.evidence)]
    );
    ids.push(res.rows[0].id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Per-company pipeline stages (each stage is callable independently — n8n WF3-7)
// ---------------------------------------------------------------------------

interface CompanyOutcome {
  companyId: number;
  status: 'completed' | 'failed' | 'skipped';
  outcome: string;
  problems: number;
  opportunities: number;
  error?: string;
}

export interface CrawlStageResult {
  companyId: number;
  status: string;
  crawlRunId: number | null;
  pages: number;
  findingsCount: number;
  failed: boolean;
  error?: string;
}

const TERMINAL_CRAWL_FAILURES = new Set(['BLOCKED', 'TIMEOUT', 'INVALID_DOMAIN', 'FAILED', 'REQUIRES_BROWSER']);

/** Stage 1 (WF3/WF4): crawl a company's website and collect signals + findings. */
export async function crawlAndSignalCompany(runId: string, companyId: number): Promise<CrawlStageResult> {
  const cRes = await pool.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = cRes.rows[0];
  if (!company) {
    return { companyId, status: 'INVALID_DOMAIN', crawlRunId: null, pages: 0, findingsCount: 0, failed: true, error: 'Company not found' };
  }
  await pool.query(
    `INSERT INTO research_company_results (run_id, company_id, status) VALUES ($1,$2,'running')
     ON CONFLICT (run_id, company_id) DO UPDATE SET status = 'running', updated_at = now()`,
    [runId, companyId]
  );
  await pool.query(`UPDATE companies SET research_status='running', stage='Researching', updated_at=now() WHERE id=$1`, [companyId]);

  const websiteId = await ensureWebsite(companyId, company.website, company.country, company.language);
  const crawl = await crawlSite(company.website, {});
  const crawlRunId = await persistCrawl(runId, companyId, websiteId, crawl);

  if (crawl.pages.length === 0 || TERMINAL_CRAWL_FAILURES.has(crawl.status)) {
    await recordError(runId, companyId, 'crawl', crawl.status, crawl.error || `Crawl ended with status ${crawl.status}`);
    await pool.query(
      `UPDATE research_company_results SET status='failed', outcome=$3, crawl_run_id=$4, error=$5, updated_at=now()
       WHERE run_id=$1 AND company_id=$2`,
      [runId, companyId, crawl.status, crawlRunId, crawl.error || null]
    );
    await pool.query(`UPDATE companies SET research_status='failed', updated_at=now() WHERE id=$1`, [companyId]);
    return { companyId, status: crawl.status, crawlRunId, pages: crawl.pages.length, findingsCount: 0, failed: true, error: crawl.error };
  }

  const signals = await extractSignals(crawl, { industry: company.industry || undefined, checkLinks: true });
  const findings = await persistSignals(runId, companyId, crawlRunId, websiteId, signals);

  await pool.query(
    `UPDATE research_company_results SET crawl_run_id=$3, updated_at=now() WHERE run_id=$1 AND company_id=$2`,
    [runId, companyId, crawlRunId]
  );
  return { companyId, status: crawl.status, crawlRunId, pages: crawl.pages.length, findingsCount: findings.length, failed: false };
}

/** Rebuild a crawl-shaped object from persisted rows (for stage-independence). */
async function reconstructCrawl(companyId: number): Promise<CrawlResult | null> {
  const cr = await pool.query(`SELECT * FROM crawl_runs WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [companyId]);
  if (!cr.rowCount) return null;
  const run = cr.rows[0];
  const pr = await pool.query(`SELECT * FROM pages WHERE crawl_run_id = $1 ORDER BY depth, id`, [run.id]);
  const pages = pr.rows.map((p: any) => ({
    url: p.url,
    finalUrl: p.final_url || p.url,
    pageType: p.page_type || 'other',
    httpStatus: p.http_status || 0,
    contentType: p.content_type || '',
    language: p.language || null,
    title: p.title || '',
    metaDescription: p.meta_description || '',
    depth: p.depth || 0,
    rendered: Boolean(p.rendered),
    contentLength: p.content_length || 0,
    responseTimeMs: 0,
    bytes: p.content_length || 0,
    text: p.text_excerpt || '',
    contentHash: p.content_hash || '',
    linksCount: p.links_count || 0,
    links: [],
    dom: emptyDom(),
  }));
  return {
    status: run.status,
    rootUrl: run.root_url,
    finalUrl: run.root_url,
    domain: domainOf(run.root_url) || '',
    pages,
    pagesAttempted: run.pages_attempted || pages.length,
    robots: { found: Boolean(run.robots_found), allowed: run.robots_allowed !== false, disallowAll: false, sitemaps: [] },
    sitemapFound: Boolean(run.sitemap_found),
    renderUsed: Boolean(run.render_used),
    redirectChain: [],
    durationMs: run.duration_ms || 0,
    failureClass: run.failure_class || undefined,
  } as CrawlResult;
}

async function loadSignalsFromDb(companyId: number, crawlRunId: number): Promise<{ signals: SiteSignals; findings: DeterministicFinding[] }> {
  const sr = await pool.query(
    `SELECT category, signal_key, value, confidence, source_url FROM website_signals WHERE company_id = $1 AND crawl_run_id = $2`,
    [companyId, crawlRunId]
  );
  const technical: Record<string, unknown> = {};
  const ux: Record<string, unknown> = {};
  const business: Record<string, unknown> = {};
  const signals: SiteSignals['signals'] = [];
  for (const row of sr.rows) {
    const bucket = row.category === 'technical' ? technical : row.category === 'ux' ? ux : business;
    bucket[row.signal_key] = row.value;
    signals.push({ category: row.category, key: row.signal_key, value: row.value, confidence: Number(row.confidence), source_url: row.source_url || '' });
  }
  const fr = await pool.query(
    `SELECT category, description, severity, confidence, source_url, evidence FROM research_findings WHERE company_id = $1 AND crawl_run_id = $2`,
    [companyId, crawlRunId]
  );
  const findings: DeterministicFinding[] = fr.rows.map((f: any) => ({
    category: f.category,
    description: f.description,
    severity: f.severity,
    confidence: Number(f.confidence),
    source_url: f.source_url || '',
    evidence: Array.isArray(f.evidence) ? f.evidence : JSON.parse(f.evidence || '[]'),
  }));
  return { signals: { technical, ux, business, signals, findings, brokenLinks: (technical.broken_links as any) || [] }, findings };
}

export interface AnalyzeStageResult {
  companyId: number;
  outcome: string;
  aiProblems: number;
  findings: number;
  opportunities: number;
  failed: boolean;
  error?: string;
}

/** Stages 5-7 (WF5/WF6/WF7): AI problem detection -> opportunities -> scoring -> recommendations. */
export async function analyzeCompany(runId: string, companyId: number, opts: { aiEnabled?: boolean } = {}): Promise<AnalyzeStageResult> {
  const cRes = await pool.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = cRes.rows[0];
  if (!company) return { companyId, outcome: 'FAILED', aiProblems: 0, findings: 0, opportunities: 0, failed: true, error: 'Company not found' };

  const crawl = await reconstructCrawl(companyId);
  const crawlRunId = (await pool.query(`SELECT crawl_run_id FROM research_company_results WHERE run_id=$1 AND company_id=$2`, [runId, companyId])).rows[0]?.crawl_run_id
    || (await pool.query(`SELECT id FROM crawl_runs WHERE company_id=$1 ORDER BY id DESC LIMIT 1`, [companyId])).rows[0]?.id || null;
  if (!crawl || !crawlRunId) {
    return { companyId, outcome: 'FAILED', aiProblems: 0, findings: 0, opportunities: 0, failed: true, error: 'No crawl available for analysis' };
  }

  const { signals, findings } = await loadSignalsFromDb(companyId, crawlRunId);
  const aiEnabled = opts.aiEnabled ?? isAiConfigured();
  const catalog = await loadServiceCatalog();

  let aiProblems: AiProblem[] = [];
  let aiRunId: number | null = null;
  let outcome: string = crawl.status;

  if (aiEnabled) {
    const started = Date.now();
    try {
      const analysis = await detectProblems({
        company: {
          name: company.name, website: company.website, industry: company.industry,
          country: company.country, region: company.region, city: company.city, language: company.language,
        },
        crawl,
        signals,
        deterministicFindings: findings,
      });
      const aiRes = await pool.query(
        `INSERT INTO ai_runs (run_id, company_id, purpose, provider, model, status, prompt_tokens, completion_tokens, total_tokens, latency_ms, attempts, request_hash)
         VALUES ($1,$2,'problem_detection',$3,$4,'completed',$5,$6,$7,$8,$9,$10) RETURNING id`,
        [runId, companyId, 'groq', analysis.model, analysis.usage.prompt_tokens, analysis.usage.completion_tokens, analysis.usage.total_tokens, analysis.latencyMs, analysis.attempts, analysis.requestHash]
      );
      aiRunId = aiRes.rows[0].id;
      aiProblems = analysis.problems;
    } catch (err: any) {
      const msg = err instanceof AiNotConfiguredError ? err.message : err?.message || String(err);
      await pool.query(
        `INSERT INTO ai_runs (run_id, company_id, purpose, provider, model, status, latency_ms, error)
         VALUES ($1,$2,'problem_detection','groq',$3,'failed',$4,$5)`,
        [runId, companyId, config.ai.groq.model, Date.now() - started, msg.slice(0, 500)]
      ).catch(() => {});
      await recordError(runId, companyId, 'ai', err instanceof AiNotConfiguredError ? 'AI_NOT_CONFIGURED' : 'AI_ANALYSIS_FAILED', msg);
      outcome = 'AI_ANALYSIS_FAILED';
    }
  } else {
    await recordError(runId, companyId, 'ai', 'AI_NOT_CONFIGURED', aiStatus().missing.join(', ') || 'AI provider not configured');
    outcome = 'AI_ANALYSIS_FAILED';
  }

  if (aiProblems.length > 0) await persistProblems(runId, companyId, crawlRunId, aiRunId, aiProblems);

  const derived = deriveOpportunities(aiProblems, findings, `${runId}:${companyId}`);
  const evidenceSummaryFor = (o: DerivedOpportunity): string => {
    if (o.problem_index >= 0 && aiProblems[o.problem_index]) {
      const p = aiProblems[o.problem_index];
      return p.evidence.map((e) => `${e.text} (${e.url})`).join(' | ') || p.description;
    }
    const f = findings.find((x) => x.description === o.description);
    return f ? f.evidence.map((e) => `${e.text} (${e.url})`).join(' | ') || f.description : o.description;
  };

  let opportunityCount = 0;
  for (const o of derived) {
    const problemId = o.problem_index >= 0
      ? (await pool.query(`SELECT id FROM problems WHERE company_id=$1 AND title=$2 LIMIT 1`, [companyId, aiProblems[o.problem_index]?.title])).rows[0]?.id ?? null
      : null;
    const oppRes = await pool.query(
      `INSERT INTO research_opportunities (opportunity_uid, run_id, company_id, problem_id, title, description, business_value, alveron_can_solve, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')
       ON CONFLICT (opportunity_uid) DO UPDATE SET run_id = EXCLUDED.run_id, problem_id = EXCLUDED.problem_id
       RETURNING id`,
      [o.uid, runId, companyId, problemId, o.title, o.description, o.business_value, o.alveron_can_solve]
    );
    const opportunityId = oppRes.rows[0].id;

    const recs = recommendServices({ opportunity: o, catalog, evidenceSummary: evidenceSummaryFor(o) });
    await pool.query(`DELETE FROM service_recommendations WHERE opportunity_id = $1`, [opportunityId]);
    for (const r of recs) {
      await pool.query(
        `INSERT INTO service_recommendations (opportunity_id, service_code, confidence, why_this_solution, what_it_would_do, what_evidence_supports, what_is_unknown)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [opportunityId, r.service_code, r.confidence, r.why_this_solution, r.what_it_would_do, r.what_evidence_supports, r.what_is_unknown]
      );
    }
    const score = scoreOpportunity({
      opportunity: o,
      matchedServices: recs.length,
      pagesCrawled: crawl.pages.length,
      signalCount: signals.signals.length,
    });
    await pool.query(`DELETE FROM opportunity_scores WHERE opportunity_id = $1`, [opportunityId]);
    await pool.query(
      `INSERT INTO opportunity_scores (opportunity_id, overall_score, priority, components, rationale) VALUES ($1,$2,$3,$4,$5)`,
      [opportunityId, score.overall_score, score.priority, JSON.stringify(score.components), score.rationale]
    );
    opportunityCount++;
  }

  await pool.query(
    `UPDATE research_company_results SET status='completed', outcome=$3, problems_count=$4, opportunities_count=$5, error=NULL, updated_at=now()
     WHERE run_id=$1 AND company_id=$2`,
    [runId, companyId, outcome, aiProblems.length + findings.length, opportunityCount]
  );
  await pool.query(
    `UPDATE companies SET research_status='completed', last_researched_at=now(),
       stage = CASE WHEN stage='Researching' THEN 'Qualified' ELSE stage END, updated_at=now() WHERE id=$1`,
    [companyId]
  );

  return { companyId, outcome, aiProblems: aiProblems.length, findings: findings.length, opportunities: opportunityCount, failed: false };
}

/** Full per-company pipeline: crawl+signal, then analyse. */
async function processCompany(
  runId: string,
  companyId: number,
  _catalog: ServiceCatalogEntry[],
  aiEnabled: boolean,
  opts: { force: boolean }
): Promise<CompanyOutcome> {
  await pool.query(
    `INSERT INTO research_company_results (run_id, company_id, status) VALUES ($1,$2,'running')
     ON CONFLICT (run_id, company_id) DO UPDATE SET status = 'running', updated_at = now()`,
    [runId, companyId]
  );

  const cRes = await pool.query(`SELECT * FROM companies WHERE id = $1`, [companyId]);
  const company = cRes.rows[0];
  if (!company) return { companyId, status: 'failed', outcome: 'INVALID_DOMAIN', problems: 0, opportunities: 0, error: 'Company not found' };

  // Idempotency: skip a fresh re-crawl inside the configured window unless forced.
  if (!opts.force && company.last_researched_at) {
    const ageDays = (Date.now() - new Date(company.last_researched_at).getTime()) / 86_400_000;
    if (ageDays < config.research.reCrawlDays) {
      const prev = await pool.query(
        `SELECT problems_count, opportunities_count, outcome FROM research_company_results
         WHERE company_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1`,
        [companyId]
      );
      const p = prev.rows[0] || {};
      await pool.query(
        `UPDATE research_company_results SET status='completed', outcome=$3, problems_count=$4, opportunities_count=$5, updated_at=now()
         WHERE run_id=$1 AND company_id=$2`,
        [runId, companyId, p.outcome || 'SUCCESS', p.problems_count || 0, p.opportunities_count || 0]
      );
      return { companyId, status: 'completed', outcome: (p.outcome || 'SUCCESS') + '_CACHED', problems: p.problems_count || 0, opportunities: p.opportunities_count || 0 };
    }
  }

  try {
    const crawl = await crawlAndSignalCompany(runId, companyId);
    if (crawl.failed) {
      return { companyId, status: 'failed', outcome: crawl.status, problems: 0, opportunities: 0, error: crawl.error };
    }
    const analysis = await analyzeCompany(runId, companyId, { aiEnabled });
    return {
      companyId,
      status: 'completed',
      outcome: analysis.outcome,
      problems: analysis.aiProblems + analysis.findings,
      opportunities: analysis.opportunities,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    await recordError(runId, companyId, 'process', 'COMPANY_FAILED', msg);
    await pool.query(
      `UPDATE research_company_results SET status='failed', outcome='FAILED', error=$3, updated_at=now() WHERE run_id=$1 AND company_id=$2`,
      [runId, companyId, msg.slice(0, 500)]
    );
    await pool.query(`UPDATE companies SET research_status='failed', updated_at=now() WHERE id=$1`, [companyId]);
    return { companyId, status: 'failed', outcome: 'FAILED', problems: 0, opportunities: 0, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Discovery stage (WF1 discovery + WF2 enrichment) — callable on its own
// ---------------------------------------------------------------------------

export interface DiscoveryStageResult {
  discovered: number;
  valid: number;
  company_ids: number[];
  error?: string;
}

export async function runDiscoveryStage(runId: string): Promise<DiscoveryStageResult> {
  const run = await getResearchRun(runId);
  if (!run) throw new Error(`Research run not found: ${runId}`);

  const dRes = await pool.query(
    `INSERT INTO discovery_runs (run_id, provider, query, status, started_at) VALUES ($1,$2,$3,'running',now()) RETURNING id`,
    [runId, run.provider, JSON.stringify({ country: run.country, region: run.region, city: run.city, industry: run.industry, language: run.language, count: run.requested_count })]
  );
  const discoveryRunId = dRes.rows[0].id;

  const outcome = await discover({
    country: run.country || undefined,
    region: run.region || undefined,
    city: run.city || undefined,
    industry: run.industry || undefined,
    language: run.language || undefined,
    limit: run.requested_count,
    website_required: run.website_required,
  }, run.provider || undefined);

  if (outcome.error) {
    await pool.query(`UPDATE discovery_runs SET status='failed', error=$2, completed_at=now() WHERE id=$1`, [discoveryRunId, outcome.error]);
    await recordError(runId, null, 'discovery', 'DISCOVERY_FAILED', outcome.error);
  } else {
    await pool.query(`UPDATE discovery_runs SET status='completed', found_count=$2, completed_at=now() WHERE id=$1`, [discoveryRunId, outcome.results.length]);
  }

  // Persist + validate discoveries; build the company work list.
  const companyIds = new Set<number>();
  for (const b of outcome.results) {
    if (companyIds.size >= run.requested_count) break;
    const website = b.website ? normalizeUrl(b.website) : null;
    let validation_status = 'ok';
    let valid = true;
    let detail: string | null = null;

    if (!website) {
      validation_status = 'no_website';
      valid = false;
      detail = 'No website listed for this business';
    } else if (!isLikelyBusinessWebsite(website)) {
      validation_status = 'invalid_url';
      valid = false;
      detail = 'URL is a social/directory page, not a business website';
    }

    const dedupeKey = businessDedupeKey({ website: website || undefined, name: b.name, city: b.city, external_id: b.external_id });

    let companyId: number | null = null;
    if (valid) {
      try {
        companyId = await upsertCompany({
          name: b.name, website: website!, provider: b.provider, external_id: b.external_id,
          country: b.country, region: b.region, city: b.city, language: run.language,
          latitude: b.latitude, longitude: b.longitude, industry: run.industry,
        });
      } catch (err: any) {
        valid = false;
        validation_status = 'error';
        detail = err?.message || String(err);
      }
    }

    await pool.query(
      `INSERT INTO discovered_companies (run_id, discovery_run_id, company_id, provider, external_id, name, website, domain, country, region, city, language, latitude, longitude, raw, dedupe_key, valid, validation_status, validation_detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (run_id, dedupe_key) DO NOTHING`,
      [
        runId, discoveryRunId, companyId, b.provider, b.external_id, b.name, website, domainOf(website || '') || null,
        b.country || null, b.region || null, b.city || null, run.language, b.latitude ?? null, b.longitude ?? null,
        JSON.stringify(b.raw || {}), dedupeKey, valid, validation_status, detail,
      ]
    ).catch(() => {});

    if (companyId) companyIds.add(companyId);
  }

  return { discovered: outcome.results.length, valid: companyIds.size, company_ids: [...companyIds], error: outcome.error };
}

// ---------------------------------------------------------------------------
// Run execution
// ---------------------------------------------------------------------------

export async function runResearchRun(runId: string, opts: { force?: boolean } = {}): Promise<void> {
  const run = await getResearchRun(runId);
  if (!run) throw new Error(`Research run not found: ${runId}`);

  await pool.query(`UPDATE research_runs SET status='running', started_at=now() WHERE run_id=$1`, [runId]);
  log({ op: 'research_run_start', run_id: runId, status: 'running' });

  const stats: Record<string, number> = {
    discovered: 0, valid_websites: 0, crawled: 0, analyzed: 0, problems: 0, opportunities: 0, failed: 0, ai_failed: 0,
  };

  try {
    const disc = await runDiscoveryStage(runId);
    stats.discovered = disc.discovered;
    stats.valid_websites = disc.valid;
    const companyIds = new Set<number>(disc.company_ids);

    const catalog = await loadServiceCatalog();
    const aiEnabled = isAiConfigured();
    if (!aiEnabled) {
      await recordError(runId, null, 'ai', 'AI_NOT_CONFIGURED', `Missing: ${aiStatus().missing.join(', ')}. Discovery, crawling, evidence and deterministic findings still run.`);
    }

    const idList = [...companyIds];
    const outcomes = await pMap(idList, config.research.companyConcurrency, async (cid) => {
      try {
        return await withTimeout(
          processCompany(runId, cid, catalog, aiEnabled, { force: opts.force === true }),
          config.research.companyTimeoutMs,
          `company ${cid}`
        );
      } catch (err: any) {
        await recordError(runId, cid, 'process', 'UNHANDLED', err?.message || String(err));
        return { companyId: cid, status: 'failed' as const, outcome: 'FAILED', problems: 0, opportunities: 0, error: err?.message };
      }
    });

    for (const o of outcomes) {
      if (o.status === 'completed') stats.analyzed++;
      if (o.outcome === 'AI_ANALYSIS_FAILED') stats.ai_failed++;
      if (o.status === 'failed') stats.failed++;
      stats.problems += o.problems;
      stats.opportunities += o.opportunities;
    }
    stats.crawled = outcomes.filter((o) => o.outcome !== 'INVALID_DOMAIN' && o.outcome !== 'NO_WEBSITE').length;

    const status =
      stats.analyzed === 0 && (stats.failed > 0 || stats.discovered > 0) ? 'failed'
      : stats.failed > 0 || stats.ai_failed > 0 ? 'partial'
      : stats.analyzed > 0 ? 'completed'
      : 'failed';
    await pool.query(
      `UPDATE research_runs SET status=$2, statistics=$3, completed_at=now() WHERE run_id=$1`,
      [runId, status, JSON.stringify(stats)]
    );
    log({ op: 'research_run_complete', run_id: runId, status, detail: stats });
  } catch (err: any) {
    const msg = err?.message || String(err);
    await recordError(runId, null, 'run', 'RUN_FAILED', msg);
    await pool.query(`UPDATE research_runs SET status='failed', error=$2, statistics=$3, completed_at=now() WHERE run_id=$1`, [runId, msg.slice(0, 800), JSON.stringify(stats)]);
    log({ op: 'research_run_failed', run_id: runId, status: 'failed', detail: { error: msg } });
    throw err;
  }
}
