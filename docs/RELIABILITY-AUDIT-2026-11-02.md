# Marketplace reliability and UX audit — 2 November 2026

## Scope and confidence

Source review of the marketplace, admin portal, shared state, Supabase migrations, service worker, upload API, push pipeline and CI configuration. This supplements the older `audit.md`; its findings were checked against the current implementation rather than assumed to remain open. The working tree was clean before this work.

Confirmed below means a code path exists, not that a production incident was reproduced. No production accounts were changed, no production database was queried, and no push was sent. This is not proof that every application path is correct. Deployment secrets, applied migrations, RLS behavior under real sessions, browser compatibility and performance measurements still require runtime verification.

## Findings and priorities

### R01 — Push permission is reported as successful registration

- **Severity / priority:** High / P1.
- **Location / evidence:** `apps/web/src/lib/push.ts:18–30,59–80` catches subscription failures; a missing VAPID public key returns null; the subscription upsert result is not checked. `components/notifications.tsx` displays “Notifications on” whenever browser permission is granted.
- **Impact / root cause:** A user can believe closed-app notifications work when no server subscription exists. Browser permission and successful backend registration are treated as the same state.
- **Fix:** Return typed registration results; check database errors; show success only after registration; expose retry and a test-notification action. Model unsupported, denied, registering, registered and failed states separately, including registration failure after permission has already been granted.

### R02 — Transient push failures permanently lose deliveries

- **Severity / priority:** High / P1.
- **Location / evidence:** `apps/web/src/app/api/push/route.ts:45–72` sets `pushed_at` before reading subscriptions or sending, ignores query errors, converts transport exceptions to status 0 and still returns success. The database webhook in `20261103100000_audit_remediation.sql:1220` queues a request; there is no durable per-device retry workflow in the reviewed implementation.
- **Impact / root cause:** A temporary network failure, push-provider 429/5xx, process interruption or subscription-read error consumes the one attempt. Requests older than five minutes are discarded.
- **Fix:** Transactional outbox plus per-subscription delivery records, expiring worker claims, bounded backoff with Retry-After, attempt counts and terminal-failure monitoring. Keep the distinction between provider acceptance and actual device delivery. Simply moving `pushed_at` after sending would introduce duplicate-send races.

### R03 — Sign-out can leave a live push subscription behind

- **Severity / priority:** High / P1, shared-device privacy.
- **Location / evidence:** `push.ts:33–37` deletes the database subscription without checking the result and never calls `PushSubscription.unsubscribe()`. `store.ts:294` ignores cleanup exceptions.
- **Impact / root cause:** If cleanup fails while offline, the browser can continue receiving the previous student's private notification text after sign-out. Endpoint reassignment can also fail under ownership RLS when its former row remains.
- **Fix:** Unsubscribe locally even when database cleanup fails; queue or expire server cleanup; test offline sign-out and account switching. A cleanup failure must not prevent clearing the local session.

### R04 — Listing details and photo replacement are not atomic

- **Severity / priority:** High / P1.
- **Location / evidence:** `apps/web/src/lib/mine.ts:138–171` writes the listing, deletes all photo rows, then inserts replacements through three separate requests.
- **Impact / root cause:** Failure after deletion leaves a real listing without photos. A new listing can exist despite the UI reporting failure, and a retry can collide with its existing ID. Concurrent editors can mix or overwrite changes.
- **Fix:** One authorized database function that validates and writes listing fields and photo rows in a transaction; add revision checks for edits and an idempotency key for creation. Upload objects first, then commit references; clean unused objects asynchronously.

### R05 — Photo storage silently falls back to process memory

- **Severity / priority:** High / P1 when deployed without a working PHOTOS binding.
- **Location / evidence:** `apps/web/src/lib/photos-server.ts:25–34,54–69` catches Cloudflare context errors and uses a module Map when no bucket is available, without restricting this fallback to local environments.
- **Impact / root cause:** Upload can appear successful but vanish on process restart or another Worker isolate. A production configuration failure is treated like local development.
- **Fix:** Allow memory storage only behind explicit local/test configuration; fail production uploads with an actionable 503 and report the binding error. Add a deployed storage round-trip health check. Validate upload bookkeeping when bucket writes fail.

### R06 — Read failures masquerade as empty or missing data

