# Class cards on Student Home: three options (not built)

Prototypes for George to choose from (Loop 275, 2026-10-28). Each keeps Halo's card shape, its colour stripe, its
colours and its fonts; drawn on Halo's Student Home stand-in with the demo student Maya Torres's six classes
(`scripts/mock-cards-options.mjs`, nothing shipped). Side by side (Now, A, B, C):
`side-by-side-light-1366.png`, `side-by-side-light-1024.png`, `side-by-side-bh-dark-1366.png`,
`side-by-side-bh-dark-1024.png`; each option alone: `<A|B|C|now>-<light|bh-dark>-<1366|1024>.png`.

**A · Tidy (subtle).** Dates, instructor and student count share one small gray line; the Halo+ line becomes the grade
in bold plus "Next: <item> · <when>" in Halo's link style. Tradeoff: cards get a little shorter and easier to scan,
but Next is still just a line of text among others.

**B · Focus (balanced).** A, plus the grade moves to the card's top right beside Halo's Topic chip, "Next" gets a
light tint of the class colour, and the stripe fills as the current topic's work is done ("Topic 3 · 1 of 2 done"
under it). Tradeoff: the most useful things are where the eye lands and nothing of Halo's is removed (Go to class
stays); the stripe only fills when every item's state in that topic is known from Halo, so it can be absent.

**C · At a glance (bolder).** B, with the dates, instructor and student count moved behind "Details on hover", Halo's
Go to class button replaced by the whole card being clickable ("Open class ›"), and "+N more this week" under Next.
Tradeoff: the shortest cards; but it hides Halo's own button and puts information behind hover (no hover on a
touchscreen), and it reads least like Halo.

Not in the pictures: a finished ("Post-Class") class taking one line (Maya's six classes are all current, and her
Past Classes is empty). In A or B it would be one row: the Topic chip reads Post-Class, the name and the final grade.

**My pick: B.** It does what students actually come for (the grade and what is next, with when) without taking
anything of Halo's away, so it still reads as Halo's card; the progress stripe is the one new idea, and it shows
only when it is exact. C saves a little more space but trades away Halo's own button and puts the class facts behind
hover; A is safe but changes little.
