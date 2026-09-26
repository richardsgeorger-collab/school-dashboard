# LOOP_LOG

One line per change, newest last. Proposals that need George's approval are marked **PROPOSAL** and not done.

- Announcement reader moved to a background runner and the large-run guard raised: the server usage log proved no post had ever been read (the guard asked at 56/58, inside a sheet that closed).
- Full-width neutral surface with a cool blue, Plus Jakarta Sans + Inter, theme toggle for everyone; Halo+'s own structure kept.
- Trial rebuilt: five days of Max, started on purpose (payoff, locked Max features, You, plans), once per account server-side (`start_trial()`), "Free for 5 days. No card. Nothing charges." everywhere; receipts during the trial; a day-before reminder; honest locked previews with real counts after it.
- Free plan switch `FREE_PLAN_ENABLED` (OFF): with it off, an account whose trial has been used and ended is asked to pick a plan before it syncs again; data stays. Reasoning in docs/PRICING.md.
- Every assignment shows its share of the class grade ("175 pts · 18% of grade") on the hero and on rows, so a 5-point DQ never looks like a paper.
- After every sync, one clear line: "Everything in Halo is in Halo+." or "Not everything came through." with what.
- ⌘K is a palette: jump to a screen, a class or an assignment, sync, switch theme, or add something (falls through to quick capture).
- Privacy-respecting usage counts (screens and a few buttons, counts only) with an admin table; trials started / running / ended / converted on the admin screen.
- Chrome extension: opening Halo is the sync (content script asks the worker when the last sync is >30 min old); switch in the popup; docs/EXTENSION.md says what shipping takes.
- **PROPOSAL** (needs approval): collapse Plus/Pro/Max to Free + Plus $3.99 + Max $9.99 (docs/PRICING.md). No live price changed.
- **PROPOSAL** (needs approval): remove the Load screen's "Weeks" view (You → Workload shows the same bars) and route the heavy-day warning to Calendar instead; keep "This week" and "Term".
- 2026-09-25 · Loop 1 · Pileup heads-up line rewritten under fifteen words ("Oct 4–9 is heavy: 5 items, 400 pts. Start X by Sep 29.") so it never truncates; capture script gains the You sections, the ⌘K palette, and a populated Inbox so those screens get reviewed each loop.
