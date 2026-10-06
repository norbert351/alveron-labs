import type { AiProblem } from './schema.ts';
import type { DeterministicFinding } from '../signals/extract.ts';
import { stableId } from '../util/hash.ts';

/**
 * Opportunity derivation, transparent scoring and service recommendation
 * (spec sections 14, 15, 16).
 *
 * These are DETERMINISTIC and auditable by design: the score is composed from
 * named, measurable components (never a single subjective number), and a
 * service is only recommended when there is a genuine fit.
 */

export interface ServiceCatalogEntry {
  code: string;
  name: string;
  description: string;
  keywords: string[];
  categories: string[];
}

// ---------------------------------------------------------------------------
// 1. Opportunity derivation
// ---------------------------------------------------------------------------

const MINOR = new Set(['low']);

export interface DerivedOpportunity {
  uid: string;
  source: 'llm' | 'programmatic';
  title: string;
  description: string;
  business_value: string;
  alveron_can_solve: boolean;
  category: string;
  business_impact: string;
  severity: string;
  confidence: number;
  evidence_count: number;
  problem_index: number;
}

const OPPORTUNITY_BY_CATEGORY: Record<string, { title: string; value: string }> = {
  conversion: { title: 'Improve enquiry conversion path', value: 'Higher-quality inbound enquiries and fewer lost leads.' },
  automation: { title: 'Automate a manual workflow', value: 'Less manual effort and fewer errors in day-to-day operations.' },
  ecommerce: { title: 'Strengthen the online sales funnel', value: 'A smoother purchase path and fewer abandoned transactions.' },
  customer_experience: { title: 'Improve customer self-service', value: 'Faster customer responses and reduced support load.' },
  technical: { title: 'Fix technical foundations', value: 'A more reliable, discoverable and maintainable website.' },
  ux: { title: 'Improve the user experience', value: 'Visitors find what they need faster, improving engagement.' },
  security: { title: 'Harden security fundamentals', value: 'Reduced risk to visitor data and to the business.' },
  accessibility: { title: 'Improve accessibility', value: 'The site becomes usable by more people, including those with disabilities.' },
  other: { title: 'Address an observed operational gap', value: 'Concrete operational improvement supported by the evidence.' },
};

/**
 * A problem becomes an opportunity ONLY when it has real impact
 * (spec section 14 — do not turn every minor issue into an opportunity).
 * `scope` MUST be unique per company so identical findings across companies do
 * not collide on the same opportunity_uid (spec section 24 idempotency).
 */
export function deriveOpportunities(
  problems: AiProblem[],
  findings: DeterministicFinding[],
  scope = 'global'
): DerivedOpportunity[] {
  const out: DerivedOpportunity[] = [];

  problems.forEach((p, i) => {
    const impact = p.business_impact;
    const impactful = impact === 'high' || impact === 'medium';
    if (!impactful) return; // low/unknown impact problems do not become opportunities
    const template = OPPORTUNITY_BY_CATEGORY[p.category] || OPPORTUNITY_BY_CATEGORY.other;
    out.push({
      uid: stableId('opp', scope, p.title, p.category, 'llm', i),
      source: 'llm',
      title: template.title,
      description: p.description,
      business_value: template.value,
      alveron_can_solve: true,
      category: p.category,
      business_impact: impact,
      severity: impact,
      confidence: p.confidence,
      evidence_count: p.evidence.length,
      problem_index: i,
    });
  });

  findings.forEach((f, i) => {
    if (f.severity !== 'high' && f.severity !== 'medium') return; // minor findings excluded
    const template = OPPORTUNITY_BY_CATEGORY[f.category] || OPPORTUNITY_BY_CATEGORY.other;
    out.push({
      uid: stableId('opp', scope, f.description, f.category, 'det', i),
      source: 'programmatic',
      title: template.title,
      description: f.description,
      business_value: template.value,
      alveron_can_solve: true,
      category: f.category,
      business_impact: f.severity,
      severity: f.severity,
      confidence: f.confidence,
      evidence_count: f.evidence.length,
      problem_index: -1,
    });
  });

  return out;
}

// ---------------------------------------------------------------------------
// 2. Transparent scoring (section 15)
// ---------------------------------------------------------------------------

export interface ScoreComponents {
  evidence_confidence: number;
  business_relevance: number;
  customer_impact: number;
  revenue_potential: number;
  operational_impact: number;
  solution_fit: number;
  feasibility: number;
  urgency: number;
  data_completeness: number;
}

export interface ScoreResult {
  overall_score: number;
  priority: 'High' | 'Medium' | 'Low' | 'Poor fit';
  components: ScoreComponents;
  rationale: string;
}

const WEIGHTS: ScoreComponents = {
  evidence_confidence: 0.18,
  business_relevance: 0.14,
  customer_impact: 0.12,
  revenue_potential: 0.12,
  operational_impact: 0.12,
  solution_fit: 0.14,
  feasibility: 0.08,
  urgency: 0.05,
  data_completeness: 0.05,
};

const CUSTOMER_IMPACT: Record<string, number> = {
  conversion: 85, customer_experience: 80, ecommerce: 82, security: 75, ux: 70,
  accessibility: 65, automation: 60, technical: 55, other: 50,
};
const REVENUE_POTENTIAL: Record<string, number> = {
  ecommerce: 88, conversion: 85, security: 70, customer_experience: 70, automation: 65,
  ux: 60, technical: 50, accessibility: 45, other: 45,
};
const OPERATIONAL_IMPACT: Record<string, number> = {
  automation: 88, customer_experience: 78, ecommerce: 70, conversion: 65, technical: 60,
  security: 58, ux: 55, accessibility: 50, other: 50,
};
const FEASIBILITY: Record<string, number> = {
  security: 90, accessibility: 82, technical: 80, conversion: 76, ux: 72,
  customer_experience: 66, ecommerce: 62, automation: 60, other: 60,
};

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface ScoreInput {
  opportunity: DerivedOpportunity;
  /** Number of services the recommender matched (solution fit). */
  matchedServices: number;
  /** Total crawled pages available for this company. */
  pagesCrawled: number;
  /** Total signals collected for this company. */
  signalCount: number;
}

