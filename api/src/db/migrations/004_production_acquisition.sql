-- Phase 11: production acquisition system
-- Users, email accounts (OAuth), real send records, campaigns, safety, attribution

-- 1. Users + sessions (multi-user auth)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

-- 2. Email accounts (OAuth, tokens encrypted at rest)
CREATE TABLE IF NOT EXISTS email_accounts (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'microsoft', 'resend')),
  email TEXT NOT NULL,
  label TEXT,
  purpose TEXT NOT NULL DEFAULT 'outreach' CHECK (purpose IN ('outreach', 'transactional')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  last_token_refresh_at TIMESTAMPTZ,
  last_send_at TIMESTAMPTZ,
  daily_send_count INT NOT NULL DEFAULT 0,
  daily_send_date DATE,
  last_error TEXT,
  oauth_state TEXT,
  oauth_state_expires_at TIMESTAMPTZ,
  history_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, email)
);

-- 3. Outreach messages: real provider send records
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS provider_thread_id TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS email_account_id INT REFERENCES email_accounts(id) ON DELETE SET NULL;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS in_reply_to TEXT;

-- 4. Approval attribution + versioning
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS approved_by_user_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS approval_ip TEXT;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS approval_user_agent TEXT;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS proposal_version INT NOT NULL DEFAULT 1;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS email_version INT NOT NULL DEFAULT 1;

-- 5. Reply tracking
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS reply_excerpt TEXT;

-- 6. Leads: source provenance
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT now();

-- 7. Events carry raw provider payloads
ALTER TABLE outreach_events ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';

-- 8. Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  daily_limit INT NOT NULL DEFAULT 20,
  min_delay_minutes INT NOT NULL DEFAULT 5,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Scored components: business relevance
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_business_relevance NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_feasibility NUMERIC(5,2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_rationale TEXT;
