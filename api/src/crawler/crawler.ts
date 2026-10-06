import { config } from '../config.ts';
import { assertSafeUrl } from '../ssrf.ts';
import { domainOf, normalizeUrl, sameSite } from '../util/url.ts';
import { sha256Short } from '../util/hash.ts';
import { pMap } from '../util/concurrency.ts';
import { fetchPage, type FetchFailureClass } from './fetcher.ts';
import { fetchRobots, isPathAllowed, EMPTY_ROBOTS, type RobotsRules } from './robots.ts';
import { classifyPage, type PageType } from './pageType.ts';
import { extractDomFacts, extractLinks, extractText, type DomFacts } from './dom.ts';

/**
 * Tiered website crawler (spec sections 7, 8, 22).
 *
 * Tier 1 — plain HTTP fetch (with SSRF-guarded redirect validation)
 * Tier 2 — HTML parsing / DOM fact extraction
 * Tier 3 — headless browser rendering, only when Tier 1 yields too little text
 *
 * A browser is never launched for every request; only for pages that
 * genuinely require rendering. This keeps infrastructure cost low.
 */

export type CrawlStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'TIMEOUT'
  | 'INVALID_DOMAIN'
  | 'REQUIRES_BROWSER'
  | 'CRAWL_LIMIT'
  | 'FAILED';

export interface CrawledPage {
  url: string;
  finalUrl: string;
  pageType: PageType;
  httpStatus: number;
  contentType: string;
  language: string | null;
  title: string;
  metaDescription: string;
  depth: number;
  rendered: boolean;
  contentLength: number;
  responseTimeMs: number;
  bytes: number;
  text: string;
  contentHash: string;
  linksCount: number;
  links: { href: string; text: string }[];
  dom: DomFacts;
}

export interface CrawlResult {
  status: CrawlStatus;
  rootUrl: string;
  finalUrl: string;
  domain: string;
  pages: CrawledPage[];
  pagesAttempted: number;
  robots: { found: boolean; allowed: boolean; disallowAll: boolean; sitemaps: string[] };
  sitemapFound: boolean;
  renderUsed: boolean;
  redirectChain: string[];
  durationMs: number;
  error?: string;
  failureClass?: FetchFailureClass;
}

const RENDER_TRIGGER_CHARS = 400;

const TYPE_PRIORITY: Record<PageType, number> = {
  homepage: 0, contact: 1, booking: 2, services: 3, products: 4, pricing: 5,
  about: 6, menu: 7, faq: 8, locations: 9, checkout: 10, blog: 11, careers: 12, other: 13,
};

