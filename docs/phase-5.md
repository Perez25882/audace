# Phase 5 — Release candidate audit and review

**NOT READY — BLOCKERS REMAIN**

## Executive assessment

AUDACE has been audited from baseline commit 1098235 and hardened for a release-candidate review. The approved storefront and seven garments are preserved. A reproduced financial-review defect and a restore-permission defect are repaired in forward migration 009; no historical migration or real financial record was rewritten.

This is a local release candidate, not a public-launch approval. No external deployment, production connection, live payment or refund was performed. Real merchant configuration, hosted acceptance, operational ownership and approved business information remain unavailable. The evidence and checklist distinguish native PostgreSQL, controlled Paystack/Auth protocol fixtures, browser emulation and actual services.

## Baseline and scope

Read the brief, project rules, README, Phase 1–4 reports, design/asset documentation, source routes/components, catalogue/bag/checkout state, payment API and signature contracts, Auth/roles, migrations, test harness and environment configuration. The pre-existing untracked duplicate root PDF was preserved.

The fresh baseline passed lint, strict types, 14 unit tests, 16 database tests and production build. The first browser baseline overlapped a rebuilding .next directory: three suites passed and two failed with missing production-build artifacts. This was an orchestration error, not evidence of a storefront regression. The final workflow serves a completed build and runs checks in sequence. The new verify command encodes that order.

The canonical four-page PDF was rendered and reviewed again. All seven WebPs match their PDF embedded raster dimensions and decoded RGB pixels. Cream/Black/Burgundy retain both sleeves; White has only its short sleeve. Page 4 repeats that same image at two scales. No stock imagery, new designs, materials, sizes, merchant prices or policies were introduced.

## Defect register and repairs

| ID | Severity | Finding and evidence | Result |
| --- | --- | --- | --- |
| F01 | P0 | A valid financial-review observation after processing was rejected by payment_order_guard. Isolated reproduction returned payment_review_required and rolled back receipt/review recording | Migration 009 permits review flags on an unchanged fulfilment state, but blocks the next fulfilment transition. Regression covers processing, shipped and delivered, reversal/dispute evidence, unchanged stock and excluded revenue |
| F02 | P1 | Native dump restoration relied on default public-schema usage. The restored authenticated role could not resolve a private application table | Explicit schema usage grants for the three application roles are now captured/restored; table grants and RLS remain restricted. Native restore/replay/RLS drill passes |
| F03 | P2 | A long order reference expanded the admin order page to 872px at a 320px viewport | References, payment headings and supporting copy wrap; responsive regression added |
| F04 | P2 | Tab could leave the zoom dialog controls | Explicit forward/backward Tab containment added; native Escape and opener-focus return retained |
| F05 | P2 | Owner inventory resolution allowed 500-character reasons, while movements accepted only 240 | Movement reason constraint aligned to 500; a 300-character reason persists atomically and repeated resolution cannot deduct twice |
| F06 | P1 readiness | No private queue/worker health surface or verified restore workflow | Private aggregate health, durable heartbeat, sanitized bounded logs and native restore drill added. Actual monitoring/scheduler/hosted recovery remain blocked |
| F07 | P2 hardening | Public/checkout security headers and script policy were incomplete | Per-response nonce CSP, no production script eval, framing/content-type/referrer/permission headers and private/no-store indexing controls added; proxy Auth fetch bounded |
| F08 | P2 | Canonical, social metadata, sitemap and staging indexing controls absent | Approved-origin opt-in, dynamic published-only sitemap/robots, exact product OG images and escaped verified Product evidence added |
| F09 | P2 | Confirmation exposed the raw unfulfilled enum | Customer copy now says awaiting fulfilment or being prepared, without delivery promises |
| F11 | P2 accessibility | Form/option boundaries measured only 1.52:1 against Paper | Dedicated Control token now measures 4.02:1 against Paper and 3.76:1 against Ivory; decorative dividers stay restrained |
| F10 | P2 tooling | Existing local Node 22.14.0 was behind the supported branch patch | Checksum-verified 22.23.4 installed only under ignored work/runtime; .nvmrc/engine/runbook updated; global runtime unchanged |

No remaining locally reproducible P0/P1 financial, authorization or data-integrity defect is known after the completed checks. This is bounded test evidence, not a claim of vulnerability absence.

## Security, payments and inventory

Payment amounts remain integer pesewas, calculated and snapshotted in PostgreSQL. Browser totals provide consent comparison only. UUID/capability ownership, immutable attempts, unique provider receipts, exact amount/GHS/domain/reference/order/attempt matching, original-byte HMAC signatures and rate limits remain enforced server-side. The current timestamped scheme and deliberately selected legacy mode remain separate; there is no automatic fallback.