- **Severity / priority:** Medium / P1.
- **Location / evidence:** `market-server.ts:10–42` returns an empty market, no reviews, or null after read failures. `mine.ts:48`, `social.ts:57`, `orders.ts:96` return null without user-facing error state. Admin `team.ts:loadTeam` and `audit.ts:loadAudit` ignore query errors.
- **Impact / root cause:** An outage looks like “nothing here”, a listing not found, or an empty audit log. Social refresh combines all reads, so one failed orders query prevents fresh messages from being applied too.
- **Fix:** Explicit loading/success/stale/error results per resource; retain last-good data with a visible timestamp; offer retry. Reserve 404 for a successful lookup that returned no row. Do not block inbox refresh on an unrelated orders read.

### R07 — Read receipts and some writes ignore failures

- **Severity / priority:** Medium / P2.
- **Location / evidence:** `social.ts:175–208` ignores errors when marking messages/notifications read. Several helpers use optional `supabase()?.… ?? {}` and pass undefined errors to `problem`, which means success; `mine.ts:setSavedRemote` explicitly returns null without a client.
- **Impact / root cause:** Optimistic read/saved/offer state can claim a write succeeded without a backend operation. Unread badges may reappear after refresh.
- **Fix:** Require a configured client for writes, return explicit failure results, reconcile optimistic state and distinguish transient synchronization failures from completed writes.

### R08 — Failed message sends discard the composer text

- **Severity / priority:** Medium / P1.
- **Location / evidence:** `app/inbox/inbox-view.tsx:Thread.send` invokes async send/edit without awaiting and immediately clears text. `store.ts:sendMessage` toasts a failure and refreshes, without retaining a durable failed-send item.
- **Impact / root cause:** Students lose typed text and cannot simply retry, especially on unstable connections.
- **Fix:** Preserve draft text per thread; show pending/sent/failed message states and retry using a client message ID with a server uniqueness constraint. Do not promise background synchronization until an actual queue exists.

### R09 — Dispute replies have no notification path

- **Severity / priority:** Medium / P1.
- **Location / evidence:** `20261103100000_audit_remediation.sql:779–804` implements `add_dispute_message` by inserting a message only. Reviewed migrations contain notifications for opening and resolving cases, but no notification trigger on `dispute_messages`. The marketplace dispute sheet only exposes opening a case, not this conversation.
- **Impact / root cause:** Database capability, user UI and notification coverage are incomplete as an end-to-end workflow.
- **Fix:** Add an authorized case conversation UI, notification recipients for buyer/seller/admin replies, safe deep links, read state, and tests excluding the author from their own reply alert.

### R10 — Browsing scales with the whole market and has inconsistent pagination

- **Severity / priority:** Medium / P2; rises with catalog growth.
- **Location / evidence:** `market.ts:145–179` loads up to 10,000 listings, but seller and rating queries are unpaginated. `build` drops cards whose seller is absent. `api.ts:searchListings` filters/paginates only after loading the market.
- **Impact / root cause:** Payload, hydration and filtering costs grow with total catalog size, even for a small visible page. If sellers exceed the configured PostgREST row cap, valid listings are dropped; the actual deployment cap was not inspected.
- **Fix:** Server-side filters, indexed keyset pagination and bounded result sets; fetch seller data for only returned cards. Until then, page sellers/ratings consistently. Measure payload bytes, LCP/INP, memory and query times before claiming speed gains.

### R11 — Hidden/deleted listings remain in open-tab incremental data

- **Severity / priority:** Medium / P2.
- **Location / evidence:** `market.ts:182–207` merges only returned changed rows; hidden/deleted rows disappear from public queries and therefore cannot remove their cached copies. Full reconciliation runs every 30 minutes when refresh is invoked.
- **Impact / root cause:** A stale card may remain visible until a full refresh; database order validation still guards actual availability.
- **Fix:** Propagate deletion/moderation tombstones or refetch the current page's IDs; reconcile promptly after mutations and focus. Show unavailable state when detail lookup fails successfully.

### R12 — Browser persistence stores more personal data than necessary

- **Severity / priority:** Medium / P1 for shared devices.
- **Location / evidence:** `store.ts:39–51` hydrates an unvalidated JSON object and persists the entire state, including user, messages, notifications and orders. It lacks a storage-event listener for cross-tab sign-out/state invalidation.
- **Impact / root cause:** Another tab can hold stale account data; malformed browser state can break rendering; private data persists locally until successfully cleared. Local state is treated as trusted hydrated domain state.
- **Fix:** Persist only explicitly selected fields, validate/version cached data, bind private caches to the account, expire them, and invalidate across tabs. Keep sensitive operational data in memory unless offline access is a deliberate product feature.

