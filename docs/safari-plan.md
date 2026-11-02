# Halo+ for Safari (Mac, iPhone, iPad) and Sign in with Apple: the plan

Loop 307, 2026-11-01. This is a plan only. Nothing is built until George says OK.

## What I checked

- **Tools:** Xcode 26.6, Safari 26.4 and the iOS 26.5 Simulator are installed on this Mac.
- **Dry run:** Apple's converter (`xcrun safari-web-extension-converter`) ran on `extension/` in a scratch folder. It made
  one project with four parts: a Mac app, an iPhone/iPad app, and the extension for each. Both built unsigned (Mac and
  iOS Simulator: BUILD SUCCEEDED). Nothing from the dry run is in the repo.
- **The converter's one warning:** `"type": "module"` on the background script. background.js imports config.js,
  halo-model.js and onhalo/logic.js, so this matters (see below).

## One codebase

`extension/` stays the only source. A small build step, `scripts/build-safari.mjs`, makes `safari/build/` from it:

- the same files;
- background.js bundled into one plain script (no `import`), in case Safari 26 really refuses a module background;
- a Safari manifest: no `type`, no `unlimitedStorage` if Safari ignores it, a minimum Safari version.

The Xcode project (in `safari/`, made once by the converter) points at `safari/build/`, and an Xcode build step runs
the script first. So every Chrome change lands in Safari on the next build, with nothing copied by hand.
`npm run build:extension` builds both.

## Every API we use, in Safari

The counts are call sites in extension/ (vendor files left out).

| API | Mac Safari | iPhone/iPad Safari | Change needed |
|---|---|---|---|
| `storage.local` (62), `storage.onChanged` | works | works | none |
| `unlimitedStorage` | probably ignored | probably ignored | measure our largest snapshot against Safari's quota; trim old rows if near it |
| `runtime.sendMessage` / `onMessage` | works | works | none |
| `runtime.onInstalled`, `onStartup`, `getManifest`, `getURL` | works | works | none |
| `runtime.getPlatformInfo` (the keep-alive during a sync) | works | works | none |
| `runtime.setUninstallURL` (the /bye page) | **not supported** | **not supported** | skip in Safari. Removing the app gives us no signal, but the daily ping stopping is the count |
| `management.getSelf` (test-browser check) | **not supported** | **not supported** | already in a try/catch; Safari test builds get their own flag so they are never counted as students |
| `navigator.userAgentData` | absent | absent | already guarded |
| background service worker | works (stops when idle, like Chrome) | works, but iOS stops it much sooner | none for messages (a message wakes it) |
| `"type": "module"` background | converter warns | same | bundled background (above); a first test tells us whether we need it |
| `alarms` (auto-sync every few hours, badge every 10 min, the daily ping) | works while Safari is open | **unreliable**: iOS rarely wakes an extension in the background | Mac: none. iPhone: sync and ping when the student is on Halo instead (below) |
| `scripting.executeScript` (files) | works | works | none |
| `scripting.executeScript` with `world: 'MAIN'` (sync-inject.js, file downloads) | works in recent Safari; verify in the first test | same | fallback: inject `sync-inject.js` as a page `<script>`; it is already a web-accessible resource |
| `scripting.insertCSS` | works | works | none |
| `tabs.query/create/update/get/remove/reload/sendMessage/onUpdated/onActivated` | works | works, but `active: false` tabs are visible tabs on a phone | iPhone: never open a background Halo tab |
| `windows.getAll/get/update/onCreated` | works | partly (one window per app) | already wrapped in `.catch` |
| `action.setBadgeText/BackgroundColor` | works | no badge shown on iPhone | none |
| `action.setBadgeTextColor` | not supported | not supported | already checked before use |
| `action.openPopup` | may be refused | refused | already in a try; falls back to opening a tab |
| `permissions.request/contains` (the Halo file host, optional) | works, Safari's own prompt | works | none |
| host permissions | **the student must allow them** in Safari, per site | same, in Settings or the aA menu | the biggest UX difference (below) |
| content scripts on halo.gcu.edu and haloplus.app | work once allowed | work once allowed | none |
| offscreen documents, declarativeNetRequest, cookies, identity | not used | not used | — |

**The one real UX difference: permission.** Chrome grants our sites at install. Safari asks the student to allow
Halo+ on each site: "Always Allow on This Website" for halo.gcu.edu and haloplus.app, or Allow on every website. Until
they do, nothing appears on Halo and the account handoff can't happen. The app's first screen and the welcome tab
will show exactly that one step with a picture, and the Halo+ toolbar button will show a dot until both sites are
allowed.

## The five things you asked about

1. **Auto-sync in the background.**
   - **Mac:** works the same as Chrome while Safari is open. The alarm opens a Halo tab behind the student's tab, reads
     it, and closes it. If Safari is quit, nothing runs (Chrome is the same when it is quit). To check in the Mac test:
     that a background tab really runs our script in Safari 26.
   - **iPhone/iPad:** there is no dependable background sync, because iOS doesn't keep extensions running. Instead,
     Halo+ syncs every time the student opens Halo in Safari, which is the Free plan's "on visits" sync. For Max, the
     promise on iPhone is "kept current when you open Halo", not "every few hours".
