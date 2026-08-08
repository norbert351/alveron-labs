import { chatJSON } from '../llm/client.ts';

export interface OpportunityScore {
  score: number;
  evidence_quality: number;
  problem_severity: number;
  alveron_fit: number;
  confidence: number;
  operational_value: number;
  feasibility: number;
  complexity: number;
  rationale: string;
}

const SYSTEM = `You are a lead scoring analyst at Alveron Labs, an AI Product and Automation Studio.
Score ONE detected opportunity for a prospect company on a 0-100 scale.
Consider:
- Evidence quality: how concrete and verifiable the observed evidence is
- Problem severity: how much the problem costs the business (leads, hours, friction)
- Alveron fit: how well the matched Alveron service solves it
- Confidence: analyst confidence in the finding
- Operational value: the operational benefit of solving it
- Feasibility: how realistic the solution is with the company's observed stack
- Complexity: project complexity, 1 = trivial, 5 = very complex (used as a mild penalty)

Rules:
- Be conservative. A mediocre opportunity should score below 60.
- Do not inflate scores. No score above 95.
- Return STRICT JSON with keys: score, evidence_quality, problem_severity, alveron_fit, confidence, operational_value, feasibility, complexity, rationale.
- All component scores 0-100 except complexity (1-5). rationale: 1-2 sentences.`;

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
    alveron_fit: clamp(result.alveron_fit, 0, 100, 50),
    confidence: clamp(result.confidence, 0, 100, 50),
    operational_value: clamp(result.operational_value, 0, 100, 50),
    feasibility: clamp(result.feasibility, 0, 100, 50),
    complexity: clamp(result.complexity, 1, 5, 3),
    rationale: String(result.rationale || '').trim(),
  };
}

export function priorityFromScore(score: number): string {
  if (score >= 75) return 'High';
  if (score >= 50) return 'Medium';
  return 'Low';
}
