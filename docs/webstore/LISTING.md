# Chrome Web Store listing kit

The listing as it should read for **0.5.2** (auto-sync on Plus and Max; the 0.5.1 auto-sync fix; confetti on Halo). 0.3.1 is live
(https://chromewebstore.google.com/detail/halo+/dookepepmkkakmepjabldmgfmfhfcmnn). Every file to upload is in
`webstore-upload/` (kept out of git):

| File | Where it goes |
|---|---|
| `halo-plus-extension-0.5.2.zip` | Package: manifest.json at the top level of the zip |
| `store-icon-128.png` | Store icon: 128×128, 96×96 artwork with 16 px transparent padding |
| `screenshot-1-now.png` … `screenshot-5-sync-review.png` | Screenshots: exactly 1280×800, 24-bit PNG, no transparency |
| `promo-tile-440x280.png` | Small promo tile: 440×280, 24-bit PNG, no transparency |

Remake the package: bump `"version"` in `extension/manifest.json` (every upload), `npm run build:extension`, then
from inside `extension/`: `zip -qr -X ../webstore-upload/halo-plus-extension-<version>.zip . -x README.md -x ".*"`.
Test the zip itself: unzip it somewhere and run `EXT_DIR=<there> node scripts/e2e-autosync-max.mjs` and
`EXT_DIR=<there> LOCAL_SITE=dist-site node scripts/e2e-extension.mjs`.

## What changed in 0.5.2 (upload this one; 0.5.0 and 0.5.1 were never submitted)

0.5.2 is 0.5.1 with auto-sync on Plus as well as Max (George, 2026-10-04). Free has no Halo sync. Prices unchanged.
It also adds its scripts to Halo+ and Halo tabs already open when it is installed or updated (so Halo+'s new setup
screen sees it in seconds and starts the first sync; same scripting and host permissions, nothing new).

1. **Package**: upload `webstore-upload/halo-plus-extension-0.5.2.zip`. The summary under the name changes with it
   (manifest `description`): "Syncs Halo+ with Halo: classes, assignments, grades and announcements, on its own every
   three hours, or with Sync now."
2. **Store listing → Description**: replace it with the Description below. Changed: "On Max it does this on its own…"
   is now "On Plus and Max it does this on its own…"; "(and, on Max, when it will next)" is now "(and when it will
   next)"; the last bullet no longer says auto-sync is Max.
3. **Privacy → alarms** justification: replace with the `alarms` line below ("on Plus and Max; on Free no alarm").
   Everything else on the Privacy tab is as in 0.5.1 below.
4. **Submit for review.**

## What changed in 0.5.1

0.5.1 is 0.5.0 (confetti on Halo) plus an auto-sync fix: a Halo tab opened before the extension was installed or
updated made every scheduled sync stall, and a logged-out Halo stopped auto-sync without a word. Now the worker adds its
Halo relay to such a tab itself (the scripting permission it already has), and a logged-out Halo shows "Auto-sync
paused: log in to Halo" in Halo+, is reported to Halo+'s error log once, and syncs again as soon as Halo is opened.
No new permission, no new host, no new data leaves the computer.

1. **Package**: upload `webstore-upload/halo-plus-extension-0.5.1.zip`.
2. **Store listing**: the 0.5.0 description below (nothing new needed for 0.5.1).
3. **Privacy**: the 0.5.0 changes below, and in the `storage` line the words "and whether auto-sync is paused because
   Halo was logged out" (already in the `storage` line below).
4. **Submit for review.**

## What changed in 0.5.0 (what to update in the dashboard)

