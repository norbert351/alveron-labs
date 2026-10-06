import { assertSafeUrl } from '../ssrf.ts';
import { config } from '../config.ts';

/**
 * SSRF-guarded HTTP fetcher with full redirect-chain validation,
 * size + time caps (spec sections 7, 22, 28).
 */

export type FetchFailureClass =
  | 'SUCCESS'
  | 'TIMEOUT'
  | 'BLOCKED'
  | 'HTTP_ERROR'
  | 'INVALID_DOMAIN'
  | 'TOO_LARGE'
  | 'NETWORK_ERROR'
  | 'UNSUPPORTED_CONTENT';

export interface FetchResult {
  ok: boolean;
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  redirectChain: string[];
  responseTimeMs: number;
  bytes: number;
  failureClass: FetchFailureClass;
  error?: string;
}

const HTML_TYPES = ['text/html', 'application/xhtml+xml', 'application/xml', 'text/xml', 'text/plain'];

function headerObj(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => (out[k.toLowerCase()] = v));
  return out;
}

async function readCapped(res: Response, maxBytes: number): Promise<{ body: string; bytes: number; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const t = await res.text();
    return { body: t.slice(0, maxBytes), bytes: t.length, truncated: t.length > maxBytes };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      chunks.push(value);
      if (total >= maxBytes) {
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes);
  return { body: buf.toString('utf-8'), bytes: total, truncated };
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  acceptLanguage?: string;
}

export async function fetchPage(rawUrl: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? config.crawler.timeoutMs;
  const maxBytes = opts.maxBytes ?? config.crawler.maxBytes;
  const ua = opts.userAgent ?? config.fetcher.userAgent;
  const started = Date.now();
  const redirectChain: string[] = [];
  let current = rawUrl;

  for (let hop = 0; hop < 6; hop++) {
    let safe: URL;
    try {
      safe = await assertSafeUrl(current);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const cls: FetchFailureClass = /DNS resolution failed/i.test(msg)
        ? 'INVALID_DOMAIN'
        : /Blocked|Internal|only http/i.test(msg)
        ? 'BLOCKED'
        : 'INVALID_DOMAIN';
      return {
        ok: false, url: rawUrl, finalUrl: current, status: 0, headers: {}, body: '',
        redirectChain, responseTimeMs: Date.now() - started, bytes: 0, failureClass: cls, error: msg,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(safe.href, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
          'Accept-Language': opts.acceptLanguage || 'en-US,en;q=0.9',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      const aborted = err?.name === 'AbortError' || /abort|timeout/i.test(err?.message || '');
      return {
        ok: false, url: rawUrl, finalUrl: current, status: 0, headers: {}, body: '',
        redirectChain, responseTimeMs: Date.now() - started, bytes: 0,
        failureClass: aborted ? 'TIMEOUT' : 'NETWORK_ERROR', error: err?.message || String(err),
      };
    }

    // Redirect hop — validate the target before following.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      await res.body?.cancel().catch(() => {});
      clearTimeout(timer);
      if (!loc) {
        return {
          ok: false, url: rawUrl, finalUrl: current, status: res.status, headers: headerObj(res.headers),
          body: '', redirectChain, responseTimeMs: Date.now() - started, bytes: 0,
          failureClass: 'HTTP_ERROR', error: 'Redirect without Location header',
        };
      }
      const next = new URL(loc, safe).href;
      redirectChain.push(next);
      current = next;
      continue;
    }

    const headers = headerObj(res.headers);
    const contentType = (headers['content-type'] || '').toLowerCase();
    const isHtml = HTML_TYPES.some((t) => contentType.includes(t));

    if (res.status === 403 || res.status === 429) {
      await res.body?.cancel().catch(() => {});
      clearTimeout(timer);
      return {
        ok: false, url: rawUrl, finalUrl: current, status: res.status, headers, body: '',
        redirectChain, responseTimeMs: Date.now() - started, bytes: 0,
        failureClass: 'BLOCKED', error: `Blocked by server (HTTP ${res.status})`,
      };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      clearTimeout(timer);
      return {
        ok: false, url: rawUrl, finalUrl: current, status: res.status, headers, body: '',
        redirectChain, responseTimeMs: Date.now() - started, bytes: 0,
        failureClass: 'HTTP_ERROR', error: `HTTP ${res.status}`,
      };
    }
    if (contentType && !isHtml) {
      await res.body?.cancel().catch(() => {});
      clearTimeout(timer);
      return {
        ok: false, url: rawUrl, finalUrl: current, status: res.status, headers, body: '',
        redirectChain, responseTimeMs: Date.now() - started, bytes: 0,
        failureClass: 'UNSUPPORTED_CONTENT', error: `Unsupported content-type: ${contentType}`,
      };
    }

    let body = '';
    let bytes = 0;
    try {
      const r = await readCapped(res, maxBytes);
      body = r.body;
      bytes = r.bytes;
    } catch (err: any) {
      return {
        ok: false, url: rawUrl, finalUrl: current, status: res.status, headers, body: '',
        redirectChain, responseTimeMs: Date.now() - started, bytes: 0,
        failureClass: 'NETWORK_ERROR', error: err?.message || String(err),
      };
    } finally {
      clearTimeout(timer);
    }

    return {
      ok: true, url: rawUrl, finalUrl: current, status: res.status, headers, body,
      redirectChain, responseTimeMs: Date.now() - started, bytes, failureClass: 'SUCCESS',
    };
  }

  return {
    ok: false, url: rawUrl, finalUrl: current, status: 0, headers: {}, body: '',
    redirectChain, responseTimeMs: Date.now() - started, bytes: 0,
    failureClass: 'HTTP_ERROR', error: 'Too many redirects',
  };
}
