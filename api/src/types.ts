export interface CompanyRow {
  id: number;
  name: string;
  website: string;
  notes: string;
  industry: string | null;
  products_services: string | null;
  target_customers: string | null;
  main_offering: string | null;
  technologies: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface JobStep {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
}

export interface JobRow {
  id: number;
  company_id: number;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step: string | null;
  steps: JobStep[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityFinding {
  problem: string;
  evidence: string;
  confidence: number;
  business_impact: string;
  recommended_solution: string;
}

export interface DetectedOpportunity extends OpportunityFinding {
  matched_service: string;
  match_reason: string;
  expected_benefit: string;
}

export interface SiteSnapshot {
  url: string;
  title: string;
  metaDescription: string;
  h1s: string[];
  navLinks: string[];
  text: string;
  links: string[];
  tech: string[];
  pageCount: number;
}

export interface ResearchResult {
  industry: string;
  products_services: string;
  target_customers: string;
  main_offering: string;
  technologies: string[];
  summary: string;
}
