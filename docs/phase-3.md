# Phase 3 operations and review

## Implementation

The existing Next.js storefront reads a dedicated Supabase RPC for published products, assets, active sizes, prices, reservation-adjusted availability, and active delivery options. An unconfigured checkout shows the illustrations-only state. A configured database outage blocks purchases and shows a temporary availability message. The browser bag still contains only variant IDs, sizes and quantities.

The guest checkout sends the form to a server action for validation. The database recalculates the quote from the current catalogue, stock and delivery fee. Checkout reports price changes and stops at delivery review. Contact details used for review are ephemeral. The separate internal pending-order operation is available to trusted server integrations and exercised against a disposable database.

## Migrations

| Migration | Contents |
| --- | --- |
| `20261107000100_shop_schema.sql` | Catalogue, images, size SKUs, stock, delivery, settings, admin roles, orders, contact, items, reservations, movements, status history and audit. Adds constraints, indexes and RLS |
| `20261107000200_order_operations.sql` | Published shop and quote projections, atomic pending creation, payment failure and cancellation release, expiry sweep and trusted stock finalization |
| `20261107000300_admin_operations.sql` | Role-checked catalogue, stock, delivery and order operations, dashboard counts and audit records |
| `20261107000400_locked_catalogue.sql` | One product, seven variants and seven original image records. Reapplying the seed preserves merchant edits |

There is one price per colour and sleeve variant, shared by that variant's sizes. Each size has a unique purchasable SKU and independent on-hand balance. Order items snapshot the approved price, variant, size and SKU. Money uses integer pesewas throughout. Delivery uses explicitly approved region and method pairs.

Apply the files in timestamp order through Supabase migrations. The first three migrations create the schema and its interfaces. The fourth is a separate, idempotent data migration. After applying the migrations to a persistent environment, fix subsequent issues in new migrations. Reverting the app to Phase 2 leaves the database records available for recovery. Dropping the schema would delete operational records and requires a separate, approved recovery plan.

## Administrator provisioning

1. Disable public account creation in Supabase Auth. The included local config does this.
2. In Supabase's protected Auth administration, create the approved staff account and confirm the identity and account UUID. Set a unique password through the merchant's private provisioning process.
3. Use the SQL editor or an authorized database session to assign the first owner. Replace the UUID with the verified account ID.

   ```sql
   insert into public.audace_admins (user_id, role)
   values ('<verified-auth-user-uuid>', 'owner');
   ```

4. Use `operator` for staff who manage stock and fulfilment. Owners can also edit catalogue and delivery settings. For revocation, remove the membership through an authorized database session and revoke the affected Auth sessions.

