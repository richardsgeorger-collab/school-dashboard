# Now Screen, Derived Deadlines, Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Now screen as landing, derived-deadline layer, on-device chat coach, simplified week/month/load.
**Architecture:** pure `now.ts` and `deadlines.ts` modules with tests; scheduler reads optional `deadlineAt`; chat as a small client with tool dispatch into store actions.
**Tech Stack:** unchanged + Anthropic Messages API (fetch).

## Global Constraints
- Keep 189 tests green. Don't touch Grades or Settings views, grade math.
- Dark theme and mono accents stay.

### Task 1: Now (gate: show user)
- Files: `src/domain/now.ts` (+test), `src/views/Now.tsx`, `src/router.ts`, `src/components/Nav.tsx`, `src/views/calendar/Calendar.tsx` (remove focus/level), `base.css`, `App.tsx`.
- [ ] Tests → impl → build → screenshots 390/1280 → deploy → pause.

### Task 2: Derived deadlines (gate: table)
- Files: `src/domain/deadlines.ts` (+test), `types.ts` (`deadlineAt?`), `schedule.ts` (deadlineDay reads deadlineAt), `store.tsx` (apply derived on schedule compute), `ItemDetail.tsx` (show both), `scripts/deadlines-table.ts`.
- [ ] Tests → impl behind a flag → print table → pause → enable.

### Task 3: Chat
- Files: `src/chat/client.ts` (+test for context/tool dispatch), `src/chat/ChatCard.tsx`, Now wiring, css.
- [ ] Load claude-api skill first. Build, manual test with key if provided.

### Task 4–6: Week rows, Month simplification, Load bars
- Files: `WeekView.tsx`, `MonthView.tsx`, `ItemChip.tsx`, `Heatmap.tsx`, css.
- [ ] Build, screenshot, deploy.
