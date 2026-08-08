# Phase 2 Evaluation — 10-Company Batch (2026-08-08)

Real companies, real websites, one batch. Goal: quality over quantity — no
invented problems, no mass lead spam.

## Batch summary

| # | Company | Industry | Job | Opps | Scored | Top score |
|---|---|---|---|---|---|---|
| 1 | Truefitt and Hill | Men's Grooming | ✅ | 5 | 5 | 72 |
| 2 | IKEA (Smoke Test Co) | Home furnishings retail | ✅ | 5 | 5 | 70 |
| 3 | Jersey Mike's | Restaurant franchise | ✅ | 1 | 1 | 67 |
| 4 | Sweetgreen | Restaurant | ✅ | 1 | 1 | 68 |
| 5 | Orangetheory Fitness | Fitness & wellness | ✅ | 3 | 3 | 78 |
| 6 | Meineke Car Care | Auto repair | ✅ | 1 | 1 | 74 |
| 7 | Massage Envy | Wellness franchise | ✅ | 0 | 0 | — |
| 8 | Wyndham Hotels | Hospitality | ✅ | 1 | 1 | 72 |
| 9 | Two Men and a Truck | Moving services | ❌ | 0 | 0 | — |
| 10 | Papa John's | Restaurant | ✅ | 2 | 2 | 77 |

**Totals:** 9/10 analyzed, 19 opportunities, 19 scored. Average score 69.4.
Priority mix: 2 High, 17 Medium, 0 Low. Service mix: Web Applications 7,
AI Automation 7, AI Agents 4, Custom Software 1. No forced SaaS/Web3 matches.

## Manual quality review

**Evidence quality: strong.** Almost every finding quotes the site verbatim:
- Papa John's: "Papa John's Online Ordering can not take your order at this
  time due to…" (confidence 0.99, real outage evidence)
- Orangetheory: "With over 900K members around the world it may take some
  time…" (support backlog, confidence 0.94)
- Meineke: "Visit our locations page or call your local center today to
  learn about current coupons" (local offer friction)

**Stability:** Truefitt & Hill was analyzed twice across the phase; the same
three finding families (support channels, store routing, enquiry intake)
recurred both times. The detector is not hallucinating one-off problems.

**Massage Envy returning 0 opportunities is the guard working.** The
fetched pages did not surface evidence-backed automation gaps, so the
analyzer returned nothing instead of inventing a sales angle.

**Service matching is sensible.** Support friction maps to AI Agents /
AI Automation; store-routing and contact flows map to Web Applications.
No Web3 or SaaS recommendation appeared because none fit.

## False positives and limitations

1. **SPA crawl artifacts (2 findings suspect).** Sweetgreen's "contact page
   serves homepage content" and Wyndham's "literal currency placeholder"
   look like client-side-rendered pages that a plain HTML fetch cannot
   render. These may be crawl artifacts, not real business problems.
   Fix: headless rendering for JS-heavy sites, or a "rendered content only"
   flag on findings that mention placeholders.
2. **One hard failure.** Two Men and a Truck's site failed the fetch step
   (301 → CDN/connection error). No analysis produced. The pipeline failed
   cleanly and did not block the queue.
3. **Score calibration.** No Low-priority opportunities were produced; the
   LLM scores cluster in the 60-78 band. The Low bucket needs a harsher
   rubric or a widened split (e.g. High ≥ 80) so prioritization actually
   differentiates.
4. **Duplicate-similar findings.** IKEA produced two near-duplicate
   "email-only intake" findings (franchisee EOI and general email routing).
   A dedupe step on finding embeddings would tighten the list.
5. **Fetch depth.** 4 pages per site caps analysis; deep internal tools and
   member portals are out of scope by design.

## Verdict

The pipeline met the quality bar: evidence-backed findings, conservative
scoring, correct service matching, honest empties, and clean failure
handling. Remaining work is calibration (scoring split, finding dedupe) and
resilience (headless rendering for SPAs), not architecture.
