const API = process.env.NEXT_PUBLIC_API_URL || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface JobStep {
  key: string;
  label: string;
  status: JobStatus;
  detail?: string;
}

export interface Job {
  id: number;
  company_id: number;
  status: JobStatus;
  current_step: string | null;
  steps: JobStep[];
  error: string | null;
}

export interface Company {
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
  opportunity_count?: number;
}

export interface Scan {
  id: number;
  url: string;
  status: string;
  findings: any[];
  page_count: number;
  error: string | null;
}

export interface Report {
  id: number;
  status: string;
  summary: string | null;
  details: any;
  sources: string[];
  created_at: string;
}

export interface Opportunity {
  id: number;
  company_id: number;
  problem: string;
  evidence: string;
  confidence: number | string;
  business_impact: string;
  recommended_solution: string;
  matched_service: string | null;
  status: string;
  company_name?: string;
  created_at: string;
}

export interface Proposal {
  id: number;
  company_id: number;
  opportunity_id: number;
  opening: string;
  observed_opportunity: string;
  evidence: string;
  suggested_solution: string;
  expected_benefit: string;
  next_step: string;
  status: string;
  company_name?: string;
  created_at: string;
}

export interface OutreachItem {
  id: number;
  company_id: number;
  proposal_id: number;
  subject: string;
  body: string;
  target_company: string;
  recommended_service: string;
  reason: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export interface CompanyDetail {
  company: Company;
  scan: Scan | null;
  report: Report | null;
  opportunities: Opportunity[];
  proposals: Proposal[];
  outreach: OutreachItem[];
  job: Job | null;
}

export interface Overview {
  companies: { total: number; new: number; analyzed: number; proposed: number; outreach: number };
  scans: { total: number; completed: number; failed: number };
  opportunities: { total: number; avg_confidence: string | null; open: number };
  proposals: { total: number; sent: number; draft: number };
  outreach: { total: number; approved: number; sent: number; rejected: number };
  recentCompanies: Company[];
  byService: { matched_service: string; count: number }[];
}
