import { chatJSON } from '../llm/client.ts';
import type { ResearchResult, SiteSnapshot } from '../types.ts';

const SYSTEM = `You are a senior business research analyst at Alveron Labs, an AI Product and Automation Studio.
You analyze publicly available website content and produce a structured company profile.
Rules:
- Only report facts observable in the provided website content.
- Do not invent products, customers, or technologies.
- Technologies must be ones that can reasonably be observed (platform markers, frameworks, integrations, or explicit mentions on the site).
- Return STRICT JSON with exactly these keys: industry, products_services, target_customers, main_offering, technologies, summary.
- industry: one concise label like "E-commerce", "Legal Services", "SaaS", "Healthcare".
- products_services: short comma-separated list.
- target_customers: who the company appears to sell to.
- main_offering: one sentence on the core business offering.
- technologies: array of strings, may be empty.
- summary: 2 to 3 sentences of neutral company description.`;

export async function researchCompany(snapshot: SiteSnapshot): Promise<ResearchResult> {
  const user = [
    `Website: ${snapshot.url}`,
    `Title: ${snapshot.title}`,
    `Meta description: ${snapshot.metaDescription}`,
    `H1 headings: ${snapshot.h1s.join(' | ') || 'none'}`,
    `Observable technologies: ${snapshot.tech.join(', ') || 'none detected'}`,
    `Pages fetched: ${snapshot.pageCount}`,
    ``,
    `WEBSITE CONTENT:`,
    snapshot.text.slice(0, 40000),
  ].join('\n');

  const result = await chatJSON(SYSTEM, user);
  return {
    industry: String(result.industry || '').trim(),
    products_services: String(result.products_services || '').trim(),
    target_customers: String(result.target_customers || '').trim(),
    main_offering: String(result.main_offering || '').trim(),
    technologies: Array.isArray(result.technologies) ? result.technologies.map(String) : [],
    summary: String(result.summary || '').trim(),
  };
}
