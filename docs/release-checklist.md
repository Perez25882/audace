# AUDACE release checklist

Status vocabulary: PASS, FAIL, BLOCKED, NOT TESTED, NOT APPLICABLE.
A local or simulated PASS is identified as such; it does not certify the corresponding hosted service.

Overall: **NOT READY — BLOCKERS REMAIN**.

## Business readiness

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Approved product prices | BLOCKED | Real catalogue prices remain unset; approve and configure |
| Approved available sizes | BLOCKED | No merchant size matrix supplied; fixtures are synthetic |
| Confirmed inventory quantities | BLOCKED | Merchant physical counts unavailable |
| Confirmed delivery areas | BLOCKED | Founder approval needed; fixtures are not operating coverage |
| Confirmed delivery charges | BLOCKED | Approve actual fees and methods |
| Approved delivery/returns policy | BLOCKED | No approved commercial promises supplied |
| Approved privacy and purchase terms | BLOCKED | Typed information interface prepared; null sections unpublished |
| Customer support contacts/process | BLOCKED | No approved contact or response procedure |
| Approved wordmark | PASS | Text-based AUDACE is authorized by the brief |
| Final garment imagery | PASS | Four PDF pages reviewed; seven lossless WebPs match source raster pixels/dimensions |
| White long-sleeve listing | NOT APPLICABLE | Not illustrated; route remains unavailable |
| New campaign photographs | NOT APPLICABLE | Outside scope; no stock or generated substitutes used |

## Technical readiness

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Production build | PASS | Phase 5 Next.js production build on Node 22.23.4 |
| Lint and strict types | PASS | Executed locally; final results in phase-5.md |
| Unit tests | PASS | 20 local unit tests pass on final source |
| Complete final database/browser suites | PASS | 21 native database tests, 5 purchase/storefront browser suites and 2 extended release suites pass |
| Native authorization/RLS | PASS | Guest/customer rejection matrix across 15 sensitive admin RPCs; direct reads remain restricted |
| Hosted Supabase authentication/RLS | BLOCKED | Real project, Auth settings and PostgREST need verification |
| Synthetic staff session rejection | PASS | Invalidated Auth-fixture session redirects to sign-in; subsequent private access rejected |
| Hosted staff absolute expiry/MFA | BLOCKED | Actual Supabase session time-box/inactivity/MFA settings not supplied or verified |
| Migration reproducibility | PASS | Applied 001–009 in disposable PostgreSQL 17 |
| Worker monitoring interfaces | PASS | Private aggregate health/heartbeat SQL tested; operational delivery is separate |
| Operational alerts/retention | BLOCKED | Actual log destination, alert owners and delivery not configured |
| Native backup restoration | PASS | Dump restored into separate disposable database; receipts/stock/functions/RLS/replay verified |
| Hosted backups/restore/RPO/RTO | BLOCKED | No merchant recovery plan or hosted drill |
| Vercel build configuration/runbook | PASS | Reviewed configuration and deployment-runbook.md; no deployment |
| Domain, DNS and HTTPS | BLOCKED | No approved domain or external environment |
| CSP and private-route headers | PASS | Production nonce changes per request, no eval, correct framing/content-type/noindex and working scripts/forms |
| Canonical/sitemap/structured data | PASS | Configured isolated-origin browser assertions verify published routes, exact GHS offers and private exclusions |
| Social-card HTML | PASS | Configured browser assertions verify OG illustration/site name and Twitter card metadata |
| External social previews | NOT TESTED | Actual platform rendering requires an approved public domain |
| Accessibility/responsive automated subset | PASS | Nine widths, keyboard/modal, reduced motion and WebKit emulation; 30 axe scans detected zero violations. Incomplete contrast cases/manual AT remain |
| Automated pixel regression baseline | NOT TESTED | No committed screenshot baseline; manual visual review performed, pixel comparison inconclusive |
| Mobile lab performance | PASS | Six Lighthouse runs: median performance 93/92; LCP 1.18s/2.02s. One product run 2.73s and TBT 326/340ms remain follow-ups, not field claims |
| Physical iPhone Safari/Android Chrome | NOT TESTED | No physical devices available |
| Real screen-reader testing | NOT TESTED | Automated axe and keyboard checks cannot certify it |
| Production dependency audit | PASS | Zero reported production vulnerabilities |
| Development dependency audit | FAIL | Eight moderate lint-chain entries, one minimatch advisory; no high/critical entries. Unsupported major/downgrade fix not applied |
| Staging indexing disabled by default | PASS | Explicit approved-origin and indexing opt-in gates; pure unit tests pass |
| Real-user performance | NOT TESTED | No launched environment or RUM data |

## Payment readiness

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Merchant identity/verification | BLOCKED | Actual merchant access unavailable |
| Required Ghana channels enabled | BLOCKED | Confirm on merchant account; no network claims from mocks |
| Real Paystack test transactions | BLOCKED | No real test credentials supplied |
| Current and explicit legacy signatures | PASS | Unit tests validate raw bytes, timestamps, rotation, tampering and mode isolation |
| Actual HTTPS webhook delivery/retries | BLOCKED | No deployed/tunnel test endpoint or merchant secret |
| Durable local webhook/reconciliation | PASS | PostgreSQL receipt, leased-job/generation and concurrent settlement tests |
| Scheduled worker and external alerting | BLOCKED | Configure and prove the actual minute schedule |
| Provider amount/order/environment matching | PASS | Controlled unit/database verification; real merchant acceptance remains blocked |
| Final-unit concurrency and stock idempotency | PASS | Existing native concurrency tests pass |
| Late-payment inventory exception handling | PASS | Native receipt retention, no overselling and owner resolution verified |
| Post-fulfilment dispute/reversal recording | PASS | Reproduced old failure; migration 009 regression passes processing/shipped/delivered |
| Refund handling policy and merchant procedure | BLOCKED | Bounded review requests only; no approved execution/accounting process |
| Actual refund/dispute provider integration | NOT TESTED | No test account; no live refund attempted |
| Live payment activation approval | BLOCKED | Explicitly excluded by this brief; live keys remain rejected |

## Operational readiness

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Real administrator accounts and MFA | BLOCKED | Approve/provision staff and enforce hosted Auth policy |
| Inventory adjustment workflow | PASS | Native optimistic-count/held-stock constraints and existing browser audit trail |
| Owner price/delivery persistence | PASS | Real isolated DB updates through admin UI, public repricing, persisted fee and operator controls verified |
| Order fulfilment controls | PASS | Native transition and financial-hold regression tests |
| Actual fulfilment and delivery process | BLOCKED | Founder must approve responsibilities and procedure |
| Support procedure and retention | BLOCKED | Contacts, ownership, response and data retention decisions unavailable |
| Failed/interrupted/pending payments | PASS | Complete controlled-provider browser suites pass alongside native/unit paths; real merchant tests remain blocked |
| Controlled exception workflow | PASS | Native owner-only inventory/refund review and immutable financial evidence |
| Incident response procedure | PASS | Documented in deployment-runbook.md |
| Incident drill and alert delivery | NOT TESTED | Requires real staging infrastructure and approved owners |
| Deployment/live transactions in this phase | NOT APPLICABLE | Prohibited and not performed |

Do not convert BLOCKED or NOT TESTED to PASS on the strength of implementation alone. Attach actual merchant/platform evidence and founder decisions before requesting controlled launch approval.
