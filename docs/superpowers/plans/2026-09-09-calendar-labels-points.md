# Calendar-first, Labels, Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Calendar the default screen with a real hierarchy, add generated short labels, add locked points, streaks, badges and completion feedback.

**Architecture:** Two new pure modules (`labels.ts`, `points.ts`) with tests; a single `ItemChip` state component reused by month/week/agenda; Calendar gains a focus strip and level bar; Today becomes Plan.

**Tech Stack:** unchanged (Vite, React, TS, Vitest).

## Global Constraints
- Do not modify `schedule.ts`, `estimate.ts`, `grades.ts`, `supabase/schema.sql`.
- All 121 existing tests stay green.
- Item fields added: `label`, `labelOverridden`, `award`.

---

### Task 1: Labels module (spec §2)
- Files: `src/domain/labels.ts`, `src/domain/labels.test.ts`, `src/domain/types.ts` (add fields), `src/parser/toAppData.ts`, `src/storage/store.tsx` (normalize on load, merge keeps overridden), `src/views/ItemDetail.tsx` (field), `scripts/seed.ts` unchanged, regenerate `src/data/seed.json`.
- [ ] Tests (≥30 cases) → fail → implement → pass. `npm run seed`. Commit.

### Task 2: Routing and Plan (spec §1)
- Files: `src/router.ts` (default calendar, `home`→`plan` alias), `src/components/Nav.tsx` (order), `src/views/Plan.tsx` (from Dashboard minus lists), `src/App.tsx`.
- [ ] Build, commit.

### Task 3: ItemChip + ItemRow labels + Month redesign (spec §1)
- Files: `src/components/ItemChip.tsx` (states, DayBar), `src/components/ItemRow.tsx`, `src/views/calendar/MonthView.tsx`, `WeekView.tsx`, `AgendaView.tsx`, `shared.tsx`, `base.css`.
- [ ] Build, screenshot 390/1280 light+dark, iterate, commit.

### Task 4: Focus strip on Calendar
- Files: `src/views/calendar/FocusStrip.tsx`, `Calendar.tsx`, css.
- [ ] Build, screenshot, commit.

### Task 5: Points module (spec §3)
- Files: `src/domain/points.ts`, `points.test.ts`, `types.ts` (Award), `store.tsx` (lock award in setStatus; scoreFactor on score change; expose `progress`).
- [ ] Tests → fail → implement → pass. Commit.

### Task 6: Progress UI + completion feedback
- Files: `src/components/LevelBar.tsx`, `src/components/ProgressCard.tsx`, `src/components/Recap.tsx`, `ItemRow.tsx` (animation), `Calendar.tsx` header, `Plan.tsx`, css.
- [ ] Build, screenshot, e2e (check-off shows +N, undo/redo does not double), commit.

### Task 7: Verify and deploy
- [ ] `npx vitest --run`, `npm run build`, `node scripts/e2e.mjs`, push, `gh run watch`, live screenshot.
