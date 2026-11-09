# Opportunity intelligence and application assistance

## Included capabilities

- Quality assessment for stored opportunity records using identity, source URL, evidence completeness, description detail, compensation clarity, deadline state, and discovery freshness.
- Priority ranking that combines the existing profile fit score with quality, deadline urgency, and freshness.
- A machine-readable opportunity summary grouped by type and source.
- A compact daily briefing endpoint suitable for a scheduled Telegram or email workflow.
- Application draft generation from the saved profile and opportunity requirements.

## API

- `GET /api/opportunity-intelligence/summary`
- `GET /api/opportunity-intelligence/briefing?limit=10`
- `GET /api/opportunity-intelligence/learning`
- `POST /api/opportunity-records/:id/assess`
- `POST /api/opportunity-records/:id/check-source`
- `POST /api/opportunity-records/:id/application-draft`

All routes use the API's existing authentication and security registration.

## Trust and safety boundaries

The quality assessment evaluates data already stored in Alveron Labs. The source check performs a guarded HTTP reachability check, validates redirect destinations against the existing SSRF protections, and distinguishes reachable, missing, unsafe, and inconclusive sources. It does not fetch the original listing, verify a company's legal identity, or prove that a role is still accepting applications. An assessment never upgrades a record to externally verified. The original source must still be checked before applying.

Application drafts are returned for human review. They are not submitted, emailed, or saved as approved applications. The generated text uses only profile data and the opportunity's stored details. Users must review every statement and add links to real work before submission.

Outcome feedback uses recorded response, interview, offer, win, rejection, and no-response events. It stays neutral until a category has at least three recorded outcomes, and its adjustment is capped. It is an early ranking aid, not a trained predictive model.

The briefing endpoint is read-only. Scheduling it through n8n requires an authenticated API connection and a Telegram bot token and chat ID stored in n8n credentials or environment configuration. Do not commit credentials to the repository.

## Ranking

Priority is a triage aid, not a probability of being hired or paid. The score combines 55% profile fit, 40% metadata quality, plus bounded freshness and deadline adjustments. Expired opportunities are assigned zero priority and are excluded from the briefing query.
