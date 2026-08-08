# Alveron Labs — Lead Intelligence (Internal MVP)

Private internal dashboard for Alveron Labs to research prospect companies, detect
evidence-backed automation opportunities, score them, generate personalized
proposals and outreach emails, and route everything through human approval before
n8n sends anything.

**This is not the public marketing site.** No autonomous mass outreach, no
auto-sending. Every email requires explicit human approval.

## Stack

- `api/` — Fastify + PostgreSQL + modular AI services (TypeScript, tsx runtime)
- `web/` — Next.js App Router dashboard (Obsidian theme, Tailwind)
- `n8n/workflows/` — importable n8n orchestration workflows
- `docs/` — architecture, API, n8n, and security docs

## Workflow

```
Company URL → Website fetch (+headless SPA fallback) → Company Research
→ Opportunity Analysis → Service Matching → Lead Scoring (80/60/40 calibrated)
→ Proposal → Outreach draft → Human Approval (attributed) → queue
→ n8n → real provider send (Gmail/Graph/Resend OAuth) → delivery tracking
→ reply detection → follow-up sequence (stops on reply/reject/pause)
```

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
cd api && NODE_ENV=test node --test --import tsx "tests/*.test.ts"
```

Coverage: SSRF blocks, auth gates, webhook create/duplicate guards, active-job
guards, lead dedupe, approval protection, workflow-run recording, scoring
priority mapping. Requires the API running.

## Guardrails

- Opportunity findings require evidence, stored with a confidence score
- Proposal generation forbids revenue/ROI/guarantee claims
- Approve & Send requires `confirm: true` + `approved_by`, recorded
- SSRF-safe website fetching (private/loopback ranges blocked, redirects re-checked)
- Every status change is audit-logged
- n8n orchestration never touches AI business logic

See `docs/` for the full picture.
