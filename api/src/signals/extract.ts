import { config } from '../config.ts';
import { fetchPage } from '../crawler/fetcher.ts';
import { sameSite, normalizeUrl } from '../util/url.ts';
import { pMap } from '../util/concurrency.ts';
import type { CrawlResult, CrawledPage } from '../crawler/crawler.ts';

/**
 * Deterministic website + business signal collection and rule-based finding
 * detection (spec sections 9, 27).
 *
 * EVERYTHING here is collected programmatically. The AI layer never has to
 * guess whether a site has HTTPS, a form, a viewport, analytics, etc. — those
 * facts are established in code and passed to the AI as evidence.
 */

export type FindingCategory =
  | 'technical' | 'ux' | 'business' | 'conversion' | 'automation'
  | 'customer_experience' | 'ecommerce' | 'security' | 'accessibility' | 'other';

export interface EvidenceItem {
  type: 'observed' | 'inferred' | 'unknown';
  url: string;
  text: string;
  signal: string;
}

export interface SignalRecord {
  category: 'technical' | 'ux' | 'business';
  key: string;
  value: unknown;
  confidence: number;
  source_url: string;
}

export interface DeterministicFinding {
  category: FindingCategory;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'unknown';
  confidence: number;
  source_url: string;
  evidence: EvidenceItem[];
}

export interface SiteSignals {
  technical: Record<string, unknown>;
  ux: Record<string, unknown>;
  business: Record<string, unknown>;
  signals: SignalRecord[];
  findings: DeterministicFinding[];
  brokenLinks: { url: string; status: number }[];
}

function union<T>(arrs: T[][]): T[] {
  return [...new Set(arrs.flat())];
}

function homepageOf(crawl: CrawlResult): CrawledPage | null {
  return crawl.pages.find((p) => p.pageType === 'homepage') || crawl.pages[0] || null;
}

function pagesOfType(crawl: CrawlResult, ...types: string[]): CrawledPage[] {
  return crawl.pages.filter((p) => types.includes(p.pageType));
}

export async function checkBrokenLinks(
  crawl: CrawlResult,
  limit = 6,
  timeoutMs = 8000
): Promise<{ url: string; status: number }[]> {
  const home = homepageOf(crawl);
  if (!home) return [];
  const crawled = new Set(crawl.pages.map((p) => normalizeUrl(p.finalUrl)));
  const candidates = union([home.links.map((l) => l.href)])
    .map((h) => normalizeUrl(h))
    .filter((u): u is string => Boolean(u))
    .filter((u) => sameSite(u, crawl.finalUrl) && !crawled.has(u))
    .slice(0, limit);

  const results = await pMap(candidates, 3, async (url) => {
    const r = await fetchPage(url, { timeoutMs, maxBytes: 20000 });
    return { url, status: r.ok ? r.status : r.status || 0 };
  });
  return results.filter((r) => r.status === 0 || r.status >= 400);
}

/** Industry-aware expectations (spec section 17) — abstracted, data-driven. */
interface Expectation {
  key: string;
  label: string;
  category: FindingCategory;
  severity: 'low' | 'medium' | 'high';
  /** returns true when the capability is detected */
  detected: (s: SiteSignals) => boolean;
  evidenceText: string;
}

const EXPECTATION_ALIASES: { match: RegExp; keys: string[] }[] = [
  { match: /restaurant|food|cafe|dining|bistro|takeaway|bakery|bar|pub/i, keys: ['ordering', 'reservation'] },
  { match: /hotel|hospitality|lodging|guest|hostel|resort|motel|bnb/i, keys: ['booking'] },
  { match: /dental|dentist|clinic|medical|doctor|health|surger|physician|therap|veterinar/i, keys: ['appointment'] },
  { match: /real estate|property|realtor|estate agent|letting/i, keys: ['listings', 'property_inquiry'] },
  { match: /ecommerce|e-commerce|online store|shop|retail|store|dtc|d2c|marketplace/i, keys: ['checkout', 'product_discovery'] },
  { match: /saas|software|app|platform|tech|startup/i, keys: ['pricing', 'signup'] },
  { match: /law|legal|attorney|solicitor|account|consult|agency|insurance|financial/i, keys: ['lead_capture', 'consultation'] },
  { match: /car|auto|garage|mechanic|dealership|logistic|freight|courier|construction|builder|contractor/i, keys: ['quote_request', 'lead_capture'] },
];

