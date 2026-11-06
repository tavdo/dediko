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
- Video library for each profile stage: three pregnancy lessons and three new-mother lessons, with category/search filters and manually marked watched progress.
- Embedded Vimeo/YouTube playback, original-provider fallback links, and visible source/language attribution.
- Personal video links with stage, category, description and language; adding, editing, deleting and watched progress are stored in the browser.

## Video lessons

The shared initial catalog is defined in `publishedLessons` in `lessons.js`. It contains six English-language videos published and embedded by [Chelsea and Westminster Hospital NHS Foundation Trust](https://www.chelwest.nhs.uk/services/maternity/antenatal-education/additional-videos-and-resources). The original provider hosts each video; Dediko does not download or rehost them. Each card and player show the source and language.

To publish a Georgian-language or other shared lesson for everyone, add its title, stage (`pregnant` or `mother`), category, YouTube/Vimeo URL, language and attribution to that catalog, then deploy. The in-app “My video” form saves a personal link only; it is not a shared administrative publishing system.

Only explicit YouTube/Vimeo video URLs can generate iframe sources. YouTube uses its privacy-enhanced player, Vimeo uses `dnt=1`, and the player loads after a user chooses a lesson. Closing the dialog removes the iframe to stop playback. A direct video link remains available if a provider disables embedding or the network blocks playback. Existing profiles migrate without discarding reminders.

## Scope

This is a local prototype, not an authenticated multi-user service. There is no backend, password login, cross-device sync, email, push, or background notification delivery. Reminders are displayed in the site. Suggested reminders concern general organization and self-care; they are not clinical schedules or medical advice. Medical appointments are entered by the user.

The pregnancy due date and child's birth date personalize the selected stage's display. More detailed suggestions by pregnancy week or child age require approved content and are not implemented yet.

Google Fonts supplies Noto Sans Georgian when online; a system sans-serif fallback works offline. All other runtime files are local.

## Source

The original reference deployment returned `DEPLOYMENT_NOT_FOUND` during inspection. This design is built from the user's brief and supplied logo, rather than a copy of the unavailable deployment.
