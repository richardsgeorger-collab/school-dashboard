# Halo+ on Instagram: launch kit (@haloplus)

Made 2026-10-30. Everything shows the real Halo+ UI, captured in Chrome on the saved Halo test pages with the made-up
demo student Maya Torres. No GCU logos or trademarks: the sponsor logo spot is left empty in every capture, and every
end card says "Not affiliated with GCU".

## Files

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

Link in bio: the Chrome Web Store page (or haloplus.app, which links to it).

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
