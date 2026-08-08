# Alveron API — Endpoint Reference

Base: `http://<host>:3100`. Two auth surfaces:

- **Dashboard routes** (`/api/*` except health + webhooks): `Authorization: Bearer <ALVERON_INTERNAL_TOKEN>`. The Next.js proxy adds this server-side; the browser never sees it.
- **Webhook routes** (`/api/webhook/*`): `X-Webhook-Key: <ALVERON_WEBHOOK_TOKEN>`. Used by n8n and email providers.
- `GET /api/health` is public.

## Dashboard routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/overview` | KPIs, funnel, conversion rates, priority + stage counts |
| POST | `/api/companies` | Create + analyze company (duplicate 409, SSRF 400) |
| GET | `/api/companies` | List with counts |
| GET | `/api/companies/:id` | Detail + activity history |
| PATCH | `/api/companies/:id` | Edit name/website/notes |
| PATCH | `/api/companies/:id/stage` | CRM stage change (audited) |
| POST | `/api/companies/:id/reanalyze` | New analysis (409 if one is running) |
| DELETE | `/api/companies/:id` | Remove company (cascades) |
| GET | `/api/opportunities?service=&priority=&status=` | Filtered opportunities |
| PATCH | `/api/opportunities/:id` | Status change |
| POST | `/api/opportunities/:id/proposal` | Generate proposal |
| GET/PATCH | `/api/proposals` `/api/proposals/:id` | Proposals |
| POST | `/api/proposals/:id/outreach` | Generate outreach draft |
| GET | `/api/outreach` | List with latest delivery status |
| GET | `/api/outreach/:id` | Detail + events + messages |
| PATCH | `/api/outreach/:id` | Edit subject/body (sets edited_before_send) |
| POST | `/api/outreach/:id/approve` | `{confirm: true, approved_by}` required; queues for n8n |
| POST | `/api/outreach/:id/reject` | `{reason}` recorded |
| GET | `/api/settings` | LLM, services, follow-up, email settings |
| PUT | `/api/settings/llm` `/services` `/follow-up` `/email` | Update settings |
| GET | `/api/workflow-runs?workflow_name=&status=` | n8n run monitor |
| GET | `/api/lead-sources` POST `/api/lead-sources` | Controlled sources |
| GET | `/api/leads` | Discovered leads |
| POST | `/api/leads/:id/promote` | Lead → company + analysis (duplicate/active guards) |

## Webhook routes (n8n / email providers)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/webhook/company` | Create + start analysis. Duplicates return `{duplicate: true, activeJob}` |
| GET | `/api/webhook/company/:id/status` | Job + stage status |
| GET | `/api/webhook/company/:id/research` | Completed research + company profile |
| GET | `/api/webhook/company/:id/opportunities` | Opportunities sorted by score |
| POST | `/api/webhook/opportunity/:id/proposal` | Generate proposal |
| GET | `/api/webhook/proposal/:id` | Get proposal |
| POST | `/api/webhook/proposal/:id/outreach` | Generate outreach draft |
| POST | `/api/webhook/outreach/:id/approve` | Request approval (human confirms in dashboard) |
| POST | `/api/webhook/outreach/:id/message` | Record delivery status (queued/sending/sent/delivered/failed/bounced) + provider_message_id + attempts |
| POST | `/api/webhook/email-status` | Provider callback: `{outreach_id, status, provider_message_id, error}` |
| POST | `/api/webhook/reply` | `{outreach_id}` reply received → stage Replied, follow-ups cancelled |
| POST | `/api/webhook/workflow-run` | Record n8n run (workflow_name, status, retry_count, last_error) |
| GET | `/api/webhook/follow-up-config` | Sequence timing for n8n |
| GET | `/api/webhook/outreach-queue` | Approved, queued emails waiting for n8n (max 20) |
| GET | `/api/webhook/follow-up-due` | Follow-ups due today (running sequences only) |
| POST | `/api/webhook/leads` | Controlled lead batch: `{source, items[]}` max 100, dedupes |

## Delivery status transitions

`queued → sending → sent → delivered | failed | bounced`

`failed` carries `attempts` + `last_error`. `bounced` is terminal. Retry policy
lives in n8n; the API records what the provider reports and never retries a
permanent failure itself.
