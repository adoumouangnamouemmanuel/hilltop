# Hilltop

A student marketplace for Ashesi: listings verified to `@ashesi.edu.gh` emails, and payments held until the buyer confirms collection.

Built with Next.js 16 (App Router, Cache Components), Tailwind CSS v4, Framer Motion and Poppins. There is no backend yet. Everything runs on mock data.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Pages

| Route                  | What it does                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                    | Rotating headline, big search, an animated phone that walks through buying (find, pay into hold, meet, release), category icons, live activity ticker, product rows                                                                                                                |
| `/browse`              | Search and categories. Filters are generated per category (brand, storage, model, material, dietary and so on), with facet counts, a price histogram slider, removable chips and sort. Mobile uses a drag-to-dismiss sheet. Everything lives in the URL (`f.brand=Apple,Samsung`). |
| `/listing/[id]`        | Multi-photo gallery with a magnifying lens (scroll to change zoom), full-screen viewer with double-tap zoom and swipe, spec tiles from the category schema, offers, messages, seller card                                                                                          |
| `/seller/[id]`         | Seller profile with stats, listings and reviews                                                                                                                                                                                                                                    |
| `/sell`                | Up to 8 photos, category picker with "New category", fields generated from the category schema, custom details, price guidance, promotion                                                                                                                                          |
| `/me`, `/saved`        | Purchases with payment-hold tracking, your listings, saved items                                                                                                                                                                                                                   |
| `/move-out`            | End-of-semester sale page with countdown                                                                                                                                                                                                                                           |
| `/sign-in`, `/sign-up` | Split-screen auth with a photo panel. Microsoft SSO button and email code (any 6 digits work in the demo)                                                                                                                                                                          |

Light, dark and system themes are supported everywhere (header toggle, account menu, footer).

## Categories are data, not code

Every category in `src/lib/catalog.ts` declares its attributes (`select`, `text`, `number`, `boolean`) and which ones are filterable. Filters, listing specs and the sell form are all generated from that schema, so adding a category means adding one object.

Categories come from three places, merged by `useCatalog()`:

1. Built-in ones in `catalog.ts` (available at render time).
2. Ones returned by the API, `fetchCategories()` in `src/lib/api.ts`. The mock adds "Tickets & events" this way.
3. Ones sellers create from the Sell page.

## Where things live

- `src/lib/catalog.ts`: category schemas
- `src/lib/data.ts`: mock listings, sellers, reviews, activity feed, fee rate (4%), boost plans, sale dates
- `src/lib/search.ts`: search scoring, attribute filters, facets and their URL format
- `src/lib/store.ts`: client store (`useSyncExternalStore`, persisted to `localStorage`). Swap these actions for API calls when `../api` is ready.
- `src/lib/theme.ts`, `src/lib/toast.ts`: theme switching and toasts
- `src/app/globals.css`: semantic colour tokens for light and dark (`canvas`, `elevated`, `surface`, `ink-*`, `maroon-*`)

Product photos are loaded from Unsplash, so the app needs internet access.
