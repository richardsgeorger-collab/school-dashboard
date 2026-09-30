# Halo+ for Halo (Chrome extension)

Desktop auto-sync for Plus and up. Every three hours while Chrome is running it runs the same sync the bookmark runs,
on your own Halo tab if one is open or on one it opens quietly in the background and closes after. Nothing takes
focus: an open Halo+ tab applies the sync with a small "Synced from Halo" note and Undo (removals still wait for a
review), and with Halo+ closed the sync waits in the extension until Halo+ next opens. **Sync now** in the popup runs
at once on any plan and opens Halo+ to review it. Logged out of Halo, the popup says so and the next run tries again.

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
