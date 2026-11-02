# Hilltop

A student marketplace for Ashesi: accounts verified to `@ashesi.edu.gh` emails, and payments held until the buyer confirms collection.

Built with Next.js 16 (App Router), Tailwind CSS v4, Framer Motion, react-hook-form + zod, Poppins and Supabase, running on Cloudflare Workers. Everything is real: sign-in, listings and photos, messages, offers, notifications, orders, reviews, the admin portal and the platform config. Paying in the app (Paystack) is the one piece still to come; until then every order is reserved in the app and paid to the seller at pickup.

The repository is an npm workspaces monorepo:

```
apps/web        The marketplace students use (port 3000)
apps/admin      The admin portal, deployed separately (port 3002)
packages/shared Platform config schema, permissions, catalog, seed data, formatting
packages/ui     Design system: tokens, primitives, charts, sheets, hooks
```

## Local demo data

The local database is seeded with Ashesi sellers and what they actually sell (calculators, braids, chapati, Eyecon glasses and so on), from `packages/shared/src/seed.ts`, plus a demo student, Kofi Darko, whose shop is claimed when you sign in as kofi.darko@ashesi.edu.gh. Prices and sales figures are placeholders. None of this is loaded into production.

## Getting started

Both apps need a Supabase. Locally that's the Supabase CLI with Docker running:

```bash
npm install
npx supabase start   # local Supabase; prints its URL and keys
npm run db:reset     # schema, default config and demo data
npm run dev          # marketplace on http://localhost:3000
npm run dev:admin    # admin portal on http://localhost:3002
```

Copy `apps/web/.env.example` and `apps/admin/.env.example` to `.env.local` in each app, with the local URL and publishable key (`npx supabase status`). `.env.local` takes precedence over the production values in `.env.production`.

**Signing in:** both apps email a 6-digit code (valid 10 minutes). Locally, emails go to Mailpit at http://127.0.0.1:54324. Only addresses on the allowed school domains (admin Settings → General) can create a marketplace account. The admin portal only lets in people on its team; the owner invited by `supabase/bootstrap.sql` is the first.

`npm run db:reset` puts the local database back to the seed.

## Scripts

| Command             | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Marketplace development server                                   |
| `npm run dev:admin` | Admin portal development server                                  |
| `npm run build`     | Production builds of both apps                                   |
| `npm test`          | Unit tests (Vitest) in every workspace                           |
| `npm run test:e2e`  | End-to-end tests (Playwright): production build + local Supabase |
| `npm run lint`      | ESLint                                                           |
| `npm run typecheck` | Generates route types, then runs TypeScript                      |
| `npm run format`    | Prettier, including Tailwind class sorting                       |

First-time e2e setup: `npx playwright install chromium`, then with the local Supabase running, `npm run build -w @hilltop/web && npm run test:e2e -w @hilltop/web`. The tests sign in for real, reading codes from Mailpit, and refuse to run against anything but a local Supabase.

A pre-commit hook (husky + lint-staged) formats and lints staged files. CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, unit tests, build, the database checks and Playwright (against a local Supabase) on every push.

## Features

- **Browse and search**: per-category filters generated from each category's schema, facet counts, price histogram slider, removable chips, sort, infinite scroll, saved searches with alerts. All filter state lives in the URL.
- **Listings**: multi-photo gallery with a magnifying lens and full-screen zoom, spec tiles, offers that sellers accept or decline, chat, sold and sold-out states. Server-rendered titles, Open Graph images and Product JSON-LD.
- **Checkout**: reserve and pay the seller at pickup, meet-up times; for food, quantity, pickup windows and same-day cut-offs, with stock going down after each order.
- **Payment protection (hybrid, once paying in the app is on)**: orders from a set price, or in chosen categories, are paid in the app and held; cheaper ones are reserved and paid to the seller at pickup, with optional protection. Pre-orders take a deposit. Held money is released when the buyer confirms collection, or automatically a set time after the seller marks it handed over unless a problem is reported. Every rule, including switching to "protect everything" or "pay at pickup only", is set in the admin under Settings → Payment protection.
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

