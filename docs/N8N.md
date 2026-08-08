# n8n Integration — Workflows

n8n is the orchestration layer. It never owns business logic. All AI decisions,
records, and approvals live in the Alveron API. n8n calls webhooks with
`X-Webhook-Key: <ALVERON_WEBHOOK_TOKEN>`.

## Setup

```bash
mkdir ~/n8n && cd ~/n8n
npm init -y
npm install n8n@2.33.7 --no-audit --no-fund
export N8N_PORT=5678 N8N_HOST=127.0.0.1
export N8N_BLOCK_ENV_ACCESS_IN_NODE=false   # required: workflows read $env.ALVERON_WEBHOOK_TOKEN
export ALVERON_WEBHOOK_TOKEN="$(grep -oP '^ALVERON_WEBHOOK_TOKEN=\K.*' ../alveron-labs/api/.env)"
node node_modules/n8n/bin/n8n start
```

First boot creates the owner account (headless):

```bash
curl -X POST http://127.0.0.1:5678/rest/owner/setup -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","firstName":"Owner","lastName":"Name","password":"..."}' -c /tmp/n8n_cookies.txt
curl -X POST http://127.0.0.1:5678/rest/login -H "Content-Type: application/json" \
  -d '{"emailOrLdapLoginId":"owner@example.com","password":"..."}' -c /tmp/n8n_cookies.txt
# API key for the public API (scopes must match n8n's exact names: workflow:create/update, NOT workflow:write)
curl -X POST http://127.0.0.1:5678/rest/api-keys -b /tmp/n8n_cookies.txt -H "Content-Type: application/json" \
  -d "{\"label\":\"alveron\",\"expiresAt\":$(python3 -c 'import time; print(int(time.time()*1000)+31536000000)'),\"scopes\":[\"workflow:create\",\"workflow:update\",\"workflow:read\",\"workflow:list\",\"workflow:delete\",\"execution:list\",\"execution:read\"]}"
# the full key is in rawApiKey of the response
```

Import a workflow (`n8n/import_workflows.sh` does all four):

```bash
curl -X POST http://127.0.0.1:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
  -d @n8n/workflows/alveron-company-analysis.json
```

The public API treats `active` as read-only. Activate via the editor API with
the session cookie (see `n8n/reimport_workflow.sh`):

```bash
curl -X POST http://127.0.0.1:5678/rest/workflows/{id}/activate -b /tmp/n8n_cookies.txt \
  -H "Content-Type: application/json" -d "{\"versionId\":\"<versionId from GET /rest/workflows/{id}>\"}"
```

## Workflow 1 — Company Analysis (`alveron-company-analysis.json`)

```
Webhook (POST /alveron-company)
  → Create Company (webhook endpoint, SSRF + duplicate guarded)
  → Wait 30s
  → Get Status (loop, max 20 iterations, then Stop and Error)
  → Is Completed? ── yes ──→ Get Research → Get Opportunities
  │                              → Generate Proposal (top opportunity)
  └── no ──→ Count Iterations → Max Reached? → Wait (loop back)
```

Request body: `{"name": "...", "website": "...", "notes": "..."}`
Response: `{"company_id": ..., "proposal_id": ..., "status": "proposal_ready"}`

Handles: failures (Stop and Error + workflow-run recording), retries (n8n
retry settings), timeouts (iteration cap), duplicates (API returns the
existing company and does not create a second job), duplicate active jobs
(API returns 409/`activeJob`).

## Workflow 2 — Lead Discovery (`alveron-lead-discovery.json`)

```
Webhook (POST /alveron-leads)
  → Ingest Leads (webhook /leads endpoint, dedupes by source+key and website)
  → Respond
```

Controlled sources only. No web scraping. Sources feed batches of
`{name, website, industry?, location?, company_size?, keywords?}`. Max 100
per batch. Promotion to research happens in the dashboard (Workflows page)
so humans review before analysis spend.

## Workflow 3 — Email Send (`alveron-email-send.json`)

```
Schedule (every 5 min)
  → Get Queue (outreach-queue webhook: approved + queued, max 20)
  → Split Out Items
  → Send via Provider (transactional API; EMAIL_PROVIDER_URL env)
  → Record Sent (message webhook: sent + provider_message_id)
```

The API never sends email. A provider failure surfaces through the message
webhook as `failed` with `last_error`; n8n retry settings govern retries.
Point `EMAIL_PROVIDER_URL` at a transactional provider (Resend, SendGrid,
SES) or the bundled mock (`npx tsx mock_email_provider.ts`, port 3199) for
local testing.

## Workflow 4 — Follow-up Sequence (`alveron-follow-up.json`)

```
Schedule (daily)
  → Get Due Follow-ups (follow-up-due webhook: running sequences only)
  → Split Out Items
  → Send Follow-up (subject prefixed "Follow-up:")
  → Advance Sequence (message webhook 'sent' advances the sequence)
```

Timing comes from Settings (`days`, e.g. `0, 4, 9`). Day 0 is the initial
email. The sequence stops automatically when the API sees: reply received,
lead rejected, lead became a customer, outreach paused, or all steps sent.
Cancellation is enforced server-side, so even a stale n8n run cannot send a
follow-up to a dead sequence.

## Workflow monitoring

Every workflow calls `POST /api/webhook/workflow-run` (started/completed/
failed + retry_count + last_error). The dashboard Workflows page renders
status without exposing n8n credentials.
