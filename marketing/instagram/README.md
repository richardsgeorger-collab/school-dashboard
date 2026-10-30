# Halo+ on Instagram: launch kit (@haloplus)

Made 2026-10-30. Everything shows the real Halo+ UI, captured in Chrome on the saved Halo test pages with the made-up
demo student Maya Torres. No GCU logos or trademarks: the sponsor logo spot is left empty in every capture, and every
end card says "Not affiliated with GCU".

## Carousel, redone (2026-10-30): `carousel-v2/`

The look matches the daylight v3 reel: paper, a gold glow, Jakarta, gold accents.

**Every slide**
- One big headline and one short line.
- One whole piece of real UI, captured by its exact box and shown big with a slight tilt and a soft shadow, filling most
  of the slide.
- The mark and the slide number small in the corner.
- `all-slides.png` shows them side by side.

**Pick a hook** (`slide-1A`, `slide-1B` or `slide-1C`)
- **1A, collage:** the hook on paper glass, with a class card, three calendar days, the search box and the confetti toast
  floating around it.
- **1B, before/after:** the same class card from plain Halo ("Show Halo+ on Halo pages" off) and with Halo+ (grade and
  NEXT).
- **1C, just type:** huge type and the gold ring. *My pick:* it reads in a thumb-scroll, and 2 to 7 show the UI anyway.

**Slides 2 to 8**
- **2:** the class card.
- **3:** three calendar days.
- **4:** the search box with seven results.
- **5:** the rubric box.
- **6:** the done toast with confetti.
- **7:** an assignment card with Max's "Due date moved…" line. It says Max is $0.99/mo and everything else is free.
- **8:** the end card, with the app line.

