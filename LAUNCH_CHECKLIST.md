# Launch checklist

Everything that costs money or needs a real account, why it is needed, and what it costs. Nothing on this list has
been bought or enabled. The app is built to run on free tiers until the day you decide to launch.

## Paid or account-gated services

| Service | Why | Cost | Placeholder in the code |
|---|---|---|---|
| **Supabase** (Free plan) | Accounts, database with row-level security, Edge Functions (the AI gateway, Stripe webhooks, push sender). Free: 500 MB database, 50k monthly active users, 500k function calls. | $0 until the free plan runs out; Pro is $25/mo when it does. | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| **Anthropic API** | The model behind every AI feature, called only from the Edge Function. Haiku 4.5: $1/M input, $5/M output, cache reads $0.10/M. Ceilings in `src/config/tiers.ts` keep any one student under $0.75 (Plus), $2.50 (Pro), $4.00 (Max) a month. | Pay as you go; expect roughly $0.30–1.50 per paying student per month at the caps. | `ANTHROPIC_API_KEY` (server secret) |
| **Stripe** | Checkout, customer portal, subscription webhooks. Built and tested in **test mode** only. | 2.9% + 30¢ per charge; no monthly fee. | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (server); price ids in `src/config/tiers.ts` |
| **Google Cloud OAuth client** | "Continue with Google". | Free. | Configured in the Supabase dashboard, no code placeholder |
| **Web Push (VAPID keys)** | Push notifications for the morning brief, heavy-day warnings, nudges, re-sync reminders. Generate a pair once; no vendor. | Free. | `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| **Meta Pixel** | Measure the ad → sign-up → connect Halo → upgrade funnel. | Free (ad spend is separate). | `VITE_META_PIXEL_ID` |
| **Domain** | A real address for the landing page and the app instead of github.io. | ~$12/yr. | none |
| **Chrome Web Store developer account** | Publishing the Plus auto-sync extension. | $5 one-time. | none |
| **Email provider** (later) | Not needed at launch; reminders are push-only. The notification system has a slot for email when wanted. | $0 now; Resend or Postmark free tiers cover thousands of emails a month. | `notification_prefs.email` column exists, no sender wired |

## Before going live, in order

Steps 1 to 7 done 2026-09-25 (project `kiacmspgvntzwngijibr`, us-west-1, free plan).

1. ~~Create the Supabase project and run the migrations.~~ Done: 0001 to 0004 applied; 16 tables, RLS on all.
2. ~~Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository variables.~~ Done.
3. ~~Email link and Google sign-in; redirect allow-list.~~ Done. **Still to do before launch:**
   - Google sign-in is in **Testing**: only listed test users can use it. To open it to everyone, finish Google Auth
     Platform → Branding (final app name, logo, privacy and terms links, your domain) and publish; Google may verify.
   - Supabase's built-in mailer sends **2 sign-in emails an hour**. Before launch, add a free SMTP sender (Resend's
     free tier covers 3,000 emails a month) under Authentication → Emails → SMTP.
4. ~~Your profile set to Max and admin.~~ Done for richards.georger@gmail.com.
5. ~~Deploy the Edge Functions and set the server secrets.~~ Done: all five deployed and smoke-tested;
   `ANTHROPIC_API_KEY` (workspace-scoped) and `NOTIFY_CRON_SECRET` set; cron URL and secret in Vault. One real
   AI call verified: the server forced Haiku and the cap when the client asked for another model, metered and logged.
6. ~~Live RLS isolation test.~~ **Passed** 2026-09-25: across all 16 tables a second student could not read, update or
   delete the first student's rows, could not upgrade itself, and both admin functions refused it. Test accounts
   deleted through `delete_my_account`, which removed every row they wrote. Re-run after any migration (create two
   accounts with passwords through the admin API, as done here).
7. ~~Remove `VITE_AI_DIRECT` from the deploy workflow.~~ Done 2026-09-25. No production build can send a browser key
   to Anthropic, and any key left in a browser from the old coach is deleted on load.
8. ~~Stripe in the sandbox.~~ Done 2026-09-25 in the School-Dashboard sandbox: three products with six prices
   (ids in `src/config/tiers.ts`, tax code SaaS personal use), webhook endpoint with 5 events, customer portal
   (cancel at period end), sandbox secret key and webhook secret on the server. Verified with a throwaway account:
   Checkout paid with 4242 → webhook set Pro and an active subscription row; portal opened; cancel-at-period-end kept
   Pro; immediate cancel dropped to Free. `scripts/e2e-checkout.mjs` fills the card form but Stripe's hCaptcha blocks
   headless submission, so the Subscribe click is a person. **Not exercised live:** the failed-payment grace period
   (same webhook path, mapping unit-tested; needs Stripe test clocks).
   **Your decision before live payments: Managed Payments.** It is on by default on this account: Stripe (through
   Link) becomes the seller of record and handles sales tax for you, adds sales tax at checkout (Pro showed $7.63 in
   Phoenix: $6.99 + 9.1%), and charges a higher fee than standard Stripe. Off means standard fees, but sales tax is
   yours to handle. Settings → Managed payments in the Stripe dashboard. Then create the same products and prices in
   live mode, put the live ids in `tiers.ts`, and set the live secret key and a live webhook.
9. Notifications: `npx web-push generate-vapid-keys`; set `VITE_VAPID_PUBLIC_KEY` as a repository variable and
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT`, `NOTIFY_CRON_SECRET` as function secrets; deploy
   `notify-send`; run `supabase/migrations/0003_notifications_cron.sql` with your project ref and the same secret;
   then turn notifications on under You and confirm the sample note and, next morning, the real one.
10. Meta Pixel: set `VITE_META_PIXEL_ID` as a repository variable (the app) and replace `META_PIXEL_ID_PLACEHOLDER`
    in `public/landing/index.html` (the landing page). Confirm PageView, Lead, CompleteRegistration, HaloConnected
    and Subscribe fire in Events Manager.
11. Run the AI before/after once with your key: `ANTHROPIC_API_KEY=… BASELINE_MODEL=<the model the app used before> npm run ai:compare`,
    read `docs/ai-compare/<date>.md`, and fix any fixture the shipped model fails before launch (prompts, not model).
12. Replace `CONTACT_EMAIL_PLACEHOLDER` in `PRIVACY.md` and `TERMS.md`, regenerate `public/privacy.html` and
    `public/terms.html` (the snippet in PROGRESS.md, Phase 8), and read both once more as the person whose name is on them.
    Run `supabase/migrations/0004_admin_feedback.sql` so the admin screen and feedback screenshots work.
13. Extension: `npm run build:extension`, zip `extension/`, upload to the Chrome Web Store (developer account,
    $5 one-time), and put the store link on the You tab and the landing page. Until then Plus users can load it
    unpacked from `extension/README.md`.

## Things that must stay true

- No GCU logos, marks or colors on the landing page or in the app; the "not affiliated with Grand Canyon University"
  line stays on the landing page and the You tab.
- The app never asks for a GCU password. Halo tokens live in the bookmarklet's runtime for one sync and are never
  stored or sent anywhere but Halo.
- Every AI call is capped by kind and metered by tier; a student can never cost more in AI than the ceiling for
  their plan.
