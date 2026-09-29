# Chrome Web Store listing kit

Everything the store form asks for, ready to paste, so the submission takes ten minutes once the $5 developer
account exists (LAUNCH_CHECKLIST step 13; needs George's OK to pay). Screenshots at exactly 1280×800 are in
`docs/screens/webstore/` (`*-1280.png`, light and dark; `SCALE=1 VIEWPORT=laptop node scripts/screens.mjs webstore` remakes them). Build and zip first:

```bash
npm run build:extension
cd extension && zip -r ../halo-plus-extension.zip . -x '*.DS_Store' && cd ..
```

Bump `"version"` in `extension/manifest.json` on every upload.

## Store listing

**Name:** Halo+ for Halo

**Summary (132 characters max):**
Syncs your GCU Halo classes, grades and announcements to Halo+ whenever you open Halo. Never your password.

**Description:**

Halo+ is an independent planner for GCU students. This extension makes opening Halo the sync: a few seconds after
halo.gcu.edu loads, if your last sync is more than thirty minutes old, it reads your classes, assignments, grades
and announcements the same way Halo's own app does and hands them to your Halo+ tab, where you approve every change
before it applies.

What you get in Halo+:
• One screen that says what to do next, with the due date, how long it takes and what it is worth.
• Announcements read for you: the "due Friday" a professor only posted in an announcement lands on the assignment.
• Grades from the gradebook, with what you need on the rest of the term.
• Reminders as push notifications; works on a phone from the Home Screen.
• A Study tab (Max): practice for any quiz or exam from your own slides, ask anything about your classes, check your work against the rubric.

Privacy: the extension runs only on halo.gcu.edu and on the Halo+ site. It never asks for, reads or stores your
password; it uses the session you already have in that tab. Nothing is sent anywhere except to your own Halo+
account. It does not read cookies, history or any other site. The code is public:
https://github.com/richardsgeorger-collab/school-dashboard

Halo+ is not affiliated with, endorsed by, or connected to Grand Canyon University. Halo is GCU's learning
platform.

**Category:** Education
**Language:** English (United States)

**Single purpose (for the review form):**
Syncs the signed-in student's own GCU Halo classes, assignments, grades and announcements to their Halo+ planner.

**Permission justifications (paste one per permission):**
- `host_permissions https://halo.gcu.edu/*`: run the sync on Halo's page while the student is logged in; the data
  is read through Halo's own API with the session that tab already holds.
- `host_permissions https://haloplus.app/*`: hand the export to the Halo+ tab and learn which plan the student is on.
- `host_permissions https://richardsgeorger-collab.github.io/*`: Halo+'s previous address, kept while students move
  over to haloplus.app; the same use as above.
- `scripting`: inject the sync script into the Halo tab when a sync is due.
- `tabs`: find or open the Halo and Halo+ tabs so the export has somewhere to go.
- `alarms`: the timed schedule (every three hours while Chrome is open) for plans that include it.
- `storage`: the last sync time, the plan, and the sync-on-open switch.

**Remote code:** none. The sync script ships inside the package (`sync-inject.js`, generated from
`src/halo/bookmarklet.ts`); nothing is fetched and evaluated.

**Data usage disclosures (the store's checklist):**
- Collects: "Website content" (the student's own class data from Halo) and "Authentication information"? No: it
  never collects credentials; select only Website content.
- Data is not sold, not used for purposes unrelated to the single purpose, not used for creditworthiness.

**Privacy policy URL:** https://haloplus.app/privacy.html
**Homepage URL:** https://haloplus.app/
**Support:** richards.georger@gmail.com (the same address on the privacy and terms pages)

## Screenshots (1280×800)

1. `sync-review-light-1280.png`: "What Halo sent", the review sheet a sync opens.
2. `now-light-1280.png`: Now, the one thing to do next.
3. `inbox-full-light-1280.png`: the Inbox with announcements read.
4. `grades-light-1280.png`: Grades by points.

Small promo tile (440×280) and marquee (1400×560) are optional; the store accepts a listing without them.

## After approval

- Put the store link on the You tab (Halo card) and on the landing page's "How the sync works" section.
- The extension's built-in script is a copy of the bookmark's; after any change to `src/halo/bookmarklet.ts`, run
  `npm run build:extension`, bump the manifest version, and upload again.
