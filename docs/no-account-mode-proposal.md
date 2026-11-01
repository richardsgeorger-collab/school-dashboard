# Proposal: Halo+ on Halo with no account (not built)

Loop 304, 2026-11-01. A proposal only, for George to decide.

## The leak, with real numbers

- **Web Store:** 158 installs in 30 days; the listing says 30 users.
- **Our own install log** (`ext_installs`, which only started on 2026-10-27):
  - 10 installs from the Web Store
  - 5 of those made an account
  - 12 more installs came from Halo+'s own setup page; 11 of them linked an account
- **Before 2026-10-27** we have no install records, so most of the 158 can't be traced yet.
- **The 61 "browsers without an account":** in Admin's sync log, 61 browsers read Halo with no account. 60 of them are
  my own automated test browsers (Chrome for Testing 153, Oct 24–26). The 61st is a real student: Edge on Windows,
  using it 8 different days, reading Halo every time, with no account. So there is at least one real "uses it, never
  signed up" student.
- **Where people stop:** this couldn't be measured until now. The welcome tab's "opened" and "sign-up started" steps
  were only counted for signed-in people.
  - From now on, every welcome tab and every sign-up start is counted, along with 0.12.16's daily ping (signed in or
    not).
  - Admin's new **Extension users** card shows the row "Installed → welcome tab opened → sign-up started → account →
    first sync".
  - Two weeks of 0.12.16 will answer it properly.
- **Why the store's numbers disagree:** the store counts reinstalls, every Chrome profile, and browsers that never
  open. Its "users" figure is a weekly estimate of browsers that checked for updates. The daily ping replaces both
  with a count we control.

## What could work with no account

Everything below reads Halo's own page data, using the session the student already has in that tab. The extension
does this today; it just waits for an account first.

| Feature | Without an account? | How |
|---|---|---|
| ⌘K search | Yes | Halo's API, kept in Chrome only |
| All-classes calendar | Yes | Halo's due dates, kept in Chrome |
| NEXT boxes on class cards | Yes | Halo's assignments and statuses |
| Rubric under the assignment | Yes | Halo's rubric API |
| Due countdowns, the "This week" panel | Yes | Halo's due dates |
| Check-off on submit (the toast and confetti) | Yes | Halo's own confirmation |
| Ticking things done by hand | On this computer only | kept in Chrome; would move to the account on sign-up |
| Grade on the card, what-if on the Gradebook | Yes | Halo's grades |
| The app (Now, Calendar, Classes), the phone, Max's announcement reading, emails, Home Screen | **No** | these need the account |

## Risks

1. **Data stays in the browser.** The class index and snapshot would live only in `chrome.storage`. That is fine for
   privacy, but nothing carries over to a new computer.
2. **Fewer accounts.** Some students will never sign up, so fewer reach Max. The bet is that people who use Halo+ for
   a week sign up at a higher rate than people asked on install day.
3. **Our server cost goes down, not up.** Nothing is sent to Halo+ without an account.
4. **Free plan line.** Today Free is "what Halo shows, kept current", with an account. This would make Free
   account-less on Halo. Max is unaffected.
5. **Work.** On-Halo features currently check `paid()` (meaning "has an account"). Each needs a no-account path that
   builds its data from the page. The class index the extension builds already does most of this. Estimate: one
   loop, plus a full e2e pass.

## Nudging sign-up afterwards, without nagging

- **The welcome tab stays,** but it becomes "You're set: open Halo" with "Make a free account to get Halo+ on your
  phone too" as the second option, not a gate.
- **One quiet line in the Halo+ pill, once:** after the 3rd day of use, "Get this on your phone: free account".
  Dismissed means gone for 30 days.
- **At natural moments only:** a check-off by hand says "Saved on this computer. Make an account to keep it
  everywhere." Max's locked line keeps its "See it with Max" (that needs an account anyway).
- **Never:** pop-ups, a countdown, or features that stop working until you sign up.

**Recommendation:** build it as a switch. Turn it on for new installs, and watch the new funnel for two weeks:
accounts per install, and active a week later.
