# Chrome Web Store listing kit

Everything the store form asks for, ready to paste, so the submission takes ten minutes once the $5 developer
account exists (LAUNCH_CHECKLIST step 13; needs George's OK to pay). Every file to upload is in `webstore-upload/`
(kept out of git):

| File | Where it goes |
|---|---|
| `halo-plus-extension-<version>.zip` | Package: manifest.json at the top level of the zip |
| `store-icon-128.png` | Store icon: 128×128, 96×96 artwork with 16 px transparent padding |
| `screenshot-1-now.png` … `screenshot-5-sync-review.png` | Screenshots: exactly 1280×800, 24-bit PNG, no transparency |
| `promo-tile-440x280.png` | Small promo tile: 440×280, 24-bit PNG, no transparency |

Remake them: `npm run build:extension`, bump `"version"` in `extension/manifest.json` (every upload), zip the extension
folder's files (not the folder, and not README.md) into `webstore-upload/`, then run the store sweep
(`ONLY=store-light SCENES=now,classes,inbox,sync-review KEYS_ENV=… node scripts/e2e-sweep.mjs`) and
`node scripts/webstore-assets.mjs`.

## Store listing

**Name:** Halo+ (the store takes the name from `manifest.json`; change it there to rename)

**Summary (132 characters max):**
Syncs your GCU Halo classes, grades and announcements to Halo+ every 3 hours while Chrome is open. Never your password.

**Description:**

Halo+ is an independent planner for GCU students. This extension keeps it in step with Halo: every 3 hours while
Chrome is open, it reads your classes, assignments, grades and announcements the same way Halo's own app does, in a
quiet background tab it closes after, and sends them to your Halo+ account. It works even when Halo+ is closed: the
next time you open Halo+, the new work is already there, with an Undo. It never takes you away from what you are
doing, and it never syncs just because you opened Halo. The popup shows when it last synced and when it will next.
Logged out of Halo? It says so in its popup and tries again next time. Sync now in the popup runs at once.

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
- `host_permissions https://haloplus.app/*`: tell an open Halo+ tab a sync has arrived, and learn which account and plan
  the student is signed in to on this computer.
- `host_permissions https://kiacmspgvntzwngijibr.supabase.co/functions/v1/sync-drop`: Halo+'s own server. Each sync is
  sent there, to the signed-in student's own account, so it arrives even when no Halo+ tab is open. This one address,
  nothing else on that host.
- `host_permissions https://richardsgeorger-collab.github.io/*`: Halo+'s previous address, kept while students move
  over to haloplus.app; the same use as above.
- `scripting`: inject the sync script into the Halo tab when a sync is due.
- `tabs`: find the student's Halo tab (or open one in the background and close it after) and find an open Halo+ tab.
- `alarms`: the timed schedule (every three hours while Chrome is open) for plans that include it.
- `storage`: the last sync time, the plan, the account's sync key (it can only deliver a sync to that account), and a
  sync kept while the account cannot be reached.
- `unlimitedStorage`: a whole term's export (every class, assignment, rubric and announcement) is several megabytes;
  it is kept only until it reaches the account.

**Remote code:** none. The sync script ships inside the package (`sync-inject.js`, generated from
`src/halo/bookmarklet.ts`); nothing is fetched and evaluated.

**Data usage disclosures (the store's checklist):**
- Collects: "Website content" (the student's own class data from Halo) and "Authentication information"? No: it
  never collects credentials; select only Website content.
- Data is not sold, not used for purposes unrelated to the single purpose, not used for creditworthiness.

**Privacy policy URL:** https://haloplus.app/privacy.html
**Homepage URL:** https://haloplus.app/
**Support:** richards.georger@gmail.com (the same address on the privacy and terms pages)

## Screenshots (1280×800, in this order)

1. `screenshot-1-now.png`: Now, the one thing to do next, with heads-ups from announcements.
2. `screenshot-2-classes.png`: every class with its grade, next deadline and pace.
3. `screenshot-3-inbox.png`: announcements read for what they ask.
4. `screenshot-4-extension-popup.png`: the extension: last sync, next sync, Sync now.
5. `screenshot-5-sync-review.png`: "What Halo sent", a new assignment and a moved date.

All five come from a throwaway account with made-up classes (no real student's data).

## After approval

- Put the store link on the You tab (Halo card) and on the landing page's "How the sync works" section.
- The extension's built-in script is a copy of the bookmark's; after any change to `src/halo/bookmarklet.ts`, run
  `npm run build:extension`, bump the manifest version, and upload again.