Published releases live in the `config_releases` table and the shared draft in `config_draft`; the marketplace reads the newest release through the public `current_config` view, caches it for two minutes on the server, refreshes it in open tabs on focus, and falls back to defaults if Supabase is unreachable.

Admins sign in with an emailed code; `apps/admin/src/lib/session.tsx` loads their team row and role. The database enforces every permission with row-level security, so the portal hiding a control is only a convenience. The team, roles, drafts, releases and audit log are stored in Supabase; so are students (with their emails, for admins with users.view), listings and reports, orders and disputes, loaded in `apps/admin/src/lib/operations.ts`. On production the portal also sits behind Cloudflare Access.

## Deploying

Both apps run on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`):

| App         | Worker          | Domain                      |
| ----------- | --------------- | --------------------------- |
| Marketplace | `hilltop-web`   | `hilltop.lumavok.com`       |
| Admin       | `hilltop-admin` | `admin.hilltop.lumavok.com` |

- **Automatic:** every push to `main` that passes CI is deployed by the `deploy` job in `.github/workflows/ci.yml`. It needs the `CLOUDFLARE_API_TOKEN` repository secret.
- **Manual:** `npm run deploy -w @hilltop/web` (or `@hilltop/admin`) after `npx wrangler login`. OpenNext isn't fully supported on Windows, so prefer CI.
- **Local Workers preview:** `npm run preview -w @hilltop/web` builds and serves the production Worker locally.
- **Config:** `apps/*/wrangler.jsonc` (bindings, domains, Sentry DSN), `apps/*/open-next.config.ts` (caching) and `apps/*/.env.production` (public build-time values). Secrets, when needed, are set in the Cloudflare dashboard.
- **Images:** `packages/ui/src/image-loader.ts` resizes Unsplash photos on Unsplash's CDN and serves other files as they are, since Workers have no built-in Next.js image optimiser.
- **Caching:** cached pages live in the `hilltop-web-opennext-cache` R2 bucket. Next's Cache Components are off because the adapter can hang requests with `"use cache"` on Next 16.4 (opennextjs-cloudflare#1464); the platform config uses fetch caching instead.
- **Errors:** Sentry wraps each Worker (`apps/*/worker.ts`) and the browser (`instrumentation-client.ts`).

## Database

Supabase (Postgres) holds everything; the schema lives in `supabase/migrations`.

- **Local:** `npx supabase start` (needs Docker), then `npm run db:reset` to rebuild with the seed, `npm run db:test` for the security tests, `npm run db:types` to regenerate `packages/shared/src/database.types.ts`.
- **Seed:** `npm run db:seed-files` regenerates `supabase/bootstrap.sql` (roles, default config, owner invite; also used on production) and `supabase/seed.sql` (demo sellers and listings; local only) from the shared TypeScript data.
- **Security model:** every table is closed by default; access is granted column by column and filtered by row-level policies. Admin powers come from `has_permission()`, which reads the roles and team managed in the admin portal. Profiles can exist before their owner signs up: the team creates a seller's shop with a claim email, and the student's first sign-in with that email links it.
- **Sign-up rules:** the `before_user_created` Auth Hook (`private.hook_before_user_created`) only lets school emails and invited admins create accounts; `handle_new_user` creates the profile, links a claimed shop and activates an admin invite. Sign-in emails use `supabase/templates/code.html`.
- **CI** applies the migrations to a fresh database and runs the security tests, the schema linter and Supabase's advisors on every push.

## Architecture

```
apps/web/src/lib/
  catalog.ts      Category schemas: each declares its attributes; filters, specs and the sell form are generated from them
  market.ts       Public listings and sellers from Supabase; market-server.ts caches them on the server for a minute
  mine.ts         The student's own listings, photos (uploaded via /api/photos to R2), saved items, searches and reports
  social.ts       Conversations, messages, offers and notifications, live via Supabase Realtime with polling as a fallback
  orders.ts       Orders and reviews; the database prices orders and allows only valid status changes
  types.ts        Domain types: orders, disputes, conversations, notifications, saved searches
  model.ts        Pure state transitions, used for instant updates before the database confirms. Fully unit-tested
  store.ts        Client store: loads the student's data, applies changes optimistically and writes them to Supabase
  queries.ts      Pure listing queries shared by server and client
  api.ts          Server-side reads for pages
  use-listings.ts Client counterpart of api.getListings that includes the user's own listings
  search.ts       Search scoring, filters, facets and their URL format
  validation.ts   Zod listing schema built per category; reusable on the server
  hooks.ts        Scroll lock, dismiss, focus trap, ticking clock, in-view
