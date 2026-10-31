# Hilltop

A student marketplace for Ashesi: accounts verified to `@ashesi.edu.gh` emails, and payments held until the buyer confirms collection.

Built with Next.js 16 (App Router, Cache Components), Tailwind CSS v4, Framer Motion, react-hook-form + zod, and Poppins. There is no backend yet: everything runs on mock data behind a data layer that is ready to be swapped for API calls.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. Any `@ashesi.edu.gh` address and any 6-digit code will sign you in. **Settings → Reset demo** on `/me` restores the starting data.

## Scripts

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Development server                                       |
| `npm run build`     | Production build                                         |
| `npm test`          | Unit tests (Vitest)                                      |
| `npm run test:e2e`  | End-to-end tests (Playwright) against a production build |
| `npm run lint`      | ESLint                                                   |
| `npm run typecheck` | Generates route types, then runs TypeScript              |
| `npm run format`    | Prettier, including Tailwind class sorting               |

First-time e2e setup: `npx playwright install chromium`, then `npm run build && npm run test:e2e`.

A pre-commit hook (husky + lint-staged) formats and lints staged files. CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, unit tests, build and Playwright on every push.

## Features

- **Browse and search**: per-category filters generated from each category's schema, facet counts, price histogram slider, removable chips, sort, infinite scroll, saved searches with alerts. All filter state lives in the URL.
- **Listings**: multi-photo gallery with a magnifying lens and full-screen zoom, spec tiles, offers (sellers answer in the demo), chat, buyer protection, sold and sold-out states. Server-rendered titles, Open Graph images and Product JSON-LD.
- **Checkout**: Mobile Money or card, meet-up times; for food, quantity, pickup windows and same-day cut-offs, with stock going down after each order.
- **Orders**: buyer and seller views, Paid → Ready → Collected → Released timeline, payout status, disputes that freeze payment, reviews that feed seller ratings.
- **Selling**: dynamic fields per category, new categories created by sellers, custom details, drafts, edit, mark sold, renew, delete. Photos are compressed in the browser.
- **Messaging and notifications**: inbox with conversations per listing, notification centre, and system notifications when the app is in the background.
- **PWA**: installable, offline page, service worker, push-ready (see below).
- **Accessibility**: focus traps in dialogs and sheets, keyboard menus, skip link, reduced-motion support, WCAG AA text contrast in light and dark themes.

## Architecture

```
src/lib/
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

Categories come from three places, merged by `useCatalog()`: the built-ins in `catalog.ts`, ones returned by `fetchCategories()` (the mock adds "Tickets & events"), and ones sellers create.

### Connecting a backend

1. Replace the bodies in `src/lib/api.ts` with `fetch` calls.
2. Replace the actions in `src/lib/store.ts` with mutations against the API. The transitions in `model.ts` describe exactly what each endpoint should do.
3. Validate listing submissions on the server with `buildListingSchema()` from `validation.ts`.
4. For push notifications, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and implement `savePushSubscription` in `src/lib/push.ts`. The service worker in `public/sw.js` already handles `push` events.

## Tests

- `tests/unit`: search and filters, the order/dispute/chat/offer state machine, validation, queries, specs and formatting.
- `tests/e2e`: buying with protection through to a review, disputes, seller fulfilment, filters and URL state, search, keyboard sort menu, publishing and drafts, and mobile flows (filter sheet, chat, no horizontal scrolling).

Product photos load from Unsplash, so the app and e2e tests need internet access.
