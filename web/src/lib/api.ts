const API = process.env.NEXT_PUBLIC_API_URL || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((options?.headers || {}) as Record<string, string>) };
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('alveron_session_token');
    if (t) headers['X-User-Token'] = t;
  }
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
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

export const PIPELINE_STAGES = [
  'Discovered',
  'Researching',
  'Qualified',
  'Proposal Ready',
  'Approved',
  'Contacted',
  'Replied',
  'Interested',
  'Meeting',
  'Proposal Sent',
  'Won',
  'Lost',
  'Paused',
];

export interface Company {
  id: number;
  name: string;
  website: string;
  status: string;
  stage: string;
  lead_source: string | null;
  created_at: string;
  industry: string | null;
  products_services: string | null;
  target_customers: string | null;
  main_offering: string | null;
  technologies: string[];
  notes: string | null;
  updated_at: string;
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
  score: number | null;
  priority: string | null;
  score_evidence_quality?: number | string;
  score_problem_severity?: number | string;
  score_alveron_fit?: number | string;
  score_operational_value?: number | string;
  score_feasibility?: number | string;
  score_complexity?: number | string;
  score_rationale?: string | null;
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

export interface OutreachMessage {
  id: number;
  outreach_id: number;
  provider: string | null;
  provider_message_id: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
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
  approval_status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  edited_before_send: boolean;
  rejected_reason: string | null;
  sent_at: string | null;
  created_at: string;
  latest_message?: OutreachMessage | null;
}

export interface ActivityItem {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: number;
  detail: any;
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
  activity: ActivityItem[];
}

export interface WorkflowRun {
  id: number;
  workflow_name: string;
  n8n_run_id: string | null;
  status: string;
  trigger: string | null;
  retry_count: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Lead {
  id: number;
  source: string;
  source_key: string;
  company_id: number | null;
  name: string;
  website: string | null;
  industry: string | null;
  location: string | null;
  company_size: string | null;
  keywords: string[];
  status: string;
  created_at: string;
}

export interface Overview {
  companies: { total: number; new: number; analyzed: number; proposed: number; outreach: number };
  scans: { total: number; completed: number; failed: number };
  opportunities: { total: number; avg_confidence: string | null; open: number; high: number; medium: number; low: number };
  proposals: { total: number; sent: number; draft: number; approved: number };
  outreach: { total: number; approved: number; sent: number; rejected: number; failed: number; bounced: number };
  recentCompanies: Company[];
  byService: { matched_service: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  stages: { stage: string; count: number }[];
  conversionRates: Record<string, number | null>;
}

export interface SettingsData {
  llm: { baseUrl: string; model: string; keySet: boolean };
  services: { name: string; description: string }[];
  followUp: { enabled: boolean; days: number[]; max_follow_ups: number };
  email: { provider: string; from_name: string; from_email: string };
}


export interface User {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
}

export interface EmailAccount {
  id: number;
  provider: 'gmail' | 'microsoft' | 'resend';
  email: string;
  label: string | null;
  purpose: 'outreach' | 'transactional';
  is_default: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  scopes: string[];
  last_token_refresh_at: string | null;
  last_send_at: string | null;
  daily_send_count: number;
  daily_send_date: string | null;
  last_error: string | null;
  created_at: string;
}

export interface ProviderConfig {
  kind: 'gmail' | 'microsoft' | 'resend';
  configured: boolean;
  missing: string[];
}

export interface EmailSafety {
  pause_all: boolean;
  daily_limit: number;
  min_delay_minutes: number;
  max_follow_ups: number;
}

export interface QueueItem {
  id: number;
  subject: string;
  target_company: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  message_id: number | null;
  message_status: string | null;
  provider: string | null;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  failed_at: string | null;
}

export interface ActivityEvent {
  id: number;
  outreach_id: number;
  message_id: number | null;
  event: string;
  detail: string | null;
  created_at: string;
}
