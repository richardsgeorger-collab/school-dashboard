# Calendar-first, Short Labels, Points — Design Spec

Date: 2026-09-09 (iteration 2)
Status: Approved

Builds on `2026-09-09-school-dashboard-design.md`. Scheduler, estimator, grade math and the
Supabase schema are unchanged. New per-item fields: `label`, `labelOverridden`, `award`.

## 1. Calendar as the main screen (Priority 1)

- Nav order: Calendar, Plan, Load, Grades, Settings. Empty hash → `#/calendar?v=week`.
  `#/home` redirects to `#/plan`.
- Calendar screen layers, top to bottom: header (title, prev/today/next, level+XP bar),
  focus strip (risk pills + "Do next" list), controls (view toggle, class filters), view.
- **Do next** = open items with risk `overdue`, then `at_risk`, then `start_today`, then
  `due_soon`, each group sorted by deadline. Six shown, "Show all N" expands. Rows use the
  compact ItemRow (label primary, full title subtitle).
- **Plan** (was Today): page title, week time budget ledger, hours by class, Progress card
  (level, streaks, badges), "Last week" recap button. No due list, no start-today list.
- **Chip states** (one component, `ItemChip`): `overdue` (fill `--overdue`, white text,
  leading `!`), `today` (solid course color, white, bold), `soon` (bold, 1.5px course
  border, tint), `at_risk` (tint, amber left bar, leading `▲`), `normal` (12% tint, course
  left bar), `done` (line-through, 45% opacity). Text = short label, max 2 lines,
  `overflow-wrap: normal`, no ellipsis mid-word. `title` attribute = full name.
- **Month, desktop (≥ 640px)**: cells stretch to the tallest cell in their row; up to 5
  chips; the remainder collapses into `DayBar` (stacked segments per course, count label).
  Cells with ≥ 5 due or planned minutes ≥ capacity get `data-heavy` (tinted background, count
  badge top-right). Today's number sits in a highlighter disc.
- **Month, mobile**: cell = day number, count (bold at ≥ 4), `DayBar` under it, and a
  marker dot: red if any overdue, highlighter if any due today. Min height 64px.
- **Week**: due strip lists all chips (no cap). Mobile stacked days unchanged but rows use
  labels.
- Polish: page title 32/36px, section gap 28px, grid lines `--line` at 60% mix, item rows
  12px subtitle.

## 2. Short labels (Priority 2)

`src/domain/labels.ts`:

```ts
export function courseShortName(code: string, name?: string): string
export function shortLabel(input: { title: string; courseCode: string; courseName?: string; type: ItemType }): string
```

Class words: CHM-113 Chem · CHM-113L Chem Lab · ENG-105 English · ESG-162 Eng Math ·
ESG-162L Eng Math Lab · UNV-106 UNV · fallback = letters before the dash.

Core rules (first match, `N`/`M` numbers preserved):
`Topic N Homework`→`HW N` · `Topic N Activity`→`Activity N` · `Topic N Review`→`Review N` ·
`Practice Quiz N`→`Practice Quiz N` · `Practice Final Exam`→`Practice Final` ·
`Quiz #N|Quiz N`→`Quiz N` · `Exam N`→`Exam N` · `APA Quiz N`→`APA Quiz N` ·
`Topic N DQ M`→`DQ N.M` · `Week N Participation`→`Participation W{N}` ·
`Topic N Participation`→`Participation N` · `Topic N Quiz`→`Quiz N` ·
`MATLAB: X`→`MATLAB {first word of X}` · `Excel: X`→`Excel {first word}` ·
`CLC – X Lab N`→`CLC {first word of X} Lab N` · `CLC – Engineering Design Report with Lab`→`CLC Design Report` ·
`CLC – Engineering Design Report and Demo N`→`CLC Report & Demo N` ·
`Formal Lab Report`→`Lab Report` · `Benchmark - Lab Practical Exam`→`Lab Practical` ·
`<Words> Lab` (CHM lab titles)→`{first significant word} Lab` (skip "and", "of", "in",
"the", "chemical") · `Chemical Safety and Equipment`→`Safety & Equipment` ·
`Chemistry Connections Essay|Presentation`→`Connections Essay|Talk` ·
`First Draft of a Rhetorical Analysis`→`Rhetorical Draft` · `Final Draft of a Rhetorical Analysis`→`Rhetorical Final` ·
`Review of AI Generated Text`→`AI Text Review` · `First Draft of a Review Assignment`→`Review Draft` ·
`Review Assignment: Peer or Self Review`→`Peer Review` · `Final Draft of a Review Assignment`→`Review Final` ·
`First Draft of an Op-Ed`→`Op-Ed Draft` · `Self-Review and Reflection on an Op-ed`→`Op-Ed Self-Review` ·
`Final Draft of an Op-Ed`→`Op-Ed Final` · `Microsoft Office 365 Quiz`→`Office 365 Quiz` ·
`AI-Assisted Career Reflection`→`Career Reflection` · `Technology & Online Time Tracking (Excel Assignment)`→`Excel Time Tracking` ·
`Online Privacy & Security (PowerPoint Assignment)`→`Privacy Slides` ·
`UNV-106 Purpose Plan: …`→`Purpose Plan` · `Final Video Reflection`→`Video Reflection` ·
`Academic Plan Reflection`→`Plan Reflection` · `CHM113 Prerequisite Concept Assignment`→`Prereq Concepts` ·
fallback: strip parentheticals and the words "assignment", "the", "of", "a", "an", keep first 3 words.

