import { chatJSON } from '../llm/client.ts';

export interface Proposal {
  opening: string;
  observed_opportunity: string;
  evidence: string;
  suggested_solution: string;
  expected_benefit: string;
  next_step: string;
}

const SYSTEM = `You are a senior business development consultant writing a personalized proposal for Alveron Labs, an AI Product and Automation Studio.
The proposal is sent to a prospect company after evidence-based research of their website.
Rules:
- Personalized opening: reference the company by name and a specific observation from their site.
- Do not exaggerate. Never promise revenue increases, guaranteed growth, or guaranteed ROI.
- Keep the tone professional, concrete, and modest.
- observed_opportunity: restate the specific problem found, with the evidence.
- suggested_solution: the concrete solution proposed.
- expected_benefit: operational benefit only (time saved, faster response, fewer manual steps).
- next_step: a small concrete step, like a 30 minute call or a quick demo.
- Return STRICT JSON with keys: opening, observed_opportunity, evidence, suggested_solution, expected_benefit, next_step.`;

export async function generateProposal(input: {
  companyName: string;
  website: string;
  industry: string;
  problem: string;
  evidence: string;
  business_impact: string;
  solution: string;
  expected_benefit: string;
  service: string;
}): Promise<Proposal> {
  const user = [
    `Company: ${input.companyName}`,
    `Website: ${input.website}`,
    `Industry: ${input.industry || 'unknown'}`,
    `Recommended Alveron service: ${input.service}`,
    ``,
    `Detected problem: ${input.problem}`,
    `Evidence: ${input.evidence}`,
    `Business impact: ${input.business_impact}`,
    `Proposed solution: ${input.solution}`,
    `Expected benefit: ${input.expected_benefit}`,
  ].join('\n');

  const result = await chatJSON(SYSTEM, user, { temperature: 0.4 });
  return {
    opening: String(result.opening || '').trim(),
    observed_opportunity: String(result.observed_opportunity || '').trim(),
    evidence: String(result.evidence || '').trim(),
    suggested_solution: String(result.suggested_solution || '').trim(),
    expected_benefit: String(result.expected_benefit || '').trim(),
    next_step: String(result.next_step || '').trim(),
  };
}
