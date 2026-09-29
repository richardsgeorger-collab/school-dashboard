# Onboarding, rebuilt (2026-09-28)

Screens, every one, desktop and phone, light and dark: `docs/screens/onboarding/<device>-<scheme>/`. Friend links:
`docs/screens/friends/`. Rerun: `scripts/e2e-onboarding.mjs`, `scripts/e2e-friends.mjs` (real backend, throwaways).

## The path

Desktop: Welcome → Account (email link or Google) → Show your bookmarks bar (skipped when the bar already shows,
advances by itself when it appears) → Drag the button (advances by itself on a drop the browser accepts) → Open Halo
(opens it in a new tab) → "Now click Sync Halo in your bookmarks bar" (nothing to press: the sync is detected; the
bookmark comes back to this very tab because the app names its window) → after a minute, the likely fixes → Payoff
(count-up, what the announcements asked, the next big deadline, a study plan for the next quiz, Start here) →
optional three-stop tour (Now, Calendar, Inbox; Skip) → the Max welcome (trial or friend) or the Plus welcome.

Phone: Copy the bookmark → Bookmark this page → Swap its address → Open Halo → run it (iPhone: Bookmarks; Android:
type Sync Halo in the address bar) → the phone's own fixes after a minute. "Easier on a computer?" is one tap away.

Every screen is saved in the account's settings; leaving and coming back resumes on the same screen (tested).
Nothing is asked that Halo knows: classes, meeting times and the time zone come from the sync and the device.

## What the new-account walkthrough found, and what was fixed

1. **A first sync lost every announcement.** They were saved before their classes existed, so a new student's
   payoff said "No announcements yet" and the reader had nothing to read (the same hit anyone adding a class
   through the review). Fixed: announcements for classes the sync is creating are kept under their new ids.
2. **The first sync opened a review sheet** ("What Halo sent · Apply 5 changes") over onboarding. An empty planner
   has nothing to review: the first sync now applies itself and lands on the payoff.
3. **The auto-apply switched itself off mid-flight** (saving stamps the last pull, which made it look like a second
   sync). Decided once, when the sync arrives.
4. **A study plan of 15 minutes a day for eight days.** Now at most four sessions of at least 30 minutes, on the
   days just before the quiz.
5. **A bookmark clicked early was ignored** (the sync landed while onboarding still showed Welcome). Any screen now
   goes to the payoff when the classes arrive.
6. **"Last Halo sync was 0 days ago. Sync now."** right after the first sync (a kind the class simply does not have,
   read as stale). Gone.
7. **The account screen said "Your email" above "Continue with Google".** Now "Sign up with".
8. **The bookmarks-bar picture already showed Sync Halo in the bar** before it had been dragged. The bar is empty
   on that step.
9. **"Two things, one tap each"** on the Plus welcome, with only one tappable (the extension is not on the Web
   Store yet). It says "One more tap" until the store link exists (`src/config/extension.ts`).
10. **The payoff's Start here sat below the fold on a phone.** Pinned to the bottom.
11. Two links on the drag step ran together; a stray " ." after "paste it here". Fixed.

## Timings (scripted clicks, real backend)

Own assignments on screen 13–15 seconds after opening the app; a real student adds reading time, the email link and
the drag, which is what the two-minute goal allows for.

## What still needs a person

The drag and the bookmark click run in the browser's own UI, so they cannot be scripted: the drop detection and
the bookmarks-bar detection are unit-tested and were checked by their rules, not by a real drag. The first real
friend through a link is the real test; the admin panel on You shows whether they finished onboarding and synced.
