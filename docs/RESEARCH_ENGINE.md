# Alveron Labs — Global Automated Research Engine (Phase 12)

The automated client-acquisition and business-opportunity intelligence engine.

The engine **discovers businesses globally** (no manually-entered URL list), **researches
their public website** with a safe tiered crawler, **collects structured evidence**, sends
that evidence to an **AI reasoning layer (Groq)** to detect genuine problems and
opportunities, **scores** those opportunities transparently, **maps them to Alveron
services**, and **persists everything in PostgreSQL** — all tracked as a research **Run**.

```
DISCOVERY (OSM/Overpass, credential-free, 23+ industries, any country)
   ↓  validation + enrichment (dedupe, domain checks)
WEBSITE CRAWL  HTTP(1) → parse(2) → headless-browser(3)  [SSRF-safe, robots-aware]
   ↓  structured DOM signals + deterministic findings + evidence
GROQ (reasons over evidence only — never fabricates)
   ↓  problem detection → opportunities → transparent scoring → service recommendation
POSTGRESQL  (run stats, companies, crawls, signals, findings, problems, opportunities,
             scores, recommendations, ai_runs, errors)
```

**Honesty guarantees (spec §§5, 27, 30):**
- Every finding has evidence (url + text + signal + `observed|inferred|unknown`).
- Deterministic facts (HTTPS, viewport, forms, CMS, booking, payments, analytics, sitemap)
  are detected **in code**, not by the AI — cutting cost and hallucination.
- The AI never invents a high-confidence claim without observed evidence; unsupported
  high confidence is **auto-downgraded** and flagged `requires_verification`.
- A problem only becomes an **opportunity** if it has real impact (medium/high);
  minor issues do not (spec §14).
- If `GROQ_API_KEY` is missing, the pipeline still runs fully for discovery + crawl +
  evidence + deterministic findings; AI analysis is recorded as `AI_NOT_CONFIGURED`
  (outcome `AI_ANALYSIS_FAILED`) — never faked.

---

## 1. Stack & ports

| Piece | Where |
|---|---|
| API (Fastify + pg) | `api/` — port **3100** |
| Dashboard (Next.js) | `web/` — port **3101** |
| n8n (headless orchestrator) | `~/n8n` — port **5678** |
| PostgreSQL | 127.0.0.1:**5433**, db `alveron` |
| Discovery | OpenStreetMap **Overpass** + **Nominatim** (no API key) |
| AI | **Groq** (`GROQ_API_KEY`) |

## 2. Quick start

```bash
# 1. env (copy .env.example -> api/.env, add GROQ_API_KEY)
cd api && cp .env.example .env   # ALVERON_DATABASE_URL already points at 5433

# 2. API
cd api && ALVERON_PORT=3100 npx tsx src/index.ts      # applies migrations on boot

# 3. (optional) n8n
cd ~/n8n && export N8N_PORT=5678 N8N_HOST=127.0.0.1 N8N_BLOCK_ENV_ACCESS_IN_NODE=false \
  ALVERON_API_BASE=http://127.0.0.1:3100 ALVERON_WEBHOOK_TOKEN=<api/.env>
node node_modules/n8n/bin/n8n start
bash n8n/import_research_workflows.sh   # imports + (DB) activates the 8 research-* workflows
```

### Start a research run (the acceptance test)

```bash
curl -s -X POST http://127.0.0.1:3100/api/research/runs \
  -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN" -H "Content-Type: application/json" \
  -d '{"industry":"restaurants","country":"United States","region":"California","city":"Los Angeles","count":20}'
# -> { "run": { "run_id": "run_2026-10-06_xxxxxx", ... } }
curl -s http://127.0.0.1:3100/api/research/runs/run_2026-10-06_xxxxxx \
  -H "Authorization: Bearer $ALVERON_INTERNAL_TOKEN"
```

`Country/Region/City/Industry = Any` is supported via **global sampling** across 23 world
metros (real geographic sampling, never fabricated).

## 3. Pipeline stages (spec §20) — each independently callable

| # | Stage | API | n8n workflow |
|---|---|---|---|
| 1 | Global business discovery | `POST /api/webhook/research/discover` | `research-global-business-discovery` |
| 2 | Company enrichment (validate/dedupe/upsert) | `POST /api/webhook/research/discover` (idempotent) | `research-company-enrichment` |
| 3 | Website crawl (tiered HTTP→parse→render) | `POST /api/webhook/research/company/crawl` | `research-website-crawl` |
| 4 | Signal extraction + deterministic findings | `POST /api/webhook/research/company/crawl` | `research-signal-extraction` |
| 5 | AI problem detection | `POST /api/webhook/research/company/analyze` | `research-ai-problem-detection` |
| 6 | Opportunity detection | `POST /api/webhook/research/company/analyze` | `research-opportunity-detection` |
| 7 | Opportunity scoring + service recommendation | `POST /api/webhook/research/company/analyze` | `research-solution-recommendation` |
| 8 | Coordinator (full pipeline + polling) | `POST /api/webhook/research/run` | `research-pipeline-coordinator` |

