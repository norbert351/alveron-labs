-- Evidence store for multi-angle company intelligence. All evidence remains attributable.
CREATE TABLE IF NOT EXISTS company_intelligence_findings (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('company_signal','customer_pain','technical_signal','technology_signal')),
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_name, source_url)
);
CREATE INDEX IF NOT EXISTS idx_company_intelligence_company_category
  ON company_intelligence_findings(company_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_intelligence_source_created
  ON company_intelligence_findings(source_name, created_at DESC);
