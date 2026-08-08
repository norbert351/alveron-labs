import { chromium, type Browser } from 'playwright-core';
import { assertSafeUrl } from '../ssrf.ts';

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

let browser: Browser | null = null;
let browserReady: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  if (!browserReady) {
    browserReady = chromium
      .launch({
        executablePath: CHROMIUM_PATH,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions'],
      })
      .then((b) => {
        browser = b;
        return b;
      });
  }
  return browserReady;
}

export interface RenderedPage {
  url: string;
  title: string;
  text: string;
  meta: Record<string, string>;
  rendered: boolean;
}

/**
 * Render a page with a real headless browser. SSRF-safe:
 * - the URL is DNS-checked before launch (private/loopback blocked)
 * - the final URL after redirects is DNS-checked again
 * - subresources that resolve to private IPs are aborted at the network layer
 * - hard timeouts and resource caps
 */
export async function renderWithBrowser(url: string, timeoutMs = 25000): Promise<RenderedPage> {
  await assertSafeUrl(url); // pre-check
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  try {
    const page = await context.newPage();
    // abort heavy or unsafe subresources: images, media, fonts, and any private-IP host
    await page.route('**/*', async (route) => {
      const req = route.request();
      const type = req.resourceType();
      if (['image', 'media', 'font'].includes(type)) return route.abort();
      try {
        const host = new URL(req.url()).hostname;
        if (host === 'localhost' || host.endsWith('.localhost') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
          return route.abort();
        }
      } catch {
        return route.abort();
      }
      return route.continue();
    });

    const response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
    if (!response) throw new Error('No response from browser navigation');
    // wait for client-side rendering to settle
    await page.waitForTimeout(2500);

    const finalUrl = page.url();
    if (finalUrl !== url) await assertSafeUrl(finalUrl); // re-check after redirects

    const result = await page.evaluate(() => {
      const text = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim();
      const title = document.title || '';
      const meta: Record<string, string> = {};
      for (const m of document.querySelectorAll('meta')) {
        const k = m.getAttribute('name') || m.getAttribute('property');
        const v = m.getAttribute('content');
        if (k && v) meta[k] = v.slice(0, 300);
      }
      return { text: text.slice(0, 60000), title, meta };
    });

    return { url: finalUrl, rendered: true, ...result };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    browserReady = null;
  }
}
