import { chatJSON } from '../llm/client.ts';
import type { OpportunityFinding, SiteSnapshot } from '../types.ts';

const SYSTEM = `You are a lead intelligence analyst at Alveron Labs, an AI Product and Automation Studio.
You analyze a company's public website and identify areas where software, AI, or automation could add value.
Look for evidence of these patterns:
- Manual customer support (no self-service portal, FAQ is thin, support is phone/email only)
- Lack of self-service tools (no account area, no booking, no status tracking)
- Repetitive workflows visible from the site (manual forms, multi-step email processes)
- Poor lead capture (no contact forms, no chat, buried contact info, no demo/quote request)
- Missing automation (manual processes described on the site)
- Missing AI functionality (search, recommendations, chatbots where they would help)
- Poor internal workflow opportunities (things described as manual/back-office)
- Missing integrations (no payment links, no scheduling tools, no CRM mentions)
- Poor user experience (outdated design, broken flows, confusing navigation)

RULES:
- NEVER claim a problem exists without evidence. Every finding needs an evidence field citing what was actually observed on the site.
- If nothing meets the bar, return an empty array.
- Return STRICT JSON: an array of objects with keys: problem, evidence, confidence, business_impact, recommended_solution.
- problem: short title of the issue.
- evidence: the concrete observation from the site that supports it (quote or specific detail).
- confidence: number 0 to 1 reflecting how sure you are, based on evidence strength.
- business_impact: what it likely costs the business (lost leads, slow service, manual hours).
- recommended_solution: a specific software, AI, or automation improvement.
- Maximum 6 findings. No revenue or growth promises.`;

export async function analyzeWebsite(snapshot: SiteSnapshot): Promise<OpportunityFinding[]> {
  const user = [
    `Website: ${snapshot.url}`,
    `Title: ${snapshot.title}`,
    `Meta description: ${snapshot.metaDescription}`,
    `Observable technologies: ${snapshot.tech.join(', ') || 'none detected'}`,
    `Pages fetched: ${snapshot.pageCount}`,
    ``,
    `WEBSITE CONTENT:`,
    snapshot.text.slice(0, 40000),
  ].join('\n');

  const result = await chatJSON(SYSTEM, user, { temperature: 0.2 });
  const arr = Array.isArray(result) ? result : Array.isArray(result.findings) ? result.findings : [];
  return arr
    .filter((f: any) => f && typeof f.problem === 'string' && f.problem.trim())
    .slice(0, 6)
    .map((f: any) => ({
      problem: String(f.problem).trim(),
      evidence: String(f.evidence || '').trim(),
      confidence: clampConfidence(f.confidence),
      business_impact: String(f.business_impact || '').trim(),
      recommended_solution: String(f.recommended_solution || '').trim(),
    }));
}

function clampConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}
