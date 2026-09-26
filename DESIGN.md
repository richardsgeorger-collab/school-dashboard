# Halo+ design

The bar: a stressed student opens Halo+ and, in two seconds, knows the one thing to do next and feels calmer than
before. Stripe is the reference for how a screen earns that: calm, one thing at a time, nothing decorative.

## 1. What great looks like (specific takeaways)

**Stripe (dashboard, onboarding)**
- One primary action per screen. It is the only filled button; everything else is a quiet text button or a
  hairline-bordered secondary. You never wonder what to press.
- Hierarchy by weight and colour, not size. Body text is one size (14–15px); headings are barely bigger but heavier
  and darker; secondary text is the same size in a lighter ink. Screens read as two tones of ink, not five sizes.
- Whitespace is structural. 24px between groups, 8–12px within a group. Cards have no visible border on light
  backgrounds; a 1px hairline at 6–8% ink and a shadow so soft it reads as "lifted", never "boxed".
- Onboarding is one question per screen with a progress bar that never lies, a big single button, and the answer
  visible immediately (a connected bank shows its balance before you have closed the sheet).
- Numbers are tabular and monospaced-aligned so columns line up; dates are short ("Sep 24", "in 2 days").
- Motion is 150–250ms, ease-out, and only on things that change state (a sheet rising, a row settling). Nothing
  moves on load for effect.

**Linear**
- The keyboard-and-thumb rule: every list row is one full-width tap target, 44px tall, with one line of primary
  text and one muted line. No row has more than two pieces of metadata.
- Dark mode is designed, not inverted: near-black surfaces with 4–6% white borders, and accents desaturated so
  they do not glow.
- Status is a small dot or a 2-letter pill, never a coloured background across the row.
- Empty states are a sentence and a button, centred, with a lot of air. They look like a pause, not an error.

**Things 3**
- The home screen shows one list (Today) and hides the rest behind a single navigation level. Counts are tiny.
- Checking something off is the most satisfying interaction in the app: the circle fills, the row fades, the list
  closes the gap. Everything else is quiet so that moment lands.
- Headings are big and warm ("Today", "This Evening") and the rest of the screen is small. One display size, one
  body size.
- A due-soon item gets one small, warm indicator. Nothing is red unless it is actually overdue.

**Apple (Reminders, Weather, Fitness)**
- Weather: the hero is the answer ("72°, Clear"), huge; everything else is a grouped card below with a one-word
  header in small caps. Grouped cards on a tinted background, no borders.
- Fitness: progress is a ring, and one ring is enough. Closing it is the reward; the app celebrates it once.
- Reminders: the big heading is the list name; the tab bar has five items and never more; sheets slide up from the
  bottom for anything that needs input, never a centred modal on a phone.
- Copy is short and specific: "No Reminders" not "You have no reminders yet!"

**What we take from all four**
1. One primary action per screen. Everything else is visually quiet.
2. Two ink tones (primary, secondary) and one body size do most of the hierarchy work. Display size only for the
   thing that answers the question of the screen.
3. Cards float on a tinted background with hairline borders; no heavy strokes, no coloured card backgrounds.
4. Sheets from the bottom on a phone; never centred modals.
5. One accent colour, used for the primary action and the "now" marker only. Status colours only for real status.
6. Motion only on state change, 150–250ms, ease-out, reduced-motion respected.
7. Numbers tabular; dates relative and short.
8. Every empty state is a sentence and one button, and reads as calm.
9. Progress is a single ring or bar, closed once a day, celebrated once.
10. Fewer things on screen always beats more. If in doubt, tuck it behind one tap.

## 2. The system

Everything is in `src/styles/tokens.css` (the values) and `src/styles/components.css` (the pieces). Screens add
layout on top; no screen defines a colour, a size or a shadow of its own.

- **Type**: Inter for everything, JetBrains Mono for numbers and codes. Six sizes, used for exactly one job each:
  display 28/600 (the one answer on a screen: the Now title, the hero title), title 22/600 (page titles), heading
  16/600 (card titles inside a sheet), body 15/400, small 13/400 (meta, hints), micro 11/500 caps (eyebrows, section
  labels). Weight and ink do the hierarchy; size rarely changes within a screen.
- **Ink**: two tones for text (`--ink`, `--ink-2`) and a third (`--ink-3`) only for labels and disabled things.
- **Colour**: page `#f4f5f7`, cards white, hairline at 8% ink. One accent, blue `#2f6bff`, for the primary button and
  the "now" marker only. Status colours (ok, warn, danger) only for real status, always as a soft tint with the
  colour as text. The gold halo is the brand mark and one celebratory moment; never text. No purple anywhere.
