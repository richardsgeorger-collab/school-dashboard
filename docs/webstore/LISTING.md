# Chrome Web Store listing kit

## 0.12.14 (2026-10-29): upload this package instead of 0.12.13; everything else as below

0.12.14 (Loop 288): what-if on Halo's Gradebook (its own switch, "What-if on the Gradebook"): a small What-if toggle with
the Halo+ mark under Halo's score cards; on, a score box in every row, the what-if letter and percent beside Halo's own
total (marked Estimate when Halo's rows don't add up to Halo's total), "What do I need?", and the next big item in plain
words ("On Exam 1 (tomorrow), you need 81% for an A…"). Nothing in Halo changes and nothing is sent anywhere. Built on
0.12.13 (the new name, summary and store pictures). **No new permission.** Upload
`webstore-upload/halo-plus-extension-0.12.14.zip`; the description, screenshots and tile as in 0.12.13 below.

## 0.12.13 (2026-10-29): the new store presence, George's picks. Upload this; everything below is history

Loop 286 (final polish): the tile is "GCU's Halo, upgraded." on the live tile's own design (subline D, shortened to fit:
"What's next, your grades and one calendar, right on Halo."); the screenshots reordered; George's own description below.
George picked (Loop 285): screenshots in style B (gold, caption on top), the title
"Halo+ for GCU: Search, Calendar & Due Dates on Halo LMS" and the rewritten description. 0.12.13 is exactly the 0.12.12
code (Free and Max on Halo); only the manifest's name, summary and version changed (zips compared file by file). **No
new permission.** Nothing has been uploaded or submitted.

Upload, in the Chrome Web Store developer dashboard (Halo+ → each tab):