### R13 — Fixed history limits have no continuation

- **Severity / priority:** Medium / P2.
- **Location / evidence:** `social.ts:18–55` reads 60 conversations, 150 messages per conversation, 100 incoming offers and 50 notifications; `orders.ts:loadOrders` reads 200 orders. The reviewed inbox has no older-message paging.
- **Impact / root cause:** Older data appears to vanish even though it remains in the database. Unread counts based on truncated message arrays are incomplete.
- **Fix:** Cursor pagination with “Load older”, separate aggregate unread counts, and explicit history boundaries. Test more records than each limit.

### R14 — Broad offline caching is unbounded

- **Severity / priority:** Medium / P2.
- **Location / evidence:** `public/sw.js:9–60` caches every navigation response regardless of status, uses a fixed cache namespace and has no entry/age eviction or sign-out purge. Asset cache also grows without a bound.
- **Impact / root cause:** Cached errors and stale navigations can be replayed offline; storage pressure grows with browsing. This review does not establish that server-rendered pages contain private message content; that must be tested rather than assumed.
- **Fix:** Cache an explicit public allowlist and successful responses only, bound cache sizes/age, version deployments, and purge account-specific caches on sign-out. Use a deliberate offline screen for private workflows.

### R15 — Concurrent acceptance of offers can deadlock

- **Severity / priority:** Medium / P2; needs a two-session database reproduction.
- **Location / evidence:** `20261103100000_audit_remediation.sql:473–535` checks for another accepted offer without locking the parent listing. Its AFTER trigger declines other pending offers. Simultaneous updates to different offers can each hold one row and then attempt to update the other's row.
- **Impact / root cause:** One acceptance can fail with a database deadlock instead of a clear “offer already answered” result. Do not describe this as proven double acceptance: the cleanup trigger affects the outcome.
- **Fix:** Serialize acceptance per listing with a consistent locking strategy across all offer paths; test two simultaneous acceptances and order creation. Preserve the separate stock-item behavior. Existing order placement already locks the listing, which is a useful safeguard.

### R16 — HEIC decode failure was passed through as an apparent photo (addressed)

- **Severity / priority:** Medium / P1.
- **Location / evidence:** `images.ts:compressImage` previously returned original bytes after bitmap decode failure; `api/photos/route.ts` accepts JPEG, PNG and WebP only. The old picker used Promise.all, so one rejected read also lost other valid selections.
- **Changes made:** Try image-element decoding after ImageBitmap fails; convert successfully decoded content to JPEG; reject undecodable files with actionable guidance; retain valid selections; list filename-specific errors using an accessible alert; decode sequentially and release bitmap/object-URL resources.
- **Limit:** This fixes the silent failure and improves native compatibility. It does **not** supply a HEIC decoder for browsers without native support. Full cross-browser conversion requires an evaluated, lazy-loaded decoder or a bounded server conversion pipeline. No new dependency or untested conversion service was introduced.

## Notification coverage

| Event                                                       | Source implementation                                              | Delivery status                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| New direct message                                          | `notify_message`, latest definition in audit-remediation migration | In-app row and push webhook path exist; live receipt unverified |
| New offer / accepted or declined offer                      | `notify_offer` in conversations migration                          | Path exists; live receipt unverified                            |
| Order placed / ready / handover / collection / cancellation | Order triggers and audit-remediation functions                     | Path exists; live receipt unverified                            |
| Dispute opened / resolved                                   | `open_dispute` / `resolve_dispute`                                 | Path exists; live receipt unverified                            |
| Dispute reply                                               | `add_dispute_message`                                              | No notification path found                                      |
| Read receipts                                               | Social writes                                                      | Errors ignored; not a push event                                |

Required deployment checks: compare applied migrations; verify `push_url`, shared webhook secret and Worker secret match without printing credentials; verify VAPID key pair and server key; inspect pg_net response status and Worker logs; inspect a subscription row; send an event between two controlled users and test foreground/background/closed app, notification click, expired subscription, denied permission, offline reconnection and shared-device sign-out. Repeat on Android and an installed iPhone web app. Current Chromium-only e2e configuration and cryptographic unit tests do not prove device receipt.