**How it's made:** `marketing/reel/src/Carousel2.tsx` (stills `Slide-1A` … `Slide-8`). The pieces come from
`public/ui3` and `public/ui5` (`scripts/marketing-capture-v5.mjs`: the plain card and the Halo+ card, the rubric, the
Max card, captured in 560 px windows so they're readable big).

## Round 4 (2026-10-30): v4, the 3D laptop in the sky. The current pick

**`halo-plus-reel-v4.mp4`** (with sound) and **`halo-plus-reel-v4-silent.mp4`** (no audio track). Both are 22.5 s,
1080×1920, 30 fps.

**The scene**
- A 3D laptop floats in a daylight sky among clouds on parallax layers, the far ones soft (depth of field).
- The camera glides and pushes in to each feature. It lands on the whole element: the class card, three calendar days,
  the search box, Submit and the toast, then This week.

**The screen**
- It shows the real UI: whole 1280×800 pages captured at 3× in Chrome on the test Halo pages, with the made-up Maya
  Torres and no GCU logos.
- What happens on it:
  - the NEXT lines fill in one by one;
  - the chips settle into their days;
  - "topic 3 quiz" is typed, with ⌘K shown as glass keycaps;
  - a cursor presses Review & Submit, and the toast counts up to +30 pts while confetti drifts through the sky;
  - the cursor ticks a This week box.
- The cursor glides with slow-in, slow-out easing and a slight arc, with a gold ring on each click.

**Words**
- One caption per beat on frosted glass, always in the same place.
- Bold sans with a serif italic accent (Instrument Serif, OFL): "What's *next*, on every class."
- The end card sits on glass: the mark, "GCU's Halo, *upgraded.*", Free on Chrome, "Plus your own Halo+ app on your
  phone.", Link in bio.

**Sound**
- Every effect was made from scratch by `scripts/marketing-sfx.py` (royalty-free by construction): a mouse click, six
  keyboard taps, a check tick, soft whooshes on camera moves, a pop, and a light two-note chime when +30 lands.
- The mix is −28 LUFS with peaks of −10.8 dBFS, low enough for a trending song on top.

**From the reference reel (marketing/reference/), copied**
- the daylight sky with puffy cumulus clouds
- a laptop floating in the clouds
- the camera gliding and pushing in to the screen
- real UI on the screen
- floating frosted-glass labels
- bold sans with a serif italic accent, words resolving out of a blur
- a cursor that picks things
- soft background depth of field
- unhurried pacing

**What's different**
- **Clean render:** it's a 1080×1920 render, not a phone filming a laptop screen with a caption bar on top.
- **Shorter:** 22.5 s, not 61 s.
- **Sound:** no voiceover or music, only quiet effects, so the song is yours to add.
- **Look:** gold Halo+ accents and the daylight palette, with captions always in the same safe-zone spot.
- **Left out:** the dark "planet horizon" interlude, the pixel mascot and the cylinder of cards. They don't fit the calm
  feel.
- **Only Halo+'s real UI:** no made-up screens.
- **Ours:** confetti on the submit moment, and an end card on glass.

**How it's made**
- Captures: `scripts/marketing-capture-v4.mjs` writes to `marketing/reel/public/ui4/`.
- The reel: `marketing/reel/src/Reel4.tsx`, compositions `Reel4-Daylight` and `Reel4-Daylight-Silent`.
- The laptop is CSS 3D rather than three.js: the screen stays the real, crisp page, and the camera can put any point of
  it dead centre at any angle.
- Render:
  - `npx remotion render Reel4-Daylight ../instagram/halo-plus-reel-v4.mp4 --codec=h264 --crf=16`
  - `npx remotion render Reel4-Daylight-Silent ../instagram/halo-plus-reel-v4-silent.mp4 --codec=h264 --crf=16 --muted`

**Cut points:** 2.8 s (into the card), 6.8 s (calendar), 10.8 s (search), 13.8 s (turn it in), 16.0 s (+30 and the chime),
17.0 s (This week), 18.3 s (the tick), 20.0 s (the end card).

## The app line (Loop 294)

- **`halo-plus-reel-daylight-v3-app.mp4`** is v3 calm with one calm line on the end card: "Plus your own Halo+ app on your
  phone." (composition `Reel3-Daylight-Calm-App`).
- **`carousel-8.png`** now has "+ your own Halo+ app on your phone" under "Free on Chrome".
- The site's phone screen plays v3 calm at 540×960, 574 KB (`public/reel/halo-plus-calm.mp4`).

## Round 3 (2026-10-30): calm and satisfying, Daylight. The current pick

v2 was too punchy and too fast. **`halo-plus-reel-daylight-v3-calm.mp4`** (20.6 s, 1080×1920, 30 fps, H.264, no music)
keeps the hook, the beats, the close-ups and the end card, and is made to watch on a loop:

- **Pace:** each beat about 4 s, long enough to watch the moment happen. The beats change with a soft dip through the
  paper (the old one is gone before the new one comes in).
- **Motion:** slow-in slow-out easing, a slow push-in and drift on the UI, and a slower drifting dot grid and gold
  glow behind it (light parallax). No slams, whips, flashes or motion blur. The captions fade and rise in gently.
- **The satisfying moments:**
  - The NEXT lines fill in one by one.
  - The calendar chips settle into their days.
  - "topic 3 quiz" is typed at about six letters a second, the box gliding to each new height with its footer staying
    on the bottom edge.
  - The done toast slides in and counts up to +30 pts (Halo+'s real toast, played at 0.6× speed).
  - The This week box ticks.
  - Soft confetti drifts down behind everything.
- **Framing:**
  - Every piece is one whole element captured by its exact box, never cut through: a whole class card, three whole
    calendar days (Fri to Sun, both weeks), the whole search box, the whole toast, and a whole This week group.
  - The search list ends after its last whole row.
  - Every piece is at the same scale (1.85 frame px per Halo px) and centered in the same place.
  - All text and UI stay inside Instagram's safe zone: nothing in the top 250 px or the bottom 400 px.
- **Text:** one short line a beat, always in the same place (y ≈ 372).

### Cut points (v3)

| Time | |
|---|---|
| 0.07 s | hook fades in |
| **2.70 s** | **CUT** (soft crossfade) → What's next |
| 3.40 s | NEXT line 1 fills in |
| 3.87 s | NEXT line 2 |
| 4.33 s | NEXT line 3 |
| **6.30 s** | **CUT** → calendar |
| 6.93 s | first chip settles |
| 8.73 s | last chip settles |
| **9.90 s** | **CUT** → search |
| 10.47 s | typing starts |
| 12.47 s | "topic 3 quiz", two results |
| **13.50 s** | **CUT** → turn it in |
| 13.87 s | the toast slides in |
| 15.23 s | +30 pts |
| 15.40 s | the box ticks, confetti starts |
| **17.30 s** | **CUT** → end card |
| 18.00 s | "GCU's Halo, upgraded." |
| 20.60 s | end |

How it's made:
- `scripts/marketing-capture-v3.mjs` (Chrome only) writes the pieces and their boxes to `marketing/reel/public/ui3/`
  (`pieces.json`). The search box and This week are captured in a 520 px wide window, so they come out about as wide
  as a class card.
- The reel is `marketing/reel/src/Reel3.tsx` (composition `Reel3-Daylight-Calm`; `reel3Cuts()` gives the table above).
- Render: `npx remotion render Reel3-Daylight-Calm ../instagram/halo-plus-reel-daylight-v3-calm.mp4 --codec=h264 --crf=16`.

## Round 2 (2026-10-30): the Daylight reel, faster

George picked Daylight. Same hook, beats and end card, re-cut to hit harder:

| File | Length | |
|---|---|---|
| `halo-plus-reel-daylight-v2.mp4` | **13.0 s** | **My pick.** Each beat about 2 s, room to read every close-up. |
| `halo-plus-reel-daylight-v2-faster.mp4` | 10.7 s | Even faster, each beat about 1.7 s. Under the 12 s floor on purpose, so the difference is clear. |
| `halo-plus-reel-daylight.mp4` | 21.8 s | Round 1, kept for comparison. |

All 1080×1920, 30 fps, H.264, no music.

What changed:
- **Close-ups, not whole desktop screens.** The UI was captured again at 3× so the crops stay sharp on a phone. You get
  the whole Student Home for a split second, then a punch in to one class card and closer to its NEXT lines; one day
  on the calendar (Sat, Oct 31: three classes); the search bar with results appearing as "topic 3 quiz" is typed; and
  Halo+'s toast counting up to +30 pts.
- **Words that slam in:** 1 to 2 words a line, each word dropping from 2.4× to size with a snap and a little turn.
  The gold word lands on a gold block. Each beat has a setup line up top at the start and the payoff line at the
  bottom on the punch in.
- **Cuts:** pop (hook → cards), whip left, gold diagonal wipe, whip up, and a white flash into the end card. All have
  motion blur, and the camera's punch-ins blur with their speed.
- **Always moving:** the paper's dot grid drifts, the gold glow moves, and the camera keeps creeping in after each punch.
- **The climax:** the toast hits +30 pts, the window pops, a gold ring goes out, confetti bursts from around the toast
  and both bottom corners, the screen shakes, and "It checks off." slams in. Then a white flash to a 2 s end card.

### Cut points for lining up a trending sound

Put the sound's drops on the **CUT** lines; the other lines are smaller hits (punch-ins and word slams) for the beats
in between.

| 13.0 s cut | | 10.7 s cut | |
|---|---|---|---|
| 0.03 s | hook: first word slams in | 0.03 s | hook: first word |
| 0.63 s | hook: last word (needs.) | 0.53 s | hook: last word |
| **1.47 s** | **CUT** (pop) → What's next | **1.23 s** | **CUT** (pop) |
| 1.80 s | punch in to one class card | 1.51 s | punch in to the card |
| 2.47 s | punch in to its NEXT box, "on every class." | 2.05 s | punch in to NEXT |
| **3.60 s** | **CUT** (whip left) → calendar | **2.97 s** | **CUT** (whip left) |
| 3.93 s | punch in to one day, "One calendar." | 3.24 s | punch in to one day |
| 5.53 s | "⌘K." slams (under the wipe) | 4.52 s | "⌘K." |
| **5.60 s** | **CUT** (wipe) → search | **4.57 s** | **CUT** (wipe) |
| 5.73 s | punch in to the search bar, typing | 4.68 s | punch in, typing |
| 6.73 s | results in, "Find anything." | 5.50 s | results, "Find anything." |
| **7.87 s** | **CUT** (whip up) → submit | **6.43 s** | **CUT** (whip up) |
| 8.07 s | punch in to the toast | 6.61 s | punch in to the toast |
| **8.67 s** | **CLIMAX**: +30, confetti burst, "It checks off." | **7.12 s** | **CLIMAX** |
| **10.93 s** | **CUT** (white flash) → end card | **9.03 s** | **CUT** (white flash) |
| 11.13 s | "upgraded." | 9.21 s | "upgraded." |
| 11.40 s | Free on Chrome | 9.42 s | Free on Chrome |
| 13.00 s | end | 10.73 s | end |

The code is `marketing/reel/src/Reel2.tsx` (`reel2Cuts(pace)` gives the same table). Render it:
`npx remotion render Reel2-Daylight ../instagram/halo-plus-reel-daylight-v2.mp4 --codec=h264 --crf=18` (and
`Reel2-Daylight-Faster`).

## Round 1

### Files

| File | What | Size |
|---|---|---|
| `halo-plus-reel-midnight.mp4` | Reel, style A: dark with gold, the UI tilted in 3D | 1080×1920, 30 fps, 21.8 s, H.264 |
| `halo-plus-reel-daylight.mp4` | Reel, style B: light with gold, flatter and cleaner camera | same |
| `carousel-1.png` … `carousel-8.png` | Carousel, 8 slides in order | 1080×1350 |
| `profile-picture.png` | Profile picture: the Halo+ mark (reads at comment-avatar size) | 1080×1080 |

**My pick:** the Midnight reel. It matches the carousel and the store tile, and the dark look stands out in a light
feed. Daylight is there if you'd rather it feel lighter.

No music is baked in: add a trending sound in Instagram. The hook is on screen by 1.3 s, and the beats change about
every 4 s, so most sounds fit.

## The reel, beat by beat (both styles)

| Time | On screen |
|---|---|
| 0.0–2.2 s | **The Halo upgrade every GCU student needs.** (word by word, the Halo+ ring drawing in) |
| 2.2–6.0 s | **What's next, on every class.** The class cards, then the camera pushes into the NEXT box. |
| 6.0–9.6 s | **Every class. One calendar.** All classes on Halo's calendar. |
| 9.6–13.6 s | **⌘K. Find anything.** Search typing "topic 3 quiz" live. |
| 13.6–17.6 s | **Turn it in. It checks off.** The submit moment: the toast, +30 pts, confetti. |
| 17.6–21.8 s | Halo+ mark · **GCU's Halo, upgraded.** · **Free on Chrome** · Link in bio · Not affiliated with GCU |

Each beat also has one plain line at the bottom, so it makes sense with the sound off.

## Profile bio options (Instagram's limit is 150 characters)

1. *(126)* The Halo upgrade for GCU students 🎓 Search, one calendar, what's next on every class. Free on Chrome. Not affiliated with GCU.
2. *(125)* GCU's Halo, upgraded. ✨ ⌘K search · one calendar · confetti when you submit. Free Chrome extension ↓ Not affiliated with GCU.
3. *(106)* Made by a GCU student for GCU students. Halo, but faster to use. Free on Chrome ↓ Not affiliated with GCU.

Link in bio: **`https://haloplus.app/?src=ig`** (Loop 294). Phones get the phone screen (send the laptop link by text, AirDrop or one email); every step is counted in Admin's Instagram funnel. Saved DM replies and the timed walkthrough: `docs/instagram-path.md`.

## Captions

**Reel**

> POV: Halo finally tells you what's next 👀
>
> Halo+ adds the missing pieces right on Halo's own pages: what's due next on every class, all your classes on one
> calendar, ⌘K search, and a little confetti when you turn something in. 🎉
>
> Free on Chrome. Link in bio.
>
> Made by a GCU student. Not affiliated with GCU.
>
> #GCU #GrandCanyonUniversity #Lopes #CollegeHacks #StudyTips #ChromeExtension #StudentLife #Halo

**Carousel**

> The Halo upgrade every GCU student needs. Swipe → 📚
>
> 1. What's next on every class
> 2. Every class, one calendar
> 3. ⌘K search, find anything
> 4. Rubrics right under the assignment
> 5. Confetti when you submit
> 6. Never miss a hidden due date (that one's Max, $0.99/mo; everything else is free)
>
> Free on Chrome. Link in bio.
> Made by a GCU student. Not affiliated with GCU.
>
> #GCU #GrandCanyonUniversity #Lopes #CollegeHacks #StudyTips #ChromeExtension #StudentLife

(The hashtags name the school as a topic, the way students tag posts. They aren't logos, but drop them if you'd rather
not use the university's name in tags at all.)

## How it's made (to change or remake)

- `scripts/marketing-capture.mjs`: captures the real UI at 2× in Chrome into `marketing/reel/public/ui/` (cards,
  calendar, search typed letter by letter, the rubric, Max's line on an assignment page, and the submit confetti frame
  by frame).
- `marketing/reel/`: its own Remotion project, outside the app and extension builds (official Remotion agent skills in
  `.agents/skills/`). `src/Reel.tsx` (the reel, `theme` midnight or daylight), `src/Carousel.tsx` (slides and profile),
  `src/brand.tsx` (gold #F2B84B, ink, the ring mark, Plus Jakarta Sans and Inter), `src/Shot.tsx` (crops of the real
  UI and the camera push).
- Preview and edit: `cd marketing/reel && npm i && npx remotion studio`.
- Render: `npx remotion render Reel-Midnight ../instagram/halo-plus-reel-midnight.mp4 --codec=h264 --crf=18` (and
  `Reel-Daylight`); stills: `npx remotion still Carousel-1 ../instagram/carousel-1.png` … `Carousel-8`, `Profile`.
