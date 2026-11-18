-- Human-review queue for companies found through public startup discovery.
CREATE TABLE IF NOT EXISTS company_discovery_candidates (
  id BIGSERIAL PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN ('discovered','reviewing','promoted','rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_company_candidates_status_date
  ON company_discovery_candidates(status, discovered_at DESC);
