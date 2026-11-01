# Hilltop

A student marketplace for Ashesi: accounts verified to `@ashesi.edu.gh` emails, and payments held until the buyer confirms collection.

Built with Next.js 16 (App Router, Cache Components), Tailwind CSS v4, Framer Motion, react-hook-form + zod, and Poppins. There is no backend yet: everything runs on mock data behind a data layer that is ready to be swapped for API calls.

The repository is an npm workspaces monorepo:

```
apps/web        The marketplace students use (port 3000)
apps/admin      The admin portal, deployed separately (port 3002)
packages/shared Platform config schema, permissions, catalog, seed data, formatting
packages/ui     Design system: tokens, primitives, charts, sheets, hooks
```

## Demo data

The demo sellers are Ashesi students and what they actually sell (calculators, braids, chapati, Eyecon glasses and so on), in `packages/shared/src/seed.ts`. Prices, ratings, review counts and sales figures are placeholders until real data comes from the backend; programme and class year are optional and only shown when a student adds them.

## Getting started

```bash
npm install
npm run dev          # marketplace on http://localhost:3000
npm run dev:admin    # admin portal on http://localhost:3002
```

Marketplace: any `@ashesi.edu.gh` address and any 6-digit code will sign you in. **Settings → Reset demo** on `/me` restores the starting data.

Admin: pick anyone from the demo team on the sign-in page to see what their role allows. **Reset demo data** is in the account menu.

To have the marketplace follow what the admin publishes, create `apps/web/.env.local` with:

```bash
NEXT_PUBLIC_CONFIG_URL=http://localhost:3002/api/config
```

## Scripts

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Marketplace development server                           |
| `npm run dev:admin` | Admin portal development server                          |
| `npm run build`     | Production builds of both apps                           |
| `npm test`          | Unit tests (Vitest) in every workspace                   |
| `npm run test:e2e`  | End-to-end tests (Playwright) against a production build |
| `npm run lint`      | ESLint                                                   |
| `npm run typecheck` | Generates route types, then runs TypeScript              |
| `npm run format`    | Prettier, including Tailwind class sorting               |

First-time e2e setup: `npx playwright install chromium`, then `npm run build -w @hilltop/web && npm run test:e2e`.

A pre-commit hook (husky + lint-staged) formats and lints staged files. CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, unit tests, build and Playwright on every push.

## Features

- **Browse and search**: per-category filters generated from each category's schema, facet counts, price histogram slider, removable chips, sort, infinite scroll, saved searches with alerts. All filter state lives in the URL.
- **Listings**: multi-photo gallery with a magnifying lens and full-screen zoom, spec tiles, offers (sellers answer in the demo), chat, buyer protection, sold and sold-out states. Server-rendered titles, Open Graph images and Product JSON-LD.
- **Checkout**: Mobile Money or card, meet-up times; for food, quantity, pickup windows and same-day cut-offs, with stock going down after each order.
- **Payment protection (hybrid)**: orders from a set price, or in chosen categories, are paid in the app and held; cheaper ones are reserved and paid to the seller at pickup, with optional protection. Pre-orders take a deposit. Held money is released when the buyer confirms collection, or automatically a set time after the seller marks it handed over unless a problem is reported. Every rule, including switching to "protect everything" or "pay at pickup only", is set in the admin under Settings → Payment protection.
- **Orders**: buyer and seller views, Paid → Ready → Collected → Released timeline, payout status, disputes that freeze payment, reviews that feed seller ratings.
- **Selling**: dynamic fields per category, custom details, drafts, edit, mark sold, renew, delete. Photos are compressed in the browser. Listings expire after a set number of days unless renewed, and each student has a cap on active listings.
- **Reporting and ranking**: students can report a listing with a reason; Best match orders listings by weighted freshness, photos, popularity, seller rating, paid promotion and the team's featured picks, which also get their own row on the home page.
- **Messaging and notifications**: inbox with conversations per listing (full-screen chat on phones, grouped messages, read state, keyboard-safe composer), notification centre, and system notifications when the app is in the background.
- **Seller dashboard**: views, saves, orders, conversion and payouts over 7, 30 or 90 days with period comparisons, a funnel, per-listing stats and suggestions.
- **PWA**: installable, offline page, service worker, push-ready (see below).
- **Accessibility**: focus traps in dialogs and sheets, keyboard menus, skip link, reduced-motion support, WCAG AA text contrast in light and dark themes.

## Admin portal

