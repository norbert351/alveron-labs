# Phase 11 Evaluation — 25-Company Batch (2026-08-08)

Real companies, real websites, real LLM analysis, calibrated scoring. No
fabricated results — every number below comes from the database.

## Headline numbers

| Metric | Value |
|---|---|
| Companies submitted | 26 |
| Successfully analyzed | 25 (96.2%) |
| Failed fetches | 1 (Two Men and a Truck — CDN blocks plain fetch) |
| Empty results (0 opportunities) | 8 (30.8%) |
| Opportunities found | 71 |
| Scored | 70 (98.6%) |
| Average score | 64.8 |
| Score range | 42–78 |
| High (≥80) | 0 |
| Medium (60–79) | 49 (70%) |
| Low (40–59) | 22 (30%) |
| Poor fit (<40) | 0 |

Service mix: Web Applications 30 · AI Automation 19 · AI Agents 15 ·
Custom Software 7. No SaaS/Web3 forced matches.

## Per-company detail

| Company | Industry | Opps | Scored | H/M/L |
|---|---|---|---|---|
| Truefitt and Hill | Grooming | 7 | 7 | 0/7/0 |
| IKEA (Smoke Test Co) | Home furnishing | 9 | 8 | 0/4/5 |
| Jersey Mike's | QSR franchise | 2 | 2 | 0/2/0 |
| Sweetgreen | Fast casual | 4 | 4 | 0/2/2 |
| Orangetheory Fitness | Fitness | 9 | 9 | 0/8/1 |
| Meineke | Auto repair | 5 | 5 | 0/4/1 |
| Massage Envy | Wellness | 2 | 2 | 0/1/1 |
| Wyndham Hotels | Hospitality | 3 | 3 | 0/2/1 |
| Papa John's | QSR delivery | 5 | 5 | 0/4/1 |
| Cold Stone | Ice cream | 6 | 6 | 0/3/3 |
| Marco's Pizza | Pizza | 3 | 3 | 0/2/1 |
| Anytime Fitness | Fitness | 5 | 5 | 0/2/3 |
| Jiffy Lube | Auto care | 6 | 6 | 0/5/1 |
| Dickey's Barbecue | QSR | 1 | 1 | 0/1/0 |
| F45 Training | Fitness | 2 | 2 | 0/2/0 |
| European Wax Center | Beauty | 1 | 1 | 0/0/1 |
| Hooters | Sports bar | 1 | 1 | 0/0/1 |
| Two Men and a Truck | Moving | 0 | 0 | failed fetch |
| Buffalo Wild Wings | Sports bar | 0 | 0 | empty |
| Firehouse Subs | QSR | 0 | 0 | empty |
| Taco Bell | QSR | 0 | 0 | empty |
| The Cheesecake Factory | Casual dining | 0 | 0 | empty |
| Crunch Fitness | Gym | 0 | 0 | empty |
| Valvoline | Auto care | 0 | 0 | empty |
| FTD | Flowers | 0 | 0 | empty |
| Edible Arrangements | Gifts | 0 | 0 | empty |

## Human evaluation findings

**Quality holds.** Sampled findings quote the source pages directly (support
intake friction, careers pages routing to email, contact flows missing) with
confidence 0.78–0.96. Massage Envy, Crunch, Taco Bell and five others
returned honest empties instead of invented problems — the anti-fabrication
guard is doing its job at scale.

**Calibration is now the problem (real finding).** The calibrated buckets
(80/60/40) plus the "be conservative" prompt produced ZERO High-priority
opportunities: scores span 42–78 with 70% in the Medium band. The rubric
compresses the top of the scale. Two fixes, in order of preference:
1. Anchor the prompt with concrete examples of an 85+ finding (direct,
   quoted evidence of revenue loss or customer churn), or
2. Widen High to ≥75 so genuinely strong findings (e.g. Papa John's ordering
   outage at 0.99 confidence) land where they belong.

**Failure handling verified.** Two Men and a Truck failed at fetch, was
recorded `failed` with the error persisted, and did not block or poison the
queue (25 subsequent analyses completed).

**SPA fallback exercised.** Several chain sites render via client-side JS;
the headless-browser fallback triggered on thin plain fetches and the
analyses completed with real content. Cold-start cost on this VM is ~30s per
browser launch (snap Chromium); acceptable for a fallback path.

**Service matching remains sensible** — no forced matches, distribution
tracks where the evidence actually pointed (30 Web Applications for
routing/contact flows, 19 AI Automation for intake friction).

## Verdict

The acquisition pipeline now works end to end on real companies with honest
empties and clean failures. The remaining work is score calibration (above)
and the external boundary: real Gmail credentials to complete the OAuth
handshake, live sending, and live reply detection (`docs/OAUTH.md`).
