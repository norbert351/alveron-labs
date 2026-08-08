# Alveron Labs — Lead Intelligence Architecture (Phase 2)

## System diagram

```
                         ┌─────────────────────────────┐
                         │   Alveron Dashboard (Next)  │
                         │   :3101                     │
                         │   human review, approval,   │
                         │   CRM, analytics, workflows │
                         └──────────────┬──────────────┘
                                        │ same-origin /api/* proxy
                                        │ adds Bearer token server-side
                         ┌──────────────▼──────────────┐
                         │   Alveron API (Fastify)     │
                         │   :3100                     │
                         │   source of truth:          │
                         │   companies, research,      │
                         │   opportunities, proposals, │
                         │   outreach, users, settings │
                         │   AI business logic         │
                         └───────┬──────────────┬──────┘
                                 │              │
                 X-Webhook-Key   │              │   X-Webhook-Key
                                 ▼              ▼
                    ┌──────────────────┐  ┌────────────────────┐
                    │  n8n (orchestr.) │  │ email provider     │
                    │  :5678           │  │ (transactional)    │
                    │  triggers,       │  │ delivery webhooks  │
                    │  waiting,        │  │                    │
                    │  retries,        │  └────────────────────┘
                    │  follow-ups      │
                    └──────────────────┘
```

**Rule:** n8n orchestrates. The Alveron API owns business logic, AI processing,
the database, validation, and audit history. Modules never move into n8n.

## Services (unchanged, modular, agent-ready)

`CompanyResearch` · `WebsiteAnalysis` · `OpportunityDetection` ·
`SolutionRecommendation` · `ProposalGeneration` · `Outreach` · `LeadScoring`

Each is a standalone module in `api/src/modules/` that can be promoted to an
independent AI agent without restructuring.

## New in phase 2

| Layer | What | Where |
|---|---|---|
| Migrations | versioned SQL runner, `schema_migrations` table | `api/src/db/migrations/` |
| Security | Bearer auth, webhook key auth, rate limiting, SSRF guard, audit log | `api/src/plugins/security.ts`, `api/src/ssrf.ts` |
| Scoring | 0-100 opportunity score + components, priority bucket | `api/src/modules/LeadScoring.ts` |
| Webhooks | n8n + email provider surface, token-authenticated | `api/src/routes/webhooks.ts` |
| CRM | 10-stage pipeline, manual stage changes, activity history | `companies.stage`, `activity_logs` |
| Delivery | queued → sending → sent → delivered → failed → bounced | `outreach_messages`, `outreach_events` |
| Follow-ups | day-based sequences, stop conditions, configurable | `follow_up_sequences` + settings |
| Workflow monitor | n8n run visibility without opening n8n | `workflow_runs` + dashboard |
| Leads | controlled lead sources, dedupe, promote to research | `leads`, `lead_sources` |
| Frontend | same-origin proxy adds the internal token server-side | `web/src/app/api/[...path]/route.ts` |

## Database

Tables: `companies`, `website_scans`, `research_reports`, `opportunities`,
`proposals`, `outreach`, `settings`, `jobs` (baseline) plus `leads`,
`lead_sources`, `lead_scores`, `outreach_messages`, `outreach_events`,
`follow_up_sequences`, `workflow_runs`, `activity_logs`, `schema_migrations`
(migration 002).

New columns: `opportunities.score*` + `priority`, `outreach.approved_by /
approved_at / approval_status / edited_before_send / rejected_reason`,
`companies.stage / lead_source`.

## Job lifecycle

1. Company submitted (dashboard or webhook) → duplicate + SSRF checks
2. Job created (`pending`), queued (serial processor)
3. fetch → research → analyze → match → score → finalize, each step persisted
4. Restart safety: jobs orphaned by an API restart are marked `failed` so
   duplicate-job guards never permanently block a company

## Delivery flow

Approve (human, recorded) → `outreach_messages` row `queued` → n8n polls
`/api/webhook/outreach-queue` → sends via transactional provider → records
`sent`/`failed`/`bounced` → events logged → follow-up sequence starts.
The API never sends email directly and the browser never sees provider keys.