export function scoreOpportunity(input: ScoreInput): ScoreResult {
  const { opportunity: o } = input;
  const cat = o.category;

  const evidence_confidence = clamp100(o.confidence * 100 + Math.min(o.evidence_count, 5) * 5);
  const business_relevance = clamp100(o.business_impact === 'high' ? 92 : o.business_impact === 'medium' ? 74 : 45);
  const customer_impact = clamp100(CUSTOMER_IMPACT[cat] ?? 50);
  const revenue_potential = clamp100(REVENUE_POTENTIAL[cat] ?? 45);
  const operational_impact = clamp100(OPERATIONAL_IMPACT[cat] ?? 50);
  const solution_fit = clamp100(input.matchedServices > 0 ? 78 + Math.min(input.matchedServices, 3) * 6 : 35);
  const feasibility = clamp100(FEASIBILITY[cat] ?? 60);
  const urgency = clamp100(o.severity === 'high' ? 85 : o.severity === 'medium' ? 65 : 40);
  const data_completeness = clamp100(Math.min(100, input.pagesCrawled * 8 + input.signalCount * 1.5));

  const components: ScoreComponents = {
    evidence_confidence, business_relevance, customer_impact, revenue_potential,
    operational_impact, solution_fit, feasibility, urgency, data_completeness,
  };

  let overall = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof ScoreComponents)[]) {
    overall += (WEIGHTS[k] * components[k]) / 100;
  }
  const overall_score = Math.round(overall * 100);

  const priority: ScoreResult['priority'] =
    overall_score >= 75 ? 'High' : overall_score >= 60 ? 'Medium' : overall_score >= 40 ? 'Low' : 'Poor fit';

  const top = (Object.entries(components) as [keyof ScoreComponents, number][])
    .sort((a, b) => WEIGHTS[b[0]] * b[1] - WEIGHTS[a[0]] * a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  const rationale = `Score ${overall_score}/100 (${priority}). Dominant components: ${top}. ` +
    `Impact=${o.business_impact}, category=${cat}, evidence items=${o.evidence_count}, services matched=${input.matchedServices}.`;

  return { overall_score, priority, components, rationale };
}

// ---------------------------------------------------------------------------
// 3. Service recommendation (section 16)
// ---------------------------------------------------------------------------

const CATEGORY_SERVICES: Record<string, string[]> = {
  conversion: ['WEBSITE_DEVELOPMENT', 'BUSINESS_AUTOMATION', 'CRM_IMPLEMENTATION'],
  automation: ['BUSINESS_AUTOMATION', 'AI_SYSTEMS', 'DATA_WORKFLOWS'],
  ecommerce: ['ECOMMERCE', 'WEBSITE_DEVELOPMENT', 'API_INTEGRATION'],
  customer_experience: ['AI_CUSTOMER_SUPPORT', 'AI_SYSTEMS', 'CUSTOM_SOFTWARE'],
  technical: ['WEBSITE_DEVELOPMENT', 'DATA_WORKFLOWS', 'CUSTOM_SOFTWARE'],
  ux: ['WEBSITE_DEVELOPMENT', 'PRODUCT_TESTING'],
  security: ['SECURITY_TESTING', 'WEBSITE_DEVELOPMENT'],
  accessibility: ['WEBSITE_DEVELOPMENT', 'PRODUCT_TESTING'],
  other: [],
};

export interface ServiceRecommendation {
  service_code: string;
  confidence: number;
  why_this_solution: string;
  what_it_would_do: string;
  what_evidence_supports: string;
  what_is_unknown: string;
}

export interface RecommendInput {
  opportunity: DerivedOpportunity;
  catalog: ServiceCatalogEntry[];
  evidenceSummary: string;
}

export function recommendServices(input: RecommendInput): ServiceRecommendation[] {
  const { opportunity: o, catalog } = input;
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const scores = new Map<string, number>();

  for (const code of CATEGORY_SERVICES[o.category] || []) {
    if (byCode.has(code)) scores.set(code, (scores.get(code) || 0) + 2);
  }

  const text = `${o.title} ${o.description} ${o.business_value}`.toLowerCase();
  for (const entry of catalog) {
    const hits = entry.keywords.filter((k) => k && text.includes(k.toLowerCase())).length;
    if (hits > 0) scores.set(entry.code, (scores.get(entry.code) || 0) + hits);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (ranked.length === 0) return []; // no clear fit → recommend nothing (spec section 16)

  const maxScore = ranked[0][1];
  return ranked.map(([code, score]) => {
    const entry = byCode.get(code)!;
    const confidence = Math.max(0.4, Math.min(0.92, 0.45 + (score / (maxScore + 2)) * 0.45));
    return {
      service_code: code,
      confidence: Math.round(confidence * 100) / 100,
      why_this_solution: `The detected ${o.category} gap maps to ${entry.name}: ${entry.description}`,
      what_it_would_do: `Alveron would scope and deliver ${entry.name.toLowerCase()} addressing: ${o.title.toLowerCase()}.`,
      what_evidence_supports: input.evidenceSummary.slice(0, 600),
      what_is_unknown: o.source === 'llm'
        ? 'The business impact estimate is an inference; internal process details were not observed and would be confirmed during scoping.'
        : 'The observation is programmatic; business context and internal processes were not observed.',
    };
  });
}