| Step | Where in the dashboard | What |
|---|---|---|
| 1 | **Package** → Upload new package | `webstore-upload/halo-plus-extension-0.12.13.zip` |
| 2 | (comes with the package) | Name **Halo+ for GCU: Search, Calendar & Due Dates on Halo LMS** (55 of 75); summary **Search every GCU Halo class with Ctrl+K, see what's next and your grade on every class, and open rubrics in place. Free on Halo LMS.** (132 of 132) |
| 3 | **Store listing → Description** | delete what is there, paste the Description block below, all of it |
| 4 | **Store listing → Screenshots** | remove every screenshot there now, then add these five in this order: `webstore-upload/screenshots/1-whats-next.png`, `2-calendar.png`, `3-checked-off.png`, `4-search.png`, `5-rubric.png` (each 1280×800, 24-bit PNG) |
| 5 | **Store listing → Small promo tile** | replace it with `webstore-upload/promo-tile-440x280.png` (440×280, 24-bit PNG): "GCU's Halo, upgraded.", subline D (Loop 286) |
| 5b | **Store listing → Official URL** | pick **haloplus.app** from the list (it lists only sites your Google account has verified in Search Console; see "Official URL" below if it is not there), then **Save draft** |
| 6 | **Privacy** | unchanged (no new permission; nothing new leaves the computer) |
| 7 | top right | **Save draft**, look at the preview, then **Submit for review** (George's step) |

The pictures were made in Chrome only, on the saved Halo page copies with the real extension and the made-up student
Maya Torres (scripts/webstore-options-capture.mjs, scripts/webstore-options-shots.mjs, scripts/webstore-options-tiles.mjs;
the options and the research are in docs/webstore/options-2026-10-29/). The pictures and tile they replace are in
`webstore-upload/old-screenshots/` (prefixed 2026-10-28-).

Worth doing in the dashboard while there (found by the research, George's call): verify haloplus.app (Account →
verified sites) so the search card shows the blue check; and check the Trader declaration (it puts a street address
and phone number on the store page; the other GCU extensions are Non-trader).

**Official URL (the blue verified check).** The store shows the check, and "Created by the owner of the listed
website", only for a site the developer account's Google account has verified in Google Search Console:
1. Open https://search.google.com/search-console signed in with the same Google account as the developer dashboard.
2. Add property → **Domain** → `haloplus.app` → Continue. Google shows a TXT record (`google-site-verification=…`).
3. At the company where haloplus.app's DNS is managed, add that TXT record to `haloplus.app` (host `@`), save, wait a
   few minutes, then press **Verify** in Search Console. (Or choose **URL prefix** `https://haloplus.app/` and the
   HTML file method: send me the file Google gives you and I'll put it in `public/` so it is served at the root.)
4. Back in the developer dashboard: **Store listing → Official URL** → choose `haloplus.app` → **Save draft**. Also
   set **Homepage URL** to `https://haloplus.app/` if it is not already.
5. It appears with the next review.

**Description** (Store listing → Description):

```
Halo+ is a planner built by a GCU student, for GCU students. It pulls everything from Halo into one clean place: your classes, assignments, due dates, grades and announcements. And it makes Halo itself better, right on Halo's own pages.

WHAT CHANGES ON HALO
• Find anything in a second. Hit Ctrl+K (⌘K on a Mac), type "topic 3 quiz," and you're there.
• Every class tells you what's next. Your grade and your next due dates, right on each class card.
• Your whole week, all your classes, one calendar. No more clicking through six classes.
• Rubrics where you need them. They open right under the assignment, not in a popup.
• Know exactly how long you have. "Due in 5h" next to every due date.
• That submit feeling. Turn something in and watch it check off, with confetti.
• Never lose a discussion post. If Halo reloads while you're typing, your draft comes back.
• Your call. Every feature has its own on/off switch.

PLANS
Free: everything on Halo. Max ($0.99/mo): Halo+ reads your announcements for you, catches the due dates and requirements professors only mention there, and syncs on its own.

PRIVACY
Halo+ reads only your own Halo, in your browser, while you're signed in there. It never asks for or sees your GCU password. Your classes go only to your own Halo+ account; nothing is sold, no ads. Announcement text is checked by AI on our server to spot a changed due date; on Max it is read in full. Drafts you type on Halo stay on your computer.

Also on your phone at haloplus.app.

Not affiliated with GCU.
```


## 0.12.12 (2026-10-29): upload this package instead of 0.12.11; the description's plans line changed

0.12.12 (Loop 283): Free and Max. Everything Halo+ adds on Halo's pages is Free now (the switches show for every
account); Max is $0.99 a month. On Free, an assignment whose due date or work an announcement changed gets one line on
its Halo page, "An announcement changed this due date · Unlock with Max" (once per assignment), which opens Max's
checkout and comes back to that page with the details; the free week's end is one note on Halo, shown once ("Keep Max ·
$0.99/mo" or "Not now"); the popup's Free line is "Max: $0.99/mo". In the description below, the plans paragraph is now
"Free: everything on Halo. Max ($0.99/mo): announcements read for you and auto-sync." **No new permission.** Upload
`webstore-upload/halo-plus-extension-0.12.12.zip`.

## 0.12.11 (2026-10-29): upload this package instead of 0.12.10; everything else as below

0.12.11 (Loop 282): the submit toast shows the item, "+30 pts" and the week's bar, without the "3 of 10 this week"
words. Otherwise 0.12.10. **No new permission.** Upload `webstore-upload/halo-plus-extension-0.12.11.zip`.

## 0.12.10 (2026-10-29)

0.12.10 (Loop 280): the submit moment as one Halo-style toast with big confetti (canvas-confetti, bundled in the
package, no remote code), and a calm loading state on Student Home ("as of" the last saved state when Halo does not
answer). **No new permission.** Upload `webstore-upload/halo-plus-extension-0.12.10.zip`. If the review asks about
third-party code: `vendor/canvas-confetti.js` is canvas-confetti 1.9.4 (ISC licence, `vendor/canvas-confetti.LICENSE.txt`),
unmodified, from npm (integrity sha512-yxQbJkAVrFXWNbTUjPqjF7G+g6pDotOUHGbkZq2NELZUMDpiJ85rIEazVb8GTaAptNW2miJAXbs1BtioA251Pw==).

## 0.12.9 (2026-10-28): upload this package instead of 0.12.8; everything else as below

0.12.9 (Loop 279): a submission is checked off the moment Halo confirms it (Halo+ had been missing Halo's real toasts),
everywhere at once and in the Halo+ app, with a moment on the page; Halo+ appears on the first load every time (one
missed answer from Halo was kept for ten minutes). **No new permission.** Upload
`webstore-upload/halo-plus-extension-0.12.9.zip`; the name, summary, description, screenshots, tile and Privacy tab
are the ones in "The listing now" below, unchanged.

## The listing now: Halo+ ON HALO, 0.12.8 (or 0.12.7) (2026-10-28): paste exactly this

The store page is now about Halo+ on Halo's own pages, for someone whose only introduction is the store page: a new
name and summary (in the manifest, so they come with the package), five new screenshots on Halo's pages, a new promo
tile and a new description. No prices anywhere on it. **No new permission**; the Privacy tab is unchanged.

Two packages, the same name, summary and pictures:
- **0.12.8 (recommended):** 0.12.7 plus one fix found while making the pictures: with the search open on Student Home,
  any change Halo made to the page made Halo+ put Halo's full header back for the rest of the visit (the search's
  backdrop covers the sponsor logo, and the check that keeps the sponsor logo visible read that as hidden). The check
  now waits while a pop-up covers the whole page; a logo really covered still brings Halo's header back.
- **0.12.7:** exactly the 0.12.6 code, only the manifest's name, summary and version changed (as asked).

| Where in the dashboard | What |
|---|---|
| **Package** → Upload new package | `webstore-upload/halo-plus-extension-0.12.8.zip` (or `halo-plus-extension-0.12.7.zip`) |
| Name and summary | come from the package: **Halo+ for GCU: Calendar, Search & Due Dates on Halo** (51 of 75 characters); **Makes GCU's Halo better right on the page: search, one calendar for all classes, what's next on every class, rubrics and more.** (126 of 132) |
| **Store listing → Description** | the Description block below, all of it |
| **Store listing → Screenshots** | remove the five there now, then add in this order: `webstore-upload/screenshots/1-home.png`, `2-calendar.png`, `3-search.png`, `4-rubric.png`, `5-next.png` (1280×800, 24-bit PNG) |
| **Store listing → Small promo tile** | `webstore-upload/promo-tile-440x280.png` (440×280, 24-bit PNG) |
| **Privacy** | unchanged (no new permission, nothing new leaves the computer) |
| Then | **Submit for review** |

The screenshots (scripts/webstore-shots-onhalo.mjs) are the saved Halo page copies with the real extension and the demo
student Maya Torres (made up), plain Halo with its purple bar, a caption on each: 1 "Halo’s home page, with your week
at a glance" (search, This week, the week strip, the class cards with NEXT); 2 "Every class, one calendar" (a class's
Calendar, All classes); 3 "Find anything in your classes: ⌘K or Ctrl+K" ("topic 3"); 4 "The rubric, right under the
assignment"; 5 "Your grade and what’s next, on every class" (two cards at 125%). Left out of the pictures: the test
page's placeholder sponsor logo (it says "stand-in"; covered with the bar's purple) and Halo+'s corner pill (it read
"Due in 2h" in the evening, over the cards). The tile (scripts/webstore-tile-onhalo.mjs): a slice of the same Student
Home (Halo's bar, Halo+'s search and This week) and "Halo, but better." with the Halo+ mark. The 2026-10-24 pictures
and tile are in `webstore-upload/old-screenshots/`.

