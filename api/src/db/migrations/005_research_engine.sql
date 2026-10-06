-- =====================================================================
-- Alveron Labs — Phase 12: Global Automated Research Engine
-- Additive + idempotent. Never modify earlier migrations; add 006+ next.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extend companies with discovery / global fields (additive)
-- ---------------------------------------------------------------------
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_uid TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS discovery_source TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS discovery_external_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS research_status TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_researched_at TIMESTAMPTZ;

-- A company is unique by stable uid (provider + external id) and, when known, by domain.
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_uid ON companies(company_uid) WHERE company_uid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_domain ON companies(domain) WHERE domain IS NOT NULL AND domain <> '';

-- ---------------------------------------------------------------------
-- Research run (top-level orchestration entity, section 25)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  industry TEXT,
  language TEXT,
  website_required BOOLEAN DEFAULT true,
  requested_count INT DEFAULT 20,
  provider TEXT,
  status TEXT DEFAULT 'pending',        -- pending|running|completed|failed|partial
  statistics JSONB DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_runs_status ON research_runs(status);
CREATE INDEX IF NOT EXISTS idx_research_runs_created ON research_runs(created_at DESC);

-- Per-provider discovery attempt inside a run
CREATE TABLE IF NOT EXISTS discovery_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  query JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',        -- pending|running|completed|failed
  found_count INT DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_run ON discovery_runs(run_id);