The original callback/webhook race, leased job recovery, new-event generations, final-unit competition, replay, duplicate collection, failed/abandoned states and expired-reservation payments are exercised on native PostgreSQL. Verified late payment is retained in paid inventory review; no automatic oversell, substitution or refund occurs. Review flags now remain recordable even after fulfilment has started. They block further fulfilment and recognized revenue.

Guests and authenticated non-staff are rejected by a matrix across 15 sensitive administration RPCs. Owner-only actions reject operators. Direct customer reads of private tables remain empty or denied under RLS; normal staff cannot overwrite gateway evidence. Browser checks separately exercise protected routes, owner persistence and invalidated synthetic sessions. Actual hosted Auth time-box/MFA/signup settings, PostgREST and project grants are not certified by a protocol fixture.

The CSP uses a new nonce per response; scripts cannot rely on unsafe-inline/eval in production. CSS attributes remain allowed for the approved colour swatches. Public catalogue data is request-deduplicated and read fresh; it is not cached across price, publication or reservation changes. Private HTML and APIs are not shared-cacheable. No third-party client payment or analytics script was introduced.

Logs accept only fixed event/code categories, bounded counts and validated UUIDs. No raw request/error/provider payload, token, email, address or secret is emitted by the new logger. Private health counts do not expose customer records. Public health indicates app liveness only. Actual retention, alerts and incident ownership still require configuration.

Refunds remain clearly labelled owner review requests, bounded by verified receipts and separated from fulfilment. This phase does not execute refunds or claim that disputes have been resolved. Merchant procedures, actual provider refund/dispute behavior, accounting clearance and financial-review resolution need approval and sandbox evidence.

## Customer, responsive and accessibility QA

The existing collection, product selection, bag persistence, repricing, server quote, mock hosted payment and private confirmation flows are preserved. Variant imagery is verified on all seven routes, including White fallback from a long-sleeve selection. Unsupported/unpublished products remain unavailable.

The release QA matrix covers 320, 360, 375, 390, 414, 768, 1024, 1440 and 1920 CSS pixels. Payment-button reflow/touch checks extend the full purchase suite. Configured bag/checkout and admin pages are exercised as well as unconfigured safe states. Keyboard work includes skip link, modal containment/Escape/focus return, form errors and visible focus; footer focus now contrasts with the dark surface. Existing live regions announce additions/quantity changes. Reduced-motion support is explicit.

Axe scans use WCAG 2 A/AA, 2.1 AA and 2.2 AA tags. Automated results and incomplete checks are recorded separately; a clean axe scan is not a WCAG certification. WebKit runs an emulated iPhone viewport and Chromium runs responsive desktop/mobile views. No physical iPhone Safari, physical Android Chrome, VoiceOver, TalkBack or NVDA verification is claimed.

Final browser QA passed both extended suites. Across 30 axe scans, no violations were detected; color-contrast remained an incomplete rule for image-dependent cases. Manual token checks measured Espresso/Ivory at 13.93:1, Muted/Ivory at 6.26:1 and Ivory/Charcoal at 12.53:1. Interactive boundaries improved from 1.52:1 to 4.02:1 against Paper (3.76:1 against Ivory). These checks do not certify every image/text case or screen-reader behavior.

Screenshots at 320/390/768/1440 and mobile paid/review administration were visually inspected. There is no committed pixel baseline, so automated pixel-regression comparison is INCONCLUSIVE rather than silently passed.

## Performance and product fidelity

Approved lossless source assets and their intrinsic dimensions are preserved. Next.js responsive image delivery, high-priority above-fold garment imagery, lazy lower content, bundled variable fonts, server-rendered content and narrowly scoped client interactions remain in place. No benchmark-driven garment replacement or quality reduction was made.

Lighthouse measurements use the local production build, Chrome, a 390×844 simulated mobile configuration and the recorded Lighthouse throttling settings. Three final Lighthouse 13.6.0 runs per route used Headless Chrome 156 on Windows, Node 22.23.4, 390×844 CSS pixels/DPR 1, simulated 150ms RTT, 1638.4 Kbps throughput and 4× CPU slowdown.

| Route | Median performance | Median LCP (range) | Maximum CLS | Median TBT | Median transfer |
| --- | --- | --- | --- | --- | --- |
| Homepage | 93/100 | 1.18s (0.95–2.07s) | 0.000775 | 326ms | 309.5 KiB |
| Burgundy product | 92/100 | 2.02s (0.94–2.73s) | 0.000261 | 340ms | 262.2 KiB |

The product LCP reached 2.73s in one run; medians alone must not hide that variance. TBT remains a performance follow-up under constrained CPU. Short separate 4× CPU Event Timing samples reported maxima of 64ms (collection filtering) and 88ms (gallery controls), not field INP. Lighthouse accessibility was 100 in these runs; SEO was intentionally limited by staging noindex/missing approved canonical host. Sanitized exact results and build identity are in phase-5-performance.json. There is no real-user or Ghana mobile-network dataset. Lighthouse TBT is not INP, and laboratory scores do not establish physical-device experience or field Core Web Vitals.

