# Alveron Labs — Lead Intelligence Architecture (Phase 11)

## System diagram

```
                         ┌─────────────────────────────┐
                         │   Alveron Dashboard (Next)  │
                         │   :3101                     │
                         │   login, human review,      │
                         │   approval attribution,     │
                         │   email accounts, queue,    │
                         │   activity, CRM, analytics  │
                         └──────────────┬──────────────┘
                                        │ same-origin /api/* proxy
                                        │ adds Bearer token server-side
                                        │ forwards X-User-Token (session)
                         ┌──────────────▼──────────────┐
                         │   Alveron API (Fastify)     │
                         │   :3100                     │
                         │   source of truth + auth:   │
                         │   users/sessions/RBAC,      │
                         │   companies, research,      │
                         │   opportunities, proposals, │
                         │   outreach, settings        │
                         │   AI business logic         │
                         └───────┬───────────┬─────────┘
                                 │           │
                 X-Webhook-Key   │           │   OAuth (Google/Graph)
                                 ▼           ▼
                    ┌──────────────────┐  ┌───────────────────────┐
                    │  n8n (orchestr.) │  │  EmailProvider layer  │
                    │  :5678           │  │  Gmail · Microsoft ·  │
                    │  send queue,     │  │  Resend               │
                    │  reply polling,  │  │  tokens encrypted     │
                    │  follow-ups,     │  │  AES-256-GCM at rest  │
                    │  analytics       │  └───────────┬───────────┘
                    └──────────────────┘              │ real provider
                                                      ▼
                                             Gmail API / Graph /
                                             Resend API (real sends,
                                             reply + bounce detection)
```

**Rule:** n8n orchestrates. The Alveron API owns business logic, AI processing,
the database, authentication, validation, and audit history.

## Authentication model (phase 11)

- **System identity**: `Authorization: Bearer <ALVERON_INTERNAL_TOKEN>` on all
  `/api/*` (except health + OAuth callbacks). Injected by the Next proxy.
- **Webhooks**: `X-Webhook-Key: <ALVERON_WEBHOOK_TOKEN>` for n8n + providers.
- **Users**: scrypt-hashed passwords, opaque session tokens (sha256 in DB,
  7-day expiry), roles owner/admin/member. Browser sends `X-User-Token`; the
  proxy forwards it. RBAC enforced in the API (approval, email management,
  settings, users), never only in the frontend.
- **First run**: `POST /api/auth/setup` creates the owner.

## Email architecture

`EmailProvider` abstraction (`src/email/`) with three real implementations:

| Provider | OAuth | Sending | Reply detection | Notes |
|---|---|---|---|---|
| Gmail | Google OAuth 2.0 | Gmail API | Gmail API polling (header classification) | priority 1 |
| Microsoft 365 | Graph OAuth 2.0 | Graph sendMail | Graph polling | sendMail returns no id; documented |
| Resend | API key | Resend API | unsupported (documented) | transactional |

- Tokens encrypted AES-256-GCM at rest (`ENCRYPTION_KEY` required)
- Auto-refresh on expiry; failed refresh marks account disconnected
- OAuth `state` validated constant-time, 10 min expiry; redirect_uri must match
- Unconfigured providers return clear config errors, never fake state
- Send path: approve → queued → n8n calls `/api/webhook/outreach/:id/send` →
  API selects the default connected mailbox → real provider call → status
  `sent` only after provider confirmation; failures recorded with
  error_code/error_message/attempts, permanent vs temporary
- Safety gates at the API: global PAUSE ALL (423), per-account daily limit,
  minimum delay between sends
- Threading: threadId + In-Reply-To/References preserved for follow-ups
- Reply detection: real mailbox polling; replies cancel follow-up sequences,
  bounces mark messages bounced, OOO/auto-responses are recorded as events

## Other phase 11 additions

- Lead sources architecture: controlled sources + real CSV import
- Playwright (system Chromium) SPA fallback with SSRF checks at both
  navigation boundaries, aborted unsafe subresources, hard timeouts
- Score calibration: 80-100 High / 60-79 Medium / 40-59 Low / 0-39 Poor fit,
  transparent components (evidence, severity, business relevance, fit,
  feasibility, confidence) with rationale stored
- CRM pipeline: 13 stages, every transition audit-logged
- Structured logging: request ids (Fastify genReqId), operation logs with
  job/company/outreach/message/account ids
- Secure headers via @fastify/helmet (CSP, no-referrer, frame ancestors none)
- Email abuse prevention: PAUSE ALL, daily limits, min delay, follow-up caps

## Database

Phase 11 migrations (004): `users`, `sessions`, `email_accounts` (encrypted
token columns), `campaigns`; columns added to `outreach_messages` (provider
ids, errors, send times, account), `outreach` (approval user/ip/ua, versions,
reply tracking), `leads` (source_url, discovered_at), `opportunities`
(calibrated component scores), `outreach_events` (raw payload).

## Observability

- Every HTTP request: JSON log with `request_id`, method, url, ip, user email
- Pipeline: `pipeline_start` / `pipeline_complete` / `pipeline_failed` with
  job_id + company_id
- Email: `email_sent` / `email_send_failed` with outreach/message/account ids
- n8n runs recorded in `workflow_runs`; provider events in `outreach_events`
- Audit: every user + system action in `activity_logs`

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
