# Moving Halo+ off github.io

Everything the app builds itself uses `window.location.origin` plus Vite's `BASE_URL`, so most of the move is
configuration, not code. The one real problem is not a URL: **browser storage is per origin.** Every
`school-dashboard:*` localStorage key and `school-dashboard-*` IndexedDB database lives under github.io. Signed-in
users get their term back from Supabase sync; recordings, the library, syllabi and announcement bodies live only in
IndexedDB and stay behind. The You tab's JSON export/import is the migration path; ship a "move to the new address"
note on the old origin before switching.

## In the repo

| File | What | Change |
|---|---|---|
| `vite.config.ts:35` | `base: '/school-dashboard/'` | `'/'` at a domain root (everything using `BASE_URL` follows) |
| `src/auth/useAuth.ts` | auth `redirectTo` = origin + base | none in code; allow-list the new URL in Supabase |
| `src/billing/client.ts` | Stripe `returnTo` = origin + base | none in code |
| `supabase/functions/stripe-checkout`, `stripe-portal` | accept any `http…` `returnTo` | allow-list the new domain |
| `supabase/functions/_shared/admin.ts`, `ai/index.ts` | CORS `*` | optionally narrow to the domain |
| `src/views/You.tsx:146` | referral link = origin + base + `#/now?ref=` | none; old shared links still point at github.io |
| `src/views/HaloPanel.tsx`, `src/views/SyncSheet.tsx` | bookmarklet built from origin + base | none in code; **every installed bookmarklet has the old origin baked in, users reinstall** |
| `src/halo/bookmarklet.ts:8-10` | example URLs in comments | update |
| `src/notify/push.ts` | service worker at `${BASE_URL}sw.js` | none; old push subscriptions stay on the old origin, users re-enable |
| `public/manifest.webmanifest` | `start_url: ./#/now`, `scope: ./` | none; installed home-screen apps are tied to github.io |
| `public/landing/index.html` | `../#/now`, `../privacy.html` | rewrite if the landing page moves to the domain root |
| `extension/config.js`, `extension/sync-inject.js` | generated with the github.io origin | rebuild with `EXT_DASH_ORIGIN` / `EXT_DASH_PATH` |
| `extension/manifest.json:7,12` | `host_permissions` and content-script `matches` on github.io | change by hand (the build script does not touch them) |
| `scripts/build-extension.ts:6-7` | defaults for `EXT_DASH_ORIGIN` / `EXT_DASH_PATH` | change the defaults |
| `src/halo/bookmarklet.test.ts:4,35` | expected host set includes github.io | update with the code |
| `scripts/*.mjs` | `BASE` defaults to `localhost:4173/school-dashboard/` | change if the base changes |
| `README.md:5,43`, `PROGRESS.md:190,234`, `LAUNCH_CHECKLIST.md:16,26-28` | docs mention the URL | update |
| `.github/workflows/deploy.yml` | no CNAME step | add `public/CNAME` or set the custom domain in Pages settings |

Storage keys (`school-dashboard:*`, `school-dashboard-*`) and the export tag `app: 'school-dashboard'`
(`src/auth/account.ts`) stay as they are; renaming them would only break old export files.

## Outside the repo

1. GitHub Pages: custom domain + DNS + "Enforce HTTPS"; leave a redirect page on github.io for shared referral links.
2. Supabase Auth → URL configuration: Site URL and Redirect URLs for the new domain (keep github.io until done).
3. Google Cloud OAuth client: Authorized JavaScript origins; Google Auth Platform branding (home, privacy, terms,
   authorized domain). Publishing may trigger verification.
4. Stripe: business website and portal privacy/terms links (and again in live mode).
5. Chrome Web Store: publish the rebuilt extension with the new host permissions.
6. Users: reinstall the bookmarklet, re-enable push, reinstall the home-screen app, export/import local-only data.
7. Meta Pixel (if set up): add the domain in Events Manager. Resend (if set up): verify the sending domain.
8. Edge function secret `VAPID_CONTACT`: optionally an address on the new domain.
