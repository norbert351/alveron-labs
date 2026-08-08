import { chatJSON } from '../llm/client.ts';
import { getSetting } from '../db.ts';

export interface ServiceMatch {
  findingIndex: number;
  matched_service: string;
  match_reason: string;
  expected_benefit: string;
}

const SYSTEM = `You are a solutions architect at Alveron Labs, an AI Product and Automation Studio.
Alveron Labs sells these services:
- AI Automation: automating repetitive business workflows with AI
- AI Agents: autonomous AI agents for research, support, and operations
- Custom Software: bespoke internal tools and business software
- SaaS Development: multi-tenant SaaS products and platforms
- Web Applications: modern web apps, portals, and dashboards
- Web3 Solutions: smart contracts, dApps, and blockchain integrations

For each detected problem at a prospect company, pick the SINGLE most relevant Alveron service.
Rules:
- Only recommend a service when it genuinely fits the company's situation. If no service fits well, still pick the closest one and say why it is a stretch.
- Never recommend Web3 Solutions unless the company's situation involves blockchain, tokens, or web3.
- Return STRICT JSON: an array of objects with keys: findingIndex, matched_service, match_reason, expected_benefit.
- findingIndex must match the index of the finding in the provided list.
- expected_benefit: the concrete operational benefit of solving it (hours saved, faster response, more leads captured). No revenue or ROI promises.`;

export async function matchServices(
  findings: { problem: string; evidence: string; business_impact: string }[],
  services: { name: string; description: string }[]
): Promise<ServiceMatch[]> {
  const user = [
    `Available services:`,
    services.map((s) => `- ${s.name}: ${s.description}`).join('\n'),
    ``,
    `Detected problems:`,
    findings.map((f, i) => `${i}. Problem: ${f.problem}\n   Evidence: ${f.evidence}\n   Impact: ${f.business_impact}`).join('\n\n'),
  ].join('\n');

  const result = await chatJSON(SYSTEM, user, { temperature: 0.2 });
  const arr = Array.isArray(result) ? result : Array.isArray(result.matches) ? result.matches : [];
  return arr
    .filter((m: any) => m && Number.isFinite(Number(m.findingIndex)))
    .map((m: any) => ({
      findingIndex: Number(m.findingIndex),
      matched_service: String(m.matched_service || ''),
      match_reason: String(m.match_reason || '').trim(),
      expected_benefit: String(m.expected_benefit || '').trim(),
    }));
}

export async function getServiceCatalog(): Promise<{ name: string; description: string }[]> {
  const stored = await getSetting('services');
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return [
    { name: 'AI Automation', description: 'Automating repetitive business workflows with AI' },
    { name: 'AI Agents', description: 'Autonomous AI agents for research, support, and operations' },
    { name: 'Custom Software', description: 'Bespoke internal tools and business software' },
    { name: 'SaaS Development', description: 'Multi-tenant SaaS products and platforms' },
    { name: 'Web Applications', description: 'Modern web apps, portals, and dashboards' },
    { name: 'Web3 Solutions', description: 'Smart contracts, dApps, and blockchain integrations' },
  ];
}
