# Chrome Web Store listing for 0.4.0 (auto-sync is Max)

Not submitted. 0.3.1 is still in review with the old text (`LISTING.md`); once it is approved, upload the 0.4.0
package and paste these in the same sitting, so the store, the extension and the app all say the same thing.
Written 2026-10-01, when auto-sync moved from Plus to Max.

## What changes in the package (already in the repo, not uploaded)

- `extension/manifest.json` version `0.3.2` → `0.4.0`.
- `extension/manifest.json` description (the summary Chrome shows under the name, 132 characters max):
  - Was: `Keeps Halo+ in sync with Halo: your classes, assignments, grades and announcements, every three hours. Part of Plus.`
  - Now: `Syncs Halo+ with Halo: classes, assignments, grades and announcements. Sync now on Plus; every three hours on its own on Max.` (125)
- Scheduled syncs run only on Max (and a Max trial or a friend-link Max). On Plus the popup says "Auto-sync is part
  of Max. Sync now still works on Plus." with Get Max, and Sync now works.
- The server already refuses a scheduled sync from a non-Max account, for every extension version, including 0.3.1.

## Summary (store field, 132 characters max; this is 129)

Syncs GCU Halo classes, grades and announcements to Halo+. Sync now on Plus; auto-sync every 3 hours on Max. Never your password.

## Description

Halo+ is an independent planner for GCU students. This extension keeps it in step with Halo: it reads your classes,
assignments, grades and announcements the same way Halo's own app does, in a quiet background tab it closes after,
and sends them to your Halo+ account. On Max it does this on its own every 3 hours while Chrome is open; on Plus you
press Sync now in the popup whenever you want. It works even when Halo+ is closed: the next time you open Halo+, the
new work is already there, with an Undo. It never takes you away from what you are doing, and it never syncs just
because you opened Halo. The popup shows when it last synced (and, on Max, when it will next). Logged out of Halo?
It says so in its popup and tries again next time.

What you get in Halo+:
• One screen that says what to do next, with the due date, how long it takes and what it is worth.
• Announcements read for you: the "due Friday" a professor only posted in an announcement lands on the assignment.
• Grades from the gradebook, with what you need on the rest of the term.
• Reminders as push notifications; works on a phone from the Home Screen.
• On Max: auto-sync every 3 hours, and a Study tab: practice for any quiz or exam from your own slides, ask anything about your classes, check your work against the rubric.

Privacy: the extension runs only on halo.gcu.edu and on the Halo+ site. It never asks for, reads or stores your
password; it uses the session you already have in that tab. Nothing is sent anywhere except to your own Halo+
account. It does not read cookies, history or any other site. The code is public:
https://github.com/richardsgeorger-collab/school-dashboard

Halo+ is not affiliated with, endorsed by, or connected to Grand Canyon University. Halo is GCU's learning
platform.

## Review form answers that change

- `alarms`: the timed schedule (every three hours while Chrome is open) on Max; on any other plan no alarm is set.
- `storage`: unchanged wording still true (the plan is kept so the worker knows whether to schedule).

Everything else in `LISTING.md` stays as it is: single purpose, the other permission answers, data disclosures,
privacy policy, homepage and support.

## After uploading

- Move this text into `LISTING.md` (it becomes the current listing) and delete this file.
- `src/landing/privacy.test.ts` checks the privacy page against `LISTING.md`; the privacy page does not mention plans,
  so it needs no change.
