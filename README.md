# Dediko

Georgian-language local prototype for pregnant people and new mothers, using the supplied pink, blue and lavender logo palette.

## Run

Requires Node.js 20.11 or newer. No installation or dependencies required.

```sh
npm run dev
```

Open http://localhost:5173. Run `npm run check` for JavaScript syntax and reminder recurrence tests.

## Deploy on Vercel

Import `tavdo/dediko` into Vercel and deploy the `main` branch. The checked-in `vercel.json` configures the project as a static site:

- Framework preset: Other
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root
- Environment variables: none required

Run `npm run build` locally to generate the same static output. Only runtime files and assets are copied; local screenshots, development scripts and tests are excluded from the deployed site.

## Implemented

- Responsive landing page with the original supplied logo.
- Local onboarding: name, pregnancy/new mother stage, expected due date or baby's birth date.
- Stage-specific suggested reminders; optional switches, editable time, date and recurrence.
- Personal reminders with categories, daily/weekly/one-time recurrence, editing, deletion and completion per occurrence.
- Today/all/personal/suggested filters and today's progress.
- Profile editing; switching stage retains personal reminders and hides the previous stage's suggestions without deleting them.
- Demo space that does not persist its changes.
- Browser-local persistence with `localStorage`.

## Scope

This is a local prototype, not an authenticated multi-user service. There is no backend, password login, cross-device sync, email, push, or background notification delivery. Reminders are displayed in the site. Suggested reminders concern general organization and self-care; they are not clinical schedules or medical advice. Medical appointments are entered by the user.

The pregnancy due date and child's birth date personalize the selected stage's display. More detailed suggestions by pregnancy week or child age require approved content and are not implemented yet.

Google Fonts supplies Noto Sans Georgian when online; a system sans-serif fallback works offline. All other runtime files are local.

## Source

The original reference deployment returned `DEPLOYMENT_NOT_FOUND` during inspection. This design is built from the user's brief and supplied logo, rather than a copy of the unavailable deployment.