## Deployment, operations and founder decisions

vercel.json prepares framework/install/build settings without identifying or deploying a project. The worker has a 60-second function-duration declaration; actual plan/region/runtime support still needs verification. The detailed runbook covers staging isolation, TLS/origins, Auth controls, migrations, signatures/callbacks, minute scheduling, queue monitoring, logs, incident handling and compatible application/database recovery.

The native backup drill restores a real custom-format dump into a second disposable database and verifies evidence, stock, functions, RLS and replay safety. It does not prove hosted Supabase backup recovery, managed Auth restoration, off-site retention, RPO or RTO. Database backups also do not protect the Git repository, original PDF or Storage object bytes by themselves.

Before any controlled launch review, the founder must supply/approve:
- Actual prices, size matrix, counts, publication, delivery regions and fees.
- Support contacts, delivery/returns, privacy/purchase terms, retention and fulfilment responsibilities.
- A canonical domain, hosting/project identities, TLS and staff accounts/MFA/session policy.
- Merchant test access, enabled card/mobile-money networks, actual signing scheme and real webhook delivery.
- A monitored minute reconciliation schedule, exception/refund/dispute procedures, alert owners and backup/recovery targets.
- Real staging acceptance and separate live activation/deployment approval.

No placeholder legal text is presented as final. The compact store-information interface publishes approved sections only; null entries stay absent. Real-user performance, social-platform previews and hosted-device/provider acceptance remain NOT TESTED/BLOCKED as applicable.

## Exact execution and outcomes

Commands ran from the AUDACE folder with Node.js 22.23.4 selected through a local PATH override and AUDACE_PG_BIN pointing to PostgreSQL 17. Baseline commands used 22.14.0 before the patch refresh.

| Command/check | Outcome |
| --- | --- |
| npm run lint; node node_modules/eslint/bin/eslint.js . --cache --cache-location=work/eslintcache | PASS — npm lint plus final cached ESLint recheck |
| npm run typecheck | PASS |
| npm test | PASS — 20 unit tests |
| npm run test:db | PASS — 21 native database tests |
| npm run build | PASS — production build with nonce-rendered routes |
| npm run test:e2e | PASS — 5 complete purchase/storefront suites |
| npm run test:qa | PASS — 2 extended responsive/accessibility/admin suites; WebKit, bidirectional focus and social-card HTML assertions included |
| npm run test:perf | PASS — 6 completed Lighthouse runs plus laboratory Event Timing samples; results above |
| npm audit --omit=dev --json | PASS — zero reported production vulnerabilities |
| npm audit --json | Eight moderate development-only lint-chain entries; zero high/critical |
| python work/phase-5-assets.py | PASS — four pages/seven exact raster matches |
| Native pg_dump/pg_restore drill | PASS — separate disposable database; stock, receipts, functions, RLS and replay |
| Real Paystack/Supabase/HTTPS/provider-channel tests | BLOCKED — no credentials or approved external environment |
| Physical devices and screen readers | NOT TESTED — unavailable |

The development audit traces eight dependency entries to one minimatch glob-amplification advisory. The suggested automatic fix changes the Next.js lint preset incompatibly; it was not forced or disguised as a clean full audit. Production dependencies report zero vulnerabilities. [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

Evidence is retained in ignored work/ for reproduction, with summarized results in this report and release-checklist.md. No actual customer data or credentials are in test fixtures. npm run verify was added as the sequential convenience workflow; the individual commands in this table were the checks actually executed.

## Remaining issues and verification limits

- P1 external launch blockers remain: approved business data/policies/support, real merchant and hosted Auth/PostgREST acceptance, domain/TLS, a monitored scheduler and a hosted restore drill. No approved external environment or local environment file was supplied.
- P2 development tooling: eight moderate lint-chain audit entries remain pending a compatible upstream fix; the production audit is clean.
- P2 performance follow-up: one product LCP sample reached 2.73s and median TBT was 326/340ms under simulated constrained CPU. Profile these on the actual staging region and representative devices; short Event Timing samples do not establish field INP.
- Physical devices, assistive-technology reading, public social-platform previews and a committed pixel-regression baseline remain unverified. Incomplete axe contrast cases are retained in the evidence.
- Refund execution, dispute/accounting clearance, guest-access recovery and customer notification delivery are not automated. They require approved operating rules and real provider acceptance; no successful refund or delivered notification is claimed.

## Release recommendation

**NOT READY — BLOCKERS REMAIN.**

Use this release candidate for founder review and authorized staging acceptance. The complete status/evidence matrix is in release-checklist.md; deployment/recovery steps are in deployment-runbook.md. Missing business approval, actual merchant/provider acceptance, hosted security/recovery and monitored operations prevent a defensible public-launch recommendation. Phase 5 does not authorize launch or live payment activation.
