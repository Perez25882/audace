# Phase 2 implementation and review

## Product experience

The Phase 1 homepage, PDF source, seven extracted illustrations and product URLs are preserved. The product detail view adds a collection breadcrumb, product name and catalogue SKU, visible price and availability states, a responsive gallery, and an original-resolution zoom dialog. The gallery supports multiple approved views. The current reference supplies one front view per variant.

| Colour | Short sleeve | Long sleeve |
| --- | --- | --- |
| Cream | AUD-CR-SS | AUD-CR-LS |
| Black | AUD-BK-SS | AUD-BK-LS |
| Burgundy | AUD-BG-SS | AUD-BG-LS |
| White | AUD-WH-SS | |

These are internal catalogue SKUs. They correspond to stable variant IDs for bag persistence and later database migration. Product links keep the current sleeve when that colour has it. Selecting White from a long-sleeve page opens White short sleeve. A variant change resets the size and quantity so the selection can be made against the new stock.

## Shopping and checkout

- The bag merges identical variant and size pairs, keeps separate lines for other selections, and checks the configured stock on quantity increases. Stale or withdrawn selections can be reduced or removed. Unavailable lines block checkout review.
- Browser storage keeps only versioned variant IDs, sizes and quantities. Malformed data and unsupported versions reset safely. Recognisable stale lines stay visible for removal. If browser storage fails, the bag is kept in memory for the current tab. Independent tabs receive storage changes. Simultaneous edits follow browser last-write behavior.
- The guest form validates contact details, Ghanaian phone format, a Ghanaian region, town or city, address, and a delivery method available in that region. Additional directions are optional. Contact details stay in the form during review.
- Checkout totals use the same integer-pesewa calculations as the bag. Review is disabled without a valid bag and approved delivery options. When configured, the review action validates the form and shows its result locally. The order confirmation page stays empty in this phase.

## Configuration still needed

Approve variant prices, size labels, per-size stock, the size guide, and any garment specifications. Approve shipping and returns copy and delivery options with region coverage and fees. Record approved values in `src/lib/merchant-config.ts`. Use integer pesewas for prices and fees. A null stock value means pending and zero means unavailable.

The approved assets are front-view illustrations. Zoom can reveal only the detail captured in each original image. The browser bag and quote are convenience features. They cannot authorize an order or guarantee inventory.

## Implementation map

| Area | Main files |
| --- | --- |
| Server catalogue and merchant configuration | `src/lib/catalogue.ts`, `src/lib/shop-model.ts`, `src/lib/merchant-config.ts` |
| Product detail | `src/app/products/[slug]/page.tsx`, `src/components/product-gallery.tsx`, `src/components/purchase-options.tsx` |
| Bag and quantities | `src/lib/bag.ts`, `src/lib/bag-store.ts`, `src/components/bag-link.tsx`, `src/components/bag-view.tsx`, `src/components/quantity.tsx` |
| Guest checkout and quote | `src/lib/checkout.ts`, `src/components/checkout-view.tsx`, `src/app/checkout/page.tsx` |
| Verification | `tests/shop.test.ts`, `tests/shop.browser.test.mjs`, `tests/fixtures/merchant-config.ts` |

## Phase 3

1. Move the approved catalogue, size stock, delivery methods, orders and payment attempts into versioned Supabase migrations. Preserve variant IDs and slugs and authorize data access with scoped roles. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
2. Recalculate the quote on the server from current prices, stock and delivery rules. Validate customer input there and create pending orders and inventory reservations transactionally.
3. Start Paystack integration in test mode. Verify current Ghana gateway availability for MTN Mobile Money, Telecel Cash, AirtelTigo Money and cards. Verify signed webhooks and reconcile reference, currency and amount before transitioning an order. [Paystack payment channels](https://paystack.com/docs/payments/payment-channels/), [Paystack webhooks](https://paystack.com/docs/payments/webhooks/)
4. Test replay, duplicate callbacks, expired stock reservations, access control and the confirmation path. Review launch readiness before authorizing live credentials or deployment.

The region choices and phone validation follow official Ghanaian references. [Ghana regional directory](https://www.isd.gov.gh/isd-across-ghana/), [National Communications Authority numbering plan](https://nca.org.gh/wp-content/uploads/2021/11/NUMBERING-PLAN-FOR-GHANA.pdf)

## Verification

| Check | Result |
| --- | --- |
| Phase 1 baseline | Lint, strict type checking and the production build passed before Phase 2 changes |
| `npm run lint` and `npm run typecheck` | Passed |
| `npm test` | Eight passing unit tests for selection, availability, bag editing, persistence, safe integer totals, and checkout validation |
| `npm run build` | Passed. All seven approved product URLs were prerendered |
| `npm run test:e2e` | Chrome journeys at 390 and 1440 px verified the blocked storefront and configured test flow. Every product URL was checked at 320 px |
| Accessibility scan | Axe reported zero violations on the homepage, product, zoom dialog, bag and checkout states tested at 390 and 1440 px |
| Artwork | The source PDF and seven WebP files match the Phase 1 Git baseline |
| `npm audit --omit=dev` | Zero production dependency vulnerabilities reported |

The full npm audit still reports eight moderate entries in the development-only lint chain, traced to the same minimatch advisory recorded in Phase 1. [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

Browser verification covered Chrome. Configured checkout was verified using synthetic data in a temporary application that is separate from the preview and the normal build.
