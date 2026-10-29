# Free and Max: the plan (for George's OK, 2026-10-29)

Nothing below is built or changed yet. Nothing in Stripe has been touched. Every number comes from the code and from a
read-only look at the database; there is no Stripe key on this computer, so nothing was read from Stripe itself.
Mockups: `docs/screens/pricing-mockups/`.

## The short version

- **Nobody is paying today.** All 7 subscription rows (5 Max, 2 Plus) belong to test accounts. Real Plus subscribers: 0.
  Real Max subscribers: 0. So moving people to the new price is a formality for now. It is still planned properly below,
  in case someone subscribes before the switch.
- **You (George)** have Max from an invite reward until **Nov 5**, with no Stripe subscription.
- **At $0.99, Halo+ keeps about $0.62 a payment** (Stripe's fees take 37%). Details in section 3.
- **The wallet buttons right on our page don't work with Managed Payments**, which is on for us (Stripe is the seller of
  record and handles sales tax everywhere). So you choose between keeping Managed Payments, with Apple Pay and Google Pay
  one screen later, or turning it off to get the buttons on our page. Section 5.
- **Ask can be removed cleanly**, but removing the Ask screen alone does not stop the AI from being used as a chatbot. The
  AI gateway sends whatever the browser builds. Section 1 has the fix.

## 1. Removing Ask, and locking down every AI call

**What Ask is in the code:**
- the Ask screen, `src/ask/*` and `src/chat/*` (except the error helper, which moves), and `src/tutor/tutor.ts`
- its route, its ⌘K entry, and links from Study, Now, the hero card, item pages, class pages, Practice, quizzes, Check
  and the demo tour
- the AI job kinds `coach` and `tutor`
- copy on the landing page, `/plans/`, llms.txt, the privacy page and PRIVACY.md, the store listing, the trial screens and
  receipts; the Admin usage mapping; about 20 test scripts

Ask has no database table, no server function of its own and nothing in the extension. Its chat history lives only in the
browser.

**Shutting it off on the server:** the AI gateway (`supabase/functions/ai`) rejects `coach` and `tutor` outright.

**Ask's switch also turns on four other things,** which need their own switches:
- Check my work and the AI assignment brief: these stay **Max**.
- The help kit: **Free**, because it uses no AI.
- The Study tab lock.

**The bigger problem: today the AI gateway can be used as a general chatbot, even with Ask gone.**
- It sends to Anthropic whatever request the browser built.
- A Max or trial account can send any conversation under any allowed job name, limited only by the $4/month ceiling.
- On Free, the "changes" job checks only the tool's name.
- `stream: true` skips the cost meter. Anthropic still bills those tokens, but they're logged as $0.
- Anthropic's own server tools can be passed in, and they aren't metered.
- Lecture transcription counts the hours the browser *says* the file is.

**The fix (every AI call becomes a fixed job):**
- The browser sends only a job name and its inputs, for example `{ kind: 'announcement', text, classCode }`. The server
  builds the prompt, the tools and the model itself. A request that brings its own messages, system prompt or tools is
  refused.
- Each job has an input cap in characters (for example: announcement 12k, brief 20k, draft 30k, lecture 80k, study, quiz
  and worksheet 20k) and a fixed output cap.
- No streaming, no server tools.
- Per-user rate limits per job (per minute and per day), on top of the monthly dollar ceiling, checked atomically so that
  parallel requests can't all slip past it.
- Transcription measures the audio length on the server.
- Tests that try to break each rule: a free-text chat, a huge input, a burst of calls, stream mode, a tool injected.

**AI jobs left after Ask** (all Haiku 5.5 through the one gateway, plus Whisper for transcription):