-- Raw discovered companies (pre-validation)
CREATE TABLE IF NOT EXISTS discovered_companies (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  discovery_run_id BIGINT REFERENCES discovery_runs(id) ON DELETE CASCADE,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  name TEXT,
  website TEXT,
  domain TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  language TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  raw JSONB DEFAULT '{}',
  dedupe_key TEXT,
  valid BOOLEAN DEFAULT true,
  validation_status TEXT,               -- ok|no_website|invalid_url|unreachable|duplicate|blocked
  validation_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discovered_run ON discovered_companies(run_id);
CREATE INDEX IF NOT EXISTS idx_discovered_company ON discovered_companies(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovered_run_dedupe ON discovered_companies(run_id, dedupe_key);

-- ---------------------------------------------------------------------
-- Websites (a company may have multiple domains; a domain many crawl runs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS websites (
  id BIGSERIAL PRIMARY KEY,
  company_id INT REFERENCES companies(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT true,
  language TEXT,
  locale TEXT,
  country TEXT,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_websites_company_domain ON websites(company_id, domain);
CREATE INDEX IF NOT EXISTS idx_websites_domain ON websites(domain);

-- ---------------------------------------------------------------------
-- Crawl runs + pages
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crawl_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT,
  website_id BIGINT REFERENCES websites(id) ON DELETE CASCADE,
  company_id INT,
  root_url TEXT,
  status TEXT DEFAULT 'pending',        -- SUCCESS|PARTIAL|BLOCKED|TIMEOUT|INVALID_DOMAIN|REQUIRES_BROWSER|CRAWL_LIMIT|FAILED
  failure_class TEXT,
  pages_attempted INT DEFAULT 0,
  pages_completed INT DEFAULT 0,
  render_used BOOLEAN DEFAULT false,
  robots_allowed BOOLEAN,
  robots_found BOOLEAN,
  sitemap_found BOOLEAN,
  duration_ms INT,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_run ON crawl_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_company ON crawl_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_website ON crawl_runs(website_id);

CREATE TABLE IF NOT EXISTS pages (
  id BIGSERIAL PRIMARY KEY,
  crawl_run_id BIGINT REFERENCES crawl_runs(id) ON DELETE CASCADE,
  website_id BIGINT,
  company_id INT,
  url TEXT NOT NULL,
  final_url TEXT,
  page_type TEXT,                       -- homepage|about|services|products|pricing|contact|booking|checkout|blog|faq|careers|locations|other
  http_status INT,
  content_type TEXT,
  language TEXT,
  title TEXT,
  meta_description TEXT,
  depth INT DEFAULT 0,
  rendered BOOLEAN DEFAULT false,
  content_length INT,
  text_excerpt TEXT,
  content_hash TEXT,
  links_count INT DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pages_crawl ON pages(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_pages_company ON pages(company_id);

-- ---------------------------------------------------------------------
-- Signals / findings / evidence
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS website_signals (
  id BIGSERIAL PRIMARY KEY,
  crawl_run_id BIGINT REFERENCES crawl_runs(id) ON DELETE CASCADE,
  website_id BIGINT,
  company_id INT,
  category TEXT,                        -- technical|ux|business
  signal_key TEXT,
  value JSONB,
  confidence NUMERIC(4,3) DEFAULT 0.8,
  detection_method TEXT DEFAULT 'programmatic',
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signals_crawl ON website_signals(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_signals_company ON website_signals(company_id);

CREATE TABLE IF NOT EXISTS research_findings (
  id BIGSERIAL PRIMARY KEY,
  finding_uid TEXT UNIQUE,
  run_id TEXT,
  company_id INT,
  crawl_run_id BIGINT,
  category TEXT,                        -- technical|ux|business|conversion|automation|customer_experience|ecommerce|security|accessibility|other
  description TEXT,
  severity TEXT,                        -- low|medium|high|unknown
  confidence NUMERIC(4,3),
  detection_method TEXT,                -- programmatic|llm
  source_url TEXT,
  evidence JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_findings_company ON research_findings(company_id);
CREATE INDEX IF NOT EXISTS idx_findings_run ON research_findings(run_id);

CREATE TABLE IF NOT EXISTS evidence (
  id BIGSERIAL PRIMARY KEY,
  finding_id BIGINT REFERENCES research_findings(id) ON DELETE CASCADE,
  problem_id BIGINT,
  type TEXT DEFAULT 'observed',         -- observed|inferred|unknown
  url TEXT,
  text TEXT,
  signal TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_finding ON evidence(finding_id);
CREATE INDEX IF NOT EXISTS idx_evidence_problem ON evidence(problem_id);

-- ---------------------------------------------------------------------
-- Problems (AI + deterministic, section 13)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS problems (
  id BIGSERIAL PRIMARY KEY,
  problem_uid TEXT UNIQUE,
  run_id TEXT,
  company_id INT,
  crawl_run_id BIGINT,
  ai_run_id BIGINT,
  title TEXT,
  category TEXT,
  description TEXT,
  confidence NUMERIC(4,3),
  business_impact TEXT,                 -- low|medium|high|unknown
  requires_verification BOOLEAN DEFAULT true,
  origin TEXT DEFAULT 'llm',            -- llm|programmatic
  evidence JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_problems_company ON problems(company_id);
CREATE INDEX IF NOT EXISTS idx_problems_run ON problems(run_id);

-- ---------------------------------------------------------------------
-- Opportunities (phase-12 entity — legacy `opportunities` untouched)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_opportunities (
  id BIGSERIAL PRIMARY KEY,
  opportunity_uid TEXT UNIQUE,
  run_id TEXT,
  company_id INT,
  problem_id BIGINT REFERENCES problems(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  business_value TEXT,
  alveron_can_solve BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ropp_company ON research_opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_ropp_run ON research_opportunities(run_id);

CREATE TABLE IF NOT EXISTS opportunity_scores (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT REFERENCES research_opportunities(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,2),
  priority TEXT,                        -- High|Medium|Low|Poor fit
  components JSONB DEFAULT '{}',
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oppscores_opp ON opportunity_scores(opportunity_id);

-- ---------------------------------------------------------------------
-- Service catalog + recommendations (section 16)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  keywords JSONB DEFAULT '[]',
  categories JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS service_recommendations (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT REFERENCES research_opportunities(id) ON DELETE CASCADE,
  service_code TEXT REFERENCES service_catalog(code),
  confidence NUMERIC(4,3),
  why_this_solution TEXT,
  what_it_would_do TEXT,
  what_evidence_supports TEXT,
  what_is_unknown TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servrec_opp ON service_recommendations(opportunity_id);

-- ---------------------------------------------------------------------
-- AI run bookkeeping + observability (sections 23, 26)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT,
  company_id INT,
  purpose TEXT,                         -- problem_detection|opportunity|recommendation|scoring
  provider TEXT,
  model TEXT,
  status TEXT,                          -- completed|failed
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  latency_ms INT,
  attempts INT DEFAULT 1,
  request_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_run ON ai_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_company ON ai_runs(company_id);

CREATE TABLE IF NOT EXISTS screenshots (
  id BIGSERIAL PRIMARY KEY,
  crawl_run_id BIGINT,
  company_id INT,
  page_url TEXT,
  label TEXT,
  path TEXT,
  width INT,
  height INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_screenshots_company ON screenshots(company_id);

CREATE TABLE IF NOT EXISTS engine_errors (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT,
  company_id INT,
  stage TEXT,
  code TEXT,
  message TEXT,
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engine_errors_run ON engine_errors(run_id);

-- ---------------------------------------------------------------------
-- Idempotency: research run results per company (section 24)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_company_results (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL,
  company_id INT NOT NULL,
  crawl_run_id BIGINT,
  status TEXT DEFAULT 'pending',        -- pending|running|completed|failed|skipped
  outcome TEXT,                         -- SUCCESS|PARTIAL|BLOCKED|TIMEOUT|INVALID_DOMAIN|REQUIRES_BROWSER|CRAWL_LIMIT|AI_ANALYSIS_FAILED|NO_WEBSITE
  problems_count INT DEFAULT 0,
  opportunities_count INT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_research_company_result ON research_company_results(run_id, company_id);
CREATE INDEX IF NOT EXISTS idx_rcr_run ON research_company_results(run_id);

-- ---------------------------------------------------------------------
-- Service catalog seed (section 16)
-- ---------------------------------------------------------------------
INSERT INTO service_catalog (code, name, description, keywords, categories) VALUES
  ('WEBSITE_DEVELOPMENT','Website Development','Design and build fast, modern, mobile-first websites.', '["website","design","landing page","mobile"]','["technical","ux","conversion"]'),
  ('ECOMMERCE','Ecommerce','Online storefronts, product discovery, checkout and payments optimisation.', '["ecommerce","store","checkout","cart","products","shipping","payment"]','["ecommerce","conversion"]'),
  ('BUSINESS_AUTOMATION','Business Automation','Automate repetitive manual workflows and back-office processes.', '["automation","workflow","manual","process","back office","admin"]','["automation"]'),
  ('AI_SYSTEMS','AI Systems','Applied AI: assistants, recommendation, document and data intelligence.', '["ai","chatbot","recommendation","intelligence","assistant"]','["automation","customer_experience"]'),
  ('CUSTOM_SOFTWARE','Custom Software','Bespoke internal tools and business applications.', '["custom","software","internal tool","portal","system"]','["automation","technical"]'),
  ('API_INTEGRATION','API Integration','Connect third-party systems, payments, scheduling and data sources.', '["integration","api","connect","payment","scheduling","crm"]','["automation","technical"]'),
  ('CRM_IMPLEMENTATION','CRM Implementation','CRM setup, lead capture and pipeline management.', '["crm","lead","pipeline","sales","follow up"]','["automation","conversion"]'),
  ('AI_CUSTOMER_SUPPORT','AI Customer Support','Automated support, self-service and deflection.', '["support","customer service","self service","ticket","faq"]','["customer_experience","automation"]'),
  ('PRODUCT_TESTING','Product Testing','QA and usability testing of web and mobile products.', '["testing","qa","usability"]','["technical","ux"]'),
  ('SECURITY_TESTING','Security Testing','Authorised security review of public-facing systems.', '["security","https","ssl","vulnerability"]','["security"]'),
  ('DATA_WORKFLOWS','Data Workflows','Data collection, enrichment, reporting and pipelines.', '["data","reporting","analytics","dashboard","pipeline"]','["automation","technical"]'),
  ('INTERNAL_TOOLS','Internal Tools','Dashboards and admin tools for internal teams.', '["internal","admin","dashboard","tool"]','["automation","technical"]')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  keywords = EXCLUDED.keywords, categories = EXCLUDED.categories;