The API owns the pipeline and persists all state; n8n provides scheduling, retries,
polling and monitoring. The coordinator is a single, honest call; stages 3→7 are one
auditable pass per company (stages 4, 6, 7 are logically bundled into the crawl/analyze
passes — they are not faked as separate fake nodes).

**Webhooks** require `X-Webhook-Key: <ALVERON_WEBHOOK_TOKEN>`. **Dashboard routes**
require `Authorization: Bearer <ALVERON_INTERNAL_TOKEN>`.

## 4. Deterministic signals + findings (spec §9, §27)

`api/src/crawler/dom.ts` + `api/src/signals/extract.ts` extract, in code:
- **Technical:** HTTP status, HTTPS, redirect chain, response time, page size, title,
  meta description, canonical, viewport, robots, sitemap, script/third-party services,
  analytics, payment providers, CMS, ecommerce platform, booking systems, forms, chat
  widgets, cookie banner, structured data/JSON-LD, images-without-alt, broken links.
- **UX:** mobile viewport, nav, CTA presence, contact/booking accessibility, product
  discovery, checkout path, form usability, render-required (SPA).
- **Business:** contact channels, booking/ordering/checkout, lead capture, support
  channels, social links, pricing visibility, trust signals.

Rule-based findings then fire with evidence (e.g. *"No online ordering was expected for
this industry but was not detected"*, evidence marked `observed`, confidence 0.75).

## 5. AI reasoning layer (Groq) — spec §4, §12, §13

All Groq calls go through **`api/src/ai/groq.ts`** (centralized, ~250ms spacing,
exponential-backoff retries, token + latency accounting). The AI receives **structured
evidence** (`COMPANY / WEBSITE / PAGE / TECHNICAL / UX / BUSINESS SIGNALS / OBSERVED
FINDINGS`) — never a bare "analyze this website." It returns strict JSON validated by
`api/src/research/schema.ts` which **downgrades unsupported high-confidence claims**.

## 6. Scoring (spec §15) & services (spec §16)

`api/src/research/derive.ts`:
- `deriveOpportunities` — only medium/high-impact problems become opportunities; UIDs
  are **scoped per company** so identical findings across companies never collide.
- `scoreOpportunity` — weighted, named components
  (evidence_confidence, business_relevance, customer_impact, revenue_potential,
   operational_impact, solution_fit, feasibility, urgency, data_completeness) → 0–100
  + priority (≥75 High, ≥60 Medium, ≥40 Low). Not a single subjective number.
- `recommendServices` — maps category/keywords to the `service_catalog` and returns
  `[]` when there is no clear fit (never a forced recommendation).

## 7. Tests (spec §31)

```bash
cd api && npx tsx --test tests/research.test.ts    # 18 tests
cd api && npm test                                  # full suite (existing + research)
```

Covers URL normalization, SSRF IP blocking, robots parsing/path rules, page-type
classification, DOM fact extraction, deterministic signal/industry findings, AI schema
validation + confidence downgrade, opportunity gating, uid scoping, scoring, service
recommendation, and the Overpass query builder.

## 8. Security & ethics (spec §28, §29)

- **SSRF**: every URL (incl. each redirect hop) DNS-checked; private/loopback/CGNAT/ULA/
  multicast blocked (`api/src/ssrf.ts`). Browser subresources to private IPs aborted.
- **Crawling**: robots.txt respected, size/time caps, max pages/depth, domain boundary
  enforced, rate limits, per-company hard timeout, no auth/paywall/CAPTCHA bypass.
- **Config gate**: missing credentials are reported (e.g. `GROQ_API_KEY`), never mocked.

## 9. Observability (spec §26)

`research_runs.statistics` (discovered/valid/crawled/analyzed/problems/opportunities/
failed/ai_failed), `ai_runs` (tokens, latency, attempts, model), `engine_errors`
(stage/code/message), per-company `research_company_results.outcome`.

## 10. Files added

```
api/src/db/migrations/005_research_engine.sql
api/src/discovery/{types,industryTaxonomy,geocode,overpass,index}.ts
api/src/crawler/{robots,fetcher,pageType,dom,crawler}.ts
api/src/signals/extract.ts
api/src/ai/groq.ts
api/src/research/{schema,analyze,derive,engine}.ts
api/src/util/{url,hash,concurrency}.ts
api/src/routes/research.ts
api/tests/research.test.ts
n8n/gen_research_workflows.py, n8n/import_research_workflows.sh,
n8n/setup_n8n_owner.sh, n8n/workflows/research-*.json (8)
web/src/app/research-runs/{page.tsx,[id]/page.tsx}
scripts/probe.py
```