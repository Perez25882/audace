# AUDACE project rules

- The user brief governs each phase. Treat the PDF as garment reference material and record any conflicts in the asset inventory.
- Preserve the approved illustrations and stable variant slugs. Keep the full source in `reference/` and web assets in `public/garments/`.
- Keep product facts grounded in approved sources. Gate bag actions on approved catalogue data. Gate payment and order creation on approved server workflows.
- Use strict TypeScript, server components by default, accessible native controls and shared design tokens.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` before reporting completion.
- Keep credentials in untracked local configuration. Deployment and live payments require approval.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
