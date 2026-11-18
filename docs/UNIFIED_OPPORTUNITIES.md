# Unified opportunity engine

The unified opportunity layer gives Alveron Labs one place to collect and review
paid work, client opportunities and research opportunities. It is additive.
Existing `opportunities` and `research_opportunities` tables remain unchanged,
so the current business research and outreach pipeline continues to work.

## Opportunity channels

- `remote_job`: remote employment opportunities.
- `paid_task`: freelance and fixed-scope technical work.
- `agency_contract`: white-label, agency partner and subcontracting work.
- `business_lead`: direct business prospecting from Alveron's existing global
  business research engine.
- `paid_research`: paid research participant or user-study opportunities when
  a source explicitly describes them as paid studies.
- `technical_content`: technical writing and developer documentation roles.

The first discovery adapters cover RemoteOK, Remotive and Hacker News comments.
Hacker News searches recent comments for explicit freelance, agency, paid research
and technical writing signals. These are community leads, so they remain partial
verification and always link to the original comment for human review. Listings are classified
conservatively. Ambiguous roles remain remote jobs instead of being guessed into
a more specific category. The current adapters do not claim full coverage of
every paid research or agency subcontracting marketplace. Additional sources
should be added only where their public APIs, feeds or usage terms allow it.

## Discovery sources and attribution

- RemoteOK JSON feed: https://remoteok.com/api
- RemoteOK API and feed FAQ: https://remoteok.com/faq
- Remotive public API: https://remotive.com/api/remote-jobs
- Hacker News Search API: https://hn.algolia.com/api
- Remotive API terms and usage notes: https://remotive.com/remote-jobs/api

Each listing keeps its original source name and direct source URL. Hacker News comments are searched within a 45-day window and must contain both an action signal and a category-specific paid-work signal before ingestion. Remotive asks
developers to credit Remotive and link to the original listing. Its public API
documentation recommends no more than four reads per day. The adapter caches
successful and partial provider runs for six hours. RemoteOK listings also retain
source attribution and direct links.

## API

- `GET /api/opportunity-records`: list with optional `type`, `status`,
  `source`, `search`, `limit` and `offset`.
- `POST /api/opportunity-records`: create a normalized record with deduplication.
- `PATCH /api/opportunity-records/:id`: update review status, verification
  status or fit score.
- `GET /api/opportunity-profile`: read the primary skills and preferences profile.
- `PUT /api/opportunity-profile`: save skills, experience, preferences and constraints.
- `POST /api/opportunity-records/:id/score`: calculate and store an explainable
  match score from skill coverage and configured profile preferences/constraints.
- `GET /api/opportunity-records/:id/outcomes`: read the human-recorded progress history.
- `POST /api/opportunity-records/:id/outcomes`: record review, approval, application,
  response, interview, offer, win/loss, no-response or follow-up events.
- `POST /api/opportunity-discovery/run`: run provider discovery and import
  existing Alveron business research opportunities.
- `POST /api/webhook/opportunity-discovery`: same discovery run for n8n, protected
  by the existing webhook key.
- `GET /api/opportunity-discovery/runs`: list recent provider run history.

The first matcher reports matched and missing skills, applies explicit remote
and opportunity-type preferences, and supports blocked types, minimum
compensation and allowed currencies. It does not infer seniority or claim that
a person is qualified from skill-name overlap alone. Compensation constraints
are applied only when a source provides comparable currency and amount data.

Creating a record, scoring it or recording an outcome never contacts a third
party or submits an application. Approval and external actions remain separate
human-controlled steps. A status of `approved` records a human review decision
only. It does not trigger an application. The outcome history provides evidence
for later conversion analysis and ranking improvements.

## Scheduling with n8n

The workflow `n8n/workflows/alveron-opportunity-discovery.json` includes a
six-hour schedule and a manual webhook. Import it using
`bash n8n/import_workflows.sh`, then activate it in n8n. Set
`ALVERON_WEBHOOK_TOKEN` in the n8n environment. Set `ALVERON_API_URL` to the
API base URL reachable from the n8n process. If it is omitted, the workflow
uses `http://127.0.0.1:3100`.

The schedule is six-hourly to respect Remotive's public API guidance. The
workflow can be run manually from n8n as well.

## Data safety

Migration `006_unified_opportunities.sql` creates new tables and indexes.
Migration `007_opportunity_source_runs.sql` adds a nullable link to source runs.
Migration `008_opportunity_outcomes.sql` creates the append-only human outcome
history. These migrations do not rewrite or delete existing opportunity data. Migrations are
applied by the repository's existing ordered migration runner.

Provider requests use fixed HTTPS endpoints, timeouts and redirect rejection.
Returned listing links are restricted to the provider's own HTTPS domain before
they are stored. The adapters do not automatically open arbitrary job URLs.

## Remaining implementation

1. Add direct source-specific adapters for paid research and agency subcontracting
   marketplaces after checking API access and reuse terms. Current Hacker News
   discovery provides community leads for these categories, not comprehensive
   marketplace coverage.
2. Add source freshness checks, closed-listing detection and evidence review.
3. Build deeper experience, location, compensation-period and eligibility
   matching.
4. Add a unified dashboard review queue, saved searches and daily briefings.
5. Add outcome tracking and learning from applications and client responses.
6. Continue migrating the remaining raw `pg` data-access paths to Drizzle. The
   opportunity profile read/write path now uses Drizzle on the existing shared
   `pg` Pool. The typed schema maps the new opportunity tables, while the current
   SQL migration runner remains the source of database changes.
