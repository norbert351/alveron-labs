# Alveron Labs — Lead Intelligence (Internal MVP)

Private internal dashboard for Alveron Labs to research prospect companies, detect
evidence-backed automation opportunities, generate personalized proposals and
outreach emails, and route them through human approval before anything is sent.

**This is not the public marketing site.** No autonomous mass outreach, no
auto-sending. Every proposal and email requires explicit human approval.

## Stack

- `api/` — Fastify + PostgreSQL + modular AI services (TypeScript, tsx runtime)
- `web/` — Next.js App Router dashboard (Obsidian theme, Tailwind)

## Workflow

```
Company URL → Website fetch → Company Research → Opportunity Analysis
→ Service Matching → Proposal → Outreach draft → Human Approval → Sent
```

## API

Run from `api/`:

```bash
cp .env.example .env   # set DATABASE_URL, ALVERON_LLM_BASE_URL, ALVERON_LLM_API_KEY, ALVERON_LLM_MODEL
npm install
npx tsx src/index.ts   # listens on 3100
```

PostgreSQL tables: `companies`, `website_scans`, `research_reports`,
`opportunities`, `proposals`, `outreach`, `settings`, `jobs`.

## Web

Run from `web/`:

```bash
cp .env.local.example .env.local
npm install
npm run dev           # listens on 3101
```

## AI services (modular, agent-ready)

Each module in `api/src/modules/` is a standalone service that can later run as
its own AI agent without restructuring:

- `CompanyResearch` — structured company profile from website content
- `WebsiteAnalysis` — evidence-backed opportunity detection
- `OpportunityDetection` — matches findings to Alveron service catalog
- `SolutionRecommendation` — concrete solution + operational benefit
- `ProposalGeneration` — personalized proposal (no ROI promises)
- `Outreach` — professional outreach email (subject, body, reason)

LLM provider is configurable in the Settings page (any OpenAI-compatible
`/chat/completions` endpoint).

## Guardrails

- Opportunity findings require evidence, stored with a confidence score
- Proposal generation forbids revenue/ROI/guarantee claims
- Approve & Send requires an explicit `confirm: true` payload
- MVP does not transmit real email, scrape leads, or automate follow-ups
