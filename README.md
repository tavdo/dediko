# Dediko

Georgian platform for pregnancy and early motherhood, using the supplied pink, blue and lavender palette. Vanilla JavaScript frontend, Vercel Functions, managed Neon Auth/Postgres, and Web Push.

## Run and validate

Use Node.js 24+ locally (Vercel uses Node.js 26). Install with `npm ci`, then `npm run dev` and open http://localhost:5173. The custom dev server bundles the browser SDK and adapts the same Web API handlers. Public pages work without backend configuration; accounts require the provisioned environment.

- `npm run check`: syntax, reminder/timezone/DST, validation, security boundaries and existing feature tests.
- `npm run build`: production browser bundle and explicit public-file whitelist in `dist`.
- `npm run db:migrate`: idempotent Dediko schema creation; run after linking/provisioning, never during a static build.
- `npm run verify:accounts`: real managed signup, independent login sessions, data isolation, conflicts, session revocation, device ownership, and worker idempotency. Uses temporary accounts and cleans them up. Pass a deployment origin to exercise HTTP.
- `node scripts/verify-account-ui.mjs [origin]`: built SDK and DOM/event flow through the real API: signup, explicit legacy import, reminders, profile stage change, conflict recovery, and logout. Requires a running local server by default. This is not browser layout testing.
- `node scripts/verify-queue.mjs [origin]`: deployed Queue producer and callback verification with a temporary database job and no device subscription. Does not send a phone notification.

Verification scripts load ignored `.env.local` and never print credentials. Only run them against the linked Dediko test/production database intentionally; they create clearly named temporary test users.

## Vercel setup

GitHub `tavdo/dediko`, production project `dediko`, public https://dediko.vercel.app. Framework: Other, build: `npm run build`, output: `dist`, root: repository root. Root `api/*.js` files export Web Request/Response handlers.

Connected resources: managed Neon Auth + Postgres `dediko-accounts`, and private Blob `dediko-ideas`. The Marketplace provisions database/auth variables. Server-only variables are listed without values in `.env.example`; only the VAPID public key and readiness flag are exposed by `/api/config`. Never put database URLs, session signing keys, private VAPID keys or Blob tokens in the browser build.

Provision first, link the correct project, pull environment variables, then migrate. `scripts/provision-push.mjs` is a one-time setup utility for this project: generates random cookie/cron keys and VAPID keys, writes the ignored local environment, and passes values to Vercel CLI over stdin. It does not print values and does not overwrite existing Vercel variables. Keep separate resources/credentials for previews; the production origin is intentionally restricted to Dediko's public domain.

