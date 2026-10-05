# Halo+ for Halo (Chrome extension)

Desktop auto-sync for Plus and Max (2026-10-04; it was Max only from 2026-10-01). Every three hours while Chrome is running it runs the same sync the bookmark runs,
on your own Halo tab if one is open or on one it opens quietly in the background and closes after. Nothing takes
focus. Every sync goes to your account first (the pending slot the iPad bookmark uses), so it lands with Halo+ closed:
an open Halo+ tab takes it at once, a closed one when it next opens, and either applies it with a small "Synced from
Halo" note and Undo (removals wait for your OK behind Review). Now says "Synced from Halo 6:08 AM via extension", the
time Halo was read. The popup says "Last synced" only for a sync that reached your account; if one did not, it says so
and keeps it until it can. The extension learns your account from Halo+: open Halo+ once on the computer, signed in.
**Sync now** in the popup runs at once on any plan. Logged out of Halo, the popup says so and the next run tries again.

After changing any file here, press **Reload** on the extension in chrome://extensions: Chrome keeps running the old
worker until then (2026-09-30: George's Chrome was still running the loop 154 worker hours after loop 156).

When Halo confirms a submission ("Assignment has been submitted.", "Quiz successfully submitted", or "Discussion post
has been submitted" from a DQ's submit window), the Halo page gets gold confetti and a small card, "+50 pts · CHM-113L
now 36% done", from the points Halo+ last handed the extension, and a quiet sync starts so Halo+ shows it (0.5.0;
Plus and Max; off with You → Display → Celebrations; reduced motion is a glow). The signal is Halo's own success toast,
read from Halo's code; see the top of `content-halo.js`. Test: `node scripts/e2e-joy-halo.mjs`.

Auto-sync never goes quiet (0.5.1, 2026-10-02): before each sync the worker checks the Halo tab still has its relay
(`content-halo.js`) and adds it if not, since a tab opened before an install or update has none and every sync through
it used to stall. A scheduled sync that finds Halo logged out pauses auto-sync: Halo+ says "Auto-sync paused: log in to
Halo" under the synced line, Admin → Errors hears of it once per stretch, and opening Halo logged in syncs at once.
Test: `node scripts/e2e-autosync-alarm.mjs` (the popup is never opened; the schedule is 30 seconds in a copy).

It never sees your password. It runs on Halo only while you are already logged in there; if you are not, it says so.

## Build

    npm run build:extension

writes `sync-inject.js` and `config.js` from `src/halo/bookmarklet.ts`. Set `EXT_DASH_ORIGIN` and `EXT_DASH_PATH`
to point it at another dashboard address (also change the two URLs in `manifest.json`).

## Load it unpacked (development)

1. `chrome://extensions`, turn on Developer mode.
2. Load unpacked, pick this `extension/` folder.
3. Open the dashboard once while signed in so the extension learns the plan on this device.

## Publish

Chrome Web Store developer account ($5 one-time), then upload a zip of this folder. See LAUNCH_CHECKLIST.md.
