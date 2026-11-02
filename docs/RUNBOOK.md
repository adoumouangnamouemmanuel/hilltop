# Hilltop operations runbook

What has to be true outside the code for Hilltop to be safe to run, how to check it, and what to do when something breaks. Each section names the audit finding it answers (`audit.md`).

The repository is this `web/` folder. The `api/` folder beside it is empty and unused (ARCH-001).

## Deploying a change

1. Migrations first: `npx supabase db push --linked`. Code that calls a new database function fails until its migration is live.
2. Push to `main`. CI runs checks, database tests, end-to-end tests and a secret scan, then deploys both Workers from the `production` environment.
3. In GitHub → Settings → Environments → `production`, require a reviewer and keep `CLOUDFLARE_API_TOKEN` there (not as a repository secret). Scope the token to the two Workers (`hilltop-web`, `hilltop-admin`) and their routes only. Set the repository variable `CLOUDFLARE_ACCOUNT_ID` (SEC-042, SEC-044).

### After the November 2026 audit migration

`20261103100000_audit_remediation.sql` adds a shared secret for push delivery. After pushing it:

```sql
select value from private.settings where key = 'push_secret';
```

Set that value as the `PUSH_WEBHOOK_SECRET` secret on the `hilltop-web` Worker. Until it's set, `/api/push` refuses every request in production and push notifications stop (in-app notifications are unaffected) (SEC-030).

The marketplace Worker also needs `SUPABASE_SECRET_KEY` for the daily photo cleanup, which runs at 03:17 UTC (SEC-033).

## Admin portal: Cloudflare Access (SEC-013)

The portal must only be reachable through Cloudflare Access.

- Zero Trust → Access → Applications: a self-hosted application for `admin.hilltop.lumavok.com/*`, session length 24 hours.
- One policy, action Allow, rule "Emails" listing each team member's address. No "Everyone", no email-domain rules, no bypass policies.
- Copy the application's **Audience (AUD) tag** and your team domain (`<team>.cloudflareaccess.com`). Set them as `CF_ACCESS_AUD` and `CF_ACCESS_TEAM_DOMAIN` variables on the `hilltop-admin` Worker. The Worker then checks Access's signed token on every request and answers 403 without it, so the portal stays closed even if the Access application is deleted or loosened by mistake.

Check after every deploy and every Access change:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://admin.hilltop.lumavok.com/
```

Expected: `302` to `*.cloudflareaccess.com`. A `200` means Access is off. A `403` means Access is off and the Worker caught it; fix Access.

Also add a WAF rate-limiting rule on `hilltop.lumavok.com` for paths starting `/api/` (for example 60 requests per minute per IP).

## Sign-in email (SEC-005, SEC-007, SEC-051)

Supabase Auth sends the 6-digit codes through Resend's SMTP, as `no-reply@hilltop.lumavok.com`.

Supabase dashboard → Authentication:

- **Rate limits**: emails sent per hour at least 30 (raise with the number of students; 2 an hour locks everyone out). Token verifications 30 per 5 minutes per IP.
- **Email**: minimum interval between emails per address 60 seconds, OTP length 6, OTP expiry 600 seconds.
- **SMTP**: host `smtp.resend.com`, port 465, user `resend`, password: the Resend API key (password manager), sender `no-reply@hilltop.lumavok.com`.
- **Attack protection**: turn on Cloudflare Turnstile if repeated code requests or guessing appear in the Auth logs. Supabase limits guesses per IP; it has no per-address lockout, and codes expire after 10 minutes.

DNS for `hilltop.lumavok.com` (check in Resend → Domains, all must be "Verified"): the SPF `TXT` record that includes `amazonses.com`, the `resend._domainkey` DKIM `TXT` record, and a DMARC record such as `_dmarc.hilltop.lumavok.com TXT "v=DMARC1; p=quarantine; rua=mailto:support@hilltop.lumavok.com"`.

Sign in with a test account once a week; if no code arrives within a minute, check Resend's logs, then Supabase's Auth logs.

## Backups and restore (SEC-041)

- **What**: `backup.yml` dumps roles, schema and data nightly at 02:30 UTC, encrypts them with [age](https://age-encryption.org), uploads them with a SHA-256 checksum to the private `hilltop-backups` R2 bucket, downloads them again to verify, and prunes: every night for 35 days, then the first of each month for a year.
- **Secrets**: `SUPABASE_DB_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (a token for `hilltop-backups` only), the `CLOUDFLARE_ACCOUNT_ID` variable, and for encryption `BACKUP_AGE_RECIPIENT` plus `BACKUP_AGE_IDENTITY` for the restore check. Generate the key pair once with `age-keygen`; keep the private key in the password manager and on paper. Until the age keys are set, backups are uploaded unencrypted with a warning (R2 still encrypts at rest). A missing database or R2 secret fails the run, and GitHub emails the repository owners.
- **Bucket**: turn on object versioning or a lock rule for `db/` in R2, so a leaked token can't delete history.
- **Recovery point**: up to 24 hours of data. Supabase's point-in-time recovery (Pro plan) narrows this; switch it on when real payments start.
- **Weekly check**: `restore-check.yml` restores the newest backup into a scratch Supabase every Monday and checks sign-ins against profiles and row-level security. A failure means the backups can't be trusted; treat it as an incident.
- **Photos** aren't in the database backup. Turn on R2 object versioning for `hilltop-photos` too.