In Neon Auth's trusted domains, add `https://dediko.vercel.app`. Email/password accounts and sessions are managed by Neon, not handwritten password storage. Optional email verification uses numeric OTP; password reset returns to Dediko. The current provider uses Neon's shared email sender. Before a broad public launch, configure a custom SMTP sender in Neon for delivery limits and branding; verification links require a custom sender. See [Neon's production checklist](https://neon.com/docs/auth/production-checklist).

## Personal accounts and synchronization

Registration collects email/password (12–128 characters), name, pregnancy/new-mother stage and expected due date/baby's birth date. Stage and date remain editable from the profile. Login, logout, email confirmation, password reset and second-device restoration are implemented.

Profiles, reminders, personal video links, watched progress, weekly plans and notes are stored privately in Postgres. APIs derive the user ID from a freshly checked managed session and require same-origin writes. An expected-account header prevents a tab with an old account from writing into a newly signed-in account. Database queries are parameterized, with user-scoped keys. No database credentials or direct database access are provided to browsers.

The original browser-local space remains available until its owner chooses to import it during onboarding. Import is explicit and is offered only for an empty cloud profile. The old copy is removed after successful cloud persistence. A separate demo stays unsaved.

Saves use optimistic revisions. A stale device receives a conflict instead of overwriting newer data; the UI offers an unsaved-data download and explicit reload of the account copy. Pending drafts are scoped to the account in localStorage, removed after save/logout, and restored with a retry/conflict prompt. Signed-out cloud documents are not kept as a normal local profile. Online/focus events retry or refresh when there are no active edits. Multi-tab logout clears the in-memory account.

## Phone notifications

Profile → notifications → enable on this device. Browser permission is requested only after a button click. Each device subscribes independently, with opt-out and a rate-limited test button. Signing out removes this installation's subscription. Android/desktop require a supported browser; iPhone/iPad require iOS 16.4+ and opening Dediko from the Home Screen. The profile explains Share → Add to Home Screen. A manifest, app icons and service worker support this installation flow; private pages/APIs are not cached by the worker.

The server sends encrypted Web Push using VAPID. Notification text is generic and contains no reminder titles, pregnancy dates, baby details or notes. Clicking opens the signed-in reminders view. Expired (404/410) subscriptions are removed. Device endpoints are restricted to supported browser push services to prevent arbitrary server requests.

Vercel Queues delivers one-time/daily/weekly reminders in the account's IANA timezone, including DST changes. A five-day checkpoint keeps distant reminders within Queue retention. Revision/job checks discard edited, deleted, completed, disabled or obsolete-stage jobs. A per-device occurrence ledger prevents duplicate retries; stable notification tags also collapse repeated display. Transient failures retry, and successful recurring reminders advance to their next occurrence. The database outbox records unpublished jobs; save/subscribe/retry actions publish them and a secret-authenticated daily cron retries pending jobs. Daily recovery is compatible with the current Hobby plan.

Queues are at-least-once and push providers/operating systems control final delivery. A network failure after provider acceptance can produce a retry; a reminder more than an hour late is skipped. Focus mode, connectivity, revoked permissions, or OS limits can delay delivery. Physical iPhone/Android receipt requires the owner's permission and an actual device; use the in-profile test button to validate that final step. This feature sends browser Push, not SMS.

## Other features

- Stage-specific self-care suggestions, personal reminder CRUD, categories and completion per occurrence. Suggestions are organizational, not clinical schedules.
- Six original-provider NHS videos split by stage, with source/language attribution, search, categories, watched progress, and private YouTube/Vimeo links. Shared catalog: `publishedLessons` in `lessons.js`. Players open only on request and are removed on dialog close.
- Seven-day Pro demo: weekly plans/templates, private notes, learning path and ICS export. Proposed price remains 19 GEL/month; no payments, automatic renewal or paid entitlement are implemented. Stored demo state is not trusted authorization for a subscription. Calendar export is a floating-time snapshot.
- Shared Ideas board (below), team cards, responsive pink/blue/lavender design, and mobile glass navigation with safe-area spacing and menu sheet.

## Shared ideas board

Open `/?page=ideas`. Both Free/Pro users and visitors can submit an idea, choose a category, search/filter by status or category, sort by popularity/newest, and view “My ideas”. Submission requires explicit public-posting consent. Profile names, pregnancy/birth dates, private reminders and notes are not sent to this API. New ideas receive `reviewing` status and the submitting browser's first vote.

`api/ideas.js` is a Node.js Web API function backed by a private Vercel Blob JSON object. ETag conditional writes and conflict retries protect concurrent changes. Votes use idempotent desired-state updates. An HTTP-only, Secure, SameSite cookie identifies a browser; public responses omit raw identifiers, voter lists and submission activity. One vote per browser is not verified one-person voting; clearing cookies or using another browser creates a separate identity. No real-account authentication is implied.

Admins can update an idea's status, post a team reply, or hide and restore it from the management panel. Existing entries in `server/idea-statuses.js` serve as the initial settings until an admin saves a change. Visitors can vote, and authors can withdraw ideas before other browsers support them.

Initial board capacity is 250 ideas, 250 browser votes per idea, and a 3 MB private object. Creation is limited to five ideas per browser in 24 hours and 120 changes per hour. These are small-community safeguards, not authenticated anti-abuse controls; move to transactional database storage and stronger identity controls as the community grows. Nothing is stored in ephemeral Function memory as the source of truth.

The local dev server uses a serialized, ignored `.local/ideas.json` file and the same HTTP handler. It never falls back to that local file in production. Failed requests do not report success or silently save submissions only to the browser. Failed submission text remains in the form/session for retry.

Run `node scripts/verify-ideas.mjs` with the dev server running to verify two independent HTTP sessions; pass a deployment origin as its argument to verify deployment storage. It creates a clearly marked test idea, verifies cross-session visibility and votes, then removes its own test content. `npm run check` covers API validation, origin/body limits, privacy, votes, conflicts, moderation and existing features.

`@vercel/cli-config`, Better Auth, Zod and minimatch are pinned to patched releases through overrides. The SDK also installs unused React/email UI dependencies: npm audit currently reports seven low-severity findings through their unpatched deepmerge dependency. These UI/email renderer modules are not imported into the application or browser bundle.

## Admin panel

Apply the schema with `npm run db:migrate` before releasing the admin routes. Open `/admin` and sign in with a Dediko account that has a verified email and an explicit grant. The link also appears in the profile for admins.

Run `node scripts/admin-access.mjs grant email@example.com` against the intended database after the account owner verifies their email. The grant is stored against the account ID. Use `revoke` with the same email to remove access.

The overview shows aggregate counts for completed profiles, published videos and visible ideas. Admins can save or publish shared videos for either stage and manage ideas. Published changes become available on the next catalog or board load. Built-in lesson IDs stay stable so existing watched progress follows the lesson. Idea moderation uses the same ideas store as the public board in each environment.

## Source

The original reference deployment returned `DEPLOYMENT_NOT_FOUND` during inspection. This design is built from the user's brief and supplied logo, rather than a copy of the unavailable deployment.