2. **The on-Halo features.** The same content scripts, so the same features on Mac. On iPhone, Halo's mobile layout
   is different (see below).
3. **The submit check-off.** The content script sees Halo's confirmation and sends a message, and a message wakes the
   background, so this works on both. On iPhone the toast and confetti show on the page, as on a laptop.
4. **The account handoff from haloplus.app.** content-dash.js runs on haloplus.app in Safari once that site is allowed,
   so it works the same. Catch: a **Home Screen** Halo+ (the web app) is not Safari, and extensions don't run there. The
   handoff happens once in a Safari tab; after that, the Home Screen app just reads the account, which is fine.
5. **The daily ping.** Mac: the alarm, as in Chrome. iPhone: sent at most once a day when the student opens Halo or
   haloplus.app, so an iPhone that is in use is always counted. The ping gains a `browser` field
   (chrome/edge/safari-mac/safari-ios), and Admin's Extension users card splits by it. No uninstall page in Safari.

## What an iPhone Safari student could do

- **Sync from the phone with no laptop: yes.** This is the most useful part.
  - The sync already runs inside a Halo tab using the student's own Halo sign-in. On iPhone Safari it can run when
    the student opens Halo.
  - Five of five iPhone sign-ups in October got stuck on "one step left, on your laptop". With the Safari extension,
    an iPhone-only student can finish on the phone: get Halo+ from the App Store, turn it on in Settings, open Halo in
    Safari, and their classes arrive.
  - The phone sign-up screen and "You're in!" would then offer "Set up on this iPhone" as a first-class path when it
    is an iPhone.
- **On Halo's mobile site:**
  - Should work: due countdowns, the "This week" panel, NEXT boxes, grade on cards, rubric under the assignment, and
    the check-off on submit.
  - Search: ⌘K needs a keyboard, so on a phone the Halo+ pill opens search instead.
  - Wide pieces (the Gradebook what-if table, the all-classes calendar) need a phone layout. I'll fit or hide them,
    never show them broken.
  - Halo's own mobile DOM isn't in our saved copies. I'll test our stand-in at phone width in the Simulator. The real
    check is George opening Halo once on his iPhone with the TestFlight build, about 5 minutes; I can't sign in to
    Halo.
- **iPad:** the same as iPhone, but at laptop-like widths, so close to the Chrome experience. With a keyboard, ⌘K
  works.

## The build, after your OK

1. **Mac:**
   - `safari/` project and `scripts/build-safari.mjs`;
   - fixes for the table above;
   - Safari-only welcome and permission steps.
   - Test in Safari on Mac with the same stand-in Halo pages and throwaway accounts: install, allow sites, handoff,
     auto-sync, on-Halo features, check-off, ping. Run the existing e2e checks where Safari can be driven, and
     screenshots everywhere else.
   - Safari doesn't let a script load an extension. **One step for George:** build once with his signing team in Xcode
     (or tick Safari → Settings → Developer → Allow unsigned extensions) so Safari will run it.
2. **iPhone/iPad:**
   - sync-on-visit;
   - the pill opens search;
   - phone layout for the wide pieces;
   - "Set up on this iPhone" in the app.
   - Test in the iOS Simulator: Safari with the extension, stand-in Halo at iPhone and iPad sizes. Turning the
     extension on in the Simulator's Settings is one tap I can do by hand.
3. Then a TestFlight build, if George makes an App Store Connect API key (below). **I will not submit anything for App
   Review**; George presses Submit, just as with the Web Store.

## What George has to do himself

### A. Once, in Xcode (2 minutes)
1. Open Xcode → Settings → Accounts → **+** → Apple ID → sign in with the Apple Developer account.
2. Tell me the **Team ID**: developer.apple.com → Account → Membership details, 10 characters like `AB12CD34EF`.
   Then I can build signed apps from the command line.

### B. Apple Developer portal (developer.apple.com → Certificates, IDs & Profiles), about 10 minutes
1. **Identifiers → + → App IDs → App:**
   - Description `Halo+`, Bundle ID (Explicit) `app.haloplus.HaloPlus`.
   - Tick **Sign in with Apple** ("Enable as a primary App ID").
   - Register.
2. **Identifiers → + → App IDs → App:** Description `Halo+ Extension`, Bundle ID `app.haloplus.HaloPlus.Extension`.
   Register. Xcode can also make 1 and 2 by itself; making them here is fine too.
3. **Identifiers → + → Services IDs** (this is the web sign-in):
   - Description `Halo+ sign-in`, Identifier `app.haloplus.signin`. Register.
   - Open it, tick **Sign in with Apple** → **Configure**:
     - Primary App ID: `app.haloplus.HaloPlus`
     - Domains: `kiacmspgvntzwngijibr.supabase.co`
     - Return URL: `https://kiacmspgvntzwngijibr.supabase.co/auth/v1/callback`
   - Save, Continue, Save.
