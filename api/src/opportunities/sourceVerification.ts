import { assertSafeUrl } from '../ssrf.ts';

export type SourceCheck = {
  state: 'reachable' | 'not_found' | 'unsafe' | 'inconclusive';
  http_status: number | null;
  checked_at: string;
  final_url: string | null;
  detail: string;
};

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
type SafeUrl = (url: string) => Promise<URL>;

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export async function checkSourceReachability(
  rawUrl: string,
  options: { fetcher?: Fetcher; safeUrl?: SafeUrl; timeoutMs?: number } = {},
): Promise<SourceCheck> {
  const fetcher = options.fetcher || fetch;
  const safeUrl = options.safeUrl || assertSafeUrl;
  const timeoutMs = options.timeoutMs || 10000;
  const checkedAt = () => new Date().toISOString();
  let current: URL;
  try {
    current = await safeUrl(rawUrl);
  } catch (error) {
    return { state: 'unsafe', http_status: null, checked_at: checkedAt(), final_url: null, detail: error instanceof Error ? error.message : 'Source URL failed safety checks.' };
  }

  for (let hop = 0; hop <= 3; hop++) {
    let response: Response;
    try {
      response = await fetcher(current, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'AlveronLabsOpportunityChecker/1.0', Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ([403, 405, 501].includes(response.status)) {
        response = await fetcher(current, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'User-Agent': 'AlveronLabsOpportunityChecker/1.0', Range: 'bytes=0-0', Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      }
    } catch (error) {
      return { state: 'inconclusive', http_status: null, checked_at: checkedAt(), final_url: current.toString(), detail: error instanceof Error ? error.message.slice(0, 300) : 'The source could not be reached.' };
    }

    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get('location');
      if (!location || hop === 3) {
        return { state: 'inconclusive', http_status: response.status, checked_at: checkedAt(), final_url: current.toString(), detail: 'The source returned a redirect that could not be safely followed.' };
      }
      try {
        const next = new URL(location, current);
        current = await safeUrl(next.toString());
      } catch (error) {
        return { state: 'unsafe', http_status: response.status, checked_at: checkedAt(), final_url: null, detail: error instanceof Error ? error.message : 'Redirect target failed safety checks.' };
      }
      continue;
    }

    try { await response.body?.cancel(); } catch { /* Response body is intentionally discarded. */ }
    if (response.status >= 200 && response.status < 300) {
      return { state: 'reachable', http_status: response.status, checked_at: checkedAt(), final_url: current.toString(), detail: 'The source URL responded successfully. This does not prove that the opportunity is still open.' };
    }
    if (response.status === 404 || response.status === 410) {
      return { state: 'not_found', http_status: response.status, checked_at: checkedAt(), final_url: current.toString(), detail: 'The source returned a not-found or gone response.' };
    }
    return { state: 'inconclusive', http_status: response.status, checked_at: checkedAt(), final_url: current.toString(), detail: 'The source responded, but its current listing status could not be confirmed.' };
  }
  return { state: 'inconclusive', http_status: null, checked_at: checkedAt(), final_url: current.toString(), detail: 'The source redirect limit was reached.' };
}