const ALL_EXPECTATIONS: Record<string, Expectation> = {
  ordering: {
    key: 'ordering', label: 'Online ordering', category: 'conversion', severity: 'medium',
    detected: (s) => Boolean((s.business.ordering_process as any)?.detected),
    evidenceText: 'No online ordering or buy-now path was found on the crawled pages.',
  },
  reservation: {
    key: 'reservation', label: 'Online reservation/booking', category: 'conversion', severity: 'medium',
    detected: (s) => Boolean((s.business.booking_process as any)?.detected),
    evidenceText: 'No online reservation or table-booking mechanism was detected.',
  },
  booking: {
    key: 'booking', label: 'Online booking', category: 'conversion', severity: 'high',
    detected: (s) => Boolean((s.business.booking_process as any)?.detected),
    evidenceText: 'No online booking or availability mechanism was detected on the site.',
  },
  appointment: {
    key: 'appointment', label: 'Online appointment scheduling', category: 'conversion', severity: 'high',
    detected: (s) => Boolean((s.business.booking_process as any)?.detected),
    evidenceText: 'No online appointment-scheduling mechanism was detected.',
  },
  listings: {
    key: 'listings', label: 'Property listings / search', category: 'business', severity: 'medium',
    detected: (s) => Boolean((s.business.product_discovery as any)?.detected),
    evidenceText: 'No searchable property listing or product catalogue page was detected.',
  },
  property_inquiry: {
    key: 'property_inquiry', label: 'Structured property enquiry', category: 'conversion', severity: 'medium',
    detected: (s) => Boolean((s.business.lead_capture as any)?.detected),
    evidenceText: 'No structured enquiry form was detected (contact appears to rely on plain contact details).',
  },
  checkout: {
    key: 'checkout', label: 'Working checkout + payment', category: 'ecommerce', severity: 'high',
    detected: (s) => Boolean((s.business.checkout as any)?.detected) && Boolean((s.technical.payment_providers as any[])?.length),
    evidenceText: 'No checkout path with a recognised payment provider was detected.',
  },
  product_discovery: {
    key: 'product_discovery', label: 'Product discovery / catalogue', category: 'ecommerce', severity: 'medium',
    detected: (s) => Boolean((s.business.product_discovery as any)?.detected),
    evidenceText: 'No product catalogue or product-discovery page was detected.',
  },
  pricing: {
    key: 'pricing', label: 'Visible pricing', category: 'business', severity: 'low',
    detected: (s) => Boolean((s.business.pricing_visibility as any)?.detected),
    evidenceText: 'No pricing or plans page was detected.',
  },
  signup: {
    key: 'signup', label: 'Self-serve signup / demo', category: 'conversion', severity: 'medium',
    detected: (s) => Boolean((s.business.lead_capture as any)?.detected) || Boolean((s.ux.cta_present as any)?.detected),
    evidenceText: 'No signup, free-trial or demo-request entry point was detected.',
  },
  lead_capture: {
    key: 'lead_capture', label: 'Structured lead capture', category: 'conversion', severity: 'medium',
    detected: (s) => Boolean((s.business.lead_capture as any)?.detected),
    evidenceText: 'No structured lead-capture form was detected; enquiries appear to rely on listed contact details.',
  },
  consultation: {
    key: 'consultation', label: 'Consultation booking', category: 'conversion', severity: 'medium',
    detected: (s) => Boolean((s.business.booking_process as any)?.detected) || Boolean((s.business.lead_capture as any)?.detected),
    evidenceText: 'No consultation-booking or structured enquiry flow was detected.',
  },
  quote_request: {
    key: 'quote_request', label: 'Quote request flow', category: 'conversion', severity: 'medium',
    detected: (s) => Boolean((s.business.lead_capture as any)?.detected),
    evidenceText: 'No quote-request flow was detected; enquiries appear to rely on plain contact details.',
  },
};

