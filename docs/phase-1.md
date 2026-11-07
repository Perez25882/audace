# Phase 1 completion

## Acceptance criteria

- The local storefront renders from the npm lockfile with no credentials.
- Seven approved variants have an original illustration and a shareable detail URL.
- The catalogue, sleeve filter, variant navigation and bag entry point work on desktop and mobile.
- The loading state, empty bag, unavailable checkout, empty order confirmation, error retry and 404 return users to a useful next step.
- Lint, strict type checking and the production build pass.

## Decisions and limitations

- The release has one shared shirt design with seven illustrated colour and sleeve combinations. Stable variant slugs can be kept when the catalogue moves to a database.
- The Burgundy short-sleeve illustration anchors the homepage. A related detail spread crops the same image in the browser.
- Variant links keep the current sleeve length where the target colour has that illustration. Selecting White from a long-sleeve page takes the visitor to White short sleeve.
- The illustrated front views and text wordmark are the available brand assets. Product specifications, sizes, price, stock and delivery information await brand approval.
- The bag, checkout and confirmation routes describe their current state. Transactions, fulfilment and the private admin are outside Phase 1.

## Original Phase 2 proposal

See [the Phase 2 report](phase-2.md) for the scope delivered after this proposal.

1. Approve the commercial catalogue and operating rules. Confirm size matrix, variant identifiers, pricing and currency, available stock, shipping zones and fees, returns, and fulfilment.
2. Add versioned Supabase migrations for catalogue, inventory, orders, line items and payment attempts. Seed the seven variant slugs, authorize database access with scoped grants and row-level security, and add the private admin with explicit roles. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
3. Implement a persistent bag and a server-authoritative checkout quote. Validate sizes, quantities, inventory, pricing and shipping before creating an order. Apply inventory changes transactionally and handle reservation expiry.
4. Add Paystack in test mode. Initialize payments server-side, verify signed webhooks using the configured signature format, and reconcile the reference, amount and currency before marking an order paid. Make processing safe to repeat and keep the confirmation page tied to an authorized, verified order. [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [Paystack transaction verification](https://paystack.com/docs/payments/verify-payments/)
5. Verify success, failure, abandoned checkout, duplicate events, concurrent stock changes and access control in staging. Review the complete customer and operator journeys before requesting approval for deployment and live payments.

## Verification results

| Check | Result |
| --- | --- |
| `npm ci --dry-run --ignore-scripts --no-audit --offline` | Passed lockfile validation |
| `npm run lint` | Passed with zero warnings |
| `npm run typecheck` | Passed strict TypeScript and generated route types |
| `npm run build` | Passed. All seven product pages were prerendered |
| Chrome production smoke test | Passed at 1440 and 390 px. Covered keyboard navigation, collection filters, variant switching, image loading and the bag |
| Responsive layout sweep | Passed at 320, 480, 768, 896, 1024, 1199 and 1920 px |
| Chrome direct-route smoke test | Passed all seven detail pages, the bag, checkout, confirmation and HTTP 404 responses for missing pages and the unsupported White long-sleeve variant |
| axe scan | Zero detected violations on the homepage, a product page and the bag at both tested screen sizes |
| Asset fidelity | All seven assets matched the corresponding PDF raster dimensions and decoded RGB pixels |
| `npm audit --omit=dev` | Zero reported production dependency vulnerabilities |

Verification ran on Windows with Node.js 20.19.0. Automated browser coverage used Chrome. The full npm audit reported eight moderate entries in the development-only lint dependency chain, all traced to a single minimatch advisory. ESLint 9 is pinned for compatibility with the plugins shipped by the current Next.js ESLint preset. [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
