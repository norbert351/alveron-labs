-- Store local-model summaries separately from source evidence.
CREATE TABLE IF NOT EXISTS company_intelligence_reports (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  findings_count INT NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_intelligence_reports_company_date
  ON company_intelligence_reports(company_id, generated_at DESC);
