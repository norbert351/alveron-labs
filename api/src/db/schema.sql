-- Alveron Labs Lead Intelligence schema
-- MVP scope: research, opportunities, proposals, outreach with human approval.

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT NOT NULL,
  notes TEXT DEFAULT '',
  industry TEXT,
  products_services TEXT,
  target_customers TEXT,
  main_offering TEXT,
  technologies JSONB DEFAULT '[]',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_scans (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  findings JSONB DEFAULT '[]',
  page_count INT DEFAULT 0,
  pages_analyzed INT DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_reports (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  scan_id INT REFERENCES website_scans(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  summary TEXT,
  details JSONB DEFAULT '{}',
  sources JSONB DEFAULT '[]',
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  scan_id INT REFERENCES website_scans(id) ON DELETE SET NULL,
  problem TEXT NOT NULL,
  evidence TEXT,
  confidence NUMERIC(4,2),
  business_impact TEXT,
  recommended_solution TEXT,
  matched_service TEXT,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  opportunity_id INT REFERENCES opportunities(id) ON DELETE CASCADE,
  opening TEXT,
  observed_opportunity TEXT,
  evidence TEXT,
  suggested_solution TEXT,
  expected_benefit TEXT,
  next_step TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  proposal_id INT REFERENCES proposals(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT,
  target_company TEXT,
  recommended_service TEXT,
  reason TEXT,
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'company_analysis',
  status TEXT DEFAULT 'pending',
  current_step TEXT,
  steps JSONB DEFAULT '[]',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scans_company ON website_scans(company_id);
CREATE INDEX IF NOT EXISTS idx_reports_company ON research_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_opps_company ON opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_proposals_company ON proposals(company_id);
CREATE INDEX IF NOT EXISTS idx_outreach_company ON outreach(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
