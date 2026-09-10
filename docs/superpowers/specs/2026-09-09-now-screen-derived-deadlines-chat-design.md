# Now Screen, Derived Deadlines, Chat — Design Spec

Date: 2026-09-09 (iteration 3). Status: Approved.
Goal: open the app and know the next thing to do without decoding a calendar.

## 1. Navigation
- Routes: `now` (default, empty hash), `calendar`, `plan`, `load`, `grades`, `settings`.
- Desktop nav shows all six. Phone bottom bar: Now, Calendar, Plan, Load, Grades; Settings via the top-bar gear/sync dot.
- Calendar loses the focus strip and level bar. Plan keeps gamification.

## 2. Now screen (`src/views/Now.tsx`, logic in `src/domain/now.ts`)
- `rankItems(items, schedule, now, tz)`: open items sorted by: overdue (real `dueAt` < now) first; then `schedule.byItem[id].deadlineDay` ascending; then `estimatedMinutes` descending; then `points` descending.
- Hero = rank 1: label (display size), full title, class chip, estimate, "Due {long date}{time if not 11:59 PM} · start by {day}", points. Button: `Start` → status `in_progress`; when in progress: `Mark done` (primary) + `Open`. Done hero disappears (linger 1.6 s for the burst) and rank 2 becomes hero.
- Then = ranks 2–4, compact rows (label · class dot · due short). Tap expands one row: full title, estimate, points, start-by, Open.
- Pressure line `pressureLine(...)`: returns null unless: overdue > 0 → "{n} overdue. {hero label} first."; else at-risk > 0 → "{label} won't fit before {day} unless you start now."; else a heavy day in the next 7 days (≥ 4 open due or planned ≥ capacity) → "{Weekday} is heavy: {n} items, {h}h. {You haven't started any. | k of n done.}".
- Progress bar `termProgress(items)`: Σ(score ?? points of done items) / Σ points, thin bar with "{pct}% of the term's points banked".
- Nothing else on the screen except the chat card (§6). Max 4 items visible.

## 3. Week view
- No time grid, no class meetings. Seven stacked rows: weekday + date; load bar (planned minutes / capacity, colored ok/warn/over); items: 1–2 open items listed by label (time shown only when due before 6 PM); 3+ → chip "{n} due" that expands in place. Done items hidden.

## 4. Month view
- No meetings. Cell background warms with load: level 0–4 from max(open due count, planned/capacity). Up to 2 labels (full words, 2-line clamp), overflow "+{n}". Done hidden. Chips: neutral surface for normal, accent (`--hi`) for exams and 100+ point items, class color only as a 7px dot. Overdue keeps red.

## 5. Derived deadlines (`src/domain/deadlines.ts`)
`deriveDeadlines(items, courses, settings): Record<id, { deadlineAt: string; reasons: string[] }>` — only for items whose deadline moved.
Rules in order (each may tighten, never loosen):
1. Big (points ≥ 100 or estimate ≥ 180 min): deadline = due − 2 days ("big item: 2 days early").
2. Participation/discussion: deadline = due − 2 days ("first touch: post, then reply").
3. Lab notebook prep (course code ends with L, type `lab`, the course has meetings): deadline = the day before the last meeting on or before the due date ("prep before the {Mon} lab").
4. Prerequisites within a class by title stem: "First Draft of X" → "Final Draft of X"; "Chemistry Connections Presentation" ← "Chemistry Connections Essay" (essay draft needed for the talk); "Formal Lab Report" needs the latest lab due before it. If prerequisite deadline ≥ dependent start-by, prerequisite deadline = dependent start-by − 1 ("needed before {dependent label}").
5. Sunday → Saturday: any deadline on a Sunday moves to Saturday 11:59 PM ("Sunday due → Saturday").
6. Clusters: while any derived day has ≥ 4 open items, move the smallest-estimate item on that day back one day ("{n} items that day, pulled earlier"). Bounded to 10 passes.
`deadlineAt` keeps the due clock time unless the rule sets a day (then 23:59). Scheduler: `deadlineDay` uses `item.deadlineAt ?? item.dueAt`; overdue still uses `dueAt`. Item sheet shows "Due {syllabus} · start by {startBy}" and the reasons.
Gate: print the inference table (item, class, original, derived, reasons) for review before enabling.

## 6. Chat (`src/chat/`)
- Card on Now; input pinned to the bottom on phones. Key entry inside the card, stored in `localStorage` key `school-dashboard:anthropic-key`, never synced or exported.
- Model `claude-sonnet-4-6`, direct browser call with `anthropic-dangerous-direct-browser-access: true`. Max 400 output tokens.
- System prompt: calm study coach; 2–3 sentences; ≤ 3 items; never totals; can trade off by points/time/class times; today, capacity, notes. Context block (JSON) with open items: id, label, class, due, deadline, startBy, estimateMin, points, status; plus done count and notes.
- Tools: `remember_note(note)` → appends to notes (shown in card, deletable); `update_item(id, status?, estimateMinutes?)` → store action. Tool loop handled client-side (max 3 rounds).
- History (last 20 turns) and notes persist locally.

## 7. Load tab
- One horizontal bar per week (planned hours vs capacity), green ≤ 80 %, amber ≤ 100 %, red over; current week marked; tap a bar → expands the existing per-class table for that week.

## 8. Tests
`now.test.ts` (ranking order, pressure line cases, progress), `deadlines.test.ts` (each rule, cluster pass, no-loosen), scheduler test for `deadlineAt`, chat context builder + tool dispatch. Existing 189 stay green.