0.5.0 adds one thing: when Halo confirms a submission, the Halo page shows gold confetti and a small card ("+50 pts ·
CHM-113L now 36% done") and the extension syncs so Halo+ shows it. No new permission, no new host, no new data sent
anywhere. If 0.4.0 was never submitted, do the 0.4.0 steps below too (they still apply), with this zip.

1. **Package** tab → Upload new package → `webstore-upload/halo-plus-extension-0.5.0.zip`.
2. **Store listing** tab → **Description**: replace it with the Description below (one new paragraph, "When you submit
   on Halo…"). The summary (manifest `description`) is unchanged.
3. **Privacy** tab:
   - **Host permission justification**: replace the whole box with the text below (the halo.gcu.edu part adds "and,
     when Halo shows its own confirmation that the student submitted something, sync right away and show a short
     celebration on that page").
   - **storage** justification: replace with the `storage` line below (it adds each Halo assignment's points and class
     code, and the Celebrations switch).
   - Everything else is unchanged: single purpose, alarms, scripting, tabs, unlimitedStorage, remote code (No), data
     usage (Website content only, the three certifications), privacy policy URL (the page already says this).
4. **Submit for review.**

## What changed since 0.3.1 (what to update in the dashboard for 0.4.0)

1. **Package** tab → Upload new package → `webstore-upload/halo-plus-extension-0.4.0.zip`.
2. **Store listing** tab → **Description**: replace it with the Description below. (The short summary under the name
   comes from the manifest's `description`, which the 0.4.0 package already carries:
   "Syncs Halo+ with Halo: classes, assignments, grades and announcements. Sync now on Plus; every three hours on its own on Max.")
3. **Privacy** tab:
   - **alarms** justification: replace with the `alarms` line below (the schedule is Max only now).
   - **Host permission justification**: replace the whole box with the Host permission text below. It adds the error
     log address (`…/functions/v1/report`), which 0.3.1 did not have, and says what an error report carries,
     including the browser and operating system.
   - Everything else on the Privacy tab is unchanged: single purpose, scripting, tabs, storage, unlimitedStorage,
     remote code (No), data usage (Website content only, the three certifications), privacy policy URL.
4. **Submit for review.**

## Store listing

**Name:** Halo+ (the store takes the name from `manifest.json`; change it there to rename)

**Summary:** comes from the package (manifest `description`, 125 characters):
Syncs Halo+ with Halo: classes, assignments, grades and announcements, on its own every three hours, or with Sync now.

**Description:**

Halo+ is an independent planner for GCU students. This extension keeps it in step with Halo: it reads your classes,
assignments, grades and announcements the same way Halo's own app does, in a quiet background tab it closes after,
and sends them to your Halo+ account. On Plus and Max it does this on its own every 3 hours while Chrome is open, and
you can press Sync now in the popup whenever you want fresh data. It works even when Halo+ is closed: the next time you open Halo+, the
new work is already there, with an Undo. It never takes you away from what you are doing, and it never syncs just
because you opened Halo. The popup shows when it last synced and when it will next. Logged out of Halo?
It says so in its popup and tries again next time.

When you submit on Halo, Halo+ celebrates right there: the moment Halo confirms your assignment, quiz or discussion
response went in, a little gold confetti and a card with the points and how much of the class is now done, and a
sync starts so Halo+ shows it too. Turn it off any time in Halo+ under You → Display → Celebrations.

What you get in Halo+:
• One screen that says what to do next, with the due date, how long it takes and what it is worth.
• Announcements read for you: the "due Friday" a professor only posted in an announcement lands on the assignment.
• Grades from the gradebook, with what you need on the rest of the term.
• Reminders as push notifications; works on a phone from the Home Screen.
• On Max: a Study tab: practice for any quiz or exam from your own slides, ask anything about your classes, check your work against the rubric.

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

## 0.6.3 (2026-10-09): the kit leaves the student where they were

Version 0.6.3; no permission change. After the allow page is answered, the Halo+ tab the kit was asked from is brought
back to the front and the allow tab closed by the extension; a quiet Halo tab is closed only if the extension opened it
and it is still a Halo tab. Nothing to change in the listing text.

## 0.6.2 (2026-10-09): one student's Halo, one account

Version 0.6.2; no permission change. An export kept in the extension while the account could not be reached is bound
to the sync key it was read for: when another account signs into Halo+ on the same computer, that export is dropped
rather than sent to the new account. Nothing to change in the listing text.

## 0.6.1 (2026-10-09): the help kit tries harder

Version 0.6.1; no permission change. A file the worker cannot fetch is tried from the student's Halo tab, then from a
second copy (an announcement's attachment), and a failure names the file host so it can be reported.

## 0.6.0 (2026-10-08): the help kit's course files

What changed for the listing:
- **Version** 0.6.0.
- **Optional host permission** (new, under Permissions): `https://gce-lms-resource-prod.s3.us-west-2.amazonaws.com/*`,
  the host Halo serves course files from. It is optional: installing or updating asks nothing; the first time a student
  presses "Download help kit" in Halo+, the extension opens a small page of its own where they can allow it (Chrome's
  own prompt). Declined, the kit lists the files as links instead and nothing else changes.
- **Host permission justification box**, add this sentence: "gce-lms-resource-prod.s3.us-west-2.amazonaws.com (optional,
  asked only when the student first downloads a help kit): fetch the files the professor attached to one assignment in
  Halo, using a download link Halo's own API hands the student's session, so they go into a zip on the student's
  computer. Never without the student allowing it; nothing is uploaded."
- **Description**, add one line: "Download help kit: one zip with an assignment's instructions, rubric, the announcements
  about it, the part of the syllabus about it, and the files your professor attached, ready to hand to an AI tutor."
- **Single purpose** text: unchanged (still syncing the student's own Halo data; the kit reads the same data).

**Permission justifications (Privacy tab; one box per API permission, one box for all host permissions):**

Host permission justification (the whole box):
halo.gcu.edu: run the sync on Halo's page while the student is logged in; the data is read through Halo's own API with the session that tab already holds; and, when Halo shows its own confirmation that the student submitted something, sync right away and show a short celebration on that page. haloplus.app: tell an open Halo+ tab a sync has arrived, and learn which account and plan the student is signed in to on this computer. richardsgeorger-collab.github.io: Halo+'s previous address, kept while students move over to haloplus.app; the same use. kiacmspgvntzwngijibr.supabase.co/functions/v1/sync-drop: Halo+'s own server; each sync is sent there, to the signed-in student's own account, so it arrives even when no Halo+ tab is open. kiacmspgvntzwngijibr.supabase.co/functions/v1/report: Halo+'s error log; when a sync fails or the extension crashes, it sends what went wrong (the reason, the extension version, the browser and operating system, the plan, a random id for this browser), never any class data, names or login. Only these two addresses on that host.

- `alarms`: the timed schedule (every three hours while Chrome is open) on Plus and Max; on Free no alarm is set.
- `scripting`: inject the sync script into the Halo tab when a sync is due.
- `tabs`: find the student's Halo tab (or open one in the background and close it after) and find an open Halo+ tab.
- `storage`: the last sync time, the plan, the account's sync key (it can only deliver a sync to that account), a
  sync kept while the account cannot be reached, and each Halo assignment's points and class code with the student's
  Celebrations switch (from Halo+, so a submission on Halo can show "+50 pts · CHM-113L now 36% done"), and whether
  auto-sync is paused because Halo was logged out.
- `unlimitedStorage`: a whole term's export (every class, assignment, rubric and announcement) is several megabytes;
  it is kept only until it reaches the account.

**Remote code:** none. The sync script ships inside the package (`sync-inject.js`, generated from
`src/halo/bookmarklet.ts`); nothing is fetched and evaluated.

**Data usage disclosures (the store's checklist):**
- Collects: "Website content" (the student's own class data from Halo) and "Authentication information"? No: it
  never collects credentials; select only Website content.
- Data is not sold, not used for purposes unrelated to the single purpose, not used for creditworthiness.

**Privacy policy URL:** https://haloplus.app/privacy.html (its "The Chrome extension" section says the same as this
page: single purpose, where it runs, Website content only, where it sends it, what it keeps, errors, not sold; keep
the two in step, src/landing/privacy.test.ts checks the key lines)
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

- The store link is an Admin setting (Admin → Chrome extension); with it set, Enable auto-sync (You → Halo connection,
  Max), the Max welcome's Add to Chrome step, Plus's Add to Chrome, and the landing page's link are on for desktop
  Chrome, Edge and Brave.
- The extension's built-in script is a copy of the bookmark's; after any change to `src/halo/bookmarklet.ts`, run
  `npm run build:extension`, bump the manifest version, and upload again.
