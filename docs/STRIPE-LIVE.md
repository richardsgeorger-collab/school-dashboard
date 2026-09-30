# Switching Halo+ billing to Stripe live mode

Written for George. The app side is done: a live key sells the live prices, a test key keeps selling the sandbox ones,
and a student whose Stripe customer was made in test mode gets a fresh live customer at checkout. What is left is
activating your Stripe account (only you can do that), then one script. No real subscriptions exist yet, so nothing
has to be moved.

## 1. Activate your Stripe account (about 15 minutes; Stripe may take a day to review)

Your test prices live in a **sandbox** ("School-Dashboard sandbox"). Live mode is your main Stripe account.

1. dashboard.stripe.com → top left, switch from the sandbox to your main account → **Activate payments** (or
   Settings → Business → Activate).
2. Business type: **Individual / sole proprietorship** (you must be 18 or older). Your legal name, date of birth,
   home address, phone, SSN (Stripe asks for the last 4 first, sometimes the full number).
3. Business details: website `https://haloplus.app`; industry **Software → SaaS**; description: "Halo+ is a study
   planner for Grand Canyon University students. Monthly subscriptions (Plus $4.99, Max $7.99) unlock Halo sync,
   announcement reading and study tools."
4. Statement descriptor: `HALOPLUS` (what shows on a card statement). Support email: yours. Support phone: yours.
5. Bank account for payouts (routing and account number, or connect your bank).
6. Two-step authentication: Stripe requires it for live mode. Turn it on when asked.

When the dashboard stops saying "Activate payments", the account can take real money.

## 2. Settings worth setting before the first sale (5 minutes, live mode)

- Settings → **Public details**: business name `Halo+`, website `https://haloplus.app`.
- Settings → **Branding**: upload the Halo+ icon, accent color `#E0A526`.
- Settings → **Customer emails**: turn on **Successful payments** (receipts) and **Refunds**.
- Settings → **Billing → Subscriptions and emails**: turn on emails for failed payments and card updates; leave
  Smart Retries on.
- Leave **Stripe Tax** off for now (it costs 0.5% per sale). Ask me before turning it on.

## 3. Put the live key on your Mac (1 minute)

Dashboard (live mode) → **Developers → API keys** → **Secret key** → **Reveal** → copy it (it starts `sk_live_`).
Then in Terminal:

```
security add-generic-password -s "Stripe live secret key" -a haloplus -w
```

It asks for the password: paste the key and press Return (nothing shows as you paste). The key stays in your
keychain; do not paste it into a chat or a file.

## 4. Tell Claude "switch Stripe to live"

Claude then:
1. runs `node scripts/stripe-live-setup.mjs` (a dry run: it shows what it will do and whether your account can take
   payments) and, if it is right, `--go`. That creates Plus $4.99 and Max $7.99 monthly in live mode, the webhook to
   Supabase, and the customer portal (cancel at period end, card update, invoices; your privacy and terms pages),
   writes the live price ids into the code, and puts the live key and webhook secret on Supabase;
2. runs the full tests, commits, deploys the four billing functions and the site;
3. checks that checkout opens a live Stripe page and that the portal opens.

## 5. One real purchase, by you (2 minutes)

Buy Plus on your own account with your own card. You should land back in Halo+ on Plus within seconds, get a receipt
email, and see the payment in the dashboard. Then Dashboard → Payments → that payment → **Refund**, and cancel the
subscription from You → Plan. That proves money, webhook, plan and portal all work live.

## Going back to test mode

Set `STRIPE_SECRET_KEY` on Supabase back to the sandbox's `sk_test_` key (Dashboard, sandbox → Developers → API
keys) and `STRIPE_WEBHOOK_SECRET` back to the sandbox webhook's secret; the code picks the test prices by itself.
