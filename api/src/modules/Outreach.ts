import { chatJSON } from '../llm/client.ts';

export interface OutreachEmail {
  subject: string;
  body: string;
  reason: string;
}

const SYSTEM = `You are a professional outbound email writer for Alveron Labs, an AI Product and Automation Studio.
Write ONE short, human-sounding outreach email to a prospect company. This email will be reviewed and approved by a human before sending.
Rules:
- Subject: under 60 characters, specific, no clickbait, no "Just checking in" fluff.
- Body: 80 to 140 words max, plain text with short paragraphs and line breaks.
- Open with a specific observation about their company from the research (proves it is not a mass email).
- Reference the recommended Alveron service and why it fits their situation.
- One clear, low-pressure next step.
- Do not promise revenue, growth, or ROI. No urgency tricks, no "limited time".
- Return STRICT JSON with keys: subject, body, reason.
- reason: internal note for the Alveron team on why this company was chosen for outreach.`;

export async function generateOutreach(input: {
  companyName: string;
  website: string;
  industry: string;
  service: string;
  proposalOpening: string;
  observedOpportunity: string;
  suggestedSolution: string;
  nextStep: string;
}): Promise<OutreachEmail> {
  const user = [
    `Company: ${input.companyName}`,
    `Website: ${input.website}`,
    `Industry: ${input.industry || 'unknown'}`,
    `Recommended service: ${input.service}`,
    ``,
    `Proposal opening: ${input.proposalOpening}`,
    `Observed opportunity: ${input.observedOpportunity}`,
    `Suggested solution: ${input.suggestedSolution}`,
    `Proposed next step: ${input.nextStep}`,
  ].join('\n');

  const result = await chatJSON(SYSTEM, user, { temperature: 0.4 });
  return {
    subject: String(result.subject || '').trim(),
    body: String(result.body || '').trim(),
    reason: String(result.reason || '').trim(),
  };
}
