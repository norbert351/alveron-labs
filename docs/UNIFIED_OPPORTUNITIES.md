# Unified opportunity engine, first implementation milestone

The unified opportunity layer is additive. Existing `opportunities` and
`research_opportunities` tables remain unchanged so the current business
research and outreach pipeline continues to work.

## Opportunity channels

- `remote_job`: remote employment opportunities.
- `paid_task`: short paid technical tasks and contract work.
- `agency_contract`: subcontracting and white-label delivery opportunities.
- `business_lead`: direct business prospecting, including the existing website
  research engine.
- `paid_research`: paid research studies and technical research opportunities.
- `technical_content`: paid technical writing, tutorials and developer content.

## API

- `GET /api/opportunity-records`: list with optional `type`, `status`,
  `source`, `search`, `limit` and `offset`.
- `POST /api/opportunity-records`: create a normalized record. Source plus
  external id, or source plus URL when no external id exists, is deduplicated.
- `PATCH /api/opportunity-records/:id`: update review status, verification
  status or fit score.

All routes use the existing API authentication layer. Creating a record never
contacts a third party or submits an application. Approval and external actions
remain separate human-controlled steps.

## Data safety

Migration `006_unified_opportunities.sql` creates new tables and indexes only.
It does not rewrite or delete existing opportunity data. The API uses parameterized
queries, validates source URLs as HTTP(S), constrains enum-like fields and caps
list page sizes. Source URL validation does not fetch the URL.

## Next steps

1. Add and test discovery adapters for each source channel.
2. Build profile editing and transparent skills/constraint matching.
3. Add verification and freshness checks with source evidence.
4. Add review queue and explicit approval gates for applications and outreach.
5. Add scheduled discovery and outcome tracking.