- **Dark**: designed, not inverted: `#0b0d11` page, `#14171d` cards, 8% white hairlines, the accent lifted to
  `#6b8cff` so it does not glow.
- **Spacing**: 4px scale. 24 between groups, 12 inside a card, 8 between rows, 20 gutters on a phone.
- **Radius**: 12 buttons and rows, 16 cards, 22 the hero and sheets, pill for pills.
- **Depth**: hairline plus a shadow at 4% for rows, a second soft 16% layer for the hero. Nothing else has depth.
- **Motion**: 150ms hover, 240ms sheets, 420ms the Done animation. `ease-out` only. Reduced motion zeroes them.
- **Components**: card, button (primary, secondary, quiet, danger, small), row (dot, title, meta, trailing), pill,
  sheet (every modal rises from the bottom on a phone), empty state, progress bar, ring, segmented control,
  eyebrow. Every screen is built from these and nothing else.

## 3. Now: three directions, one pick

Screenshots in `docs/screens/directions/`.

- **A, Focus** (`direction-a`): the day's answer as the title with a progress ring beside it, one hero card (what,
  why, how long, how much, Start), then a short "Then" list of the next three, then quiet notes.
- **B, Timeline** (`direction-b`): the same pieces on a vertical timeline with a "Now" dot.
- **C, Deck** (`direction-c`): the hero as the top card of a stack with a "4 left" pill and nothing else on screen.

**A ships.** The 2-second test is what decides it: A puts the answer and the one card in the top 60% of the screen
and nothing competes with them. B's line and dots promise a schedule the data does not have (there are no times),
so they are decoration, and they push the card right and narrow it. C hides the "then" that makes the one thing
feel finite, and the count pill collides with the status pill; a stack also invites swiping, which is the one
gesture that must never mean "done" by accident on a phone.

What changed after seeing A: the status sentence split into a display title and a quiet subline (three lines of
display type is not calm), the stray underline on the title went, the "Then" rows got their meta on its own line,
and the section labels went to small caps. The Done animation is the card leaving (400ms scale and fade) and the
ring filling; nothing else on the screen moves.

## 4. The other screens

Final screenshots in `docs/screens/after/` (every screen, 390×844, light and dark); the originals are in
`docs/screens/before/`.

- **Rows** (`ItemRow`): one component everywhere. A 22px check circle, a 500-weight title, one muted meta line, and
  a status pill on the right only when there is real status (overdue, due today, at risk). The coloured left border
  is gone; the course is a dot and a mono code in the meta line.
- **Calendar**: the title and the Agenda/Month control share the first line; ‹ › and a Filter button share the
  second, with Today appearing only when you are not on it and the class chips only while filtering. Agenda rows
  drop the date the day header already gives. The month grid is tint only: warm for heavy days, a count pill in the
  cell, today as a filled accent circle, and no coloured borders or second markers; red is reserved for the overdue
  dot.
- **Classes**: one "synced" line under the title instead of one per card; a card is the course dot, the name, the
  next meeting and the next deadline, and a grade only when there is one.
- **Inbox**: announcements are cards with a course code, a date and the body; the filter chips only appear when
  there is something to filter; an empty inbox is a sentence and a Sync button.
- **You**: the level card is a level, one bar and two streak tiles; badges are grey until earned and explain
  themselves on tap, not in a paragraph. Plans are one card per tier with the price large, a short list, one
  button. Sections leave room for the sticky bar when a link scrolls to them.
- **Class page**: a title, the meetings, one sync line, three equal actions on one row, then a card with an
  eyebrow ("Next deadline"), the item, and four stats with micro labels.
- **Onboarding**: one question per screen, a progress bar that matches the step count, a single full-width
  primary button (52px) and a quiet secondary; the device choice is the same segmented control the rest of the app
  uses; the "not affiliated" line stays under the first button.
- **Sheets**: every modal (item detail, sync, review) is a bottom sheet with a handle, a 17px title and a round
  close button; field labels are small and 500-weight, hints under a field are small, regular and third-ink.
- **Landing**: the app's own tokens and type (Inter, the blue accent, hairline cards), the Halo+ mark, a headline
  that says what the app answers, one primary "Start free" button, and a mock of the Now screen in the hero so the
  page shows the product instead of describing it. Plans and the sync steps are cards and a list; the footer keeps
  the "not affiliated with Grand Canyon University" line. `prefers-color-scheme` drives dark.
- **AI, Load**: restyled with the same pieces (segmented control, hairline cards); the locked card is a hairline
  card with a micro tier label, not a dashed box.

Two things worth knowing when reading the shots:
- Fresh-profile screens (onboarding, the empty Now) render light in both columns because the theme defaults to
  light and dark mode is a Plus feature; the landing page and every seeded screen show real dark mode.
