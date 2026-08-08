import { chatJSON } from '../llm/client.ts';

export interface SolutionDetail {
  recommended_solution: string;
  expected_benefit: string;
  scope_notes: string;
}

const SYSTEM = `You are a solutions architect at Alveron Labs, an AI Product and Automation Studio.
Given a detected problem at a prospect company and a matched Alveron service, propose a concrete solution.
Rules:
- The solution must be specific to the company's actual situation, not generic.
- expected_benefit: concrete operational benefit only (time saved, faster response, fewer manual steps). NEVER promise revenue increases, guaranteed growth, or guaranteed ROI.
- scope_notes: what a first engagement would look like (discovery, build, integration).
- Return STRICT JSON with keys: recommended_solution, expected_benefit, scope_notes.`;

export async function recommendSolution(input: {
  companyName: string;
  industry: string;
  problem: string;
  evidence: string;
  business_impact: string;
  service: string;
}): Promise<SolutionDetail> {
  const user = [
    `Company: ${input.companyName}`,
    `Industry: ${input.industry || 'unknown'}`,
    `Matched Alveron service: ${input.service}`,
    ``,
    `Detected problem: ${input.problem}`,
    `Evidence: ${input.evidence}`,
    `Business impact: ${input.business_impact}`,
  ].join('\n');

  const result = await chatJSON(SYSTEM, user, { temperature: 0.2 });
  return {
    recommended_solution: String(result.recommended_solution || '').trim(),
    expected_benefit: String(result.expected_benefit || '').trim(),
    scope_notes: String(result.scope_notes || '').trim(),
  };
}
