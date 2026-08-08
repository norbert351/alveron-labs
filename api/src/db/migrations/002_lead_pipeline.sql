-- Phase 2: lead intelligence pipeline
-- All statements are additive and idempotent. Existing data is untouched.

-- Leads from discovery sources
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_key TEXT,
  company_id INT REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  location TEXT,
  company_size TEXT,
  keywords TEXT[] DEFAULT '{}',
  raw JSONB DEFAULT '{}',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, source_key)
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'manual',
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Opportunity scoring
CREATE TABLE IF NOT EXISTS lead_scores (
  id SERIAL PRIMARY KEY,
  opportunity_id INT REFERENCES opportunities(id) ON DELETE CASCADE,
  score INT NOT NULL,
  evidence_quality NUMERIC(5,2),
  problem_severity NUMERIC(5,2),
  alveron_fit NUMERIC(5,2),
  confidence NUMERIC(5,2),
  operational_value NUMERIC(5,2),
  feasibility NUMERIC(5,2),
  complexity NUMERIC(5,2),
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score INT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_evidence_quality NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_problem_severity NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_alveron_fit NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_operational_value NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_feasibility NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_complexity NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_rationale TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS priority TEXT;

-- Human review metadata on outreach
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS edited_before_send BOOLEAN DEFAULT false;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- CRM pipeline stage on companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Discovered';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS lead_source TEXT;

-- Email delivery tracking
CREATE TABLE IF NOT EXISTS outreach_messages (
  id SERIAL PRIMARY KEY,
  outreach_id INT REFERENCES outreach(id) ON DELETE CASCADE,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT DEFAULT 'queued',
  attempts INT DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_events (
  id SERIAL PRIMARY KEY,
  outreach_id INT REFERENCES outreach(id) ON DELETE CASCADE,
  message_id INT REFERENCES outreach_messages(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Follow-up sequences
CREATE TABLE IF NOT EXISTS follow_up_sequences (
  id SERIAL PRIMARY KEY,
  outreach_id INT REFERENCES outreach(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  current_step INT DEFAULT 0,
  steps JSONB DEFAULT '[]',
  stop_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- n8n workflow run monitoring
CREATE TABLE IF NOT EXISTS workflow_runs (
  id SERIAL PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  n8n_run_id TEXT,
  status TEXT NOT NULL,
  trigger TEXT,
  retry_count INT DEFAULT 0,
  last_error TEXT,
  payload JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit / activity history
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INT,
  detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_opp ON lead_scores(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_outreach ON outreach_messages(outreach_id);
CREATE INDEX IF NOT EXISTS idx_outreach_events_outreach ON outreach_events(outreach_id);
CREATE INDEX IF NOT EXISTS idx_seq_outreach ON follow_up_sequences(outreach_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_name ON workflow_runs(workflow_name);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
