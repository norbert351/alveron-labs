# Open-source company intelligence

Alveron's company intelligence module investigates a company from three angles:
company/startup signals, customer pain, and technical/operational signals. It
stores source-attributed findings separately from sales opportunities so a
search result or complaint is never silently treated as a verified sales lead.

## Open-source-only operating mode

The implementation does not call Product Hunt, Crunchbase, G2, Capterra,
Trustpilot, Wellfound, BuiltWith or Reddit paid/private APIs. It uses:

- Self-hosted SearXNG for indexed public web discovery, including searches
  targeted at YC, Product Hunt, review sites and Reddit public pages.
- GitHub's public REST API for public issue signals. `GITHUB_TOKEN` is optional
  and only increases the public API rate limit.
- Hacker News' public Algolia search API.
- Alveron's own lightweight HTML/header technology fingerprint, inspired by
  the same public signatures used by open technology-detection projects.
- Existing company records and their public websites.

SearXNG is an open-source metasearch engine. It queries configured upstream
search engines and does not maintain its own web index. Results depend on
upstream availability, indexing, and rate limits. A SearXNG result is a lead
for investigation, not proof of a customer complaint or company claim.

## Scheduling\n\nFor a fully open-source scheduler, use Linux cron and the runner in `docs/COMPANY_INTELLIGENCE_CRON.md`. The n8n workflow is optional. Do not run both schedules at once.\n\n## Start SearXNG on the VPS

From the repository root:

```bash
cd research
cp .env.example .env
# Set SEARXNG_SECRET to a unique random value in .env
docker compose up -d
docker compose ps
curl -fsS 'http://127.0.0.1:8080/search?q=Alveron&format=json' >/dev/null
```

Keep port 8080 bound to localhost. Do not expose the SearXNG service publicly.
Configure the API environment:

```env
ALVERON_SEARXNG_URL=http://127.0.0.1:8080
ALVERON_INTELLIGENCE_MAX_RESULTS=10
ALVERON_INTELLIGENCE_TIMEOUT_MS=18000
# Optional GitHub token for higher public API limits
GITHUB_TOKEN=
```

If the API runs in Docker, use the private Docker network service name or the
host gateway address instead of localhost. Do not put SearXNG credentials or
tokens in the frontend.

## API

Both endpoints require Alveron's existing internal bearer token:

- `POST /api/company-intelligence` is not exposed. The scheduled batch runs through the webhook below.\n- `GET /api/company-intelligence/candidates?limit=100` lists startup discovery candidates for human review.\n- `PATCH /api/company-intelligence/candidates/:id` marks a candidate as `reviewing` or `rejected`.\n- `POST /api/company-intelligence/candidates/:id/promote` adds a candidate to the company pipeline after a human supplies and verifies its company name and website.\n- `POST /api/companies/:id/intelligence/run` runs all configured source groups.
- `GET /api/companies/:id/intelligence/findings?limit=100` returns evidence.\n- `POST /api/webhook/company-intelligence-discovery` runs startup discovery and researches up to ten existing companies per batch, protected by the webhook key.

Each finding includes category, source name, original URL, title, evidence text,
published date when available, collection time and source metadata. Duplicate
findings are prevented per company, source and URL.

Categories:

- `company_signal`: startup launches, YC directory references, funding,
  expansion and company announcements found through public search.
- `customer_pain`: indexed public Reddit discussions and review-site pages for
  G2, Capterra and Trustpilot.
- `technical_signal`: GitHub public issues and Hacker News discussions.
- `technology_signal`: indicative public HTML and HTTP header fingerprints.

## Interpretation and safeguards

- Search snippets and public discussions are evidence leads, not verified facts.
- Review counts, funding totals, customer numbers and revenue are not inferred.
- A technology fingerprint is marked indicative only. Absence of a signature
  does not mean a technology is absent.
- Search engines may return irrelevant results. Review evidence before using it
  in a proposal or contacting a company.
- The crawler does not bypass logins, paywalls, CAPTCHAs, robots rules or access
  controls. It does not scrape private communities or use undocumented APIs.
- No finding automatically creates outreach, sends email, submits applications
  or changes a company status.
- Public APIs and search engines still impose rate limits and terms. Use a
  responsible request cadence and honor source restrictions.

## Known coverage limits

Product Hunt, Crunchbase, Wellfound, G2, Capterra, Trustpilot, BuiltWith and
Reddit are discovery targets through public indexing only. The module does not
claim complete database coverage or direct access to proprietary review data.
If a source blocks indexing or changes access, that source will return fewer
results. The design intentionally keeps each finding's source visible.