- "Not synced from Halo yet" and the overdue counts in the sample term are the seeded data, not a defect.

Rules that held throughout: one filled button per screen; two ink tones; status colour only for real status; sheets
from the bottom; no colour, size or shadow defined outside `tokens.css`; every screen built from the components in
`components.css`. Anything a screen needed that the system did not have was added to the system, not to the screen.

## 5. Second pass: the look (2026-09-25)

The review of the live app was right on two counts: every screen showed everything it knew at the same volume, and
the result looked like a developer tool. Before designing, six products were looked at again for calm and polish,
not layouts:

- **Linear**: the page is not flat. A near-black surface with a faint gradient and grain, cards a few percent
  lighter with a lit top edge, one accent that glows behind the thing that matters. Everything else is grey text in
  two weights. Status is a small dot; colour never spreads across a row.
- **Vercel**: the same discipline in light mode. Hairlines at 6–8%, one typeface used with real confidence in size
  (big titles, tight tracking), and motion only when something changes state.
- **Things 3**: the home screen is one list; everything else is a tap away. Checking something off is the best
  moment in the app: the circle fills, the row fades, the list closes the gap. Headings are big and warm.
- **Todoist**: rows are one line; the second line is metadata at normal contrast, not a whisper. Pills are rare.
- **Sunsama**: a calm warm palette, a serif for the day's heading, and a single "what are you doing now" card. It
  feels like a planner someone chose, not a dashboard.
- **Notion Calendar**: the month fits a laptop screen; cells show two short labels and "+N"; today's date is the
  only accent on the grid.

**Three directions were built on the Now screen** (`#/looks`, screenshots in `docs/screens/looks/`):

- **Ink**: dark and glowy. Geist display, indigo accent, the hero lit from behind, grain over a near-black page.
- **Paper**: warm and editorial. Instrument Serif for titles and the hero, Inter for everything else, ink blue for
  the one action, cream page with a slow warm gradient and grain, cards on a faint gradient with a lit edge.
- **Pop**: bright and quick. Sora display, coral accent, big radii, soft colour blobs in the page.

