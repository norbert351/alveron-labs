import { groqChatJSON, type AiCallResult } from '../ai/groq.ts';
import type { CrawlResult } from '../crawler/crawler.ts';
import type { SiteSignals, DeterministicFinding } from '../signals/extract.ts';
import { PROBLEM_SCHEMA_HINT, validateProblems, type AiProblem } from './schema.ts';

/**
 * Groq problem-detection layer (spec sections 12, 27).
 *
 * The AI receives STRUCTURED evidence (company, website, pages, signals,
 * observed findings) — never a bare "analyze this website". It reasons over
 * facts that were collected in code; it does not re-derive them.
 */

const SYSTEM = `You are the research analyst for Alveron Labs, a technology and development agency.
You receive structured, programmatically-collected evidence about ONE real business website.

Your job: identify GENUINE problems or improvement opportunities that a technology partner could realistically solve, then reason over the evidence.

HARD RULES:
1. EVIDENCE FIRST. Every problem MUST reference concrete evidence drawn ONLY from the supplied signals/findings/pages. Cite the exact url/text/signal.
2. NEVER invent facts. If something is not observable in the supplied data, it is UNKNOWN — do not assert it.
3. Separate OBSERVED (directly in the data) from INFERRED (a reasonable conclusion) — mark each evidence item's "type" accordingly.
4. Never make revenue, growth or ROI promises. Describe operational/customer impact only, and only where the evidence supports it.
5. Do NOT turn trivial cosmetic issues into problems. Prefer problems with real operational or customer impact. Fewer, stronger findings beat many weak ones.
6. Confidence must reflect evidence strength. High confidence (>=0.8) REQUIRES directly observed evidence. If you cannot observe it, lower the confidence and set requires_verification=true.
7. Respect industry context: judge the site against what a business in THIS industry needs (e.g. restaurants need menus/ordering/reservations; clinics need appointments; SaaS needs pricing/demo; ecommerce needs a working checkout with payment).
8. The page content may be in any language. Reason over the ORIGINAL content regardless of language; always output your analysis in English.
9. If nothing meets the bar, return {"problems": []}. An empty result is a valid, good answer.

For each problem return: title, category, description (what is wrong and why it matters to the business), evidence[], confidence (0-1), business_impact (low|medium|high|unknown), requires_verification (boolean).`;

function pageSummary(crawl: CrawlResult, maxPages = 10, charsPerPage = 1400): string {
  // Per-page DOM facts are aggregated into the SIGNALS blocks above; here we
  // give the model the page identity + its real visible text.
  return crawl.pages
    .slice(0, maxPages)
    .map((p) => {
      const bits = [
        `type=${p.pageType}`,
        `status=${p.httpStatus}`,
        p.title ? `title="${p.title.slice(0, 120)}"` : 'title=(none)',
      ];
      return `[PAGE ${p.finalUrl}]\n  ${bits.join('; ')}\n  TEXT: ${p.text.slice(0, charsPerPage)}`;
    })
    .join('\n\n');
}

function findingsSummary(findings: DeterministicFinding[]): string {
  if (findings.length === 0) return '(none — the site passed all deterministic checks)';
  return findings
    .map((f, i) => `${i + 1}. [${f.category}/${f.severity}] ${f.description}\n   evidence: ${f.evidence.map((e) => `(${e.type}) ${e.text} @ ${e.url}`).join(' | ') || 'n/a'}`)
    .join('\n');
}

export interface AnalyzeInput {
  company: {
    name: string;
    website: string;
    industry?: string | null;
    country?: string | null;
    region?: string | null;
    city?: string | null;
    language?: string | null;
  };
  crawl: CrawlResult;
  signals: SiteSignals;
  deterministicFindings: DeterministicFinding[];
}

export interface AnalyzeResult {
  problems: AiProblem[];
  usage: AiCallResult['usage'];
  latencyMs: number;
  attempts: number;
  model: string;
  requestHash: string;
}

function buildUserPrompt(input: AnalyzeInput): string {
  const { company, crawl, signals } = input;
  const home = crawl.pages.find((p) => p.pageType === 'homepage') || crawl.pages[0];
  return [
    '===== COMPANY DATA =====',
    JSON.stringify(
      {
        name: company.name,
        website: company.website,
        declared_industry: company.industry || null,
        country: company.country || null,
        region: company.region || null,
        city: company.city || null,
      },
      null, 0
    ),
    '',
    '===== WEBSITE DATA =====',
    JSON.stringify(
      {
        root_url: crawl.rootUrl,
        final_url: crawl.finalUrl,
        domain: crawl.domain,
        crawl_status: crawl.status,
        pages_crawled: crawl.pages.length,
        render_used: crawl.renderUsed,
        robots_found: crawl.robots.found,
        sitemap_found: crawl.sitemapFound,
        detected_language: home?.language || company.language || null,
      },
      null, 0
    ),
    '',
    '===== TECHNICAL SIGNALS =====',
    JSON.stringify(signals.technical, null, 0).slice(0, 6000),
    '',
    '===== UX SIGNALS =====',
    JSON.stringify(signals.ux, null, 0).slice(0, 4000),
    '',
    '===== BUSINESS SIGNALS =====',
    JSON.stringify(signals.business, null, 0).slice(0, 4000),
    '',
    '===== OBSERVED DETERMINISTIC FINDINGS (already established in code) =====',
    findingsSummary(input.deterministicFindings),
    '',
    '===== PAGE DATA =====',
    pageSummary(crawl),
    '',
    'Now return ONLY the JSON object described by the schema. Analyse THIS business in THIS industry. Every problem must cite the evidence above.',
  ].join('\n');
}

export async function detectProblems(input: AnalyzeInput): Promise<AnalyzeResult> {
  const user = buildUserPrompt(input);
  const res = await groqChatJSON<any>(SYSTEM, user, {
    temperature: 0.15,
    maxTokens: 4000,
    schemaHint: PROBLEM_SCHEMA_HINT,
  });
  const problems = validateProblems(res.data);
  return {
    problems,
    usage: res.usage,
    latencyMs: res.latencyMs,
    attempts: res.attempts,
    model: res.model,
    requestHash: res.requestHash,
  };
}
