import { chatJSON } from '../llm/client.ts';

export interface OpportunityScore {
  score: number;
  evidence_quality: number;
  problem_severity: number;
  business_relevance: number;
  alveron_fit: number;
  feasibility: number;
  confidence: number;
  rationale: string;
}

const SYSTEM = `You are a lead scoring analyst at Alveron Labs, an AI Product and Automation Studio.
Score ONE detected opportunity for a prospect company on a 0-100 scale using transparent components:
- evidence_quality (0-100): how concrete and quotable the observed evidence is
- problem_severity (0-100): how much the problem costs the business
- business_relevance (0-100): how core the affected process is to revenue/operations
- alveron_fit (0-100): how well the matched Alveron service solves it
- feasibility (0-100): how realistic the solution is with the observed stack
- confidence (0-100): analyst confidence the problem is real, not a crawl artifact

Calibration (do NOT force scores into buckets, let honesty land where it lands):
80-100 = High priority, 60-79 = Medium, 40-59 = Low, 0-39 = Poor fit.
Rules:
- Be conservative. A mediocre opportunity should score below 60.
- Do not inflate scores. No score above 95.
- Be sceptical of unrendered JavaScript placeholders, templates, and generic boilerplate.
- Return STRICT JSON with keys: score, evidence_quality, problem_severity, business_relevance, alveron_fit, feasibility, confidence, rationale.
- All component scores 0-100. rationale: 1-2 sentences explaining the final score.`;

export async function scoreOpportunity(input: {
  companyName: string;
  industry: string;
  service: string;
  problem: string;
  evidence: string;
  business_impact: string;
  solution: string;
}): Promise<OpportunityScore> {
  const user = [
    `Company: ${input.companyName}`,
    `Industry: ${input.industry || 'unknown'}`,
    `Matched service: ${input.service}`,
    `Problem: ${input.problem}`,
    `Evidence: ${input.evidence}`,
    `Business impact: ${input.business_impact}`,
    `Proposed solution: ${input.solution}`,
  ].join('\n');

  const result = await chatJSON(SYSTEM, user, { temperature: 0.2 });
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  return {
    score: clamp(result.score, 0, 100, 50),
    evidence_quality: clamp(result.evidence_quality, 0, 100, 50),
    problem_severity: clamp(result.problem_severity, 0, 100, 50),
    business_relevance: clamp(result.business_relevance, 0, 100, 50),
    alveron_fit: clamp(result.alveron_fit, 0, 100, 50),
    confidence: clamp(result.confidence, 0, 100, 50),
    feasibility: clamp(result.feasibility, 0, 100, 50),
    rationale: String(result.rationale || '').trim(),
  };
}

export function priorityFromScore(score: number): 'High' | 'Medium' | 'Low' | 'Poor fit' {
  if (score >= 80) return 'High';
  if (score >= 60) return 'Medium';
  if (score >= 40) return 'Low';
  return 'Poor fit';
}
