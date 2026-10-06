import { config } from '../config.ts';
import { sha256Short } from '../util/hash.ts';
import { sleep } from '../util/concurrency.ts';

/**
 * Centralized Groq AI interface (spec section 4).
 *
 * ALL Groq calls in the platform go through this module. Nothing else may
 * hard-code a Groq endpoint, key or model. If the credential is missing the
 * module throws AiNotConfiguredError — it never fabricates a result.
 *
 * Structured output is requested (`response_format: json_object`) and the
 * result is validated by the caller against a strict schema. AI output is
 * NEVER treated as evidence on its own (spec section 5).
 */

export class AiNotConfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`AI provider (Groq) is not configured. Missing environment variable(s): ${missing.join(', ')}`);
    this.name = 'AiNotConfiguredError';
    this.missing = missing;
  }
}

export interface AiStatus {
  provider: string;
  configured: boolean;
  model: string;
  baseUrl: string;
  missing: string[];
}

export function aiStatus(): AiStatus {
  const missing: string[] = [];
  if (!config.ai.groq.apiKey) missing.push('GROQ_API_KEY');
  return {
    provider: config.ai.provider,
    configured: missing.length === 0,
    model: config.ai.groq.model,
    baseUrl: config.ai.groq.baseUrl,
    missing,
  };
}

export function isAiConfigured(): boolean {
  return aiStatus().configured;
}

export interface AiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AiCallResult<T = any> {
  data: T;
  usage: AiUsage;
  latencyMs: number;
  attempts: number;
  model: string;
  requestHash: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Override the configured model (rare). */
  model?: string;
  /** JSON schema description embedded into the prompt for strictness. */
  schemaHint?: string;
}

function extractJSON(content: string): any {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }
  const obj = trimmed.match(/\{[\s\S]*\}/);
  if (obj) {
    try { return JSON.parse(obj[0]); } catch { /* fall through */ }
  }
  const arr = trimmed.match(/\[[\s\S]*\]/);
  if (arr) {
    try { return JSON.parse(arr[0]); } catch { /* fall through */ }
  }
  throw new Error('AI output was not valid JSON: ' + content.slice(0, 300));
}

let lastCallAt = 0;
const MIN_SPACING_MS = Number(process.env.GROQ_MIN_SPACING_MS || 250);

/** Spacing helper to respect Groq rate limits across concurrent workers. */
async function respectSpacing() {
  const now = Date.now();
  const wait = lastCallAt + MIN_SPACING_MS - now;
  lastCallAt = now + Math.max(0, wait);
  if (wait > 0) await sleep(wait);
}

export async function groqChatJSON<T = any>(system: string, user: string, opts: ChatOptions = {}): Promise<AiCallResult<T>> {
  const status = aiStatus();
  if (!status.configured) throw new AiNotConfiguredError(status.missing);

  const model = opts.model || config.ai.groq.model;
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 4096;
  const url = `${config.ai.groq.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const requestHash = sha256Short(system.slice(0, 400) + '||' + user.slice(0, 2000) + '||' + model, 24);

  const systemWithSchema = opts.schemaHint
    ? `${system}\n\nReturn ONLY a JSON object matching this JSON Schema exactly:\n${opts.schemaHint}`
    : system;

  let lastErr: Error | null = null;
  const maxRetries = config.ai.groq.maxRetries;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    await respectSpacing();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ai.groq.timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.groq.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemWithSchema },
            { role: 'user', content: user },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const transient = res.status === 429 || res.status >= 500;
        const err = new Error(`Groq request failed (${res.status}): ${body.slice(0, 300)}`);
        if (!transient) throw err;
        lastErr = err;
        clearTimeout(timer);
        await sleep(Math.min(1000 * 2 ** attempt, 20000));
        continue;
      }
      const raw = await res.text();
      clearTimeout(timer);
      let payload: any;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`Groq returned non-JSON response: ${raw.slice(0, 200)}`);
      }
      const content: string = payload?.choices?.[0]?.message?.content ?? '';
      if (!content) throw new Error('Groq returned empty content');
      const data = extractJSON(content) as T;
      const usage: AiUsage = {
        prompt_tokens: payload?.usage?.prompt_tokens ?? 0,
        completion_tokens: payload?.usage?.completion_tokens ?? 0,
        total_tokens: payload?.usage?.total_tokens ?? 0,
      };
      return { data, usage, latencyMs, attempts: attempt, model, requestHash };
    } catch (err: any) {
      clearTimeout(timer);
      const msg = err?.message || '';
      const aborted = err?.name === 'AbortError' || /abort|timeout/i.test(msg);
      const transient = aborted || /429|5\d\d|overloaded|temporarily|ECONNRESET|fetch failed/i.test(msg);
      lastErr = err;
      if (!transient) throw err;
      await sleep(Math.min(1000 * 2 ** attempt, 20000));
    }
  }
  throw lastErr || new Error('Groq request failed after retries');
}