| Job | What it does | Student's own text? | Plan |
|---|---|---|---|
| announcement | reads an announcement: moved or hidden due dates, extra steps | no (Halo's text) | Max |
| changes | the locked heads-up: "did this announcement change something?" | no | see flag A |
| class_plan, term_plan, links | AI pass over a syllabus, links between topics | no (syllabus) | Max |
| brief | the AI assignment brief | no (Halo's text) | Max |
| draft, method | Check my work | **yes** (pasted work), capped | Max |
| study, quiz, worksheet | Practice | no | Max |
| lecture | notes from a transcript | **yes** (transcript), capped | Max |
| transcribe (Groq Whisper) | lecture audio to text | audio, capped by measured length | Max |

Job kinds that nothing calls (`audit`, `needs`, `recap`, `other`) are deleted.

## 2. The new split

**The rule:** anything that costs AI tokens is Max, plus auto-sync.

**Free:**
- Everything on Halo's pages: search, the all-classes calendar and week strip, class cards with NEXT and grades, This week,
  rubric, drafts, word count, due countdowns, topic progress, the submit check-off and celebration, PDFs, links, the
  compact header, counts, feedback, participation, faster pages.
- The pill, the class lines with grade refresh, the toolbar badge.
- Syncing on a Halo visit or with Sync now.
- Grades, GPA, What-if, Now, Calendar, Classes, Library, Search, adding things by hand, the syllabus reader that uses no
  AI, the Inbox list, the Sunday review sheet in the app, celebrations.
- The help kit, Get a prompt, and the locked heads-up (flag A).

**Max:**
- Announcements read for you, with the gold dots, "extra steps" and the assignment notes on Halo.
- Auto-sync every 3 hours.
- Reminders, the Sunday preview and the Monday wrap card, the calendar feed.
- Practice, Check my work, the AI brief, lecture notes and transcription, the AI syllabus pass.

**Removed:** Ask.

**The biggest change in the extension:** all 18 on-Halo features are hidden on Free today. They become Free; the gate
becomes "has an account".

**Things that don't fit the rule cleanly (your call on A, B, C and F):**

- **A. The locked heads-up uses AI.** It's the `changes` job, about $0.0002 per announcement, on Free.
  - Option 1, my recommendation: keep it as the one AI job on Free. It's the reason anyone upgrades. Cap Free's AI budget
    at $0.05 a month and rate-limit it.
  - Option 2: make it use no AI ("a new announcement in BIO-181 since you last looked"). It's vaguer, and it can't say
    "changed this due date".
- **B. Reminders, the Sunday preview and the calendar feed use no AI.** The rule puts them in Free; your list puts them in
  Max. I'd keep them in Max, as you listed: they're the "Halo+ works when you're not on Halo" set, alongside auto-sync.
  Reminders are only blocked in the browser today, so the server needs a check too.
- **C. Grade projection (Plus today) and the colour picker (Max today) use no AI.** By the rule, both become Free.
- **D. The gold dots, "extra steps" and the assignment notes are drawn for anyone whose data has them.** Free accounts
  keep the ones left from their trial. Fix: Halo+ stops sending them to the extension for Free.
- **E. The help kit uses no AI**, so it's Free. But it can include the requirements the AI found, so for Free it leaves
  those out.
- **F. The invite reward is 30 days of Plus.** It becomes 30 days of Max; that's my suggestion.
- **G. Five plan switches are never checked:** `nowSmart`, `heavyDayWarnings`, `gamification`, `promptPanel` and
  `earlyAccess`. They're deleted.

## 3. Price: Max at $0.99/month, and what you keep

**What changes:**
- The $2.99 first-month offer for Max and its coupon go, everywhere: the trial screens, Admin's intro view and the
  database settings.
- So does the $0.99 Plus offer and its coupon.

**What Halo+ keeps per $0.99 payment.** Fees today are card 2.9% + 30¢, Billing 0.7%, Managed Payments 3.5%.

| Case | Stripe takes | Halo+ keeps |
|---|---|---|
| US card, Managed Payments on (today) | $0.37 | **$0.62** (63%) |
| Same, with sales tax added (the student pays $1.08; the tax passes through) | $0.38 | $0.61 |
| International card | $0.39 | $0.60 |
| International card, currency converted | $0.40 | $0.59 |
| Managed Payments off | $0.34 | $0.65 |

- Apple Pay, Google Pay and Link cost the same as cards.
- **The 30¢ fixed fee is 30% of every payment.**
- A refund still costs about 37¢.
- One $15 dispute wipes out about 2 years of one subscriber.

Notes only, not part of this plan: $1.99/month keeps 78%, and a yearly price ($9.99/year keeps about $8.98) avoids eleven
of the twelve fixed fees.

**Stripe changes, for your OK. I won't make them until you say so:**
1. Add a $0.99/month price to the existing Max product. Tax code stays SaaS for personal use; price excludes tax.
2. Deploy code that knows the new price **first**, and maps the old Plus ($4.99) and Max ($7.99) prices to Max. If a price
   is unknown, the webhook drops a paying account to Free.
3. Archive the $4.99 Plus and $7.99 Max prices, so they can't be sold. Subscriptions already on them keep working.
4. Delete the coupons `halo-intro-max-299` and `halo-intro-plus-099`, if they exist.
5. Optional: archive the Plus product.

## 4. Removing Plus, and the subscribers

**Who is affected:**
- Real paying subscribers: **0 Plus, 0 Max.** The database's 7 subscription rows are all test accounts (`@example.invalid`,
  no Stripe customer).
- Two real students opened checkout and didn't pay.
- **You:** Max from an invite reward until Nov 5, no subscription. After the change you stay on Max until Nov 5, then Free,
  unless you subscribe. As the owner I could also give your account Max permanently; tell me which.

**If anyone subscribes before the switch:**
- Their subscription's price is swapped to the $0.99 price with "no proration".
- Nothing is charged or refunded now, there's no gap in Max, and the next renewal bills $0.99.
- Plus subscribers become Max subscribers at $0.99, on the same terms.
- The coupons only applied once, so nothing is left attached.
- I'd list them for you by count and anonymised id first, and do nothing until you OK it.

**Where Plus disappears:**
- the app: the trial-end screen, Plans, You, the Inbox badge, the plan wall;
- the extension: the popup's "Plus also syncs…", the gate, "see it with Plus" on the pill;
- the landing page, `/plans/`, llms.txt and the store listing's plans line;
- the trial-ending email (it says "Max is $7.99… Plus is $4.99");
- Admin's plan stats;
- the server's plan list.

Old database rows that say "plus" stay readable and are treated as Max.

## 5. Two-tap checkout with the wallet buttons

**What Stripe allows:**
- With **Managed Payments on**, Stripe does not support its embedded payment components or creating subscriptions outside
  Stripe Checkout. So the Express Checkout Element, the Apple Pay sheet right on our page, is out.
- Apple's rule: an Apple Pay button may only start Apple Pay itself. A "Buy with Apple Pay" button that opens another page
  first breaks Apple's rules.
- With **Managed Payments off**, it works. You'd use Checkout Sessions with the Elements mode and the Express Checkout
  Element on haloplus.app.
- **Inside the extension popup, Apple Pay isn't available at all.** The popup always opens checkout in a tab.

**A. Keep Managed Payments (my recommendation):**
- On our page: one **"Keep Max · $0.99/mo"** button, with no wallet logos (Apple's rules).
- Tapping it opens Stripe's checkout instantly, with the email filled in. Apple Pay or Google Pay sits at the top, whichever
  the device has.
- That's tap → wallet button → Face ID: one tap more than B.
- Stripe stays the seller of record and handles sales tax and VAT everywhere, so you never register for sales tax yourself.
- Keeps $0.62 a payment.

**B. Turn Managed Payments off:**
- The official Apple Pay and Google Pay buttons sit on the Max card, shown only where they work.
- Tap → wallet sheet → Face ID.
- You become the seller: sales tax is yours. Stripe Tax can calculate it for 0.5% per payment, but registering and filing
  where you pass a state's threshold is on you. At today's size that's likely nowhere, but it grows with you.
- Keeps $0.65 a payment.

**On Halo's pages, either way:**
- Stripe's payment parts can't be put on halo.gcu.edu, because only haloplus.app can be registered with Stripe.
- So the button on Halo opens checkout in a new tab and comes back to the same Halo page with Max on. The extension then
  shows what was locked, right there.

**Making checkout instant.** Up to 30 seconds today; the likely causes are:
- the sign-in token wait, which has no limit when the stored token is stale (after a laptop sleep);
- 3 to 5 Stripe calls one after another on the server;
- a cold server;
- Stripe's page itself, which has never been timed.

The plan:
1. Create the checkout session when the Max card appears, so the tap only navigates.
2. Create the Stripe customer ahead of time.
3. Drop the per-tap customer and coupon calls.
4. Put a hard limit on the token wait.
5. Warm the server and connect to Stripe early from every Max button.
6. Time every step, including Stripe's page.

Target: Stripe's page on screen in under 2 seconds.

**Stripe Dashboard setup:**
- **A:** nothing new. Wallets show automatically in Stripe Checkout under Managed Payments. Check that Apple Pay, Google
  Pay and Link are on under Settings → Payment methods.
- **B:**
  - Settings → Payment method domains: add `haloplus.app` and `www.haloplus.app`. Stripe checks Apple's domain itself; the
    site is on GitHub Pages, so if a verification file is ever needed it can be served from `/.well-known/`.
  - Turn on Apple Pay and Google Pay in the payment method settings.
  - Turn off Managed Payments.
  - Optionally turn on Stripe Tax.

**After paying:** the student lands back where they were (`return_url` = the app screen or the Halo page), with Max
already on. The page waits for the webhook, up to a few seconds, with "Turning on Max…", then shows it.

## 6. The paid part on Halo, for extension-only students (mockups)

- **The locked heads-up** (`6a-locked-heads-up.png`):
  - It appears on the assignment, under Halo's due date: "An announcement changed this due date · Unlock with Max".
  - At most once per item.
  - It uses the checkout from section 5; after paying it shows the detail right there.
- **When the trial ends, one note on Halo** (`6b-trial-end-note-on-halo.png`):
  - It uses Halo's own info alert style and shows once, ever.
  - It says what Free keeps and what Max adds, with "Keep Max · $0.99/mo" and "Not now".
- **One line in the popup** (`6c-popup-line.png`): "Max: $0.99/mo ›". Plus's "Plus also syncs…" box goes.
- **Nothing else:** no banners, nothing on every page, nothing repeated.
- **Admin:** paying users by where they paid, the extension or the app. Recorded as a checkout source on the session.

## 7. The trial-end screen: two cards (mockups)

- Max is the clear main card: "What you have now", $0.99 a month, and three real numbers from their own week (announcement
  catches, moved dates found, auto-syncs).
- Free is a real "Stay on Free" button, quieter, with what they keep.
- Honest throughout: no countdown, no hidden price, "Cancel anytime · plus tax where applicable".
- The headline uses their own number ("Max caught 4 things this week you'd have missed"), or a plain line when it caught
  nothing.

Mockups:
- `7-trial-end-desktop-A.png` and `7-trial-end-phone-A.png`: Managed Payments kept, one button.
- `7-trial-end-desktop-B.png` and `7-trial-end-phone-B.png`: wallet buttons on the card. The black buttons there are
  stand-ins for Apple's and Google's official buttons, which Stripe draws.

## 8. Also updated

- Admin's plan stats: Free and Max only, plus paid users from the extension vs the app.
- The extension's gating: Free gets everything on Halo's pages; Max gets auto-sync and the announcement-read notes.
- The store description's plans line.

## Your decisions

1. **Wallet buttons:** A (keep Managed Payments, one button, Apple Pay on Stripe's page) or B (Managed Payments off,
   wallet buttons on our page, sales tax becomes yours)?
2. **The locked heads-up:** keep its small AI cost on Free (recommended), or make it use no AI?
3. **Reminders, the Sunday preview and the calendar feed:** in Max, as you listed (recommended)?
4. **Grade projection and the colour picker:** Free, by the rule?
5. **Invite reward:** 30 days of Max?
6. **Your account:** Max until Nov 5 then Free, or Max permanently as the owner?
7. **Stripe:** OK to add the $0.99 price, archive the old prices and delete the two coupons, after the code that knows them
   is live?