4. **Keys → +:**
   - Name `Halo+ Sign in with Apple`, tick **Sign in with Apple** → Configure → `app.haloplus.HaloPlus`.
   - Register, then **Download** the `.p8` file (Apple lets you download it only once). Save it as
     `~/haloplus-apple-key.p8`, never in the repo.
   - Tell me the **Key ID** shown on that page.
5. **Services → Sign in with Apple for Email Communication → Configure:** this is what makes "Hide my email" addresses
   get our emails.
   - Add the domains `haloplus.app` and `send.haloplus.app`.
   - Add the email addresses `noreply@haloplus.app`, `hello@haloplus.app` and the Supabase sign-in sender (the
     "Sender email" in Supabase → Authentication → Emails → SMTP Settings).
   - Apple shows a green check per domain once SPF passes. Tell me if one stays red and I'll fix the DNS.

### C. Supabase: nothing to paste by hand
With the Team ID, Key ID, Services ID and the .p8 file on this Mac, I set the Apple provider in Supabase myself through
the Management API (the same access the CLI already uses). The secret Supabase needs is a token made from the .p8.

**It expires every 6 months.** I'll add `scripts/apple-secret.mjs` to remake it, and an Admin warning a month before it
runs out. Then `APPLE_SIGNIN` turns on.

If you'd rather paste it yourself: Supabase → Authentication → Sign In / Providers → **Apple** → Enable.
- Client IDs: `app.haloplus.signin,app.haloplus.HaloPlus`
- Secret Key: the token the script prints
- Save.

### D. App Store Connect (appstoreconnect.apple.com), when the build is ready
1. **Apps → + → New App:**
   - Platforms: iOS and macOS. Name: **"Halo+ for Halo LMS"**, or another; it must be unique on the App Store, and
     "GCU" in the name risks a trademark rejection (guideline 5.2).
   - Primary language English (U.S.). Bundle ID `app.haloplus.HaloPlus`. SKU `haloplus`. Full access.
   - One record for both Mac and iPhone means one purchase covers both.
2. **Pricing:** Free. **Category:** Education.
3. **App Privacy** (answers to paste):
   - Contact Info → Email Address: App Functionality, linked to the user, not used for tracking.
   - User Content → Other User Content (classes and due dates read from Halo): App Functionality, linked, not tracking.
   - Identifiers → Device ID (the random daily-ping id): Analytics, not linked, not tracking.
   - Usage Data → Product Interaction: Analytics, not linked, not tracking.
   - Privacy policy URL: `https://haloplus.app/privacy.html`. Support URL: `https://haloplus.app/`.
4. **Screenshots:** I'll make them from the Simulator and Safari:
   - iPhone 6.9" (1320×2868)
   - iPad 13" (2064×2752)
   - Mac (2880×1800)
5. **Age rating:** all "None" → 4+.
6. **App Review notes:** reviewers can't sign in to GCU's Halo. I'll write the notes and record a short demo video
   (Halo stand-in with Maya Torres). Apple may still ask questions; George answers them.
7. **Optional, so I can upload builds to TestFlight:** Users and Access → Integrations → App Store Connect API →
   **+** key with "App Manager" role. Download the `.p8` to `~/haloplus-asc-key.p8` and tell me the Key ID and Issuer
   ID. Without it, George uploads each build from Xcode (Product → Archive → Distribute).
8. **Submit for Review:** George only.

## Sign in with Apple: what I build and check

- **Where the button goes:** the Apple button turns on in the phone sign-up (built in Loop 298, off until now). It is
  also added beside Google on the laptop sign-in and log-in, following Apple's button rules.
- **Safari (Mac and iPhone):** the normal web flow, where Apple's page asks for Face ID / Touch ID / password, then
  back to haloplus.app.
- **Instagram's in-app browser:** unlike Google, Apple's web sign-in works inside in-app browsers (no "open in Safari"
  needed). So in Instagram the Apple button stays in place and is listed first. I'll test the flow in the Simulator
  with Instagram's browser identity. The last real check is George tapping it once in Instagram on his iPhone.
- **"Hide my email" addresses:**
  - Our emails (the laptop link, reminders, alerts, password reset) go from haloplus.app via Resend. Resend already
    DKIM-signs them as haloplus.app, which is what Apple's relay checks along with the registered senders (step B5).
  - The test: a George-made relay address receives a laptop-link email, and our send log shows it delivered.
  - Admin will show "Apple relay" for these accounts, so we know why the address looks odd.
- **The first sign-in:** Apple gives the name and email only on the first sign-in. Supabase stores them; nothing else
  needed.
- **Testing limits:**
  - I can't make an Apple ID, so a full Apple sign-in needs George's own Apple ID, once. That creates George's own
    account (his choice, and he can delete it in Settings).
  - Everything else uses throwaway accounts only.

## Questions for George
1. OK to build, Mac first?
2. App Store name: "Halo+ for Halo LMS", or another?
3. Should I upload TestFlight builds (needs the API key in D7), or will you upload from Xcode?