Composition: `${classWord} ${core}`; if classWord ends with "Lab" and core starts with
"Lab ", drop the duplicate ("Chem Lab" + "Lab Report" → "Chem Lab Report"). Collapse spaces.

Item: `label: string`, `labelOverridden: boolean`. `toAppData` sets it; the store fills it
for any loaded item missing it; merge-import keeps overridden labels. ItemDetail gets a
"Short label" field with "use suggested". Every list, chip and modal title shows `label`
first and `title` as subtitle/tooltip.

## 3. Points, streaks, badges (Priority 3)

`src/domain/points.ts`:

```ts
export interface Award { base: number; multiplier: 1.5 | 1 | 0.5; earnedAt: string; scoreFactor: number | null }
export function timingMultiplier(completedAt: string, dueAt: string, startBy: DateStr, tz: string): 1.5 | 1 | 0.5
export function awardValue(a: Award): number            // round(base * multiplier * (scoreFactor ?? 1))
export function makeAward(item, startBy, completedAt, tz): Award
export function levelFor(xp: number): { level: number; floor: number; ceil: number }  // level = floor(sqrt(xp/60)) + 1
export function computeProgress(items: Item[], settings: Settings, today: DateStr): Progress
```

`Progress` = `{ xp, level, levelFloor, levelCeil, dailyStreak, weeklyCleanStreak, currentWeekClean, badges: Record<BadgeId, string|null>, lastWeek: Recap }`.

- Award set once in `setStatus(id,'done')` when `item.award` is null, using
  `schedule.byItem[id].startBy`. Undo keeps `award`; XP counts only items with
  `status === 'done'`. Score entry sets `award.scoreFactor = score / points` (points > 0).
- Daily streak: distinct Phoenix dates of `completedAt` among done items; consecutive run
  ending today, else ending yesterday, else 0.
- Weekly clean: for each completed week (end < this week's start) that had ≥ 1 item due:
  clean iff every such item is done with `completedAt <= dueAt`. Streak = consecutive clean
  weeks back from the most recent completed week that had items. `currentWeekClean` =
  no late completion and no overdue-open item so far this week.
- Badges (earned timestamp or null): Early Bird = completedAt of the 5th done item with
  multiplier 1.5; Survived the Week = end of the first completed week where
  Σ estimatedMinutes of items due ≥ week capacity and all done on time; Clean Sweep =
  end of first completed week where some class had ≥ 2 items due, all done on time.
- Recap for the last completed week: points earned (awards with earnedAt in week),
  completed count, late count, missed (due that week, still open), early count, clean flag.
- UI: `LevelBar` in Calendar header; `ProgressCard` in Plan; `RecapCard` on Calendar when
  today is Sunday, `RecapModal` from Plan any day; completion feedback in ItemRow: check
  pops (scale 1→1.25→1), `+N` floats up 28px over 700ms fading, row background flashes
  `--hi-soft` 600ms; with `prefers-reduced-motion` only a static `+N` shown 1s.

## 4. Testing

Keep 121 green. Add `labels.test.ts` (≥ 30 title cases), `points.test.ts` (multipliers,
award lock on undo/redo, score factor, level thresholds, daily streak edge at today/yesterday,
weekly clean streak, each badge, recap counts).