**Description** (Store listing → Description):

```
Halo+ makes GCU's Halo better right on Halo's own pages. Nothing new to learn: open Halo as you always do, and it's there.

On Halo, with Halo+:
• Search every class at once. Press Ctrl+K (⌘K on a Mac) on any Halo page and type a topic, an assignment or a file.
• Every class on one calendar. Halo's calendar shows one class at a time; Halo+ adds "All classes", each in its Halo colour.
• What's next on every class card: your grade at the top, then the next things due, soonest first, and what you can't do yet with why ("Exam 1 · in class Fri").
• This week on Halo's home page, with a strip of the days ahead.
• The rubric right under the assignment, instead of a new tab.
• How long you have beside each due date, topic progress, participation this week, PDFs that open on the page, your discussion drafts kept on your computer, your word count against the minimum, and Halo's own proof that your file went through.
• Each one has its own switch, so you keep only what you want.

Behind it, a planner of your own:
• Reads your Halo announcements for you: a due date that moved or a new requirement, caught and put on the right assignment.
• Your real Halo grades for every class, and your semester GPA.
• Works on your phone: your laptop syncs Halo; open Halo+ on your phone and the whole week is there.

After Add to Chrome: make a free Halo+ account (one step), then open Halo. Your classes, due dates and grades come in on their own. About two minutes.

Free: everything on Halo. Max ($0.99/mo): announcements read for you and auto-sync.

Built for Grand Canyon University students who use Halo. The extension reads only your own Halo, while you're logged in there. It never asks for, sees or stores your GCU password, and it sends your classes only to your own Halo+ account. The code is public: https://github.com/richardsgeorger-collab/school-dashboard.

Not affiliated with GCU.
```

