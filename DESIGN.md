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
