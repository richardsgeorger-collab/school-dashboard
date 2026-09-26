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
- 2026-09-26 · Gold accent replaces the blue (two golds per theme: fill and text); logo and rings are golden halos; six accent presets for Max under You → Display, locked with "Try Max free" for everyone else; gold returns when Max ends and the choice is kept.
- 2026-09-26 · Landing page at the root address (strangers only; anyone signed in or with data lands on Now), the app's own Now markup as its picture, sign-up straight into the account step, a sign-in screen of its own. Onboarding now waits for a signed-in account's data, which also stops a returning student's settings being overwritten by a fresh welcome on a new device.
- 2026-09-26 · Max welcome: four screens the moment the trial starts (welcome, colour on a live copy of Now, what Max already read, a tour on the student's own classes); "Max did this for you" line on Now during the trial; the receipts card on Now on the last day; default theme follows the device.

- 2026-09-26 · Loop 2 · The free Max trial is offered on every locked Pro feature too (coach, tutor, announcement reading, exam plans), not only Max ones: Max has everything Pro has, and "See Pro" sent a curious freshman to a price instead of the free five days. Button reads "Try Max free".
- 2026-09-26 · Loop 3 · A plan without announcement reading no longer reads as a missing "Anthropic key" with "Add one on Now" (there is nothing to add): the outcome tells a locked plan from a build without a model, the Inbox and Now say "waiting to be read; reading is part of Pro" and show the locked card with Try Max free, and the Inbox header says the count once instead of four times; Read-now only appears when reading can happen.
- 2026-09-26 · Loop 4 · The week-at-a-glance column showed a stray "·" on days with nothing planned; empty days are now empty.
- 2026-09-26 · Loop 5 · Load's Weeks view showed "· / 25h" for weeks with nothing planned; it now says "0h / 25h". The capture script starts every shot at the top of the page.
- 2026-09-26 · Loop 6 · The "finished but not confirmed in Halo" heads-up was cut mid-parenthesis by the fifteen-word rule; it is now short by construction ("10 things you finished this week aren't confirmed submitted in Halo. Sync to check.").
- 2026-09-26 · Loop 7 · The first-sync trial card quotes the real number of announcements the sync brought ("Your professors have posted 56 announcements. Max reads every one…") instead of a generic line, so the offer lands on the student's own data the moment the app has proved itself.
- 2026-09-26 · Loop 8 · When the trial has ended and a plan is asked for, the card says what Max actually did during the trial from the student's own records ("Max during your trial: read 23 announcements, found 4 hidden requirements."), counted from the trial's start rather than the last seven days.
- 2026-09-26 · Loop 9 · The welcome screen has "Already have an account? Log in" for a returning student on a new device, who otherwise saw only Sign up.
- 2026-09-26 · Loop 10 · Checkbox rows on You (Study time, Notifications) and in the class editor put the box on its own line above the sentence on a phone; one class (.field-check) puts the box first on the same line, and the Sunday review status is plain text instead of mono.
- 2026-09-26 · Loop 11 · A class with no grade yet said "—" and one never synced said "never"; both now say "not yet" (class page and grade projection).
- 2026-09-26 · Loop 12 · Breathing room: checkbox rows sit a step below the hint above them, and the accent picker no longer runs into the time zone field.