## Hardcoded and mock data

- The marketplace's `model.seedState()` starts with empty records; its public market reads Supabase. Finding a `seed` import or old “mock backend” comment alone is not evidence of fake production listings.
- Local catalog/seller fixtures exist in `packages/shared/src/seed.ts` and `supabase/seed.sql`. Whether production was accidentally seeded cannot be determined from source alone.
- Admin `store.ts:44,76` still calls the deterministic mock `seedState` and only overwrites users/listings/orders/disputes with empty operations. Seed team/audit/default-role data remains in the initial store. Current team and audit screens have their own database-backed hooks, so this is a **Low / P3** production initialization/bundling issue, not proof those screens show fake records. Replace runtime fixture initialization with an explicit empty admin state and retain fixtures for tests.
- Default school domains, currency, campus terminology, pickup options and branding are product/config defaults. `push_url` and VAPID subject contain deployment-specific domains. They are not secrets, but should be centralized or configured if multiple deployments are planned.
- In-app payment processing is explicitly unfinished and disabled in release defaults. Reservation/pay-at-pickup is the implemented flow. README's opening “payments held” wording overstates the current experience; align product and documentation copy with the actual payment mode.

## UI/UX improvement sequence

1. **Trust first:** visible sync status and last refresh; separate unavailable/empty states; retry beside the failed action; only show success after durable completion. Keep actionable errors near the field rather than relying solely on transient toasts.
2. **Messaging:** preserve composer drafts, failed-message retry, older history, accurate unread aggregates and an obvious offline state. Keep keyboard focus and scroll stable when new events arrive.
3. **Notifications:** a settings card with actual device registration state, denied-permission help, retry/test controls, per-category preferences and discreet lock-screen previews. Explain installation requirements where applicable after testing the target device flow.
4. **Selling:** show each photo's decoding/upload status, rejected filename, retry/remove controls and explicit format/size guidance. Prevent publish while photo preparation is pending. Preserve unsaved form data through recoverable failures and navigation.
5. **Orders/disputes:** emphasize the next responsible person and next action; distinguish reservation from payment; expose case replies, resolution and expected response time in a coherent timeline.
6. **Accessibility/mobile QA:** check 44px touch targets (photo removal currently uses size-6), keyboard navigation, focus restoration, screen-reader announcements, text scaling and reduced motion. Confirm on actual small Android devices; a source review cannot certify contrast, layout or perceived polish.

## Positive controls inspected

Database RLS and restricted column grants exist; sensitive workflows use server-side checks rather than only UI guards. Order insertion locks the listing before calculating availability. Several resource caps use advisory locks. Admin Access JWT verification checks signature/audience/issuer/time, in addition to database permissions. Push webhook authentication and endpoint allowlisting exist. Photo type sniffing and metadata cleaning exist. CI includes types, lint, tests, build, dependency audit and database checks. These are useful controls, not proof of complete security or deployed configuration.

## Verification and limitations

- `npm test`: passed, 152 tests across admin, marketplace and shared workspaces.
- `npx vitest run tests/unit/images.test.ts --reporter=verbose` in the marketplace workspace: all four new regression tests passed.
- `npm run typecheck` and `npm run lint`: passed across configured workspaces.
- Targeted Prettier check and `git diff --check`: passed.
- `npm run build`: failed in both applications during Turbopack CSS worker process startup (child process exited before connection). No build success is claimed; the failure occurs in the build tool's process startup, with no source diagnostic tying it to this patch. Recheck in CI or an unrestricted supported environment.
- `npm audit --omit=dev --audit-level=high`: could not complete because registry.npmjs.org DNS resolution failed (ENOTFOUND). Dependency advisory status remains unverified.
- `docker info`: permission denied connecting to the Docker Desktop Linux engine. Local database/RLS/concurrency and authenticated Playwright tests were not run.

New image tests cover bitmap resizing/cleanup, native HEIC fallback, explicit unsupported-HEIC rejection and canvas allocation failure. They mock browser decoding and do not certify real HEIC codec support. No deployment or production data mutation was performed.

Recommended order: R01–R05 and R08/R12 first; then R06/R07/R09, paging and cache correctness; then measured performance and visual refinement. Keep database changes in new migrations, test against populated fixtures, and avoid rewriting already-applied migrations.
