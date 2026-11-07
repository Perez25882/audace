# AUDACE

AUDACE is a local menswear storefront for the first release. Phase 2 adds garment zoom, size and quantity selection, a persistent bag, and guest checkout review to the Phase 1 collection.

## Local development

Use Node.js 20.9 or newer and npm. From this folder, run:

```powershell
npm ci
npm run dev
```

Open [the local storefront](http://localhost:3000). The storefront runs without credentials. See [.env.example](.env.example) for reserved configuration names.

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm start
```

Browser tests require a locally installed Chrome. They launch the production build and a temporary, independent build with clearly labelled test data. `npm start` serves the normal production build on port 3000.

## Routes

| Route | Behavior |
| --- | --- |
| `/` | Editorial homepage and sleeve-filtered collection at `#collection` |
| `/products/[slug]` | Prerendered garment detail, image gallery and approved colour and sleeve navigation |
| `/bag` | Persistent, editable bag with stock checks and integer-pesewa subtotals |
| `/checkout` | Guest delivery form, validation and order summary. Review depends on configured stock, prices and delivery |
| `/order-confirmation` | Empty order state |
| Unknown or unpublished variant | HTTP 404 with a link back to the collection |

## Merchant configuration

Use [src/lib/merchant-config.ts](src/lib/merchant-config.ts) for merchant-approved prices in pesewas, size labels and per-size stock, publish state, specifications, size guidance, and delivery options. Use the existing public variant slugs as keys. The shipped configuration is empty. Missing prices, sizes or stock disable adding the affected item to the bag. Delivery methods need explicit region coverage and fees. Rebuild the production site after updating this file.

## Implementation

Next.js App Router prerenders the collection and product routes from the server catalogue. Only interactive controls and shopping views use client components. The bag stores variant IDs, size labels and quantities in browser local storage. Prices and stock come from the catalogue in the current build. Shared bag and checkout functions validate quantities and compute estimates in integer pesewas. Checkout details stay on the form in the current page.

Tailwind v4 exposes shared tokens alongside component styles in `src/app/globals.css`. Local fonts and responsive derivatives of the PDF rasters serve the storefront. The zoom dialog uses the original WebP.

- [Garment asset inventory](docs/assets.md)
- [Design system](docs/design-system.md)
- [Phase 1 completion](docs/phase-1.md)
- [Phase 2 implementation and review](docs/phase-2.md)
- [Project rules](AGENTS.md)

The tooling follows the [Next.js App Router installation guide](https://nextjs.org/docs/app/getting-started/installation) and the [Tailwind CSS guide for Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