## 0.12.6 (2026-10-28)

0.12.6 (Loop 277): a calmer NEXT box on Halo's class cards: each class's own colour (no longer plain gray), more room
between items, the title in Halo's link style with its time right after it, what cannot be done yet in plain gray with
why, participation posts included; a finished class is a card like the others in Halo's grid. **No new permission.**
Upload `webstore-upload/halo-plus-extension-0.12.6.zip`; the description and the Privacy tab as below, unchanged.

## 0.12.5 (2026-10-28)

0.12.5 (Loop 276): Halo's class cards on Student Home with the class grade at the top right, the details on one quiet
line and a NEXT box (up to three things for the class, each opening on Halo); cards in a row one height; a finished
class as one slim line with its final grade; its own switch. **No new permission.** Upload
`webstore-upload/halo-plus-extension-0.12.5.zip`; the description and the Privacy tab as below, unchanged.

## 0.12.4 (2026-10-28)

0.12.4 (Loop 275): the Halo+ mark beside Halo's View Rubric / Hide Rubric; a small "Past classes (N)" link after the
class cards on the compact Student Home (Halo's own Past Classes view, and back). **No new permission.** Upload
`webstore-upload/halo-plus-extension-0.12.4.zip`; the description and the Privacy tab as below, unchanged.

## 0.12.3 (2026-10-28)

0.12.3 (Loop 274): George's changes after testing 0.12.2. The compact Student Home (same switch) now hides Halo's title
row and tabs and shows the school's sponsor logo in Halo's purple bar, so search, This week and the class cards start
right under the bar; it stays compact when Halo redraws Student Home without reloading; a slim week strip under This
week (a dot per thing due, in each class's colour) opens the calendar on a day; the rubric opens in a box of its own,
with Hide, and Halo's link reads "Hide Rubric" while it is open. **No new permission.** Upload
`webstore-upload/halo-plus-extension-0.12.3.zip`; the description and the Privacy tab as below, unchanged.

## 0.12.2 (2026-10-28)

0.12.2 (Loop 273): George's changes after testing 0.12.1. A compact Student Home header (the title and the school's
sponsor logo on one row, Halo's two schedule lines folded into a "View your full schedule" link; its own switch); the
all-classes calendar as its own section below the class cards ("Calendar · All classes", folds, starts on one week,
each class in its card's own colour), reached from a "Calendar" link in the This week bar; the rubric short first
(the total, one line per criterion with its top level), with "Show all levels", "Show everything" and a printable
"Open in new tab". **No new permission.** Upload `webstore-upload/halo-plus-extension-0.12.2.zip`; the description and
the Privacy tab are as below (0.12.1/0.12.0), unchanged.

## 0.12.1 (2026-10-28)

0.12.1 (Loop 272): George's fixes after testing 0.12.0 on real Halo. Halo's own "View Rubric" opens the rubric right
under its row (a second click closes it); a handed-in card shows only what Halo's card does not (when it was sent and
which file); the all-classes calendar shows each item on its due day as a small chip, and has its own "Calendar" tab
on Student Home; a clearer "Restore your draft from 10:42 AM?" above the reply box; Halo+'s real logo mark (the gold
ring with the plus) on everything it adds. **No new permission.** Upload `webstore-upload/halo-plus-extension-0.12.1.zip`;
the Privacy tab is the 0.12.0 one below, unchanged; in the 0.12.0 description below, one phrase changed ("the rubric right on the assignment"): paste it again.

## 0.12.0 (2026-10-27)

0.12.0 (Loop 271): Halo+ on Halo's own pages, for Plus and Max (the trial included), each with its own switch in the
popup under "Show Halo+ on Halo pages": search across classes (Student Home and Ctrl/⌘+K), "Next" on each class card,
drafts kept on the computer, the word minimum in Halo's editor, the rubric under the instructions, how long you have
beside due dates, all classes on Halo's calendar, topic progress, Halo's own submission confirmation and a wrong
file type warning, participation this week, PDFs on the page, last feedback, counts on Better Halo's card buttons where
its own are missing, clickable links in announcements, the calendar's view choice remembered, and the next page's code
fetched ahead. Free is unchanged. **No new permission** (the same five, the same hosts). Drafts stay in the browser's own
extension storage and are never sent anywhere. The description gains one bullet; the Privacy tab's single-purpose
sentence gains "and shows that planner's help on Halo's own pages".

| Where in the dashboard | What |
|---|---|
| **Package** → Upload new package | `webstore-upload/halo-plus-extension-0.12.0.zip` |
| **Store listing → Description** | the Description block below, all of it |
| **Store listing → Screenshots** | unchanged (optional: add `docs/screens/on-halo/search/plain-2-home-results.png` cropped to 1280×800) |
| **Privacy** | no new permission; nothing new leaves the computer. One line to update: **Single purpose** now reads "Syncs the signed-in student's own GCU Halo classes, assignments, grades and announcements to their Halo+ planner, and shows that planner's help on Halo's own pages." (Halo+ has shown on Halo's pages since 0.8.0; this says so.) |
| Then | **Submit for review** |

**Description** (Store listing → Description):

```
Halo buries your due dates in five places: the assignment page, the gradebook, the syllabus, a discussion thread, and the announcements your professor posts on a Tuesday night that move a quiz or add "bring goggles to lab." Miss one and it costs you points.

Halo+ reads all of it and gives every GCU class one plan: what's due next, what changed, and what to start today.

What Halo+ does that a plain calendar can't:
• Reads your Halo announcements for you. A due date that moved, a new requirement, "closed-toe shoes for Lab 4": caught and put on the right assignment.
• "This week" on Halo's home page: everything due across your classes, in Halo's own look.
• Your grade on every class card on Halo's home page, with a refresh that reads it straight from Halo.
• On Halo's own pages, with Plus or Max: search every class with Ctrl+K, the rubric right on the assignment, how long you have beside each due date, all your classes on Halo's calendar, PDFs that open on the page, a copy of your discussion drafts on your computer, your words against the minimum, and Halo's own proof that your file went through.
• Tells you what's due next, not just what's due. One card says what to start now, with how long it takes and what it's worth.
• Your real Halo grades for every class, and your semester GPA worked out from them.
• Works on your phone. Your laptop syncs Halo; open Halo+ on your phone and the whole week is there.
• Syncs whenever you're on Halo. Plus and Max also sync on their own every 3 hours while Chrome is open.

After Add to Chrome: make a free Halo+ account (one step), then open Halo. Your classes, due dates and grades come in on their own, and This week shows on Halo's home page. About two minutes.

Built for Grand Canyon University students who use Halo: assignments, due dates, a calendar and a planner in one place. The extension reads only your own Halo, while you're logged in there. It never asks for, sees or stores your GCU password, and it sends your classes only to your own Halo+ account. The code is public: https://github.com/richardsgeorger-collab/school-dashboard. Free syncs Halo whenever you're on Halo and shows your due dates, grades and GPA; Plus reads every announcement for you and syncs on its own every 3 hours; Max adds the study tools.

Not affiliated with GCU.
```

## The listing before: 0.11.1 (2026-10-26)

0.11.1 (Loop 269): each class's grade on its Halo Student Home card ("Halo+ · B 86.0% ↻ · 1 this week"), Halo's own
letter and percent, with a refresh that reads that one class's grade straight from Halo (no sync, no Halo tab), saved
to the account; nothing twice when Better Halo already shows the grade. 0.11.0 (Loop 268): Free syncs whenever the
student is on Halo; a Web Store install gets a one-step welcome tab; a small "Set up Halo+" pill before an account
exists. No new permission since 0.7.2; the Privacy tab is unchanged. The description below is complete (two bullets
are new and the closing paragraph is rewritten: it still said Plus was what synced Halo).

| Where in the dashboard | What |
|---|---|
| **Package** → Upload new package | `webstore-upload/halo-plus-extension-0.11.1.zip` |
| **Store listing → Description** | the Description block below, all of it |
| **Store listing → Screenshots** | unchanged from 0.10.4 (`webstore-upload/screenshots/1-this-week-on-halo.png` … `5-announcements-caught.png`) |
| **Privacy** | unchanged (no new permission) |
| Then | **Submit for review** |

**Description** (Store listing → Description):

```
Halo buries your due dates in five places: the assignment page, the gradebook, the syllabus, a discussion thread, and the announcements your professor posts on a Tuesday night that move a quiz or add "bring goggles to lab." Miss one and it costs you points.

Halo+ reads all of it and gives every GCU class one plan: what's due next, what changed, and what to start today.

What Halo+ does that a plain calendar can't:
• Reads your Halo announcements for you. A due date that moved, a new requirement, "closed-toe shoes for Lab 4": caught and put on the right assignment.
• "This week" on Halo's home page: everything due across your classes, in Halo's own look.
• Your grade on every class card on Halo's home page, with a refresh that reads it straight from Halo.
• Tells you what's due next, not just what's due. One card says what to start now, with how long it takes and what it's worth.
• Your real Halo grades for every class, and your semester GPA worked out from them.
• Works on your phone. Your laptop syncs Halo; open Halo+ on your phone and the whole week is there.
• Syncs whenever you're on Halo. Plus and Max also sync on their own every 3 hours while Chrome is open.

After Add to Chrome: make a free Halo+ account (one step), then open Halo. Your classes, due dates and grades come in on their own, and This week shows on Halo's home page. About two minutes.

Built for Grand Canyon University students who use Halo: assignments, due dates, a calendar and a planner in one place. The extension reads only your own Halo, while you're logged in there. It never asks for, sees or stores your GCU password, and it sends your classes only to your own Halo+ account. The code is public: https://github.com/richardsgeorger-collab/school-dashboard. Free syncs Halo whenever you're on Halo and shows your due dates, grades and GPA; Plus reads every announcement for you and syncs on its own every 3 hours; Max adds the study tools.

Not affiliated with GCU.
```

## The listing before: 0.10.4 (2026-10-24)

Same title and summary (they live in the package, unchanged since 0.7.2). The description gains one line for "This
week" on Halo's home page and one for the GPA, and loses "7 days free, no card" (no price or trial talk before someone
has tried it, as on the home page). No new permission since 0.7.2; the Privacy tab is unchanged.

| Where in the dashboard | What |
|---|---|
| **Package** → Upload new package | `webstore-upload/halo-plus-extension-0.10.4.zip` |
| **Store listing → Description** | the Description block below, all of it |
| **Store listing → Screenshots** | remove the old five, add these five in this order (1280×800, 24-bit): `webstore-upload/screenshots/1-this-week-on-halo.png`, `2-today-and-tomorrow.png`, `3-on-the-assignment.png`, `4-gpa.png`, `5-announcements-caught.png` |
| **Store listing → Small promo tile** | `webstore-upload/promo-tile-440x280.png` (440×280, 24-bit) |
| **Privacy** | unchanged (no new permission) |
| Then | **Submit for review** |

**Description** (Store listing → Description):

```
Halo buries your due dates in five places: the assignment page, the gradebook, the syllabus, a discussion thread, and the announcements your professor posts on a Tuesday night that move a quiz or add "bring goggles to lab." Miss one and it costs you points.

Halo+ reads all of it and gives every GCU class one plan: what's due next, what changed, and what to start today.

What Halo+ does that a plain calendar can't:
• Reads your Halo announcements for you. A due date that moved, a new requirement, "closed-toe shoes for Lab 4": caught and put on the right assignment.
• "This week" on Halo's home page: everything due across your classes, in Halo's own look.
• Tells you what's due next, not just what's due. One card says what to start now, with how long it takes and what it's worth.
• Your real Halo grades for every class, and your semester GPA worked out from them.
• Works on your phone. Your laptop syncs Halo; open Halo+ on your phone and the whole week is there.
• Syncs on its own every 3 hours while Chrome is open (Plus and Max), or press Sync now.

Built for Grand Canyon University students who use Halo: assignments, due dates, a calendar and a planner in one place. The extension reads only your own Halo, while you're logged in, and sends it to your own Halo+ account. Free keeps your classes from your syllabi; Plus adds Halo sync and announcements read for you; Max adds the study tools.

Not affiliated with GCU.
```

## The listing in 0.7.2 (2026-10-12)

Written to be found next to the other GCU Halo extensions (Better Halo, Halo Global Calendar): the words students type
(Halo, GCU, Grand Canyon, assignments, due dates, calendar, planner) are in the title, the summary and the first lines.
No code and no permission changed; the title and the summary live in the package, so they ship as 0.7.2.

| Where in the dashboard | What |
|---|---|
| **Package** → Upload new package | `webstore-upload/halo-plus-extension-0.7.2.zip` (sets the **title** and the **summary** below; nothing else changed) |
| **Store listing → Description** | the Description block below, all of it |
| **Store listing → Screenshots** | remove the old five, add `webstore-upload/screenshots/1-whats-due-next.png` … `5-ask-a-question.png` in that order (1280×800, 24-bit) |
| **Store listing → Category** | Education → "Tools" (unchanged) |
| **Privacy** | unchanged from 0.6.x (no new permission; the optional file host stays optional) |
| Then | **Submit for review** |

**Title** (manifest `name`, 52 of 75 characters):

```
Halo+ for GCU: Every Due Date, Even in Announcements
```

**Summary** (manifest `description`, 121 of 132 characters):

```
Every GCU Halo due date in one planner, even ones buried in announcements. Works on your phone and shows what's due next.
```

**Description** (Store listing → Description):

```
Halo buries your due dates in five places: the assignment page, the gradebook, the syllabus, a discussion thread, and the announcements your professor posts on a Tuesday night that move a quiz or add "bring goggles to lab." Miss one and it costs you points.

Halo+ reads all of it and gives every GCU class one plan: what's due next, what changed, and what to start today.

What Halo+ does that a plain calendar can't:
• Reads your Halo announcements for you. A due date that moved, a new requirement, "closed-toe shoes for Lab 4": caught and put on the right assignment.
• Tells you what's due next, not just what's due. One card says what to start now, with how long it takes and what it's worth.
• Your real Halo grades for every class, and what an assignment does to your grade before you turn it in.
• Works on your phone. Your laptop syncs Halo; open Halo+ on your phone and the whole week is there.
• Syncs on its own every 3 hours while Chrome is open (Plus and Max), or press Sync now.

7 days free, no card.

Built for Grand Canyon University students who use Halo: assignments, due dates, a calendar and a planner in one place. The extension reads only your own Halo, while you're logged in, and sends it to your own Halo+ account. Free keeps your classes from your syllabi; Plus adds Halo sync and announcements read for you; Max adds the study tools.

Not affiliated with GCU.
```

## Earlier listings (for reference)


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
Syncs the signed-in student's own GCU Halo classes, assignments, grades and announcements to their Halo+ planner, and shows that planner's help on Halo's own pages.

## 0.7.1 (2026-10-12): the popup never says "Syncing…" forever (built as 0.6.6; the store already had 0.7)

Version 0.6.6; no permission change. A sync the extension finishes after Chrome restarted it now clears its "Syncing"
state like any other; the popup treats two minutes with no word from Halo as stopped, says so, and offers Try again;
a sync Halo+ applies from anywhere (the bookmark too) shows in the popup as the last sync. Nothing to change in the
listing text.

## 0.6.5 (2026-10-12): Sync now on Halo+ says how it ended

Version 0.6.5; no permission change. Halo+'s own Sync now button asks the extension to sync (on any plan, joining a
sync already running), and the extension tells open Halo+ tabs how each sync ended (landed, Halo logged out, refused,
no connection), so the page never says "Syncing…" forever. Nothing to change in the listing text.

## 0.6.4 (2026-10-11): one Halo student, one Halo+ account, and a way to move it

Version 0.6.4; no permission change. Each sync now carries a one-way hash of the Halo student's identity (never the
identity itself) so Halo+ can tell students in the same class apart. When a Halo account is linked to a different
Halo+ account, the extension opens Halo+, which asks the student whether to move it. Nothing to change in the listing
text; if a reviewer asks about data, the hash is the only new field and it is not reversible.

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

Now (2026-10-28, Halo+ ON HALO): `webstore-upload/screenshots/1-home.png`, `2-calendar.png`, `3-search.png`,
`4-rubric.png`, `5-next.png` (see "The listing now" at the top). The set below is from 2026-09-30, for reference.

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