```

Categories come only from the published platform config (`packages/shared/src/config.ts`) and are managed by admins; sellers who need a new one ask the support team. `useCatalog()` returns the visible ones. `lib/config-server.ts` and `lib/config.tsx` load the config on the server and keep it fresh in the browser.

### Rules the database enforces

Students write with plain inserts and updates; triggers and row-level security decide what's allowed, so a modified app can't get around them: listing limits from the published config (price cap, banned words, active listing cap), offer minimums, order pricing (an accepted offer counts) and status moves, stock, suspended accounts, and rate limits on messages, offers, orders and reports. Notifications are written by the database when something happens to someone. See `supabase/migrations` and the tests in `supabase/tests`.

### Still to come

- Paying in the app (Paystack), which switches on buyer protection, deposits and promotion (`payments.inApp` in the config).
- Deleting accounts from the portal, which needs the Supabase secret key as a Worker secret.

### Push notifications

When the database writes a notification, it asks the marketplace to deliver it (`net.http_post` to `private.settings.push_url`, which is `/api/push` on production and the dev server locally). `/api/push` loads it with the server key, claims it so it's sent once, encrypts it (RFC 8291) and signs it (VAPID, RFC 8292) with WebCrypto in `apps/web/src/lib/web-push.ts`, and sends it to every browser in `push_subscriptions` for that student. Browsers register when the student turns notifications on, and are removed on sign-out.

Production needs, on the `hilltop-web` Worker: the `SUPABASE_SECRET_KEY` and `VAPID_PRIVATE_KEY` secrets, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `apps/web/.env.production`. Generate the pair with `npx web-push generate-vapid-keys`.

### Records

Orders copy both students' names when placed, and the audit log is never rewritten, so both stay complete after an account is deleted. Edited and deleted messages keep their earlier text in `message_revisions`, readable only by the team. Browsing and search history belong to the account (`browsing_history`, `search_history`), like the big shops: they follow the student across devices and are cleared from a browser when they sign out.

### Backups

`.github/workflows/backup.yml` dumps the production database nightly into the private `hilltop-backups` R2 bucket once the `SUPABASE_DB_URL`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` repository secrets exist.

## Tests

- `apps/admin/tests/unit`: permissions and role safeguards, audit entries, moderation, refunds and disputes, drafts, metrics and CSV.
- `packages/shared/tests`: config parsing, diffs, email domains, banned words and role permissions.
- `apps/web/tests/unit`: search and filters, the order/dispute/chat/offer state machine, validation, queries, specs and formatting.
- `apps/web/tests/e2e`: real sign-up and sign-in with emailed codes, two students messaging and agreeing an offer, reserving and handing over, cancelling, buying with protection through to a review, disputes, seller fulfilment, filters and URL state, search, keyboard sort menu, publishing and drafts, the seller dashboard, and mobile flows (filter sheet, chat, no horizontal scrolling).

Product photos load from Unsplash, so the app and e2e tests need internet access.
