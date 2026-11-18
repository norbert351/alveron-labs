-- Alveron Labs unified opportunity layer. Additive only.
CREATE TABLE IF NOT EXISTS opportunity_records (
  id BIGSERIAL PRIMARY KEY,
  opportunity_type TEXT NOT NULL CHECK (opportunity_type IN ('remote_job','paid_task','agency_contract','business_lead','paid_research','technical_content')),
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  external_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  organization_name TEXT,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  location TEXT,
  is_remote BOOLEAN NOT NULL DEFAULT false,
  employment_type TEXT,
  compensation_min NUMERIC(14,2),
  compensation_max NUMERIC(14,2),
  compensation_currency TEXT,
  compensation_period TEXT,
  deadline_at TIMESTAMPTZ,
  required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualification JSONB NOT NULL DEFAULT '{}'::jsonb,
  fit_score NUMERIC(5,2) CHECK (fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 100)),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','partial','verified')),
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered','reviewing','qualified','approved','rejected','applied','closed','expired')),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (compensation_min IS NULL OR compensation_max IS NULL OR compensation_max >= compensation_min)
);
CREATE INDEX IF NOT EXISTS idx_opportunity_records_status_created ON opportunity_records(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_records_type_created ON opportunity_records(opportunity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_records_source ON opportunity_records(source_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_records_fit ON opportunity_records(fit_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_opportunity_records_deadline ON opportunity_records(deadline_at) WHERE deadline_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunity_records_skills ON opportunity_records USING GIN(required_skills);

CREATE TABLE IF NOT EXISTS opportunity_profiles (
  id BIGSERIAL PRIMARY KEY,
  profile_key TEXT NOT NULL UNIQUE DEFAULT 'primary',
  display_name TEXT NOT NULL DEFAULT 'Primary profile',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunity_source_runs (
  id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  opportunity_type TEXT NOT NULL CHECK (opportunity_type IN ('remote_job','paid_task','agency_contract','business_lead','paid_research','technical_content')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','partial','failed')),
  query JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_count INT NOT NULL DEFAULT 0,
  new_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opportunity_source_runs_created ON opportunity_source_runs(created_at DESC);