**Paper ships.** It is the only one that reads premium in both light and dark (Ink is dark-only, and dark mode is a
Plus feature; Pop's coral glow behind a card reads as an alarm, which breaks the colour rule below). The serif does
what the brief asked of typography: it carries the personality by itself, so the rest of the screen can be quiet.
Ink and Pop stay at `#/looks?d=ink` and `#/looks?d=pop`; switching is one token file.

**The system now (tokens.css):**

- Type: Instrument Serif for the display line and page titles (40/30), Inter for everything else at three working
  sizes: 15 body, 13 small, 13 caps labels. Nothing under 13px. Every text colour clears 4.5:1 on the page and on a
  card (`--ink-3` was lifted from 3.6:1 to 5:1 for that).
- Colour, one meaning each for status: the accent (ink blue) is the one primary action per screen and today's
  date; red is late or broken; amber is due within a day and not started; everything else is grey. Class colours
  are the dot beside a class code and nothing else. The accent, the gradient and the glow are brand, not status.
  `domain/status.ts` is the single source of a row's tone, and every pill and chip reads it.
- Depth: the page has a slow warm gradient (`--page-blobs`, 28s drift, off under reduced motion) and grain; cards
  sit on a faint gradient with a lit top edge; the hero has a blurred accent glow behind it. One card style.
- The mark: a halo drawn as an open ring, completed by a gold plus sitting in the gap.
- Motion: a screen fades up on tab change (240ms); cards ease in with a 45ms stagger; the tick draws itself and the
  circle settles; the hero slides out left when done and the next slides in from the right. All off under
  reduced motion.
- Model-written strings: checklist lines are five to ten words in the prompt and capped at ten in code; summaries
  at eighteen. The quote keeps the full text one tap away.

## 6. Third pass: fewer things, one meaning per colour, moments (2026-09-25)

**Bugs first** (fourteen from the screen recording, all in the Phase 1 commit). The one worth recording here: the
Inbox header and a row read two different records for "was this post read", so they could disagree. Both now read
one answer per post (`readState`), a ledger that fails to open is reported instead of being treated as empty, and
a stamped post the ledger has lost is healed. The two contradictions on Now ("Today's done" over "420 pts due
today") are impossible by construction now: `statusLine` and `riskLine` count the same thing, and a test says so.

**Now** answers "what do I do next, and am I okay" in two seconds: one sentence in one colour, the hero (title,
class, points, time, due, Start, Done, Details, one why-line that names the same day as its chips), three Then
rows, one Heads-up card (every warning, one line each, three shown), and one coach row that opens a side panel.
Term progress, next class and the sync time moved off. **Agenda**: collapsed rows, expand for parts and notes,
two weeks then Later. **Month**: grey, two short labels a cell, red only for late, fits a laptop screen.
**Classes**: tiles with a grade ring; a grade needs three graded items or a tenth of the points. **Class page**:
Work / Rules / Notes. **Inbox**: what a post asks leads; Needs you first. **You**: account, stats, Halo as one
line; diagnostics under Advanced.

**Moments**: the mark draws itself (ring traced, gold plus popped in) for the onboarding payoff, "Today's done",
and a level up. Onboarding is sign up, drag the bookmark (shown by a looping demo, not described), open Halo and
click it, then the payoff counted up: "We found 181 assignments and 12 things your professors only mentioned in
announcements." Study hours moved out of the first run. Streaks get a toast. Empty states have a drawing. Load
bars fill with a gradient and grow in. Rings animate on load.

**Colour, audited**: the accent is the primary action and today; red is late or broken; amber is due within a day
and untouched; the gold halo is the mark and the moments; everything else is grey. `domain/status.ts` is the
single source of a row's tone. The old risk badges (at risk, due soon, start today) are gone: those are meta text.

**Model-written strings**: five to ten words for a checklist line in the prompt, capped at ten in code; summaries at
eighteen. The professor's own sentence is always one tap away behind "source".

**Haiku**: every AI call already goes through the gateway on `claude-haiku-4-5-20251001` (a test refuses any other
model id). The last before/after run (`docs/ai-compare/2026-09-25-3.md`) is 15/15 on the announcement reader (six
real posts) and the lecture ingestion fixtures at $0.033 for the set. The coach and the prompt generator have no
harness fixtures yet, so their quality on Haiku is observed, not measured: the coach's answers are shorter and
occasionally skip the "why", which the shorter prompts in this pass lean into rather than fight.

**Not a colour, not a diagnostic**: sync counts, the announcement cleanup tally and the pull build live under
Advanced. The submission check speaks in plain words.

## 7. Fourth pass: Halo+'s own identity, full width, neutral (2026-09-26)

The serif and the warm paper were the wrong call for this product: they made it look like a magazine, not a tool a
student opens forty times a week. Two reference screenshots were offered as a floor, not a target, and then the
direction was sharpened: keep Halo+'s own structure (the hero, Then, Heads up), only change the surface.

- **Full width.** `--content-max` is 1440px with 32–48px side padding; the nav spans the same width. Now is two
  columns on a wide screen (the answer, hero and Then on the left; Heads up and the coach on the right, sticky).
  Agenda is the list with the week at a glance beside it. Classes are three across. Inbox is two panes: the list and
  the selected post. You is a settings page: sections on the left, one section's content on the right. Below 900px
  everything is one column.
- **Type.** Plus Jakarta Sans 700 for titles and the hero, Inter for everything else. No serif anywhere.
- **Colour.** Neutral light (`#F6F7F9` page, white cards) and neutral dark (`#0B0D10` page, `#15181C` cards), grey
  lines and inks, one cool blue (`#3F7FEE`, `#6FA0FF` at night) for the primary action, the active tab, progress,
  links, today and focus. Status colours stay small and muted; class colours are the dot. A faint blue wash and fine
  grain in the page, cards a shade lighter with a lit edge, the one glow behind the hero. The theme toggle is in the
  nav for everyone; dark mode is no longer a Plus feature.
- **Controls.** Every input, select, textarea, checkbox, radio, file picker and disabled button is styled; nothing
  is the browser's default.
- **Quality.** Heads-up lines are one line (about fifteen words); a link becomes "Open", never a raw address.
  No bare dashes: a class with nothing graded says so. The invite link is shortened on screen with a copy button.
  Badge labels never wrap; the earned date is on hover.
- **The alternate.** `#/looks?d=sky` is the same system with a softer blue, light or dark by the toggle.

**The announcement bug, third report, proven.** The account's server-side usage log had zero rows: not one post had
ever reached the reader. Two things conspired. The large-run guard asked before reading more than half of what was
on file, and a first sync is always more than half (56 of 58). And the question lived inside the review sheet, so
closing the sheet lost it, and the next sync asked again. Now the reader runs in the app, not the sheet
(`halo/backgroundRead.ts`): after every sync and once on open, with its state shown on Now, in the Inbox and in the
review; the guard only asks above about a dollar; a "Read now" button exists wherever posts are waiting. The replay
(`docs/ai-compare/ledger-e2e-2026-09-25.txt`) reads 56 on the first sync, 0 on an identical second, 1 when one body
changes, 0 again.
