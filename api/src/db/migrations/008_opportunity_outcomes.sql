-- Track human-reviewed application and client outcomes for future ranking feedback.
CREATE TABLE IF NOT EXISTS opportunity_outcomes (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT NOT NULL REFERENCES opportunity_records(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'reviewed', 'approved', 'rejected', 'applied', 'response_received',
    'interview', 'offer', 'won', 'lost', 'no_response', 'follow_up', 'closed'
  )),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_opportunity_event
  ON opportunity_outcomes(opportunity_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_type_event
  ON opportunity_outcomes(event_type, event_at DESC);