export function industryExpectations(industry?: string): Expectation[] {
  const ind = industry || '';
  const keys = new Set<string>();
  for (const a of EXPECTATION_ALIASES) if (a.match.test(ind)) a.keys.forEach((k) => keys.add(k));
  return [...keys].map((k) => ALL_EXPECTATIONS[k]).filter(Boolean);
}

export interface ExtractOptions {
  industry?: string;
  checkLinks?: boolean;
  maxBrokenChecks?: number;
}

export async function extractSignals(crawl: CrawlResult, opts: ExtractOptions = {}): Promise<SiteSignals> {
  const home = homepageOf(crawl);
  const signals: SignalRecord[] = [];
  const findings: DeterministicFinding[] = [];

  const push = (category: SignalRecord['category'], key: string, value: unknown, source_url: string, confidence = 0.9) => {
    signals.push({ category, key, value, confidence, source_url });
  };

  if (!home) {
    return { technical: {}, ux: {}, business: {}, signals, findings, brokenLinks: [] };
  }

  const homeUrl = home.finalUrl;
  const allDom = crawl.pages.map((p) => p.dom);

  const thirdParty = union(allDom.map((d) => d.externalScriptHosts));
  const analytics = union(allDom.map((d) => d.analyticsIndicators));
  const payments = union(allDom.map((d) => d.paymentIndicators));
  const cms = union(allDom.map((d) => d.cmsIndicators));
  const ecommerce = union(allDom.map((d) => d.ecommerceIndicators));
  const booking = union(allDom.map((d) => d.bookingIndicators));
  const bookingProviders = union(allDom.map((d) => d.bookingProviders));
  const chat = union(allDom.map((d) => d.chatIndicators));
  const crm = union(allDom.map((d) => d.crmIndicators));
  const jsonLd = union(allDom.map((d) => d.jsonLdTypes));
  const social = union(allDom.map((d) => d.socialLinks));
  const ctas = union(allDom.map((d) => d.ctaTexts));
  const forms = allDom.flatMap((d) => d.forms);
  const totalForms = allDom.reduce((n, d) => n + d.formCount, 0);
  const emailForms = forms.filter((f) => f.hasEmailField).length;
  const telLinks = allDom.reduce((n, d) => n + d.telLinks, 0);
  const mailtoLinks = allDom.reduce((n, d) => n + d.mailtoLinks, 0);
  const imgCount = allDom.reduce((n, d) => n + d.imgCount, 0);
  const imgMissingAlt = allDom.reduce((n, d) => n + d.imgMissingAlt, 0);

  const hasContactPage = pagesOfType(crawl, 'contact').length > 0;
  const hasBookingPage = pagesOfType(crawl, 'booking').length > 0;
  const hasPricingPage = pagesOfType(crawl, 'pricing').length > 0;
  const hasProductsPage = pagesOfType(crawl, 'products', 'menu').length > 0;
  const hasServicesPage = pagesOfType(crawl, 'services').length > 0;
  const hasCheckoutPage = pagesOfType(crawl, 'checkout').length > 0;
  const hasFaq = pagesOfType(crawl, 'faq').length > 0;

  const bookingDetected = booking.length > 0 || bookingProviders.length > 0 || hasBookingPage;
  const checkoutDetected = ecommerce.length > 0 || hasCheckoutPage;
  const productDiscovery = hasProductsPage || ecommerce.some((e) => /Cart|Commerce|Shopify|Magento|WooCommerce/i.test(e));
  const leadCapture = totalForms > 0 && (emailForms > 0 || forms.some((f) => f.inputCount >= 2));
  const contactAccessible = hasContactPage || telLinks > 0 || mailtoLinks > 0 || totalForms > 0;

  // ---- technical signals ----
  const technical: Record<string, unknown> = {
    http_status: home.httpStatus,
    https: home.finalUrl.startsWith('https://'),
    redirect_chain: crawl.redirectChain,
    response_time_ms: home.responseTimeMs,
    page_size_bytes: home.bytes,
    title: home.title,
    title_present: Boolean(home.title),
    meta_description: home.metaDescription,
    meta_description_present: Boolean(home.metaDescription),
    canonical: home.dom.hasCanonical,
    viewport: home.dom.hasViewport,
    robots_found: crawl.robots.found,
    robots_disallow_all: crawl.robots.disallowAll,
    sitemap_found: crawl.sitemapFound,
    script_count: allDom.reduce((n, d) => n + d.scriptCount + d.inlineScriptCount, 0),
    third_party_services: thirdParty,
    analytics,
    payment_providers: payments,
    cms,
    ecommerce_platform: ecommerce,
    booking_systems: [...booking, ...bookingProviders],
    forms_count: totalForms,
    email_forms: emailForms,
    chat_widgets: chat,
    crm,
    cookie_banner: allDom.some((d) => d.hasCookieBanner),
    structured_data_types: jsonLd,
    schema_markup: jsonLd.length > 0,
    iframes: union(allDom.map((d) => d.iframeHosts)),
    pages_crawled: crawl.pages.length,
    render_used: crawl.renderUsed,
    language: home.language,
    cms_detected: cms.length > 0,
    images: imgCount,
    images_missing_alt: imgMissingAlt,
  };
  push('technical', 'https', technical.https, homeUrl, 1.0);
  push('technical', 'viewport', technical.viewport, homeUrl, 1.0);
  push('technical', 'sitemap_found', crawl.sitemapFound, homeUrl, 1.0);
  push('technical', 'structured_data_types', jsonLd, homeUrl, 0.95);
  push('technical', 'cms', cms, homeUrl, 0.8);
  push('technical', 'analytics', analytics, homeUrl, 0.85);
  push('technical', 'payment_providers', payments, homeUrl, 0.85);
  push('technical', 'forms_count', totalForms, homeUrl, 1.0);

  // ---- UX signals ----
  const ux: Record<string, unknown> = {
    mobile_viewport: { detected: home.dom.hasViewport, value: home.dom.hasViewport },
    nav_links: home.dom.navLinkCount,
    cta_present: { detected: ctas.length > 0, examples: ctas.slice(0, 8) },
    contact_accessible: { detected: contactAccessible, has_contact_page: hasContactPage, tel: telLinks, email: mailtoLinks },
    booking_accessible: { detected: bookingDetected },
    product_discovery: { detected: productDiscovery },
    checkout_path: { detected: checkoutDetected },
    form_usability: { detected: totalForms > 0, forms: totalForms, email_forms: emailForms },
    images_missing_alt: { detected: imgMissingAlt > 0, missing: imgMissingAlt, total: imgCount },
    rendered_required: { detected: crawl.status === 'REQUIRES_BROWSER' },
    faq_present: { detected: hasFaq },
  };
  for (const [k, v] of Object.entries(ux)) push('ux', k, v, homeUrl, 0.9);

  // ---- business signals ----
  const business: Record<string, unknown> = {
    business_type_hint: jsonLd.find((t) => /Restaurant|Store|LocalBusiness|MedicalBusiness|Organization|Hotel/i.test(t)) || null,
    services_pages: { detected: hasServicesPage },
    product_discovery: { detected: productDiscovery },
    contact_channels: { phone: telLinks > 0, email: mailtoLinks > 0, form: totalForms > 0, chat: chat.length > 0, whatsapp: chat.includes('WhatsApp') },
    booking_process: { detected: bookingDetected, providers: [...booking, ...bookingProviders] },
    ordering_process: { detected: productDiscovery && (bookingDetected || ecommerce.length > 0) },
    checkout: { detected: checkoutDetected, payments },
    lead_capture: { detected: leadCapture, email_forms: emailForms, forms: totalForms },
    support_channels: { chat: chat.length > 0, faq: hasFaq },
    social_links: social,
    pricing_visibility: { detected: hasPricingPage, page: hasPricingPage },
    trust_signals: { https: home.finalUrl.startsWith('https://'), structured_data: jsonLd.length > 0 },
  };
  for (const [k, v] of Object.entries(business)) push('business', k, v, homeUrl, 0.85);

  // ---- deterministic findings ----
  const ev = (type: EvidenceItem['type'], url: string, text: string, signal: string): EvidenceItem => ({ type, url, text, signal });

  if (!home.finalUrl.startsWith('https://')) {
    findings.push({
      category: 'security', severity: 'high', confidence: 1.0, source_url: home.finalUrl,
      description: 'The website is served over plain HTTP, so traffic (including any form submissions) is unencrypted.',
      evidence: [ev('observed', home.finalUrl, `Final URL uses the http:// scheme: ${home.finalUrl}`, 'technical.https=false')],
    });
  }
  if (!home.dom.hasViewport) {
    findings.push({
      category: 'ux', severity: 'medium', confidence: 0.98, source_url: home.finalUrl,
      description: 'No mobile viewport meta tag was found, so the page may not render responsively on phones.',
      evidence: [ev('observed', home.finalUrl, 'No <meta name="viewport"> element present in the homepage HTML.', 'ux.mobile_viewport=false')],
    });
  }
  if (crawl.status === 'REQUIRES_BROWSER') {
    findings.push({
      category: 'technical', severity: 'medium', confidence: 0.85, source_url: home.finalUrl,
      description: 'The website returned very little static HTML and appears to depend on client-side JavaScript to render content.',
      evidence: [ev('observed', home.finalUrl, `Static fetch produced only ${home.text.trim().length} characters of visible text; headless rendering was required/attempted.`, 'ux.rendered_required=true')],
    });
  }
  if (!home.metaDescription) {
    findings.push({
      category: 'technical', severity: 'low', confidence: 0.95, source_url: home.finalUrl,
      description: 'The homepage has no meta description, which weakens search-result presentation.',
      evidence: [ev('observed', home.finalUrl, 'No <meta name="description"> content found.', 'technical.meta_description_present=false')],
    });
  }
  if (jsonLd.length === 0) {
    findings.push({
      category: 'technical', severity: 'low', confidence: 0.9, source_url: home.finalUrl,
      description: 'No structured data (JSON-LD / schema.org) markup was detected, reducing rich-result eligibility.',
      evidence: [ev('observed', home.finalUrl, 'No <script type="application/ld+json"> blocks found across crawled pages.', 'technical.schema_markup=false')],
    });
  }
  if (!crawl.sitemapFound && crawl.robots.sitemaps.length === 0) {
    findings.push({
      category: 'technical', severity: 'low', confidence: 0.8, source_url: home.finalUrl,
      description: 'No XML sitemap was found, which can slow search-engine discovery of pages.',
      evidence: [ev('observed', home.finalUrl, 'No sitemap.xml and no Sitemap directive in robots.txt.', 'technical.sitemap_found=false')],
    });
  }
  if (totalForms === 0 && (telLinks > 0 || mailtoLinks > 0)) {
    findings.push({
      category: 'conversion', severity: 'medium', confidence: 0.85, source_url: home.finalUrl,
      description: `The site exposes contact details (${telLinks} phone link(s), ${mailtoLinks} email link(s)) but no inquiry form, so enquiries are unstructured and easy to lose.`,
      evidence: [
        ev('observed', home.finalUrl, `Detected ${telLinks} tel: link(s) and ${mailtoLinks} mailto: link(s) and 0 HTML forms across crawled pages.`, 'business.lead_capture=false'),
      ],
    });
  }
  if (hasContactPage && totalForms === 0) {
    findings.push({
      category: 'conversion', severity: 'medium', confidence: 0.8, source_url: home.finalUrl,
      description: 'A contact page exists but no form was detected on it, so there is no structured way to capture enquiries.',
      evidence: [ev('observed', homeUrl, 'Contact page crawled; no <form> element found in its HTML.', 'ux.form_usability=false')],
    });
  }
  if (home.responseTimeMs > 3000) {
    findings.push({
      category: 'ux', severity: 'medium', confidence: 0.75, source_url: home.finalUrl,
      description: `The homepage took ${home.responseTimeMs}ms to respond, which is slow enough to affect conversion.`,
      evidence: [ev('observed', home.finalUrl, `Measured TTFB/response time ${home.responseTimeMs}ms (>3000ms threshold).`, 'technical.response_time_ms')],
    });
  }
  if (home.bytes > 2_500_000) {
    findings.push({
      category: 'technical', severity: 'low', confidence: 0.7, source_url: home.finalUrl,
      description: `The homepage HTML alone is ${(home.bytes / 1_000_000).toFixed(2)}MB, which is unusually large and slows loading.`,
      evidence: [ev('observed', home.finalUrl, `Measured homepage payload ${home.bytes} bytes.`, 'technical.page_size_bytes')],
    });
  }
  if (imgCount > 0 && imgMissingAlt / Math.max(1, imgCount) > 0.5) {
    findings.push({
      category: 'accessibility', severity: 'low', confidence: 0.8, source_url: home.finalUrl,
      description: `${imgMissingAlt} of ${imgCount} images lack alt text, which harms accessibility and SEO.`,
      evidence: [ev('observed', homeUrl, `${imgMissingAlt}/${imgCount} <img> elements have no alt attribute.`, 'ux.images_missing_alt')],
    });
  }
  if (analytics.length === 0) {
    findings.push({
      category: 'business', severity: 'low', confidence: 0.7, source_url: home.finalUrl,
      description: 'No web-analytics or tag-management script was detected, so traffic and conversion cannot be measured.',
      evidence: [ev('observed', homeUrl, 'No known analytics/tag-manager signatures found across crawled pages.', 'technical.analytics=[]')],
    });
  }
  if (checkoutDetected && payments.length === 0) {
    findings.push({
      category: 'ecommerce', severity: 'medium', confidence: 0.6, source_url: home.finalUrl,
      description: 'Commerce/cart functionality appears present but no recognised payment provider was detected.',
      evidence: [ev('inferred', homeUrl, `Cart/ecommerce indicators: ${ecommerce.join(', ') || 'cart UI'}; no Stripe/PayPal/Square/etc. signature found.`, 'business.checkout.payments=[]')],
    });
  }

  // Industry expectations
  for (const exp of industryExpectations(opts.industry)) {
    if (!exp.detected(await Promise.resolve({ technical, ux, business, signals, findings, brokenLinks: [] } as SiteSignals))) {
      findings.push({
        category: exp.category, severity: exp.severity, confidence: 0.75, source_url: homeUrl,
        description: `${exp.label} was expected for this industry but was not detected. ${exp.evidenceText}`,
        evidence: [ev('observed', homeUrl, `Industry expectation "${exp.key}" not satisfied by crawled signals.`, `expectation.${exp.key}=false`)],
      });
    }
  }

  // Broken links (bounded, opt-in)
  let brokenLinks: { url: string; status: number }[] = [];
  if (opts.checkLinks) {
    try {
      brokenLinks = await checkBrokenLinks(crawl, opts.maxBrokenChecks ?? 6);
      if (brokenLinks.length > 0) {
        findings.push({
          category: 'technical', severity: 'medium', confidence: 0.7, source_url: homeUrl,
          description: `${brokenLinks.length} broken or unreachable internal link(s) were found on the homepage.`,
          evidence: brokenLinks.slice(0, 5).map((b) => ev('observed', b.url, `Link returned status ${b.status || 'no response'}.`, 'broken_link')),
        });
      }
    } catch {
      /* best effort */
    }
  }

  technical.broken_links = brokenLinks;

  return { technical, ux, business, signals, findings, brokenLinks };
}

export { config };
