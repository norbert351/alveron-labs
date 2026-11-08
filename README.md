# Alveron Labs — Lead Intelligence (Internal MVP)

Internal opportunity intelligence system for Alveron Labs. It researches prospect
companies, discovers remote work and paid technical opportunities, detects
evidence-backed business problems, scores opportunities against a saved skills
profile, and prepares proposals and outreach for human review.

**This is not the public marketing site.** No autonomous mass outreach, no
auto-sending. Every email requires explicit human approval.

## Stack

- `api/` — Fastify + PostgreSQL + modular AI services (TypeScript, tsx runtime)
- `web/` — Next.js App Router dashboard (Obsidian theme, Tailwind)
- `n8n/workflows/` — importable n8n orchestration workflows
- Unified Opportunity Hub — one review feed for remote jobs, paid tasks, agency contracts, business leads, paid research and technical content
- `docs/` — architecture, API, n8n, and security docs

## Workflow

```
Company URL → Website fetch (+headless SPA fallback) → Company Research
→ Opportunity Analysis → Service Matching → Lead Scoring (80/60/40 calibrated)
→ Proposal → Outreach draft → Human Approval (attributed) → queue
→ n8n → real provider send (Gmail/Graph/Resend OAuth) → delivery tracking
→ reply detection → follow-up sequence (stops on reply/reject/pause)
```

## Unified opportunity discovery

The dashboard includes `/opportunity-hub` for the normalized opportunity feed and `/opportunity-profile` for skills, experience, location, compensation and work preferences. The API currently ingests RemoteOK and Remotive public remote-job feeds and imports existing Alveron global business research opportunities. Provider results keep source attribution and direct links. The n8n workflow `alveron-opportunity-discovery.json` can schedule discovery every six hours after it is imported and activated. See `docs/UNIFIED_OPPORTUNITIES.md` for provider terms, API routes and setup.

The opportunity matcher is an explainable first-pass rules engine. It shows skill overlap and missing skills, and applies the profile constraints it can verify from source data. It does not submit applications or contact prospects.

## Quick start

```bash
# API (from api/)
cp .env.example .env        # set ALVERON_DATABASE_URL, LLM, tokens, ENCRYPTION_KEY
npm install
npx tsx src/index.ts        # :3100

# Dashboard (from web/)
cp .env.local.example .env.local   # set ALVERON_INTERNAL_TOKEN to match
npm install
npm run dev                 # :3101

# First run: POST /api/auth/setup (or the dashboard's First-run setup tab) creates the owner

# Real email: see docs/OAUTH.md — Gmail/Graph/Resend credentials required
# n8n: see docs/N8N.md
```

## Environment variables

| Var | Purpose |
|---|---|
| `ALVERON_DATABASE_URL` | PostgreSQL (this VM: port 5433) |
| `ALVERON_INTERNAL_TOKEN` | Bearer token for dashboard API |
| `ALVERON_WEBHOOK_TOKEN` | X-Webhook-Key for n8n/email provider |
| `ALVERON_LLM_BASE_URL` / `ALVERON_LLM_API_KEY` / `ALVERON_LLM_MODEL` | OpenAI-compatible LLM |
| `ALVERON_RATE_LIMIT_MAX` / `ALVERON_RATE_LIMIT_WINDOW_MS` | Rate limiting |

## Tests

```bash
cd api && npm ci && npm run build && npm run test:unit
```

The unit suite covers research utilities, SSRF protections, scoring, migration
contracts, discovery normalization and provider URL validation. The existing
`tests/integration.test.ts` suite requires a running API, a disposable PostgreSQL
database and an `api/.env` file. GitHub Actions runs the API build and unit suite
alongside the dashboard typecheck and production build.

## Guardrails

- Opportunity findings require evidence, stored with a confidence score
- Proposal generation forbids revenue/ROI/guarantee claims
- Approve & Send requires `confirm: true` + `approved_by`, recorded
- SSRF-safe website fetching (private/loopback ranges blocked, redirects re-checked)
- Every status change is audit-logged
- n8n orchestration never touches AI business logic

See `docs/` for the full picture.
