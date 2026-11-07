# AUDACE

AUDACE is a Ghanaian menswear storefront and private store operations console. The first release comprises seven approved garment illustrations from the supplied PDF.

## Local development

Use Node.js 22 or newer and npm. From this folder, run:

```powershell
npm ci
npm run dev
```

Open [the local storefront](http://127.0.0.1:3000). With the Supabase settings blank, the app serves the illustrated collection with ordering unavailable.

For local administration and database-backed commerce, install the Supabase CLI and a compatible container runtime. From the project folder:

```powershell
supabase start
supabase migration up --local
supabase status
```

Copy `.env.example` to `.env.local`. Set the API URL and publishable key from the local project's status output, set the app origin, and restart Next.js. For a hosted environment, use your project's API settings and actual HTTPS app origin. See the [Phase 3 operations guide](docs/phase-3.md) for initial administrator provisioning. The [Phase 4 payment guide](docs/phase-4.md) covers test-only Paystack credentials, channel approval, webhook signing, the required reconciliation scheduler and inventory exceptions. Payment keys remain server-only. Missing configuration disables payments safely.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm run test:e2e
```

The database and browser suites use disposable local PostgreSQL clusters. Install PostgreSQL 17 client and server binaries and put them on PATH, or set `AUDACE_PG_BIN` to the bin directory. Browser tests also require Chrome. Run the production build before the browser suite.

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

Phase 3 moves merchant configuration to the protected admin. The catalogue migration seeds the approved garments and leaves prices, size SKUs, stock and delivery methods awaiting merchant entry. The original artwork and variant slugs are recorded in the [asset inventory](docs/assets.md). UI tokens remain in the [design system](docs/design-system.md).