function detectLanguage(html: string): string | null {
  const m = html.match(/<html[^>]*\blang=["']([a-zA-Z-]{2,10})["']/i);
  if (m) return m[1].toLowerCase();
  const og = html.match(/<meta[^>]+property=["']og:locale["'][^>]+content=["']([a-zA-Z_-]{2,10})["']/i);
  if (og) return og[1].toLowerCase();
  return null;
}

async function fetchSitemapUrls(origin: string, robots: RobotsRules): Promise<string[]> {
  const candidates = robots.sitemaps.length > 0 ? robots.sitemaps.slice(0, 2) : [new URL('/sitemap.xml', origin).href];
  for (const sm of candidates) {
    try {
      await assertSafeUrl(sm);
      const res = await fetch(sm, { headers: { 'User-Agent': config.fetcher.userAgent }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 1_000_000);
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
      if (locs.length > 0) return locs;
    } catch {
      /* try the next candidate */
    }
  }
  return [];
}

function buildCrawledPage(input: {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  depth: number;
  rendered: boolean;
  text?: string;
  responseTimeMs?: number;
  bytes?: number;
}): CrawledPage {
  const dom = extractDomFacts(input.html, input.finalUrl);
  const text = (input.text ?? extractText(input.html, config.fetcher.maxCharsPerPage)).slice(0, config.fetcher.maxCharsPerPage);
  const links = extractLinks(input.html, input.finalUrl);
  return {
    url: input.url,
    finalUrl: input.finalUrl,
    pageType: classifyPage(input.finalUrl, dom.title),
    httpStatus: input.status,
    contentType: input.contentType,
    language: detectLanguage(input.html),
    title: dom.title,
    metaDescription: dom.metaDescription,
    depth: input.depth,
    rendered: input.rendered,
    contentLength: input.html.length || text.length,
    responseTimeMs: input.responseTimeMs ?? 0,
    bytes: input.bytes ?? input.html.length,
    text,
    contentHash: sha256Short(text),
    linksCount: links.length,
    links,
    dom,
  };
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  timeoutMs?: number;
  respectRobots?: boolean;
  allowBrowser?: boolean;
  /** When true, this call is an explicit re-crawl (bypasses nothing, just labelled). */
  reCrawl?: boolean;
}

export async function crawlSite(rawUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const started = Date.now();
  const maxPages = opts.maxPages ?? config.crawler.maxPages;
  const maxDepth = opts.maxDepth ?? config.crawler.maxDepth;
  const timeoutMs = opts.timeoutMs ?? config.crawler.timeoutMs;
  const respectRobots = opts.respectRobots ?? config.crawler.respectRobots;
  const allowBrowser = opts.allowBrowser ?? config.fetcher.browserFallback;

  const base: CrawlResult = {
    status: 'FAILED', rootUrl: rawUrl, finalUrl: rawUrl, domain: domainOf(rawUrl) || '',
    pages: [], pagesAttempted: 0,
    robots: { found: false, allowed: true, disallowAll: false, sitemaps: [] },
    sitemapFound: false, renderUsed: false, redirectChain: [], durationMs: 0,
  };

  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    return { ...base, status: 'INVALID_DOMAIN', failureClass: 'INVALID_DOMAIN', error: 'Invalid URL', durationMs: Date.now() - started };
  }
  const domain = domainOf(normalized)!;
  base.domain = domain;
  base.finalUrl = normalized;

  // SSRF pre-check (DNS resolved, private ranges blocked).
  try {
    await assertSafeUrl(normalized);
  } catch (err: any) {
    return { ...base, status: 'INVALID_DOMAIN', failureClass: 'BLOCKED', error: err?.message || String(err), durationMs: Date.now() - started };
  }

  const origin = new URL(normalized).origin;

  // robots.txt
  let robots: RobotsRules = EMPTY_ROBOTS;
  if (respectRobots) {
    robots = await fetchRobots(origin, config.fetcher.userAgent);
    if (robots.disallowAll) {
      return {
        ...base,
        status: 'BLOCKED',
        failureClass: 'BLOCKED',
        robots: { found: true, allowed: false, disallowAll: true, sitemaps: robots.sitemaps },
        error: 'robots.txt disallows all crawling',
        durationMs: Date.now() - started,
      };
    }
  }

  // Tier 1: homepage fetch
  const homeFetch = await fetchPage(normalized, { timeoutMs });
  if (!homeFetch.ok) {
    const status: CrawlStatus =
      homeFetch.failureClass === 'TIMEOUT' ? 'TIMEOUT'
      : homeFetch.failureClass === 'BLOCKED' ? 'BLOCKED'
      : homeFetch.failureClass === 'INVALID_DOMAIN' ? 'INVALID_DOMAIN'
      : 'FAILED';
    return {
      ...base,
      status,
      failureClass: homeFetch.failureClass,
      finalUrl: homeFetch.finalUrl,
      redirectChain: homeFetch.redirectChain,
      robots: { found: robots.fetched, allowed: true, disallowAll: false, sitemaps: robots.sitemaps },
      error: homeFetch.error,
      durationMs: Date.now() - started,
    };
  }

  let home = buildCrawledPage({
    url: normalized, finalUrl: homeFetch.finalUrl, status: homeFetch.status,
    contentType: homeFetch.headers['content-type'] || '', html: homeFetch.body, depth: 0, rendered: false,
    responseTimeMs: homeFetch.responseTimeMs, bytes: homeFetch.bytes,
  });

  let renderUsed = false;

  // Tier 3: render only if the static page is thin and it is an HTML page.
  if (allowBrowser && home.text.trim().length < RENDER_TRIGGER_CHARS) {
    try {
      const { renderWithBrowser } = await import('../modules/browserRender.ts');
      const rendered = await renderWithBrowser(homeFetch.finalUrl, Math.max(timeoutMs, 30000));
      if (rendered.rendered && rendered.text.trim().length > home.text.trim().length) {
        renderUsed = true;
        home = {
          ...home,
          rendered: true,
          text: rendered.text.slice(0, config.fetcher.maxCharsPerPage),
          title: rendered.title || home.title,
          contentHash: sha256Short(rendered.text),
          contentLength: rendered.text.length,
        };
      }
    } catch {
      /* best effort — the static page still stands */
    }
  }

  // Determine whether the site genuinely requires a browser but could not render.
  const needsBrowser = home.text.trim().length < RENDER_TRIGGER_CHARS && !renderUsed;

  // Candidate sub-pages: sitemap first, then in-page links.
  const sitemapUrls = await fetchSitemapUrls(origin, robots);
  const sitemapFound = sitemapUrls.length > 0;

  const candidates = new Map<string, { url: string; type: PageType; depth: number; score: number }>();

  function consider(url: string, depth: number) {
    const n = normalizeUrl(url);
    if (!n) return;
    if (!sameSite(n, origin)) return;
    if (n === normalizeUrl(home.finalUrl)) return;
    if (!/^https?:/.test(n)) return;
    const type = classifyPage(n);
    const score = TYPE_PRIORITY[type] * 10 + depth;
    if (type === 'other' && depth > 0) return; // don't wander into arbitrary pages
    if (!candidates.has(n)) candidates.set(n, { url: n, type, depth, score });
  }

  for (const loc of sitemapUrls.slice(0, 200)) consider(loc, 1);
  for (const l of home.links) consider(l.href, 1);

  const ordered = [...candidates.values()].sort((a, b) => a.score - b.score);
  const budget = Math.max(0, maxPages - 1);
  const selected = ordered.slice(0, budget);
  const hitLimit = ordered.length > budget;

  const subResults = await pMap(selected, config.crawler.concurrencyHttp, async (cand) => {
    // robots check per path
    if (respectRobots && robots.fetched) {
      try {
        const path = new URL(cand.url).pathname;
        if (!isPathAllowed(robots, path)) return { skipped: true as const };
      } catch {
        /* ignore */
      }
    }
    const f = await fetchPage(cand.url, { timeoutMs });
    if (!f.ok) {
      // attempt render for sub-pages only if browser allowed and failure looks render-related
      if (allowBrowser && (f.failureClass === 'UNSUPPORTED_CONTENT' || f.status === 0)) {
        try {
          const { renderWithBrowser } = await import('../modules/browserRender.ts');
          const r = await renderWithBrowser(cand.url, Math.max(timeoutMs, 30000));
          if (r.rendered && r.text.length > 200) {
            return {
              page: buildCrawledPage({
                url: cand.url, finalUrl: r.url, status: 200, contentType: 'text/html',
                html: '', depth: cand.depth, rendered: true, text: r.text,
              }),
              rendered: true,
            };
          }
        } catch {
          /* ignore */
        }
      }
      return { skipped: true as const };
    }
    return {
      page: buildCrawledPage({
        url: cand.url, finalUrl: f.finalUrl, status: f.status,
        contentType: f.headers['content-type'] || '', html: f.body, depth: cand.depth, rendered: false,
        responseTimeMs: f.responseTimeMs, bytes: f.bytes,
      }),
      rendered: false,
    };
  });

  const pages: CrawledPage[] = [home];
  let subRendered = false;
  for (const r of subResults) {
    if (!r) continue;
    if ('page' in r && r.page) {
      pages.push(r.page);
      if (r.rendered) subRendered = true;
    }
  }
  renderUsed = renderUsed || subRendered;

  const attempted = 1 + selected.length;
  let status: CrawlStatus;
  if (needsBrowser && pages.length === 1) status = 'REQUIRES_BROWSER';
  else if (pages.length <= 1 && hitLimit) status = 'CRAWL_LIMIT';
  else if (pages.length === 1) status = 'PARTIAL';
  else if (hitLimit) status = 'CRAWL_LIMIT';
  else status = 'SUCCESS';

  return {
    status,
    rootUrl: normalized,
    finalUrl: home.finalUrl,
    domain,
    pages,
    pagesAttempted: attempted,
    robots: { found: robots.fetched, allowed: true, disallowAll: false, sitemaps: robots.sitemaps },
    sitemapFound,
    renderUsed,
    redirectChain: homeFetch.redirectChain,
    durationMs: Date.now() - started,
  };
}

export { classifyPage, extractText };
export type { PageType, DomFacts };
