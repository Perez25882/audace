# Phase 4 — Test-mode payments

## Scope and result

AUDACE now has a server-authoritative Paystack hosted checkout, protected customer payment status and confirmation, durable webhook receipts and reconciliation jobs, atomic payment/stock settlement, private payment operations and owner-controlled exception review. The application only accepts explicitly configured test credentials. No deployment, live charge, live refund, garment change or merchant catalogue configuration was performed.

Real Paystack and hosted Supabase credentials were not supplied. The integration is implemented and tested against controlled provider/API stand-ins connected to isolated PostgreSQL 17 databases. This does **not** establish verification against a real Paystack merchant integration. The local storefront keeps payments disabled until every required setting is present.

## Baseline and prerequisite repairs

Baseline lint, strict TypeScript, eight unit tests, five database tests and production build passed. The original illustrations-only browser journey passed. The configured database browser journey timed out waiting for a product image: its synthetic API started a new psql process per request and intermittently exceeded the application's catalogue timeout. The test API now uses a bounded pg pool with bound parameters and actual database roles. A parameter-generation defect introduced during this harness change was corrected before final verification.

The Phase 3 trusted finalizer rejected expired reservations without recording the successful payment. Phase 4 introduces a receipt ledger and a paid inventory-review state, revokes direct service access to the old order/finalizer functions, freezes payment totals and restricts fulfilment to reconciled receipts. Historical paid rows lacking provider receipts are flagged for review rather than assigned invented financial evidence.

Existing migrations 001–004 remain unchanged. Apply forward migrations 005–008 in sequence using the established migration process; do not manually edit a deployed migration.

## Architecture and trust boundaries

- Server components read the catalogue and protected order state. Client components collect guest details, request review and redirect to hosted checkout. They cannot approve payment.
- POST /api/payments/initialize validates bounded same-origin JSON, contact, delivery, cart and consent total. PostgreSQL rechecks publication, price, SKU and availability, snapshots the authoritative total, reserves stock for 15 minutes and creates an attempt in one transaction.
- A UUID checkout request plus random 256-bit access capability makes replay idempotent. Changed inputs with the same identity fail. A consent amount is compared with the database total; it never determines the payable amount.
- Each attempt has a server-generated ADT-UUID reference and immutable expected GHS pesewas. A partial unique index allows one active attempt per order. Initialization has a fenced 45-second lease.
- The server calls Paystack over HTTPS with its test secret. Only validated checkout.paystack.com URLs are returned. Callback URLs are derived from the configured application origin, never caller input.
- POST /api/payments/verify requires the order capability and queues authoritative provider verification. POST /api/payments/webhook records authenticated receipts and durable work before acknowledgement. POST /api/internal/payments/reconcile requires a separate bearer secret.
- Provider verification checks exact reference, domain=test, integer amount, GHS, order and attempt metadata, customer email, supported status, successful paid timestamp and channel. A configured integration ID is checked when Paystack returns it. Verification is authenticated by the merchant's test secret even when no integration field is returned.
- Provider uint64 identifiers remain exact decimal strings through JSON parsing and storage. No payment details, card credentials, raw webhook bodies or provider secrets enter customer payloads or application logs.

