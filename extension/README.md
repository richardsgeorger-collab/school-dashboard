# Halo+ for Halo (Chrome extension)

Desktop auto-sync for Plus and up. It opens Halo in a background tab every three hours while Chrome is running,
runs the same sync the bookmark runs, and hands the export to the dashboard tab, where you approve the changes
exactly as with the bookmark. Anyone can press **Sync now** in the popup; only Plus, Pro and Max get the schedule.

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
