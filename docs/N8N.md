# n8n Integration and Self-Hosting

n8n is Alveron Labs' workflow orchestration service. Alveron's API remains the
source of truth for opportunity data, scoring, research, approvals and business
logic. n8n schedules and connects those capabilities.

The n8n source project is maintained at https://github.com/n8n-io/n8n. Alveron
uses the official n8n container image rather than copying or maintaining a fork
of the n8n source code inside this repository. The current deployment file pins
the image to `2.49.0`. Review upstream release notes before changing that pin.

## Deployment layout

- `n8n/compose.yaml` runs n8n and a dedicated PostgreSQL database.
- `n8n/.env` contains deployment secrets and host-specific settings. It must
  never be committed.
- `n8n/workflows/` contains version-controlled workflow definitions.
- Alveron's API runs as a separate service on the VPS and is reached from the
  n8n container through `host.docker.internal:3100`.
- Docker volumes persist n8n state and its database across container updates.

This keeps n8n separate from Alveron's application database and from any other
business running on the same VPS.

## Self-host on the VPS

Requirements: Docker Engine with the Docker Compose plugin, a public DNS record
for the n8n subdomain, and an HTTPS reverse proxy such as the Nginx or Caddy
already used by the server.

From the repository root:

```bash
cd n8n
cp .env.example .env
```

Edit `.env` and set:

- `N8N_HOST` to the real automation subdomain, for example
  `automation.your-domain.com`.
- `N8N_ENCRYPTION_KEY` to a stable random secret.
- `N8N_DB_PASSWORD` to a strong, unique password.
- `ALVERON_INTERNAL_TOKEN` and `ALVERON_WEBHOOK_TOKEN` to the matching
  values from the API's private `api/.env`.
- Telegram values only if Telegram delivery is wanted.

Generate secrets on the VPS instead of committing them:

```bash
openssl rand -hex 32
```

Use separate generated values for the encryption key and database password.
Keep the encryption key backed up securely. Losing it can make stored n8n
credentials unreadable.

Start the services:

```bash
docker compose up -d
docker compose ps
docker compose logs -f n8n
```

The editor listens on `127.0.0.1:5678` on the VPS. It is deliberately not
bound to the public network. Configure the existing HTTPS reverse proxy to
forward the automation subdomain to `http://127.0.0.1:5678`, preserve the
`Host` and `X-Forwarded-For` headers, and support WebSocket connections.
Do not expose port 5678 directly to the internet.

The API currently listens on `0.0.0.0:3100`, allowing the n8n container to
reach it through Docker's host-gateway mapping. Keep the API protected by its
existing tokens and firewall rules.

Check local health after startup:

```bash
curl -fsS http://127.0.0.1:5678/healthz
```

Open the HTTPS automation subdomain and create the n8n owner account on first
boot.

## Import Alveron workflows

Create an n8n public API key from the n8n owner account. Then, from the
repository root on the VPS:

```bash
N8N_API_KEY='your-n8n-api-key' \
N8N_BASE_URL='http://127.0.0.1:5678' \
./n8n/import_workflows.sh
```

The importer reads workflow JSON from this repository and creates the workflows
in n8n. It does not activate them. Review credentials, endpoints and execution
settings in the n8n editor before activating any workflow. Re-running the import
script can create duplicate workflows, so use it for initial import and manage
later updates deliberately.

The `alveron-company-intelligence-discovery.json` workflow runs once daily. It calls the API's protected company-intelligence webhook, discovers startup candidates through SearXNG, then researches up to ten existing companies per batch across startup signals, indexed customer complaints, GitHub issues, Hacker News and public technology fingerprints. Findings are stored for human review. It does not promote candidates or contact companies.\n\nThe daily opportunity briefing workflow runs at 08:30 in the configured
`GENERIC_TIMEZONE`. Telegram is optional. The briefing API and dashboard remain
usable without Telegram credentials.

## Existing workflow environment access

Some existing workflow definitions read environment variables with n8n's
`$env` expression. The Compose file sets
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` for compatibility. This makes the
configured environment available to workflow expressions and code nodes.
Only trusted administrators should be able to create or edit workflows.
Keep the editor behind HTTPS and owner authentication, and do not give
untrusted users workflow-edit access.

## Operations

View service status and logs:

```bash
docker compose ps
docker compose logs --tail=200 n8n
docker compose logs --tail=200 n8n-db
```

Update only after reviewing upstream release notes and taking a database and
volume backup:

```bash
docker compose pull
docker compose up -d
```

Back up the n8n PostgreSQL database and the `n8n_data` volume. Store backups
outside the VPS. Keep `N8N_ENCRYPTION_KEY` safe and unchanged across restarts
and upgrades.

## Workflow architecture

n8n orchestrates tasks. It must not become the source of truth for business
logic, opportunity records, scoring, or human approvals. Those remain in the
Alveron API and database.

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

Request body: `{"name":"...","website":"...","notes":"..."}`.

## Workflow 2 — Lead Discovery (`alveron-lead-discovery.json`)

```
Webhook (POST /alveron-leads)
  → Ingest Leads (webhook /leads endpoint, dedupes by source+key and website)
  → Respond
```

Controlled sources only. No unreviewed mass scraping. Promotion to research
happens in the dashboard so humans review before analysis spend.

## Workflow 3 — Email Send (`alveron-email-send.json`)

```
Schedule (every 5 min)
  → Get Queue (approved + queued outreach, max 20)
  → Send via Provider
  → Record Sent
```

Email sending requires a configured provider and explicit human approval in
Alveron. n8n must never bypass the API's approval checks.

## Workflow 4 — Follow-up Sequence (`alveron-follow-up.json`)

```
Schedule (daily)
  → Get Due Follow-ups
  → Send approved follow-up
  → Advance Sequence
```

The API enforces cancellation when a reply arrives, a lead is rejected, a
customer is won, or outreach is paused.

## Workflow 5 — Opportunity Discovery (`alveron-opportunity-discovery.json`)

Runs the API's discovery endpoint on its configured schedule. Discovery
providers, normalization, deduplication and ranking stay in the API.

## Workflow 6 — Daily Opportunity Briefing (`alveron-daily-opportunity-briefing.json`)

Runs at 08:30, fetches the ranked briefing endpoint and formats a summary.
The current workflow has a Telegram delivery node. Configure Telegram tokens
only if you choose that delivery channel. The workflow is imported inactive
and requires review before activation.

## License note

n8n describes its licensing as fair-code and uses the Sustainable Use License
for its community distribution. It is source-available and self-hostable, but
it is not an OSI-approved open-source project under the usual definition.
Review the upstream license and usage terms for your intended deployment:
https://github.com/n8n-io/n8n
