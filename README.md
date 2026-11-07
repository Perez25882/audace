# AUDACE

Phase 1 is a local, browsable menswear storefront for the first AUDACE release. It includes the homepage and collection, seven garment detail pages, and entry points for future commerce.

## Local development

Use Node.js 20.9 or newer and npm. From this folder, run:

```powershell
npm ci
npm run dev
```

Open [the local storefront](http://localhost:3000). Phase 1 runs without environment variables. See [.env.example](.env.example) for reserved configuration names.

```powershell
npm run lint
npm run typecheck
npm run build
npm start
```

Run `npm start` after building to serve the production version on port 3000.

## Routes

| Route | Phase 1 behavior |
| --- | --- |
| `/` | Editorial homepage and sleeve-filtered collection at `#collection` |
| `/products/[slug]` | Individual garment view with links to approved colour and sleeve combinations |
| `/bag` | Empty bag |
| `/checkout` | Checkout availability notice |
| `/order-confirmation` | Empty order state |
| Unknown route or variant | 404 with a link back to the collection |

## Implementation

Next.js App Router serves the layout, collection cards, and typed garment catalogue as server components. Product routes are prerendered from stable variant slugs. The collection filter uses client-side state and native toggle buttons. Product variant selectors use ordinary links so each approved combination has a shareable URL. An error boundary provides a retry action, and the product segment has a loading state.

Tailwind v4 exposes shared tokens alongside component styles in `src/app/globals.css`. The display and interface fonts are bundled locally. Next Image serves responsive derivatives of the lossless catalogue assets.

- [Garment asset inventory](docs/assets.md)
- [Design system](docs/design-system.md)
- [Phase 1 completion and Phase 2 plan](docs/phase-1.md)
- [Project rules](AGENTS.md)

The tooling follows the [Next.js App Router installation guide](https://nextjs.org/docs/app/getting-started/installation) and the [Tailwind CSS guide for Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
