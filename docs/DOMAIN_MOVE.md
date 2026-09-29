# Moving Halo+ to haloplus.app

Written for George. Everything in the repo is done and deployed. What is left happens in five dashboards, in the
order below. Nothing breaks while you do it: the old github.io address keeps working exactly as it does today until
haloplus.app is really live over HTTPS, and then it moves each student over by itself.

## How the move works (so you know what to expect)

- **Two sites, one build.** Every deploy builds the app twice. The haloplus.app build is pushed to the repo
  `richardsgeorger-collab/haloplus.app`, whose GitHub Pages serve the domain. The github.io build keeps deploying
  to `richardsgeorger-collab.github.io/school-dashboard/` as before.
- **Old bookmarks keep working.** Every 😇 Sync Halo bookmark saved before today loads its script from the
  github.io address, and that address keeps serving it. The script now hands the sync to whichever Halo+ address
  the tab ends up on, so it works before, during and after the move.
- **Students are moved automatically.** Once haloplus.app answers, the github.io site checks on every visit:
  - Someone with nothing saved there is sent straight to haloplus.app, on the same page.
  - Someone with a planner there sees one screen, "Halo+ now lives at haloplus.app", and one button. It hands their
    sign-in, classes, checked-off work, slides, recordings and syllabi to haloplus.app (browsers keep each address's
    storage separate, so this is the only way it comes along), then opens haloplus.app.
  - After that, every old link and every old bookmark forwards to haloplus.app.
- **What students redo once:** turn notifications on again, and re-add the Home Screen app if they had one (the old
  one still opens, then forwards).

Tested end to end with an old bookmark (`scripts/e2e-domain-move.mjs`): before the domain is live the old bookmark
syncs to github.io as always; once live, the move screen appears, one tap brings the account and a library file
across, and the same old bookmark then hands its sync to haloplus.app ("Sent to the dashboard").

---

## 1. Cloudflare DNS (about 5 minutes)

Cloudflare dashboard → **haloplus.app** → **DNS** → **Records** → **Add record**, once for each row. Set **Proxy
status to "DNS only" (grey cloud) on every one**: GitHub has to see its own servers to issue the HTTPS
certificate, and an orange-cloud record hides them.

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | `@` | `185.199.108.153` | DNS only | Auto |
| A | `@` | `185.199.109.153` | DNS only | Auto |
| A | `@` | `185.199.110.153` | DNS only | Auto |
| A | `@` | `185.199.111.153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only | Auto |
| CNAME | `www` | `richardsgeorger-collab.github.io` | DNS only | Auto |

Delete any other A, AAAA or CNAME record on `@` or `www` that Cloudflare added when you bought the domain (a parking
page, for example). Leave MX and TXT records alone.

If **DNS → Settings** shows any **CAA** records, add one more: type `CAA`, name `@`, tag "Only allow specific
hostnames", value `letsencrypt.org`. With no CAA records at all, do nothing.

## 2. GitHub: verify the domain, then turn on HTTPS (about 10 minutes plus waiting)

**Verify the domain for your account first.** This stops anyone else from ever pointing a GitHub site at it.

1. github.com → your avatar → **Settings** → **Pages** (left menu, under "Code, planning, and automation") →
   **Add a domain** → type `haloplus.app` → **Add domain**.
2. GitHub shows a TXT record. In Cloudflare, **Add record**: type `TXT`, name exactly what GitHub shows (it starts
   with `_github-pages-challenge-richardsgeorger-collab`; Cloudflare adds `.haloplus.app` itself, so paste only the
   part before it), content the code GitHub shows. Save.
3. Back on GitHub, **Verify**. It can take a few minutes.

**Then the site.** Claude already created the repo and CI pushes the site into it on every deploy.

4. github.com/richardsgeorger-collab/haloplus.app → **Settings** → **Pages**. It should already say "Your site is
   live at https://haloplus.app" (or "DNS check in progress"). If Source is not set: **Deploy from a branch**,
   branch `main`, folder `/ (root)`, **Save**. **Custom domain** should read `haloplus.app`; if it is empty, type
   `haloplus.app` and **Save**.
5. Wait for "DNS check successful" (minutes to an hour). Then wait for the certificate: the **Enforce HTTPS** box
   becomes clickable (usually under an hour, up to 24). **Tick Enforce HTTPS.**
6. Check: https://haloplus.app opens Halo+ with the padlock, and http://haloplus.app and https://www.haloplus.app
   both end up there.

The moment step 6 works, the github.io site starts moving students over. Nothing else to switch.

## 3. Supabase (2 minutes, after step 2 works)

supabase.com → project **school-dashboard** → **Authentication** → **URL Configuration**:

- **Site URL**: replace it with `https://haloplus.app/` and **Save**. (This is the default place emails send people.)
- **Redirect URLs**: already done by Claude: `https://haloplus.app/**` and `https://www.haloplus.app/**` are in the
  list. Keep the github.io entries until everyone has moved.