Staff sign in at `/admin/login`. Each protected page and action verifies the Auth user and database membership. Mutations independently check the required role in PostgreSQL. The proxy refreshes admin sessions and returns private, non-cacheable responses. Cookies are HttpOnly and SameSite Lax, with Secure on HTTPS and an eight-hour cookie lifetime per refresh. Loopback HTTP for local development requires the explicit loopback app origin. Configure Auth session time-box, inactivity limits and staff MFA policy before hosted use, as supported by the selected Supabase plan. [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [Supabase sessions](https://supabase.com/docs/guides/auth/sessions)

The console provides metrics for orders, fulfilment and SKU stock, and counts revenue only from verified paid orders. It provides catalogue publishing and size configuration, inventory search and adjustments with reasons, recent movements, order search and status filters, order details and timeline, and delivery settings. Catalogue cards show the source artwork, offer a private listing preview, and link to the public page for published variants.

## Order and inventory lifecycle

1. **Quote.** The database validates distinct SKU selections, quantities, publication, configured price, current availability and the approved delivery method. Review reads stock.
2. **Reserve.** A trusted caller can request a pending order with a UUID idempotency key. PostgreSQL serializes retries for that key, locks product and SKU rows in a deterministic order, checks stock again and writes the order, contact, snapshots, history and 15-minute holds in one transaction. Replays return the existing order. Reuse with changed inputs fails.
3. **Expire or release.** Failed or cancelled payment releases holds without altering on-hand stock. Expired holds stop reducing available stock immediately. The maintenance sweep records expired orders as cancelled and releases their rows in bounded batches with `SKIP LOCKED`.
4. **Finalize.** The restricted function is reserved for a future trusted payment verifier. It requires the exact amount, GHS, a unique verification reference and unexpired holds. In one transaction it deducts physical stock, writes movements, finalizes the reservations and records verified payment. Replay of the same verification has no effect.
5. **Fulfil.** A paid order can move from unfulfilled to processing, shipped and delivered. Operators can cancel an unpaid pending order. Failed and cancelled payments require cancelled fulfilment. Refunded is reserved in the schema for a verified refund flow.

Run `select public.audace_expire_orders(200);` as a database operator for recovery. For continuous maintenance on Supabase with Cron enabled, schedule that statement every minute under an authorized database role. Monitor completed job runs and catch up by repeating the batch until it returns zero. A delayed job can leave the operational status pending until the sweep runs. Sellable stock still recovers at expiry. [Supabase Cron](https://supabase.com/docs/guides/cron)

## Security review and founder decisions

- RLS denies order, contact, inventory and audit reads to guests and authenticated users without a staff assignment. Role memberships can be written only by an authorized database operator. The public RPCs return scoped catalogue and quote data. Admin APIs use the staff session. The service key stays in server configuration for the isolated order path and future trusted integration.
- Sensitive input is bounded and validated server-side, and SQL uses typed parameters. React escapes editable copy. Next.js server actions enforce same-origin checks. Admin responses disable framing and caching. Password attempts use Supabase Auth controls plus per-process throttling, and checkout review uses a bounded per-process rate limit. Set gateway-level rate limits before exposing multiple app instances or allowing direct public traffic to the quote RPC.
- Orders use random public references. Customer access to order details requires a separate Phase 4 capability or authentication mechanism. The Phase 3 public confirmation route displays an empty state.
- Approve exact prices, SKU names and sizes, physical counts, publication decisions, delivery areas and fees, the returns copy, staff membership, and operational low-stock thresholds before configuring the store.
- Approve retention and access policies for contact and delivery data, including the deletion interval for expired pending orders. The data model separates contact records from financial snapshots so a later privacy process can remove contact details independently.
- Before authorizing Phase 4, test Supabase Auth and API behavior against the merchant's own non-production project. Confirm webhook verification, currency and amount reconciliation, late payment handling after a hold expires, and refund behavior in the Paystack sandbox.

## Actual verification results

| Check | Result |
| --- | --- |
| Phase 2 baseline | Lint, TypeScript, eight unit tests, production build and both browser journeys passed before implementation |
| Lint and strict TypeScript | Passed |
| Unit tests | 8 passed, including bounded untrusted checkout input, quantities, stale persistence and safe integer arithmetic |
| PostgreSQL integration | 5 passed on an isolated PostgreSQL 17 cluster. Applied all four migrations, reapplied the seed, tested constraints and SKU uniqueness, scoped RLS and roles, owner edits, authoritative quotes, simultaneous final-unit requests, idempotency, expiry, release, finalization, movements and permitted transitions |
| Chrome browser journeys | 2 passed. Verified 390 and 1440 px shopping, seven product pages at 320 px, database-backed prices, server quote updates, outage handling, role denial, admin authentication, an audited stock adjustment and cookie cleanup on logout |
| Production build | Passed with request-time rendering for commerce and protected admin routes |
| Production dependency audit | Zero reported vulnerabilities |
| Garment assets | Git comparison confirms the seven WebP assets and source PDF match the Phase 2 baseline |

The local database suite supplies isolated equivalents of Supabase's auth roles and `auth.uid()`. Browser integration uses a test HTTP gateway connected to that real database, with a synthetic Auth protocol for session checks. Supabase-hosted Auth, PostgREST and project configuration require verification against the merchant's own non-production project. No external project credentials were available during this phase.

A Windows test-cluster startup hang was corrected by preventing child processes from inheriting the startup pipes. A later browser run was interrupted during a prolonged host pause. The fresh rerun passed both journeys. The final code and database checks have no unresolved test failures.

Use Node.js 22 or newer for the current Supabase SDK. Approving the merchant's catalogue and delivery data, staff identities, retention policy and hosted security configuration are the remaining founder decisions before Phase 4 sandbox integration.
