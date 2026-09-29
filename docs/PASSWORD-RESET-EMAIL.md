# Password reset emails from haloplus.app (Resend)

Written for George. Forgot password needs a real email sender; Supabase's built-in one allows 2 emails an hour and
is not for real use. Until this is done, the switch in Admin stays off and students see "Contact George to reset your
password." instead of a link that silently fails.

With the domain, Resend's free tier works: 3,000 emails a month, 100 a day, to anyone. Emails come from
`noreply@haloplus.app`. Do this after the domain itself is set up (`docs/DOMAIN_MOVE.md`, steps 1 to 3).

## 1. Add and verify the domain in Resend (about 10 minutes, then a short wait)

1. resend.com → **Sign up** (GitHub or Google sign-in is fine). Free plan, no card.
2. **Domains** → **Add Domain** → Name: `haloplus.app` → Region: **North Virginia (us-east-1)** → **Add**.
3. Resend lists DNS records: an **MX** and a **TXT** (SPF) on `send.haloplus.app`, and a **TXT** (DKIM) on
   `resend._domainkey.haloplus.app`. Two ways to add them:
   - **Easiest:** click **Auto configure** (or "Sign in to Cloudflare") on that page, approve access to the
     haloplus.app zone, and Resend adds all of them.
   - **By hand:** Cloudflare → haloplus.app → DNS → Records → **Add record** for each row Resend shows, copying
     Type, Name and Value exactly (for Name paste only the part before `.haloplus.app`, e.g. `send` and
     `resend._domainkey`; for the MX, Priority `10`). Proxy status **DNS only** where Cloudflare offers it.
4. Also add one DMARC record (recommended; it helps inboxes trust the mail): **Add record** → Type `TXT`, Name
   `_dmarc`, Content `v=DMARC1; p=none;` → Save.
5. Back in Resend → **Verify DNS Records**. Status turns **Verified** within minutes (sometimes up to an hour).

These records sit on `send.` and `resend._domainkey.`, so they do not touch the website records.

## 2. Make an API key

Resend → **API Keys** → **Create API Key** → Name `Supabase password resets`, Permission **Sending access**, Domain
`haloplus.app` → **Add**. Copy the key (it starts with `re_`); Resend shows it once. Do not paste it anywhere else.

## 3. Paste it into Supabase

supabase.com → project **school-dashboard** → **Authentication** → **Emails** → **SMTP Settings** → turn on
**Enable Custom SMTP**:

| Field | Paste |
|---|---|
| Sender email | `noreply@haloplus.app` |
| Sender name | `Halo+` |
| Host | `smtp.resend.com` |
| Port number | `465` |
| Minimum interval between emails | `60` |
| Username | `resend` |
| Password | the `re_…` key from step 2 |

**Save.** Then **Authentication** → **Rate Limits** → **Rate limit for sending emails**: `30` per hour → **Save**.

Optional, same page, **Templates** → **Reset Password**: subject `Reset your Halo+ password`.

## 4. Test, then switch it on

1. Halo+ (https://haloplus.app) → You → **Admin** → **Password reset emails** → **Turn on**.
2. Log out → **Log in** → **Forgot password** → your own email → **Email me a reset link**.
3. The email should arrive within a minute, from Halo+ `noreply@haloplus.app`, and its link should open Halo+ asking
   for a new password. If it does not arrive: Resend → **Emails** shows what happened; turn the Admin switch back
   off until it works so students keep seeing "Contact George".

## Accounts made with the email link

They keep working. Those accounts have no password, so:
- a Google address: Continue with Google signs straight into the same account (same email, same data);
- anyone: Forgot password sets a password (once the steps above are done).
Trying a password on one of these accounts says exactly that instead of a bare "wrong password".
