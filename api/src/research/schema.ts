/**
 * Strict AI problem-detection schema + validation (spec sections 12, 13).
 *
 * The AI must return machine-readable JSON. Anything that fails validation is
 * dropped or downgraded — we never let an unsupported high-confidence claim
 * through, and we never convert UNKNOWN into a fact.
 */

export const PROBLEM_CATEGORIES = [
  'technical', 'ux', 'conversion', 'automation', 'customer_experience',
  'ecommerce', 'security', 'accessibility', 'other',
] as const;

export const BUSINESS_IMPACTS = ['low', 'medium', 'high', 'unknown'] as const;
export const EVIDENCE_TYPES = ['observed', 'inferred', 'unknown'] as const;

export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];
export type BusinessImpact = (typeof BUSINESS_IMPACTS)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface AiEvidence {
  url: string;
  text: string;
  signal: string;
  type: EvidenceType;
}

export interface AiProblem {
  title: string;
  category: ProblemCategory;
  description: string;
  evidence: AiEvidence[];
  confidence: number;
  business_impact: BusinessImpact;
  requires_verification: boolean;
}

export const PROBLEM_SCHEMA_HINT = JSON.stringify({
  type: 'object',
  properties: {
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: PROBLEM_CATEGORIES },
          description: { type: 'string' },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                text: { type: 'string' },
                signal: { type: 'string' },
                type: { type: 'string', enum: EVIDENCE_TYPES },
              },
              required: ['url', 'text', 'signal', 'type'],
            },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          business_impact: { type: 'string', enum: BUSINESS_IMPACTS },
          requires_verification: { type: 'boolean' },
        },
        required: ['title', 'category', 'description', 'evidence', 'confidence', 'business_impact', 'requires_verification'],
      },
    },
  },
  required: ['problems'],
});

function clamp01(v: unknown, fallback = 0.5): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function asString(v: unknown, max = 1200): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Validate + normalise an AI problems payload.
 * - unknown enum values are coerced to safe defaults
 * - high-confidence claims without observed evidence are DOWNGRADED and
 *   flagged for verification (spec §§5, 13)
 */
export function validateProblems(raw: any): AiProblem[] {
  const arr = Array.isArray(raw?.problems) ? raw.problems : Array.isArray(raw) ? raw : [];
  const out: AiProblem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const title = asString(item.title, 200);
    if (!title) continue;
    const category: ProblemCategory = (PROBLEM_CATEGORIES as readonly string[]).includes(item.category)
      ? (item.category as ProblemCategory)
      : 'other';
    const impact: BusinessImpact = (BUSINESS_IMPACTS as readonly string[]).includes(item.business_impact)
      ? (item.business_impact as BusinessImpact)
      : 'unknown';

    const evidence: AiEvidence[] = (Array.isArray(item.evidence) ? item.evidence : [])
      .map((e: any) => ({
        url: asString(e?.url, 500),
        text: asString(e?.text, 800),
        signal: asString(e?.signal, 200),
        type: (EVIDENCE_TYPES as readonly string[]).includes(e?.type) ? (e.type as EvidenceType) : 'unknown',
      }))
      .filter((e: AiEvidence) => e.url || e.text || e.signal);

    let confidence = clamp01(item.confidence, 0.4);
    let requires_verification = item.requires_verification !== false;

    const hasObserved = evidence.some((e) => e.type === 'observed' && (e.url || e.text));
    if (confidence >= 0.8 && !hasObserved) {
      // Unsupported confidence: downgrade + require verification.
      confidence = Math.min(confidence, 0.6);
      requires_verification = true;
    }
    if (evidence.length === 0) {
      confidence = Math.min(confidence, 0.4);
      requires_verification = true;
    }

    out.push({
      title,
      category,
      description: asString(item.description, 1600),
      evidence,
      confidence,
      business_impact: impact,
      requires_verification,
    });
    if (out.length >= 8) break;
  }
  return out;
}
