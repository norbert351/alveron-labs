import * as cheerio from 'cheerio';
import { config } from '../config.ts';
import type { SiteSnapshot } from '../types.ts';

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

async function fetchWithTimeout(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetcher.timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': config.fetcher.userAgent,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const html = await res.text();
    return { html, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

const INTERESTING_PATHS = [
  'about', 'contact', 'services', 'products', 'solutions',
  'pricing', 'team', 'careers', 'support', 'help', 'features',
];

function pickSubpages(links: string[], origin: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([origin]);
  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link, origin);
    } catch {
      continue;
    }
    if (u.origin !== new URL(origin).origin) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    const path = u.pathname.toLowerCase().replace(/\/$/, '');
    const match = INTERESTING_PATHS.find((p) => path.includes(p));
    if (match && !seen.has(u.href)) {
      seen.add(u.href);
      out.push(u.href);
    }
    if (out.length >= config.fetcher.maxPages - 1) break;
  }
  return out;
}

function detectTech(html: string, text: string): string[] {
  const tech: string[] = [];
  const checks: [RegExp, string][] = [
    [/wp-content|wp-includes|generator["'] content=["']WordPress/i, 'WordPress'],
    [/wix\.com|X-Wix-Meta/i, 'Wix'],
    [/cdn\.shopify|shopify\.com\/s\//i, 'Shopify'],
    [/squarespace/i, 'Squarespace'],
    [/_next\/static|__NEXT_DATA__/i, 'Next.js'],
    [/(?:^|["'])react["']|data-reactroot|__react/i, 'React'],
    [/vue\.js|data-v-[a-f0-9]{6,}/i, 'Vue'],
    [/angular\.js|ng-app|ng-controller/i, 'Angular'],
    [/tailwind/i, 'Tailwind CSS'],
    [/jquery[.-]min/i, 'jQuery'],
    [/bootstrap[.-]min/i, 'Bootstrap'],
    [/js\.stripe\.com/i, 'Stripe'],
    [/js\.hs-scripts\.com|hsforms/i, 'HubSpot'],
    [/widget\.intercom\.io/i, 'Intercom'],
    [/assets\.zendesk\.com/i, 'Zendesk'],
    [/elementor/i, 'Elementor'],
    [/framer\.com/i, 'Framer'],
    [/webflow\.js/i, 'Webflow'],
    [/cloudflare/i, 'Cloudflare'],
  ];
  for (const [re, name] of checks) {
    if (re.test(html) || re.test(text)) tech.push(name);
  }
  return [...new Set(tech)];
}

function extractText($: cheerio.CheerioAPI, html: string): string {
  const $root = $.root().clone();
  $root.find('script, style, noscript, svg, canvas, iframe, form, header, footer, nav').remove();
  const text = $root
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, config.fetcher.maxContentChars);
}

export async function fetchSite(rawUrl: string): Promise<SiteSnapshot> {
  const url = normalizeUrl(rawUrl);
  const { html, finalUrl } = await fetchWithTimeout(url);
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || '';
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';
  const h1s = $('h1')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 0)
    .slice(0, 8);

  const navLinks: string[] = [];
  $('nav a, header a, footer a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.trim()) navLinks.push(href.trim());
  });

  const allLinks = $('a[href]')
    .map((_, el) => $(el).attr('href')!)
    .get()
    .filter((h) => h && !h.startsWith('mailto:') && !h.startsWith('tel:') && !h.startsWith('#'));

  const origin = new URL(finalUrl).origin;
  const subpages = pickSubpages(allLinks, origin);

  const pages: { url: string; text: string }[] = [
    { url: finalUrl, text: extractText($, html) },
  ];

  for (const sub of subpages) {
    try {
      const { html: subHtml } = await fetchWithTimeout(sub);
      const sub$ = cheerio.load(subHtml);
      pages.push({ url: sub, text: extractText(sub$, subHtml) });
    } catch {
      /* skip subpage on failure */
    }
  }

  const combinedText = pages
    .map((p) => `[PAGE: ${p.url}]\n${p.text}`)
    .join('\n\n')
    .slice(0, config.fetcher.maxContentChars);

  const tech = detectTech(html, combinedText);

  return {
    url: finalUrl,
    title,
    metaDescription,
    h1s,
    navLinks: [...new Set(navLinks)].slice(0, 20),
    text: combinedText,
    links: [...new Set(allLinks)].slice(0, 60),
    tech,
    pageCount: pages.length,
  };
}
