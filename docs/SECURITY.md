# Security

## Authentication

- **Dashboard API**: `Authorization: Bearer <ALVERON_INTERNAL_TOKEN>` on every
  `/api/*` route except `/api/health` and `/api/webhook/*`.
- **Webhooks (n8n, email providers)**: `X-Webhook-Key: <ALVERON_WEBHOOK_TOKEN>`.
- Tokens live in `api/.env` (gitignored). The Next.js proxy injects the
  internal token server-side from `web/.env.local` (no `NEXT_PUBLIC_` prefix,
  never shipped to the browser).

## SSRF protection

Every submitted website URL is checked before fetching:

- scheme restricted to http/https
- `localhost`, `.local`, and dot-less hostnames rejected
- DNS is resolved and every A/AAAA record checked; private ranges, loopback,
  link-local, CGNAT, ULA, multicast, reserved, and IPv4-mapped addresses are
  blocked (`api/src/ssrf.ts`)
- redirects are followed manually and each hop re-checked (max 6)

Internal network URLs (`127.x`, `10.x`, `172.16-31.x`, `192.168.x`,
`169.254.x`, metadata endpoints) cannot be fetched through the analysis system.

## Rate limiting

`@fastify/rate-limit` on all routes (default 120/min/IP, 3-strike ban window).
Auth failures are audit-logged, throttled to one entry per minute per IP.

## Request validation

Required fields validated per route (name/website, confirm flag on approval,
stage whitelist, delivery status whitelist, batch size cap of 100 leads).

## Email approval protection

- Sending requires `POST /api/outreach/:id/approve` with `confirm: true` and a
  recorded `approved_by`.
- Approve without confirm → 400. Re-approve after draft → 409.
- Edits before approval set `edited_before_send: true`.
- Rejection records `rejected_reason`.
- The API never sends email; it only queues. n8n transmits.

## Secrets

- No API keys in frontend code (token injected by the server-side proxy).
- `api/.env` and `web/.env.local` are gitignored. Only `.env.example` files
  with placeholders are committed.
- `ALVERON_LLM_API_KEY`, `ALVERON_INTERNAL_TOKEN`, `ALVERON_WEBHOOK_TOKEN`,
  `ALVERON_DATABASE_URL` are environment-driven.

## Audit log

`activity_logs` records: auth failures, company create/delete, stage changes,
proposal generation, approval requests, approvals, edits, rejections, sends,
deliveries, bounces, replies, lead batches, workflow runs.

## Notes

- The dashboard is an internal tool; n8n should be bound to localhost or put
  behind an IP allowlist (never expose the n8n editor or API publicly).
- The mock email provider is for local testing only; replace with a real
  transactional provider and rotate all keys before any production use.
