# AUDACE

AUDACE is a Ghanaian menswear storefront and private store operations console. The first release comprises seven approved garment illustrations from the supplied PDF.

## Local development

Install Git and Node.js 22.23.4 with its bundled npm. The Node version is recorded in `.nvmrc`; select it with your version manager before installing dependencies.

Start from a fresh clone:

```powershell
git clone https://github.com/Perez25882/audace.git
cd audace
npm ci
npm run dev
```

Open [the local storefront](http://127.0.0.1:3000). The collection, garment pages and interface work without an environment file, Supabase, Docker or Paystack credentials. With Supabase unconfigured, ordering and administrator sign-in are unavailable by design.

For a quick code check, run `npm run lint`, `npm run typecheck` and `npm test`. Stop the development server before running `npm run build` and then `npm start` to check the production build. The database and browser suites have additional prerequisites listed below.

### Database and payments

For local administration and database-backed commerce, install the Supabase CLI and a compatible container runtime. From the project folder:

```powershell
supabase start
supabase migration up --local
supabase status
```

Copy `.env.example` to `.env.local`. Set the API URL and publishable key from the local project's status output, set the app origin, and restart Next.js. For a hosted environment, use your project's API settings and actual HTTPS app origin. See the [Phase 3 operations guide](docs/phase-3.md) for initial administrator provisioning. The [Phase 4 payment guide](docs/phase-4.md) covers test-only Paystack credentials, channel approval, webhook signing, the required reconciliation scheduler and inventory exceptions. Payment keys remain server-only. Missing configuration disables payments safely.

The [deployment and recovery runbook](docs/deployment-runbook.md) and [release checklist](docs/release-checklist.md) govern staging preparation. Public indexing defaults off. Set an approved `AUDACE_PUBLIC_ORIGIN` and deliberately enable indexing only after review. Contact and legal copy stays unpublished until the founder provides approved text. Live keys remain rejected.

### Working together

Create a branch for each change, push it and open a pull request against `main`. The repository is public, so cloning does not require collaborator access. Direct pushes and branches in this repository require the owner to grant write access; contributors without it can use a fork.

Use your own isolated Supabase project and Paystack test configuration when backend work requires them. Keep credentials in the ignored `.env.local` file, and share access through the service's team controls or an agreed secure channel. Never paste keys into commits, pull requests or issues. `.env.example` documents the settings with credential fields left blank; automated payment tests generate disposable local values.

The [Phase 5 report](docs/phase-5.md) and [release checklist](docs/release-checklist.md) record remaining launch requirements. The local storefront is ready for development; a production launch still needs the documented merchant configuration and acceptance checks.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm run test:e2e
npm run test:qa
npm run test:perf
```

The database and browser suites use disposable local PostgreSQL clusters. Install PostgreSQL 17 client and server binaries and put them on PATH, or set `AUDACE_PG_BIN` to the bin directory. Browser tests also require Chrome. Run the production build before the browser suite.

Release QA also uses WebKit installed under `work/browsers`; setup commands are in the runbook. `npm run verify` executes lint, types, unit/database tests, build and both browser suites sequentially. Never run a build while browser or Lighthouse tests are serving `.next`. Performance evidence is laboratory data; physical-device, screen-reader, hosted merchant and real-user checks remain separate.

## Routes

| Route | Behavior |
| --- | --- |
| `/`, `/products/[slug]` | Database-backed collection and garment details, with an illustrations-only mode when Supabase is unconfigured |
| `/bag` | Browser-persisted bag, repriced from the current catalogue |
| `/checkout` | Guest validation, authoritative quote and configured test-mode hosted payment |
| `/payment-status` | Capability-protected verification, pending states and safe retry |
| `/order-confirmation` | Protected confirmation only for verified, allocated orders; empty state without order access |
| `/admin/login` | Private staff sign-in |
| `/admin` | Overview, catalogue, inventory, orders and delivery operations |
| `/admin/payments` | Private attempts, provider checks and exception visibility |
| `/api/payments/*` | Server initialization, owned verification and authenticated durable webhooks |
| `/api/internal/payments/reconcile` | Bearer-protected scheduled queue worker |
| `/api/health` | Public application liveness only |
| `/api/internal/health` | Bearer-protected database/queue/worker readiness aggregates |
| `/robots.txt`, `/sitemap.xml` | Opt-in indexing of published products; staging excluded |
| `/information` | Approved support/policy sections only; honest unavailable state until supplied |

Phase 3 moves merchant configuration to the protected admin. The catalogue migration seeds the approved garments and leaves prices, size SKUs, stock and delivery methods awaiting merchant entry. The original artwork and variant slugs are recorded in the [asset inventory](docs/assets.md). UI tokens remain in the [design system](docs/design-system.md).
