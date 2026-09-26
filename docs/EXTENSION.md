# Halo+ Chrome extension: sync whenever Halo is opened

The bookmark is the hardest step for a stranger and it is manual every time. The extension makes opening Halo the
sync: a content script on halo.gcu.edu waits four seconds after the page loads and, if the last sync from this
browser is more than thirty minutes old, asks the service worker to run one in that same tab. The worker injects
the same script the bookmark runs, carries the export to the Halo+ tab (opening one in the background if there is
none), and the review sheet shows what changed for approval. The timed schedule (every three hours while Chrome is
open) stays with the plans that have it; sync-on-open is for everyone, because it replaces the bookmark.

Test it unpacked: `chrome://extensions` → Developer mode → Load unpacked → the `extension/` folder. Open Halo+ once
signed in (the extension learns the plan on that device), then open halo.gcu.edu. The badge shows "…" while it
syncs. The popup has a switch to turn sync-on-open off.

## What it takes to ship

- **Chrome Web Store developer account**: $5 one time, tied to a Google account; identity verification (a phone,
  sometimes a document) since 2024. Publishing is free after that. (LAUNCH_CHECKLIST step 13; needs your OK.)
- **Review**: a new extension usually clears review in 1–3 days; anything with host permissions on a login site and
  `scripting` gets a closer look. What reviewers will want:
  - a privacy policy URL (`/privacy.html` covers it: no password, data goes only to the student's own account);
  - a single-purpose description ("Syncs your GCU Halo classes to Halo+") and screenshots (1280×800) of the popup
    and the review sheet;
  - justification text for each permission (below);
  - no remote code: the injected script ships inside the package (`sync-inject.js` is built from
    `src/halo/bookmarklet.ts` by `npm run build:extension`; nothing is fetched and evaluated).
- **Permissions and why** (`manifest.json`):
  - `host_permissions` `https://halo.gcu.edu/*`: run the sync on Halo's page while the student is logged in;
  - `host_permissions` the app origin: hand the export to the Halo+ tab (change when the domain moves,
    docs/DOMAIN_MOVE.md);
  - `scripting`: inject the sync script into the Halo tab;
  - `tabs`: find or open the Halo and Halo+ tabs;
  - `alarms`: the timed schedule (paid plans);
  - `storage`: last sync time, plan, the sync-on-open switch.
  Nothing reads cookies, history or other sites; there is no `webRequest`, no `<all_urls>`.
- **Packaging**: `zip -r halo-plus.zip extension -x '*.DS_Store'` after `npm run build:extension`; version bump in
  `manifest.json` on every upload.
- **Halo changes**: the injected script depends on Halo's GraphQL operations (docs/halo-api.md). A Halo release
  can break it; the sync then reports what failed and the app shows "Not everything came through". The extension's
  script is the same code as the bookmark, so one fix covers both.
- **Cost to run**: nothing. The extension talks to Halo and to the app; there is no server of its own.
- **Firefox / Safari**: the manifest is MV3; Firefox would need a `browser_specific_settings` block and the
  `scripting` API is fine there. Safari needs an Xcode wrapper and a $99/yr Apple developer account; not worth it
  until students ask.

## What is still manual on a phone

Chrome extensions do not run on iOS or Android Chrome. Phone users keep the bookmark (four steps in the app), or
sync from a laptop and let the account carry it over.
