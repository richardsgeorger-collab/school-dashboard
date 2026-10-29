# Store presence options, 2026-10-29 (overnight): George picks

Nothing here is uploaded or submitted, and the manifest's name is unchanged until you choose. Everything is made from
the saved Halo page copies with the real extension and the made-up student Maya Torres, in Chrome only.

**Start with:** `overview-tiles.png` and `overview-screenshots.png`. To see the tiles in the store's search results
beside Better Halo, open `local-only/` (those images contain other extensions' tiles, so they are not committed: the
repo is public).

## My picks

| What | Pick | Runner-up | Where |
|---|---|---|---|
| Title (manifest `name`) | **Halo+ for GCU: Search, Calendar & Due Dates on Halo LMS** (55) | Halo+ for GCU Halo LMS: Search, Calendar, Due Dates, Grades & Rubrics (69) | `titles.md` (12 options, top 3) |
| Summary (manifest `description`) | **Search every GCU Halo class with Ctrl+K, see what's next and your grade on every class, and open rubrics in place. Free on Halo LMS.** (132) | the shorter one in `titles.md` | `titles.md` |
| Promo tile | **F · Gold, with the search bar** | A · Gold | `tiles/F-gold-search.png` (440×280, 24-bit); `tiles/compare-*.png` each beside the live and pending tiles; `local-only/search-*.png` in results |
| Screenshots | **Style A · dark side panel** | Style B · gold, caption on top | `screenshots/A-side/1-search.png` … `5-calendar.png` (1280×800, 24-bit) |
| Description | **the rewrite** | | `description.md` (paste the block) |

Why these:
- **Title:** your pending title with Search first (the thing only Halo+ does) and "Halo LMS" added. Today Halo+ is
  missing from the store's "Halo LMS" searches; it keeps every word it already ranks for (GCU, Halo, Calendar). The
  results card shows the whole title, so the extra words cost nothing.
- **Tile F:** every other Halo tile is dark (Better Halo) or purple (Halo Global Calendar), so gold is the one a
  student sees first, and the search bar is a promise only Halo+ makes, readable at the card's 275×175. The pending
  "Halo, but better." reads like Better Halo's name, so it is out.
- **Screenshots A:** the store's bigger student extensions all use a huge headline of a few words beside one cropped
  feature; A's headline is the biggest and stays readable at the carousel's size, and the dark panel separates it from
  Halo's light pages. B puts the feature bigger; pick B if you would rather the gold carry from the tile.
- **The five:** search, what's next with the grade, checked off on submit (with the confetti), the rubric in place,
  every class on one calendar: what only Halo+ does on Halo, in that order.

## What the pictures show, and one thing to check

- Halo's real look: Halo's own stylesheets and fonts (loaded from Halo's public files when the pictures were made),
  its purple bar, and the sponsor's logo where Halo+ puts it on Student Home (in the bar, on its white plate). Class
  names are a realistic first-year GCU schedule (BIO-181, BIO-181L, MAT-250, PSY-102, COM-100, UNV-103), and the rubric
  uses GCU's level names (No Submission, Insufficient, Approaching, Acceptable, Target) with realistic descriptions.
- **Check:** the Global Credit Union logo is the wordmark Better Halo bundles (not copied into this repo), drawn in
  one dark navy. On your Halo it may be in its own colors; if it looks different, say so and I'll match it.

## Files

- `research-2026-10-29.md` (one folder up): Better Halo, Halo Global Calendar, the other GCU tools, how the store's
  search shows them, what the big student extensions do.
- `titles.md`, `description.md`: the words.
- `tiles/`: six concepts (`A-gold` … `F-gold-search`) at 440×280 and half size, `compare-*.png`, and the live and
  pending tiles (`0-live-now.png`, `0-pending.png`).
- `screenshots/A-side/`, `screenshots/B-gold/`: the five in each style.
- `local-only/` (git-ignored): each tile in a mock of the store's results for "GCU" above Better Halo, and all six at
  the card's size beside Better Halo's and Halo Global Calendar's tiles.
- Made by `scripts/webstore-options-tiles.mjs`, `scripts/webstore-options-capture.mjs` (BH_DIR for the sponsor logo),
  `scripts/webstore-options-shots.mjs`.

## Found by the research, for you (not changed)

- The store page live now is still the 0.11.1 listing (it says "7 days of Max free" and mentions Plus); none of the
  0.12.x listing is up yet.
- Halo+ is declared a **Trader**, so its store page shows your street address and phone number; Better Halo and the
  other student extensions are "Non-trader". Worth checking in the developer dashboard.
- Verify haloplus.app in the developer dashboard: Better Halo gets a blue check next to its website on every search
  card; Halo+ doesn't.
- No Halo extension is on Microsoft Edge Add-ons; an Edge listing would have GCU searches there to itself.

## When you've picked

Tell me the title, tile and style. I'll set the manifest's name and summary, put the tile and the five pictures in
`webstore-upload/`, update `docs/webstore/LISTING.md`, and build the zip. Nothing gets uploaded.
