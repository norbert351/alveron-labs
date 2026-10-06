import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- util/url ----
import {
  normalizeUrl, domainOf, sameSite, isLikelyBusinessWebsite, businessDedupeKey,
} from '../src/util/url.ts';

test('normalizeUrl: adds scheme, strips tracking/hash, rejects invalid', () => {
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com');
  assert.equal(normalizeUrl('https://example.com/?utm_source=x&gclid=y&a=1'), 'https://example.com'); // root: query dropped for canonical root
  assert.equal(normalizeUrl('https://example.com/path?utm_source=x&b=2'), 'https://example.com/path?b=2');
  assert.equal(normalizeUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(normalizeUrl(''), null);
  assert.equal(normalizeUrl('ftp://x.com'), null);
  assert.equal(normalizeUrl('https://notreal'), null);
});

test('domainOf: lowercases and drops www', () => {
  assert.equal(domainOf('https://www.EXAMPLE.com/p'), 'example.com');
  assert.equal(domainOf('https://example.com'), 'example.com');
  assert.equal(domainOf('garbage'), null);
});

test('sameSite: apex/subdomains same site, others different', () => {
  assert.ok(sameSite('https://example.com', 'https://www.example.com'));
  assert.ok(sameSite('https://example.com', 'https://shop.example.com'));
  assert.ok(!sameSite('https://example.com', 'https://notexample.com'));
});

test('isLikelyBusinessWebsite: rejects social, directories, dead hosts', () => {
  assert.ok(isLikelyBusinessWebsite('https://realbusiness.com'));
  assert.ok(!isLikelyBusinessWebsite('https://facebook.com/acme'));
  assert.ok(!isLikelyBusinessWebsite('https://linktr.ee/acme'));
  assert.ok(!isLikelyBusinessWebsite('https://yelp.com/biz/acme'));
  assert.ok(!isLikelyBusinessWebsite('https://example.com/x'));
});

test('businessDedupeKey: prefers domain, falls back to name+city', () => {
  assert.equal(businessDedupeKey({ website: 'https://www.acme.com', name: 'Acme' }), 'domain:acme.com');
  assert.equal(businessDedupeKey({ name: 'Acme Co', city: 'London' }), 'name:acme co|london');
});

// ---- ssrf ----
import { isBlockedIp } from '../src/ssrf.ts';

test('isBlockedIp: blocks private/loopback/reserved, allows public', () => {
  assert.ok(isBlockedIp('127.0.0.1'));
  assert.ok(isBlockedIp('10.0.0.5'));
  assert.ok(isBlockedIp('172.16.0.1'));
  assert.ok(isBlockedIp('192.168.1.1'));
  assert.ok(isBlockedIp('169.254.10.1'));
  assert.ok(isBlockedIp('::1'));
  assert.ok(isBlockedIp('fc00::1'));
  assert.ok(!isBlockedIp('8.8.8.8'));
  assert.ok(!isBlockedIp('104.16.0.1'));
});

// ---- robots ----
import { parseRobots, isPathAllowed } from '../src/crawler/robots.ts';

test('robots: parses groups, disallow-all, and path rules', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /\nSitemap: https://x.com/sitemap.xml', 'AlveronBot/1');
  assert.equal(rules.fetched, true);
  assert.equal(rules.disallowAll, true);
  assert.deepEqual(rules.sitemaps, ['https://x.com/sitemap.xml']);

  const rules2 = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /pricing', 'AlveronBot/1');
  assert.equal(isPathAllowed(rules2, '/admin'), false);
  assert.equal(isPathAllowed(rules2, '/pricing'), true);
  assert.equal(isPathAllowed(rules2, '/about'), true);
});

// ---- page type ----
import { classifyPage } from '../src/crawler/pageType.ts';

test('classifyPage: identifies page types from URL and title', () => {
  assert.equal(classifyPage('https://x.com/'), 'homepage');
  assert.equal(classifyPage('https://x.com/contact'), 'contact');
  assert.equal(classifyPage('https://x.com/book-now'), 'booking');
  assert.equal(classifyPage('https://x.com/pricing'), 'pricing');
  assert.equal(classifyPage('https://x.com/cart'), 'checkout');
  assert.equal(classifyPage('https://x.com/blog'), 'blog');
});

// ---- dom facts ----
import { extractDomFacts, emptyDom } from '../src/crawler/dom.ts';

