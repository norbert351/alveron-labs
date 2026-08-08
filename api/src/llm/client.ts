import { getSetting } from '../db.ts';

export interface LlmSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

let cache: { value: LlmSettings; at: number } | null = null;

export async function getLlmSettings(): Promise<LlmSettings> {
  if (cache && Date.now() - cache.at < 30000) return cache.value;
  const stored = await getSetting('llm');
  const s: LlmSettings = stored
    ? {
        baseUrl: stored.baseUrl || '',
        apiKey: stored.apiKey || '',
        model: stored.model || '',
        timeoutMs: 180000,
      }
    : {
        baseUrl: process.env.ALVERON_LLM_BASE_URL || '',
        apiKey: process.env.ALVERON_LLM_API_KEY || '',
        model: process.env.ALVERON_LLM_MODEL || '',
        timeoutMs: 180000,
      };
  cache = { value: s, at: Date.now() };
  return s;
}

export function clearLlmCache() {
  cache = null;
}

function extractJSON(content: string): any {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const obj = trimmed.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {
      /* fall through */
    }
  }
  const arr = trimmed.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      return JSON.parse(arr[0]);
    } catch {
      /* fall through */
    }
  }
  throw new Error('LLM output was not valid JSON: ' + content.slice(0, 300));
}

export async function chatJSON(
  system: string,
  user: string,
  opts: { temperature?: number; maxRetries?: number } = {}
): Promise<any> {
  const s = await getLlmSettings();
  if (!s.baseUrl || !s.apiKey) {
    throw new Error('LLM provider not configured. Open Settings and add the API base URL and key.');
  }
  const maxRetries = opts.maxRetries ?? 4;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      return await chatOnce(s, system, user, opts.temperature ?? 0.3);
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || '';
      const transient =
        /503|502|529|429|timeout|abort|no container instance|overloaded|temporarily/i.test(msg);
      if (!transient) throw err;
    }
  }
  throw lastErr || new Error('LLM request failed after retries');
}

async function chatOnce(
  s: LlmSettings,
  system: string,
  user: string,
  temperature: number
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), s.timeoutMs);
  try {
    const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.apiKey}`,
      },
      body: JSON.stringify({
        model: s.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const raw = await res.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`LLM returned non-JSON response: ${raw.slice(0, 300)}`);
    }
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('LLM returned empty content');
    return extractJSON(content);
  } finally {
    clearTimeout(timer);
  }
}
