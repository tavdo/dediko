# Dediko

Georgian-language local prototype for pregnant people and new mothers, using the supplied pink, blue and lavender logo palette.

## Run

Requires Node.js 20.11 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Run `npm run check` for JavaScript syntax and reminder recurrence tests.

## Deploy on Vercel

Import `tavdo/dediko` into Vercel and deploy the `main` branch. The checked-in `vercel.json` configures the project as a static site:

- Framework preset: Other
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root
- Storage: the Ideas API needs a connected private Vercel Blob store. Vercel injects `BLOB_READ_WRITE_TOKEN` automatically. Keep it server-side; it is never part of the static build. Local development uses `.local/ideas.json` instead.

Run `npm run build` locally to generate the same static output. Only runtime files and assets are copied; local screenshots, development scripts and tests are excluded from the deployed site.

## Implemented

- Responsive landing page with the original supplied logo.
- Floating glass pill navigation on mobile, with four primary controls and a bottom-sheet menu for the remaining destinations. Uses safe-area insets, hides during dialogs/text entry, and reserves page/toast space above the dock.
- Local onboarding: name, pregnancy/new mother stage, expected due date or baby's birth date.
- Stage-specific suggested reminders; optional switches, editable time, date and recurrence.
- Personal reminders with categories, daily/weekly/one-time recurrence, editing, deletion and completion per occurrence.
- Today/all/personal/suggested filters and today's progress.
- Profile editing; switching stage retains personal reminders and hides the previous stage's suggestions without deleting them.
- Demo space that does not persist its changes.
- Browser-local persistence with `localStorage`.
- Video library for each profile stage: three pregnancy lessons and three new-mother lessons, with category/search filters and manually marked watched progress.
- Embedded Vimeo/YouTube playback, original-provider fallback links, and visible source/language attribution.
- Personal video links with stage, category, description and language; adding, editing, deleting and watched progress are stored in the browser.

## Video lessons

The shared initial catalog is defined in `publishedLessons` in `lessons.js`. It contains six English-language videos published and embedded by [Chelsea and Westminster Hospital NHS Foundation Trust](https://www.chelwest.nhs.uk/services/maternity/antenatal-education/additional-videos-and-resources). The original provider hosts each video; Dediko does not download or rehost them. Each card and player show the source and language.

To publish a Georgian-language or other shared lesson for everyone, add its title, stage (`pregnant` or `mother`), category, YouTube/Vimeo URL, language and attribution to that catalog, then deploy. The in-app “My video” form saves a personal link only; it is not a shared administrative publishing system.

Only explicit YouTube/Vimeo video URLs can generate iframe sources. YouTube uses its privacy-enhanced player, Vimeo uses `dnt=1`, and the player loads after a user chooses a lesson. Closing the dialog removes the iframe to stop playback. A direct video link remains available if a provider disables embedding or the network blocks playback. Existing profiles migrate without discarding reminders.

## Dediko Pro demo

Open `/?page=pro` for the public package comparison. Free keeps all existing reminders and videos. Pro's proposed price is **19 GEL per month**, displayed as a planned price, not an available paid offer.

The current implementation offers a **seven-day browser-local demo trial** without a card, billing, automatic renewal or real subscription. It includes stage-specific weekly planner templates, custom editable tasks, completion tracking, weekly notes, a lesson learning path, and `.ics` calendar export of enabled reminders. The calendar file uses floating local times, daily/weekly recurrence, UTF-8 line folding and escaped text; importing it is a snapshot, not ongoing calendar synchronization.

The trial and planner are preserved across reloads. Stage changes retain both sets of tasks and notes. Completing or cancelling the trial preserves the data and closes Pro actions; it cannot be restarted within the retained local profile. This is a prototype convenience gate, **not secure subscription authorization**. Clearing browser storage resets it.

Before paid launch, implement authenticated accounts and server-side storage, a payment-provider checkout, verified payment webhooks, server-side entitlement checks, and actual subscription cancellation/refund handling. No paid customers or payment details are collected by this version.

## Scope

Profiles, reminders and Pro remain browser-local prototypes without password login, cross-device sync, email, push, or background notification delivery. The Ideas board is a shared backend feature, described below. Reminders are displayed in the site. Suggested reminders concern general organization and self-care; they are not clinical schedules or medical advice. Medical appointments are entered by the user.

The pregnancy due date and child's birth date personalize the selected stage's display. More detailed suggestions by pregnancy week or child age require approved content and are not implemented yet.

Google Fonts supplies Noto Sans Georgian when online; a system sans-serif fallback works offline. Video playback uses the original providers; the shared Ideas board requires the online API.

## Shared ideas board

Open `/?page=ideas`. Both Free/Pro users and visitors can submit an idea, choose a category, search/filter by status or category, sort by popularity/newest, and view “My ideas”. Submission requires explicit public-posting consent. Profile names, pregnancy/birth dates, private reminders and notes are not sent to this API. New ideas receive `reviewing` status and the submitting browser's first vote.

`api/ideas.js` is a Node.js Web API function backed by a private Vercel Blob JSON object. ETag conditional writes and conflict retries protect concurrent changes. Votes use idempotent desired-state updates. An HTTP-only, Secure, SameSite cookie identifies a browser; public responses omit raw identifiers, voter lists and submission activity. One vote per browser is not verified one-person voting; clearing cookies or using another browser creates a separate identity. No real-account authentication is implied.

Roadmap changes and team replies are controlled in `server/idea-statuses.js`. Add an idea's full ID (returned by `/api/ideas`) with `{status:'planned', reply:'...'}` and deploy. Allowed statuses: `reviewing`, `planned`, `inprogress`, `completed`. Use `{hidden:true}` to moderate an inappropriate submission. Visitors cannot change roadmap statuses through the API. An author may withdraw an idea before other browsers support it.

Initial board capacity is 250 ideas, 250 browser votes per idea, and a 3 MB private object. Creation is limited to five ideas per browser in 24 hours and 120 changes per hour. These are small-community safeguards, not authenticated anti-abuse controls; move to transactional database storage and stronger identity controls as the community grows. Nothing is stored in ephemeral Function memory as the source of truth.

The local dev server uses a serialized, ignored `.local/ideas.json` file and the same HTTP handler. It never falls back to that local file in production. Failed requests do not report success or silently save submissions only to the browser. Failed submission text remains in the form/session for retry.

Run `node scripts/verify-ideas.mjs` with the dev server running to verify two independent HTTP sessions; pass a deployment origin as its argument to verify deployment storage. It creates a clearly marked test idea, verifies cross-session visibility and votes, then removes its own test content. `npm run check` covers API validation, origin/body limits, privacy, votes, conflicts, moderation and existing features.

`@vercel/cli-config` is pinned through an override to the patched 0.3.7 release because the Blob SDK's OIDC dependency otherwise resolved a vulnerable older transitive version.

## Source

The original reference deployment returned `DEPLOYMENT_NOT_FOUND` during inspection. This design is built from the user's brief and supplied logo, rather than a copy of the unavailable deployment.