Official contracts: [accept payments](https://paystack.com/docs/payments/accept-payments/), [transaction API](https://paystack.com/docs/api/transaction/), [verification](https://paystack.com/docs/payments/verify-payments/).

## Channels and hosted checkout

The implementation requests only the explicitly configured subset of card and mobile_money. Paystack hosts all credential entry. Ghana mobile money includes MTN, Telecel and AT Money (the AirtelTigo channel) where enabled on the actual account. Merchant dashboard support must be confirmed before advertising particular networks. No public key or custom card form is needed for this server-initialized redirect flow. [Paystack payment channels](https://paystack.com/docs/payments/payment-channels/)

No prices, sizes, delivery fees or physical counts were invented for the real catalogue. Synthetic commerce data exists only in isolated tests.

## Webhook verification and durability

For PAYSTACK_WEBHOOK_MODE=timestamped, verification reads the original bytes, parses Paystack-Signature with one t and one or more v1=whk_identifier:hex signatures, computes HMAC-SHA512 over timestamp + "." + raw body using the complete whsec_ secret, uses constant-time comparisons and enforces a 300-second past/future tolerance. Current and previous secrets can overlap during rotation.

For an integration explicitly configured with PAYSTACK_WEBHOOK_MODE=legacy, the older x-paystack-signature is verified over the raw body using the test secret key. There is no automatic downgrade. The timestamped header is rejected in legacy mode, so an operator must deliberately select and test the merchant's documented scheme.

Receipt identity is SHA256 of the raw body. A transaction records the sanitized event, duplicate counter, timeline entry and queued job. Invalid signatures return 401; malformed or unsupported signed events return 400; database receipt failures return 503 for provider retry. A 200 response means durably accepted, not financially settled. Unknown signed references are retained without granting order access or payment authority.

Supported observations include charge.success, refund lifecycle events and dispute creation/reminder/resolution. Refund/dispute observations flag financial review; they do not themselves fabricate verified refunds or clear disputes. Signed charge events always lead to a separate authenticated transaction verification. [Paystack webhooks](https://paystack.com/docs/payments/webhooks/)

## Reconciliation, retry and inventory policy

Run the protected worker **every minute** through the chosen trusted scheduler. Configure a POST to the actual HTTPS application origin at /api/internal/payments/reconcile with Authorization: Bearer followed by PAYMENT_RECONCILE_SECRET. Keep this header in the scheduler's secret store, outside source control and public URLs. No scheduler was installed on an external service during this phase.

Each request expires up to 200 old orders, claims up to five due jobs with SKIP LOCKED and a 90-second lease, awaits all verification work and records each result. Schedule sufficient invocations for the anticipated queue volume and monitor the backlog, errors and lease age. Use a runtime timeout above the bounded parallel provider/DB work (60 seconds is appropriate for this worker). Failed requests can safely repeat. A crashed worker's lease expires and another invocation recovers it.

Queue generations fence the result as well as the lease: a webhook or authorized check arriving during an existing verification increments the generation. Finishing the older check leaves the newer work ready. A regression test covers this sequence and rejects an obsolete worker's completion token.

Transient failures retry with exponential delay from 60 seconds up to one hour. Unresolved attempts older than seven days become dashboard review items. An authorized admin can enqueue another rate-limited check. The queue provides durability; a configured and monitored scheduler provides liveness.

State mapping:

| Provider result | Stored/customer behavior |
| --- | --- |
| pending, ongoing, processing, queued | Pending; no revenue or fulfilment; reconciled later |
| failed, abandoned | Incomplete; release unpaid reservation; eligible bounded retry |
| success with exact evidence and live holds | Atomic receipt, paid order, one stock deduction, allocated and eligible for fulfilment |
| success after expiry/cancellation or missing holds | Receipt preserved, paid inventory review, no stock deduction or automatic fulfilment |
| reversed | Financial review; no automatic refund or cancellation of recorded financial evidence |
| mismatched evidence or conflicting transaction | Review, audit and blocked fulfilment; no credit from suspicious evidence |

Browser closure is never treated as provider cancellation. Inventory stops being reserved at the 15-minute expiry even if maintenance is delayed. A real late payment is retained in review and cannot consume stock reserved by another customer. Only an owner can allocate currently available stock, once, with a recorded reason. A refund review is the alternative administrative path; neither substitution nor extra stock is automatic.

A verified terminal failed/abandoned attempt can create a new attempt on the same eligible order, rechecking and reserving stock at the unchanged consent total, with at most five attempts. An uncertain initialization retains the same order and reference; the application does not create a new reference to conceal uncertainty. If the provider accepted initialization but its authorization URL was lost, recovery depends on the provider accepting same-reference retry or subsequent verification/operator review; a fresh charge is not assumed safe. Actual Paystack duplicate-initialization behavior remains a required sandbox check.

Duplicate successful callbacks/webhooks are idempotent. A separate successful attempt after an earlier successful collection is recorded as a duplicate receipt, flags financial review and never deducts stock again. Reusing a provider transaction ID across orders is blocked and flags the implicated orders.

## Customer privacy and experience

The flow is collection → product → bag → checkout review → Paystack hosted checkout → payment status → verified confirmation. Desktop and mobile retain the existing typography, palette and spacing.

A random capability is stored as a hash in PostgreSQL and a per-order HttpOnly, SameSite=Lax cookie (Secure on HTTPS) with a seven-day lifetime. URLs contain an opaque order UUID and never the capability. Guessing a UUID or supplying a gateway reference cannot expose an address. Guest access is limited to the browser holding the cookie. Session storage retains only checkout identity and a digest to recover interrupted requests; it does not retain raw contact information.

Status refreshes are bounded and rate-limited. Pending, incomplete and inventory-review pages make no false success or fulfilment promise. Confirmation requires a stored verified receipt, paid status, allocated stock and no financial-review flag. It shows snapshots, selected variants and sizes, quantities, verified total and delivery details. The bag is cleared only if it still matches the confirmed order. No notification delivery is claimed.

Seven-day access recovery, multi-device guest access and contact-data retention need a separately approved notification/privacy workflow.

## Database changes

| Migration | Responsibility |
| --- | --- |
| 20261107000500_payment_schema.sql | Immutable attempt evidence, receipts, webhook receipts, leased jobs, history, refund/dispute records, order capability/allocation and durable limits |
| 20261107000600_payment_checkout.sql | Idempotent order/attempt creation, consent checks, initialization leases, scoped access, durable receipt enqueue, worker claims and retry inputs |
| 20261107000700_payment_settlement.sql | Atomic verified settlement, late payment review, immutable order guard, owner stock resolution, refund review, admin verification and reconciled metrics |
| 20261107000800_payment_admin.sql | Role-checked payment search and detail reads |

All payment tables enable RLS. Anonymous users and ordinary authenticated customers cannot inspect payment/PII records. Service operations use narrowly granted security-definer RPCs with an empty search_path. Staff RPCs independently check database membership and role. The service role does not receive direct ledger write privileges. Monetary values use integer pesewas; receipt/provider and attempt uniqueness enforce replay safety.

## Administration and refund/dispute readiness

/admin/payments lists and searches order references, attempt references, amounts, channels, states, timestamps and reconciliation failures. Order details show receipts, event history, refund review and dispute observations. Admin re-verification only fetches provider truth; it cannot mark a payment successful. Owners alone can resolve inventory review or create bounded, idempotent full/partial refund-review requests with reasons. Requests reserve an amount against a verified receipt and remain requested, never refunded.

This phase does **not** call the Paystack refund-creation API or automate dispute responses. The schema separates requested/pending/processing/needs_attention/failed/processed, provider evidence and fulfilment. Signed observations remain visible for review. Provider refund verification, authenticated execution, reconciliation of externally issued refunds, dispute resolution and net-revenue treatment require a dedicated Phase 5 workstream before these operations are offered. An observed refund/dispute places the order in financial review and removes it from the recognized-revenue metric.

Dashboard revenue counts only verified, allocated, financially clear orders with an allocated receipt. It is a reconciled gross-sales measure, not an accounting profit or settlement balance. [Paystack refunds](https://paystack.com/docs/payments/refunds/)

## Required configuration

Copy .env.example to the untracked .env.local and set:

| Variable | Required value |
| --- | --- |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | Merchant's non-production Supabase API |
| SUPABASE_SERVICE_ROLE_KEY | Server-only service key |
| AUDACE_APP_ORIGIN | Exact origin; HTTPS externally, loopback HTTP locally |
| PAYSTACK_ENVIRONMENT | test, explicitly |
| PAYSTACK_SECRET_KEY | Merchant sk_test_ key; live keys are rejected |
| PAYSTACK_CHANNELS | Explicit approved subset: card,mobile_money |
| PAYSTACK_WEBHOOK_MODE | timestamped, or legacy only after merchant scheme confirmation |
| PAYSTACK_WEBHOOK_SECRET | Dedicated whsec_ secret for timestamped mode |
| PAYSTACK_WEBHOOK_SECRET_PREVIOUS | Optional rotation overlap |
| PAYSTACK_INTEGRATION_ID | Optional merchant ID; validated when returned |
| PAYMENT_RECONCILE_SECRET | Independently generated random secret, minimum 32 characters |

No NEXT_PUBLIC payment secrets exist. Configuration errors leave checkout unavailable. The test-only API-origin override is accepted only with AUDACE_PROVIDER_MOCKS=1 and both origins on loopback HTTP; it cannot redirect server secrets to a remote arbitrary API.

For real sandbox verification, use an approved HTTPS test deployment or tunnel, set the exact origin and callback, register /api/payments/webhook in the Paystack test dashboard, configure the actual signature mode, and run the trusted scheduler. Then complete official test-card and each enabled mobile-money scenario, inspect actual webhook deliveries/retries and validate settlement records against the merchant dashboard. Never use a live key. [Paystack test payments](https://paystack.com/docs/payments/test-payments/)

## Focused security review

Server prices, exact consent and provider evidence are enforced independently. Customer mutation endpoints require same-origin JSON and capability ownership. There is no public arbitrary-reference verification endpoint. Private pages/API responses disable caching and referrer disclosure; the proxy blocks framing. Provider redirects are allowlisted. Raw signatures are checked before JSON parsing. Request bodies, attempts, worker batches and retry windows are bounded; durable global and per-capability limits protect initialization/verification. Add gateway-level per-source abuse protection and Supabase Auth controls before external exposure.

Concurrent payment application locks the order and attempt, unique receipts prevent double credit, sorted SKU locks preserve stock integrity, and database triggers block unverified fulfilment. Refund/inventory actions are owner-only and audited. SQL parameters are typed/bound; staff cannot overwrite provider truth. No actual secrets or sensitive payload logging were added. Do not treat a compromised server service key as an untrusted-caller boundary: rotate and restrict that key operationally.

## Verification results

Tests use synthetic prices, SKUs, addresses, credentials and gateway responses solely inside disposable native PostgreSQL clusters. Supabase Auth/PostgREST are protocol stand-ins, not the actual hosted services.

| Check | Final result |
| --- | --- |
| ESLint | Passed for the final source; cached recheck also passed |
| Strict TypeScript | Passed route type generation and tsc --noEmit |
| Unit tests | 14 passed: existing shopping behavior, test-only configuration, signature modes/rotation/tolerance, verification mismatches and exact uint64 parsing |
| PostgreSQL integration | 16 passed: all eight migrations, seed and roles, authoritative quotes, consent/idempotency, concurrency, expiry, settlement, permitted fulfilment, duplicate receipts, queue recovery/generations, owner inventory resolution and refund reviews |
| Chrome browser suites | 5 passed in the final full run: complete desktop/mobile hosted mock checkout and private confirmation/admin totals; initialization interruption/timeout and durable failure recovery; pending mobile money, failed retry and expired-reservation late success; original storefront; configured shopping/admin journey |
| Production build | Passed on Node.js 22.14.0 and Next.js 16.4.5 |
| Production dependency audit | Zero reported vulnerabilities |
| Browser asset boundary | No Paystack secret-configuration names or synthetic provider secrets found in browser build assets |
| Approved artwork | Canonical PDF and seven garment WebPs unchanged from baseline ca5fc92 |
| Local preview | Running on port 3000; storefront, product, status and empty confirmation return 200; unauthenticated payment administration redirects to sign-in |

Confirmation screens were visually inspected at 390 and 1440 pixels, together with the private payments table. Browser checks assert viewport width and absence of hydration/page errors. The test harness now waits for application readiness and rendered admin rows. Its native psql connection timeout was raised from five to 30 seconds after a transient host timeout interrupted fixture restoration and caused cascading fixture failures; the clean final database and browser reruns passed. No financial invariant failures remain in the controlled suite.

Real Paystack initialization, card authorization, each Ghana mobile-money network, merchant account/channel eligibility, real refund behavior and webhook/tunnel delivery: **not executed — no merchant credentials or public test endpoint supplied**.

## Founder decisions and Phase 5 gates

1. Approve merchant prices, sizes, stock, publication, delivery fees and operating copy.
2. Supply a non-production Supabase project and Paystack test integration; confirm integration ID, webhook scheme and enabled channels.
3. Validate hosted Auth, PostgREST grants/RLS, cookie behavior, test callbacks and real webhook retries with merchant credentials.
4. Configure and monitor the minute worker, queue volume, manual-review ownership and failure alerting. No external alerts are installed.
5. Test actual same-reference initialization errors and interrupted checkout recovery against Paystack; operationally resolve unknown attempts rather than issuing blind new references.
6. Approve late-payment handling, refund authorization and execution, dispute response, financial-review clearance and accounting reports. Current controls deliberately retain exceptions for review.
7. Approve contact retention, guest access recovery, staff MFA/session controls and customer notifications; no email/SMS delivery is integrated.
8. Perform final responsive/accessibility/security QA, backup/restore and concurrent load tests. Obtain separate deployment and live-payment approval.

Phase 4 provides the test-mode implementation and controlled automated evidence for Phase 5. It does not authorize launch.
