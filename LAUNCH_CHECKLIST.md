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

1. Create the Supabase project (free). Run `supabase/migrations/0001_foundations.sql` in the SQL editor.
2. Set the two `VITE_SUPABASE_*` repository variables on GitHub so the deploy bakes them in.
3. Enable Email (magic link) and Google providers in Supabase Auth. Add the github.io (or custom domain) URL to the
   redirect allow-list.
4. Set your own profile to `tier = 'max', is_admin = true` in the SQL editor so your copy is never metered and the
   admin dashboard opens for you.
5. Deploy the Edge Functions (`supabase functions deploy ai …`) and set the server secrets from
   `supabase/functions/.env.example`.
6. **Run the isolation test against the live project**: create two throwaway accounts with passwords enabled
   temporarily, then `SUPABASE_URL=… SUPABASE_ANON_KEY=… RLS_USER_A=… RLS_PASS_A=… RLS_USER_B=… RLS_PASS_B=… npx vitest run supabase/tests`.
   Turn passwords back off afterwards. Do not launch on a failure.
7. **Remove `VITE_AI_DIRECT: '1'` from `.github/workflows/deploy.yml`.** After that, no build can send a browser key
   to Anthropic; every AI call goes through the server.
8. Stripe: create the three products with month and year prices in **test mode**, paste the ids into
   `STRIPE_PRICE_IDS` in `src/config/tiers.ts`, point the webhook at the `stripe-webhook` function, run a test
   checkout end to end. Only then switch to live keys and repeat once with a real card and refund it.
9. Generate VAPID keys, set both, send yourself one push.
10. Put the Meta Pixel id in, confirm the four events fire in Events Manager.
11. Read `PRIVACY.md` and `TERMS.md` once more with your own name and contact in them.

## Things that must stay true

- No GCU logos, marks or colors on the landing page or in the app; the "not affiliated with Grand Canyon University"
  line stays on the landing page and the You tab.
- The app never asks for a GCU password. Halo tokens live in the bookmarklet's runtime for one sync and are never
  stored or sent anywhere but Halo.
- Every AI call is capped by kind and metered by tier; a student can never cost more in AI than the ceiling for
  their plan.