test('extractDomFacts: observes viewport, forms, links, structured data', () => {
  const html = `<html lang="en">
    <head><meta name="viewport" content="width=device-width"><meta name="description" content="hi">
      <meta property="og:title" content="OG"><link rel="canonical" href="https://x.com/">
      <script type="application/ld+json">{"@type":"Restaurant","name":"X"}</script>
    </head>
    <body><h1>Title</h1><form><input type="email"><input type="text"><button>Send</button></form>
    <a href="/contact">Contact</a><a href="tel:+123456">Call</a><img src="a.png">
    <a href="https://facebook.com/x">FB</a></body></html>`;
  const facts = extractDomFacts(html, 'https://x.com/');
  assert.equal(facts.hasViewport, true);
  assert.equal(facts.metaDescription, 'hi');
  assert.equal(facts.ogTitle, 'OG');
  assert.equal(facts.formCount, 1);
  assert.equal(facts.forms[0].hasEmailField, true);
  assert.equal(facts.telLinks, 1);
  assert.ok(facts.jsonLdTypes.includes('Restaurant'));
  assert.ok(facts.socialLinks.includes('facebook.com'));
});

test('emptyDom: returns a structurally valid DomFacts', () => {
  const d = emptyDom();
  assert.equal(d.formCount, 0);
  assert.equal(d.jsonLdTypes.length, 0);
});

// ---- signals (deterministic findings) ----
import { extractSignals } from '../src/signals/extract.ts';
import type { CrawlResult, CrawledPage } from '../src/crawler/crawler.ts';

function makePage(over: Partial<CrawledPage> & { dom?: any }): CrawledPage {
  return {
    url: 'https://x.com/', finalUrl: 'https://x.com/', pageType: 'homepage', httpStatus: 200,
    contentType: 'text/html', language: null, title: 'X Restaurant', metaDescription: '',
    depth: 0, rendered: false, contentLength: 100, responseTimeMs: 500, bytes: 1000,
    text: 'Welcome to X Restaurant. About our menu and reservations.',
    contentHash: 'abc', linksCount: 2,
    links: [{ href: 'https://x.com/contact', text: 'Contact' }],
    dom: emptyDom(),
    ...over,
  };
}

function makeCrawl(pages: CrawledPage[]): CrawlResult {
  return {
    status: 'SUCCESS', rootUrl: 'https://x.com/', finalUrl: 'https://x.com/', domain: 'x.com',
    pages, pagesAttempted: pages.length,
    robots: { found: true, allowed: true, disallowAll: false, sitemaps: [] },
    sitemapFound: true, renderUsed: false, redirectChain: [], durationMs: 100,
  };
}

test('extractSignals: flags missing viewport and missing HTTPS deterministically', async () => {
  const page = makePage({ finalUrl: 'http://x.com/', dom: { ...emptyDom(), hasViewport: false } });
  const s = await extractSignals(makeCrawl([page]), { industry: 'restaurants' });
  const findings = s.findings.map((f) => `${f.category}/${f.description}`);
  assert.ok(findings.some((f) => f.startsWith('security/') && f.includes('HTTP')));
  assert.ok(findings.some((f) => f.startsWith('ux/') && f.includes('viewport')));
  assert.equal(s.technical.https, false);
});

test('extractSignals: industry expectations are industry aware', async () => {
  const page = makePage({ dom: { ...emptyDom(), hasViewport: true } });
  const s = await extractSignals(makeCrawl([page]), { industry: 'restaurants' });
  const findings = s.findings.map((f) => `${f.category}/${f.description}`);
  assert.ok(findings.some((f) => f.startsWith('conversion/') && /reservation/.test(f)));
  assert.ok(findings.some((f) => f.startsWith('conversion/') && /ordering/.test(f)));
});

// ---- AI schema validation ----
import { validateProblems } from '../src/research/schema.ts';