## 4. Google Cloud (Google sign-in) and Search Console

**Search Console first** (Google wants proof you own the domain before it shows it on the sign-in screen):

1. search.google.com/search-console → **Add property** → **Domain** → `haloplus.app` → **Continue**.
2. Google shows a TXT record. Either click **Verify with Cloudflare** if offered (it adds the record for you), or in
   Cloudflare **Add record**: type `TXT`, name `@`, content the `google-site-verification=…` text. Then **Verify**.
3. Once verified: **Sitemaps** (left menu) → enter `https://haloplus.app/sitemap.xml` → **Submit**.
4. Optional: in the old github.io property, nothing to do; Google follows the canonical links to haloplus.app.

**Google Cloud console** (console.cloud.google.com, the project that holds the Halo+ sign-in):

5. **Google Auth Platform** (or APIs & Services → OAuth consent screen) → **Branding**:
   - App home page: `https://haloplus.app/`
   - App privacy policy link: `https://haloplus.app/privacy.html`
   - App terms of service link: `https://haloplus.app/terms.html`
   - **Authorized domains** → **Add domain** → `haloplus.app` (it must be verified in Search Console, step 2).
   - **Save**. If Google asks to re-verify the branding, submit it; sign-in keeps working while it reviews.
6. **Clients** (or APIs & Services → Credentials) → the **Web client** Halo+ uses → **Authorized JavaScript origins**
   → **Add URI** → `https://haloplus.app` → **Save**. Leave **Authorized redirect URIs** as it is (it is the Supabase
   address, `https://kiacmspgvntzwngijibr.supabase.co/auth/v1/callback`, which does not change).

## 5. Stripe (test mode now; repeat in live mode at launch)

dashboard.stripe.com (the School-Dashboard sandbox):

1. **Settings** → **Business** → **Public details** → **Website**: `https://haloplus.app`. **Save**.
2. **Settings** → **Billing** → **Customer portal** → **Business information**: Privacy policy
   `https://haloplus.app/privacy.html`, Terms of service `https://haloplus.app/terms.html`. **Save**.
3. Checkout and the portal return to whichever address the student started from, so there is nothing else to set.

## 6. Resend: password reset emails from haloplus.app

Now that there is a domain, Resend's free tier (3,000 emails a month, 100 a day) can send to anyone. Full steps are
in `docs/PASSWORD-RESET-EMAIL.md`; in short: add `haloplus.app` in Resend (its **Auto configure** button can add
the DNS records to Cloudflare for you), wait for **Verified**, make an API key, paste the SMTP settings into Supabase,
send yourself a test reset, then turn on **Password reset emails** in Admin.

## 7. Later

- **Chrome Web Store**: the extension is rebuilt for haloplus.app (permissions keep github.io for the move). The
  listing text is updated in `docs/webstore/LISTING.md`. Publish when you pay the $5.
- **Bing Webmaster Tools** (optional): add `haloplus.app` and import from Search Console; IndexNow pings
  `haloplus.app` on every deploy already.
- **Months from now**: when the old address has had no visits for a while, remove the github.io entries from
  Supabase's Redirect URLs. Keep the github.io site itself running for as long as old bookmarks exist: it costs
  nothing and it is what they load.