A separate Next.js app for running the marketplace. Nothing in the marketplace is hardcoded: fees, payment protection rules (threshold, protected categories, deposits, auto-release), listing expiry and caps, report reasons, ranking weights, featured listings, payment methods, promotion plans, pickup spots, conditions, listing limits, banned words, offer rules, dispute reasons and response time, popular searches, feature flags, events, the announcement banner, allowed email domains and the whole category catalog (including each category's fields and filters) come from a published config.

- **Overview**: sales volume, platform revenue, orders and active students with period comparisons, a category ranking, and the queues that need attention.
- **Operations**: users (verify, suspend, delete), listing moderation with reports, orders (refund or release payouts), and disputes with response-time tracking and decision notes. CSV export on every list.
- **Catalog and settings**: edit everything above. Changes go to a shared draft.
- **Publish**: a readable diff of the draft against what's live, validation, release notes, release history with rollback, JSON export and import.
- **Team and roles**: invite admins, assign roles, create roles and grant each permission in a matrix. Safeguards keep at least one owner and stop the owner role losing permissions.
- **Audit log**: every action, by whom and when, filterable and exportable.
- **Command palette**: Ctrl/Cmd+K jumps to any page, user, listing or order.

Permissions are defined in `packages/shared/src/permissions.ts` (each guards a real action); which roles hold them is configured in the portal. Every action goes through `apps/admin/src/lib/model.ts`, which checks the permission and writes the audit entry, so the rules are unit-tested.

The live config is served at `GET /api/config` (public, CORS-enabled, holds no secrets). Releases are stored in `apps/admin/.data/` (or `CONFIG_STORE_DIR`), with an in-memory fallback on read-only filesystems; swap `apps/admin/src/lib/config-store.ts` for a database when the backend lands. The marketplace caches the config for a few minutes on the server, refreshes it in open tabs on focus, and falls back to defaults if the portal is unreachable.

Admin identities and operational data are mock data in the browser for now. Publishing runs on the server and, when `ADMIN_ACCESS_KEY` is set, requires that key at sign-in. Keep the portal behind your host's access protection (for example Vercel deployment protection) until real authentication is added.

## Deploying

Both apps run on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`):

| App         | Worker          | Domain                      |
| ----------- | --------------- | --------------------------- |
| Marketplace | `hilltop-web`   | `hilltop.lumavok.com`       |
| Admin       | `hilltop-admin` | `admin.hilltop.lumavok.com` |

- **Automatic:** every push to `main` that passes CI is deployed by the `deploy` job in `.github/workflows/ci.yml`. It needs the `CLOUDFLARE_API_TOKEN` repository secret.
- **Manual:** `npm run deploy -w @hilltop/web` (or `@hilltop/admin`) after `npx wrangler login`. OpenNext isn't fully supported on Windows, so prefer CI.
- **Local Workers preview:** `npm run preview -w @hilltop/web` builds and serves the production Worker locally.
- **Config:** `apps/*/wrangler.jsonc` (bindings, domains, Sentry DSN), `apps/*/open-next.config.ts` (caching) and `apps/*/.env.production` (public build-time values). Secrets such as `ADMIN_ACCESS_KEY` are set in the Cloudflare dashboard.
- **Images:** `packages/ui/src/image-loader.ts` resizes Unsplash photos on Unsplash's CDN and serves other files as they are, since Workers have no built-in Next.js image optimiser.
- **Caching:** cached pages live in the `hilltop-web-opennext-cache` R2 bucket. Next's Cache Components are off because the adapter can hang requests with `"use cache"` on Next 16.4 (opennextjs-cloudflare#1464); the platform config uses fetch caching instead.
- **Errors:** Sentry wraps each Worker (`apps/*/worker.ts`) and the browser (`instrumentation-client.ts`).

The admin still stores published releases on the local filesystem, which Workers don't keep between requests. They move to Supabase in the next phase.

## Architecture

```
apps/web/src/lib/
  catalog.ts      Category schemas: each declares its attributes; filters, specs and the sell form are generated from them
  data.ts         Seed listings, sellers, reviews (the mock "database")
  types.ts        Domain types: orders, disputes, conversations, notifications, saved searches
  model.ts        Pure state transitions (placeOrder, markReady, openDispute, sendMessage...). No React, fully unit-tested
  store.ts        Client store: persists state, wraps model.ts, simulates the other side (seller replies, offer answers)
  queries.ts      Pure listing queries shared by server and client
  api.ts          The data layer. Async functions the server calls; swap these bodies for fetch() when the backend exists
  use-listings.ts Client counterpart of api.getListings that includes the user's own listings
  search.ts       Search scoring, filters, facets and their URL format
  validation.ts   Zod listing schema built per category; reusable on the server
  hooks.ts        Scroll lock, dismiss, focus trap, ticking clock, in-view
```

Categories come only from the published platform config (`packages/shared/src/config.ts`) and are managed by admins; sellers who need a new one ask the support team. `useCatalog()` returns the visible ones. `lib/config-server.ts` and `lib/config.tsx` load the config on the server and keep it fresh in the browser.

### Connecting a backend

1. Replace the bodies in `apps/web/src/lib/api.ts` with `fetch` calls.
2. Replace the actions in `apps/web/src/lib/store.ts` with mutations against the API. The transitions in `model.ts` describe exactly what each endpoint should do.
3. Validate listing submissions on the server with `buildListingSchema()` from `validation.ts`.
4. For push notifications, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and implement `savePushSubscription` in `apps/web/src/lib/push.ts`. The service worker in `apps/web/public/sw.js` already handles `push` events.

## Tests

- `apps/admin/tests/unit`: permissions and role safeguards, audit entries, moderation, refunds and disputes, drafts, metrics and CSV.
- `packages/shared/tests`: config parsing, diffs, email domains, banned words and role permissions.
- `apps/web/tests/unit`: search and filters, the order/dispute/chat/offer state machine, validation, queries, specs and formatting.
- `apps/web/tests/e2e`: buying with protection through to a review, disputes, seller fulfilment, filters and URL state, search, keyboard sort menu, publishing and drafts, the seller dashboard, and mobile flows (filter sheet, chat, no horizontal scrolling).

Product photos load from Unsplash, so the app and e2e tests need internet access.
