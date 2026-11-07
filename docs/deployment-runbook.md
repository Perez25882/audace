# AUDACE deployment and recovery runbook

This is a preparation document. No external environment was created, deployed, migrated or connected during Phase 5. No live payment or refund is authorized. The application rejects live keys.

## Release inputs and local verification

Use the tested Node.js 22 patch in .nvmrc (22.23.4), npm, PostgreSQL 17 server/client tools, Chrome, and Playwright WebKit. A checksum-verified local Windows runtime is available under work/runtime in this checkout; it is ignored and is not a portable deployment artifact. The global Node installation was not changed.

From the repository root, after selecting the correct Node runtime:

~~~powershell
npm ci
$env:AUDACE_PG_BIN = 'C:/Program Files/PostgreSQL/17/bin'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'work/browsers'
node node_modules/playwright-core/cli.js install webkit
npm run verify
npm run test:perf
npm audit --omit=dev
~~~

verify runs lint, type checking, unit tests, isolated database tests, production build, existing purchase browser suites and release QA **in sequence**. Do not rebuild .next while browser/performance tests are serving it. The database suites exercise concurrency internally despite serial test-file execution. No business data is seeded into a persistent project by these commands.

Performance reports and temporary test evidence go under ignored work/. They contain synthetic data only. Lighthouse uses its recorded simulated mobile settings; laboratory scores are not Ghana-network or real-user measurements.

## Environment isolation

Use distinct Supabase projects, Auth users, service credentials, webhook secrets and scheduler secrets for staging and production. Use distinct Vercel environment settings; never expose these through NEXT_PUBLIC variables. Do not copy synthetic fixture values into merchant settings.

.env.example lists all settings. SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY are server configuration. AUDACE_APP_ORIGIN must be the exact external HTTPS origin for that environment. PAYSTACK_ENVIRONMENT stays test. Configure the actual sk_test_ key, enabled hosted channels, confirmed webhook mode and the dedicated whsec_ secret where applicable. PAYMENT_RECONCILE_SECRET is an independent random bearer secret of at least 32 characters.

AUDACE_PUBLIC_ORIGIN stays blank until the founder approves a canonical HTTPS domain. AUDACE_INDEXING_ENABLED stays false in development/staging and through acceptance. Enabling it requires an approved origin; published product routes alone enter the sitemap. Bag, checkout, admin, API and private order routes remain excluded. Configure social cards with the existing approved garment illustrations; validate actual platform previews after a real domain exists.

Approve support contacts, delivery/returns, privacy and purchase terms before populating src/lib/store-information.ts. Null sections are not published as policies. Configure approved size guidance, prices, sizes, physical stock, publishing and delivery settings through authorized administration. Do not infer policies from example text.

## Staging preparation — requires separate deployment authorization

1. Create or select a non-production Supabase project and verify its identity. Disable public Auth signup, provision approved staff privately and assign owner/operator membership as described in phase-3.md.
2. Configure Auth session time-box/inactivity limits and MFA supported by the selected plan. App cookies are HttpOnly, SameSite Lax and Secure over HTTPS. Their eight-hour refresh lifetime is not a substitute for an absolute Auth-session policy.
3. Review migration history and a restorable backup. Apply migrations 001–009 in order using the established Supabase migration tooling against the verified staging target. Never reset a merchant database or edit applied migrations.
4. Review project grants/RLS and real PostgREST RPC behavior. The native test roles and Auth protocol fixtures do not verify hosted Supabase.
5. Configure Vercel for the Next.js framework, npm ci, npm run build and Node 22. vercel.json contains build preparation only. Confirm the provider actually offers the tested patch or a later supported 22 patch, function duration and region before proceeding. The payment worker declares maxDuration=60 seconds; check actual account limits. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
6. Set the exact HTTPS application origin, allowed domains and Auth redirects. Confirm DNS ownership and TLS. No domain has been guessed or configured.
7. Register /api/payments/webhook in Paystack **test mode**, confirm the actual signing scheme and secret, and exercise real test callbacks, each enabled Ghana payment channel, retries, amount/domain checks, delayed settlement and uncertain initialization. Never use a live key.
8. Install a trusted minute scheduler for POST /api/internal/payments/reconcile, with the bearer secret in its secret store. Do not place it in a query string or repository. No scheduler is installed by this project.
9. Connect logs and private-health polling to approved operational owners. Test alerts and an outage drill before acceptance.
10. Run the complete release checklist, including a hosted restore drill and physical-device checks. Record evidence and obtain founder review.

Vercel's Hobby cron frequency is not a substitute for a minute payment worker; review actual plan restrictions. Supabase Cron plus pg_net/Vault is a possible scheduling approach, subject to extension availability and approval. Do not assume that a free tier includes the chosen operational schedule. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Supabase scheduling and Vault](https://supabase.com/docs/guides/functions/schedule-functions)