test('validateProblems: enforces strict schema and unsupported-confidence downgrade', () => {
  const good = validateProblems({
    problems: [{
      title: 'No booking flow', category: 'conversion', description: 'd',
      evidence: [{ url: 'https://x.com', text: 'no form', signal: 's', type: 'observed' }],
      confidence: 0.9, business_impact: 'high', requires_verification: false,
    }],
  });
  assert.equal(good.length, 1);
  assert.equal(good[0].confidence, 0.9);

  const weak = validateProblems({
    problems: [{ title: 'Probably bad', category: 'ux', description: 'd', evidence: [], confidence: 0.95, business_impact: 'unknown' }],
  });
  assert.equal(weak[0].confidence, 0.4);
  assert.equal(weak[0].requires_verification, true);

  const coerced = validateProblems({ problems: [{ title: 'x', category: 'nope', description: 'd', evidence: [{ url: 'u', text: 't', signal: 's', type: 'observed' }], confidence: 0.5, business_impact: 'low' }] });
  assert.equal(coerced[0].category, 'other');

  assert.equal(validateProblems({ problems: [] }).length, 0);
  assert.equal(validateProblems(null).length, 0);
});

// ---- opportunity derivation + scoring + recommendation ----
import { deriveOpportunities, scoreOpportunity, recommendServices } from '../src/research/derive.ts';

test('deriveOpportunities: only impactful problems become opportunities', () => {
  const findings = [
    { category: 'conversion', description: 'No booking', severity: 'high' as const, confidence: 0.8, source_url: 'u', evidence: [] },
    { category: 'technical', description: 'Missing meta', severity: 'low' as const, confidence: 0.9, source_url: 'u', evidence: [] },
  ];
  const opps = deriveOpportunities([], findings, 'c1');
  assert.equal(opps.length, 1);
  assert.equal(opps[0].source, 'programmatic');
});

test('deriveOpportunities: uids scoped per company (no cross-company collision)', () => {
  const findings = [{ category: 'conversion', description: 'No booking', severity: 'medium' as const, confidence: 0.7, source_url: 'u', evidence: [] }];
  const a = deriveOpportunities([], findings, 'c1')[0].uid;
  const b = deriveOpportunities([], findings, 'c2')[0].uid;
  assert.notEqual(a, b);
  assert.equal(deriveOpportunities([], findings, 'c1')[0].uid, a);
});

test('scoreOpportunity: transparent weighted score in a sane range', () => {
  const opp = { uid: 'u', source: 'programmatic' as const, title: 't', description: 'd', business_value: 'v', alveron_can_solve: true, category: 'conversion', business_impact: 'high', severity: 'high', confidence: 0.9, evidence_count: 4, problem_index: 0 };
  const s = scoreOpportunity({ opportunity: opp, matchedServices: 2, pagesCrawled: 8, signalCount: 40 });
  assert.ok(s.overall_score >= 0 && s.overall_score <= 100);
  assert.ok(['High', 'Medium', 'Low', 'Poor fit'].includes(s.priority));
  assert.ok('evidence_confidence' in s.components);
  assert.ok(s.rationale.length > 20);
});

test('recommendServices: maps categories and returns [] when no fit', () => {
  const catalog = [
    { code: 'ECOMMERCE', name: 'Ecommerce', description: 'd', keywords: ['checkout', 'cart'], categories: [] },
    { code: 'WEBSITE_DEVELOPMENT', name: 'Website Dev', description: 'd', keywords: ['website'], categories: [] },
    { code: 'CRM_IMPLEMENTATION', name: 'CRM', description: 'd', keywords: ['lead', 'crm'], categories: [] },
  ];
  const opp = { uid: 'u', source: 'programmatic' as const, title: 'Strengthen the online sales funnel', description: 'Commerce present but no payment provider', business_value: 'v', alveron_can_solve: true, category: 'ecommerce', business_impact: 'high', severity: 'high', confidence: 0.8, evidence_count: 3, problem_index: -1 };
  const recs = recommendServices({ opportunity: opp, catalog, evidenceSummary: 'evidence' });
  assert.ok(recs.length >= 1);
  assert.ok(recs.some((r) => r.service_code === 'ECOMMERCE'));
  assert.equal(recommendServices({ opportunity: { ...opp, category: 'other' }, catalog: [], evidenceSummary: 'x' }).length, 0);
});

// ---- overpass query builder ----
import { buildOverpassQL } from '../src/discovery/overpass.ts';

test('buildOverpassQL: builds a bounded query with website filters', () => {
  const ql = buildOverpassQL({ bbox: ['10', '20', '30', '40'], filters: ['["amenity"="restaurant"]'], websiteRequired: true, limit: 25 });
  assert.ok(ql.includes('["amenity"="restaurant"]["website"]'));
  assert.ok(ql.includes('["amenity"="restaurant"]["contact:website"]'));
  assert.ok(ql.includes('(10,30,20,40)'));
  assert.ok(ql.includes('out center 25'));
});