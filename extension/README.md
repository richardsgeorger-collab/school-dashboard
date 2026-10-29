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

On Halo's own pages (0.12.0, 2026-10-27): `onhalo/` adds search, discussion drafts, word minimums, the rubric, how
long is left, topic progress, an all-classes calendar, remembered calendar views, a submission check, last feedback,
participation, PDFs on the page, clickable links, card counts and fetch-ahead, for Plus and Max (and the trial);
`halo-ui.js` adds Next on each class card. Each has its own switch in the popup and in Halo+'s You → Display.
`core.js` decides who sees what (plan, the "Show Halo+ on Halo pages" switch, the feature's switch), watches the page
with one observer, and asks Halo read-only questions one at a time; `logic.js` holds the rules (tested in
`src/halo/onHaloLogic.test.ts`); everything added carries the ⊕ mark ("Added by Halo+"). What each feature reads on
Halo, and why it shows nothing when it is not sure, is in `docs/halo-pages.md`. Tests: `scripts/e2e-onhalo-*.mjs`, one
per feature (stand-ins of Halo's pages with Halo's real stylesheets; `BROWSER=edge`, `BH_DIR=` for Better Halo); cost:
`scripts/measure-onhalo.mjs`.

0.12.1 (2026-10-28, George's fixes after testing 0.12.0 on real Halo): Halo's own "View Rubric" opens the rubric under
its row (`rubric.js`); a handed-in card shows only the time and file, under Halo's chip (`submit.js`); the all-classes
calendar is chips on due days, drawn by `calendar.js` for a class calendar and for the new "Calendar" tab on Student
Home (`homecal.js`; the tab shares the calendar's switch through a feature's `switch`); the draft offer is a "Restore
your draft from 10:42 AM?" prompt above the box (`drafts.js`); the mark is Halo+'s logo (`core.js MARK_SVG`,
`--hp-gold` in `tokens.css`).

0.12.2 (2026-10-28, George's changes after testing 0.12.1): `homeheader.js` (a compact Student Home header, own
switch); `homecal.js` is now a "Calendar · All classes" section below the class cards (the This week bar in
`halo-ui.js` links to it), each class in its card's colour (`calendar.js` reads the stripes, `logic.js boldColor`);
`rubric.js` opens short (total, one line per criterion) with "Show all levels", "Show everything" and a printable
"Open in new tab".

0.12.3 (2026-10-28): `homeheader.js` hides Student Home's title row, schedule lines and tabs from a mark on the page
root (`html[data-hp-home-compact]`, so Halo's redraws stay compact) and shows the sponsor logo in the purple bar;
`homecal.js` adds the week strip under This week (`halo-ui.js` announces `haloplus-week-placed`); `rubric.js` puts the
rubric in a box with Hide, and Halo's link reads "Hide Rubric".

0.12.4 (2026-10-28): `rubric.js` puts the Halo+ mark after Halo's View Rubric link; `homeheader.js` adds "Past classes
(N)" after the class cards (it clicks Halo's own hidden tab, and reads "Current classes" to come back). Card redesign
options are prototypes only: `scripts/mock-cards-options.mjs`, `docs/screens/cards-options/`.

0.12.5 (2026-10-28): `homecards.js` (option B for Halo's class cards: the grade, one quiet details line, the NEXT box
from `logic.js cardNext`, equal heights, a slim line for a finished class; switch `homecards`; `halo-ui.js` draws no
class line on Student Home cards while it is on); class colours come from Halo's own card style (never black after a
restyle).

0.12.6 (2026-10-28): the NEXT box reads the class colour as the week strip does (`calendar.js cardColor`: Halo's
`color` attribute or its `border-top` shorthand, which `style.borderTopColor` reads empty for a `var()`), lists
participation posts, and is calmer (`tokens.css` `.hp-n-*`); the slim line for a finished class is gone (a normal card).

0.12.7 (2026-10-28): the 0.12.6 code with the store's new name and summary (Halo+ ON HALO). 0.12.8: `homeheader.js`'s
check that the sponsor logo shows in the bar waits while a pop-up covers the whole page (the search's backdrop, a Halo
dialog); before, any change Halo made under an open search put Halo's full header back for the visit. Store pictures:
`scripts/webstore-shots-onhalo.mjs`, `scripts/webstore-tile-onhalo.mjs`.

0.12.9 (2026-10-28): the check-off on submit and Halo+ on the first load. `content-halo.js` reads Halo's success toasts
anywhere in the toast (Halo's toast starts with its icon's title "SUCCESS" and "Success", so the old anchored match
never fired on real Halo) and knows "Discussion response has been submitted"; an ordinary post is not a submission. The
worker marks a confirmed submission done at once (`haloMarks`, keyed by Halo+'s id from `halo-model.js itemId`, with
Halo's id in `h`) and sends it to the account straight away (sync-drop `mark`); no full sync. `onhalo/submitted.js`
re-reads that one class from Halo (`calendar.js refreshClass`) and takes the mark back if Halo, read twice, says not
turned in. `celebrate.js` shows the check-off (check, points counting up, this week's bar); `homecards.js` ticks it off
once on Student Home; `topic.js` counts it up. First load: `calendar.js` keeps only Halo's real answers and asks again
for the rest (1.5, 4, 10, 30 s), never remembering a miss for ten minutes; `counts.js`, `feedback.js`, `submit.js`
retry a miss; `homeheader.js` retries its logo check (three misses before giving up); `halo-ui.js` retries This week and
the class lines; `core.js` and `halo-ui.js` look again a few times after a page starts or moves; after an update every
Halo script and style goes into open Halo tabs; a copy left by an update steps aside. `core.js diag()` keeps a log of
what each Halo page waited for in `chrome.storage.local` `haloDiag` (the last ten pages, no student data).

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