The worker processes at most five due attempts per call. Measure queue volume and invoke additional bounded batches when needed. A seven-day reconciliation limit does not extend the 15-minute stock hold. Monitor backlog and leases; do not rely on customers keeping a tab open.

## Operational checks and incident response

GET /api/health is public **application liveness only**. A 200 does not establish database or gateway readiness.

GET /api/internal/health requires Authorization: Bearer followed by PAYMENT_RECONCILE_SECRET. It queries the database through a service-only RPC and exposes aggregate counts, not customer details. Healthy returns 200; missing configuration, old/missing worker heartbeat, overdue/retrying work, inventory/financial review or inconsistent allocation returns 503. Unauthorized configured requests return 401. This endpoint does not execute a provider charge or prove Paystack availability.

The worker records a heartbeat only after its awaited sweep and jobs finish. Provider failure can leave a recent heartbeat plus retry counts; investigate both. Alert on an absent heartbeat beyond five minutes, overdue jobs, repeated provider failures, allocation inconsistency and unresolved manual review. Assign an owner and response target; neither is invented here.

Structured stdout events contain a fixed event/code vocabulary and bounded counts/UUIDs. Raw errors, bodies, addresses, email, passwords, tokens, provider secrets and full URLs are excluded. Events are rate bounded per process. Financial receipts, attempt/job state, histories and owner actions remain in the restricted database. Configure log retention/access and alert delivery on the actual platform; no paid monitoring service was added.

On a payment incident:
1. Preserve the relevant private payment records, sanitized correlation IDs and provider delivery evidence.
2. Prevent new checkout initialization if necessary by removing payment enablement through approved environment management. Keep webhook receipt and reconciliation operating where safe; stopping receipt delivery can lose liveness.
3. Compare verified provider reference/amount/domain with the immutable attempt. Never mark paid manually or repair by editing stock balances.
4. Use authorized re-verification. Paid inventory conflicts remain held; owners may allocate genuinely available units with a reason, once, or record a refund review. Duplicate collection and disputes require financial investigation.
5. Refund reviews are requests, not executed refunds. Actual merchant dashboard/API refund and dispute procedures, authorization, reconciliation and accounting clearance still need founder approval and sandbox proof.
6. Rotate compromised secrets and revoke affected Auth sessions. Retest before restoring checkout.

## Backups and restoration

The Phase 5 native PostgreSQL drill creates a real custom-format dump of application/auth-stub schemas, restores into a **different disposable database**, and verifies receipts, exact stock, RLS, executable functions and idempotent settlement after restoration. This is evidence of the local restore mechanism, not a hosted-project recovery guarantee.

For the merchant project, choose and approve backup frequency, retention, encryption, storage location, access controls, RPO and RTO. Do not assume a free account includes downloadable backups or PITR. Review the actual Supabase plan and current platform procedures. Database backups do not back up Storage object bytes; preserve the original PDF, garment assets, repository version, migration history and environment references separately. Never put secrets or customer backups in Git. [Supabase backups and recovery](https://supabase.com/docs/guides/platform/backups)

Before an actual hosted drill:
- Verify the source and **isolated destination project identifiers** and approved maintenance window.
- Use the provider-supported backup/restore procedure, including its managed Auth/schema guidance. Do not restore the native test dump or auth stub into Supabase.
- Restore into an isolated destination, configure separate keys and keep payments/indexing disabled.
- Compare stock/reservations, order snapshots, provider receipt uniqueness, job state, RLS, staff membership and migration versions. Re-run settlement replay tests and observe that stock stays unchanged.
- Reconcile provider activity since the snapshot before enabling any checkout. A database rewind does not rewind the external payment gateway.
- Record observed data-loss interval and recovery duration. Retain evidence and explicitly approve recovery readiness.

## Migration and application recovery

Migration 009 is forward-only: it repairs financial-review recording, makes schema access explicit for restoration, aligns owner-resolution audit reason length, and adds private worker health records. It does not rewrite financial history or remove transactions.

For a failed app release, restore the last **compatible** deployment and its environment configuration while preserving the database, webhook receipts and reconciliation. Never roll back to the vulnerable pre-009 financial guard. Review compatibility before reverting code; Phase 4's receipts remain authoritative. If a migration fails transactionally, diagnose in staging and ship a reviewed forward fix. Do not drop the application schema or restore over paid orders as an improvised rollback.

A database restore over a merchant environment is destructive and needs a separate explicit approval and gateway reconciliation plan. No such action was performed in Phase 5.

## Public launch gate

The release remains NOT READY — BLOCKERS REMAIN until the checklist has evidence for business configuration, hosted Auth/RLS, real Paystack test transactions/webhooks, a monitored scheduler, hosted recovery, support and policies, domain/HTTPS and founder approval. This phase does not implement or authorize a live-key switch. Live activation requires a separately reviewed change and approval.