### Restore drill (every term, and before any risky migration)

1. Create a new Supabase project (free tier is enough) or use `supabase start` in an empty folder.
2. Download the newest `db/…tar.gz.age` and its `.sha256` from R2; compare checksums.
3. `age -d -i key.txt -o backup.tar.gz backup.tar.gz.age && tar xzf backup.tar.gz`
4. `psql "$DB" -f roles.sql; psql "$DB" -v ON_ERROR_STOP=1 -f schema.sql; psql "$DB" -c 'set session_replication_role = replica' -f data.sql`
5. Point a local build at it (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), sign in as a test student, open a listing, place and cancel an order.
6. Write down how long steps 2–5 took (the recovery time) and anything that failed, below.

| Date | Backup restored | Time to restore | Result | By  |
| ---- | --------------- | --------------- | ------ | --- |
|      |                 |                 |        |     |

To restore production for real: pause deploys, restore into a new project, check it as above, then point the Workers' `NEXT_PUBLIC_SUPABASE_*` settings and the Auth hook and SMTP settings at it.

## Monitoring

Sentry receives errors from both Workers and browsers, with emails, tokens and query strings removed (SEC-050). Set alerts:

- Error count above normal for 10 minutes, for each project.
- Any event containing "Couldn't load the published config" (the marketplace is running on an old or default config).
- Any event from `/api/push`, and the daily photo cleanup failing.

Also watch: the GitHub Actions emails for `Database backup` and `Backup restore check`; Supabase's Reports (slow queries, connections) and Advisors weekly; an uptime check (Cloudflare Health Checks or a free monitor) on `https://hilltop.lumavok.com/` and the Access redirect above.

## Known limits

- **Browsing** still loads every live listing (paged, with shortened descriptions) and filters in the browser. Fine for a few thousand listings; past that, move search, filters and pagination into database queries (PERF-001). The server logs an error above 10,000.
- **Photo sizes**: listing photos are served at full size unless Cloudflare Image Transformations is switched on for the zone and the marketplace is built with `NEXT_PUBLIC_IMAGE_RESIZING=1` (PERF-006).
- **Seller analytics**: totals are real; the day-by-day view curves are estimated and labelled as such (REL-002).
- **Security headers**: pages are prerendered, so the Content Security Policy allows inline scripts (Next's bootstrap). Everything else (connections, images, frames, plugins) is restricted (SEC-040). Sign-in tokens live in the browser, as Supabase's browser client requires (SEC-003); the policy limits what injected script could reach.
- **Dependency advisories**: `npm audit` reports moderate advisories in Sentry's build-time tooling (`minimatch` via `glob`); they don't run in production. CI fails on high or critical ones. Review when Sentry releases an update (SEC-045).
- **Payments**: in-app payments stay off. Refund and payout-release buttons in the admin portal refuse pay-at-pickup orders, because Hilltop holds no money for them (SEC-023).
