# Password reset emails: what George sets up

Forgot password needs a real email sender. Supabase's built-in sender allows 2 emails an hour and is not for real use.
Until this is set up, the switch in Admin stays off and students see "Contact George to reset your password."

## Pick a sender (both free)

**Recommended, no domain needed: a Gmail account.** Free, about 500 emails a day, and mail really comes from Google,
so it lands in inboxes.

**Resend's free tier** (3,000 a month, 100 a day) only sends to addresses you do not own after you verify a domain you
own. Halo+ lives on github.io, so that means buying a domain first (about $10 a year). Say the word if you want that.

## Gmail (about 10 minutes)

1. Make a Gmail account for the app, for example haloplus.help@gmail.com (or use one you have).
2. In that Google account: Security, turn on 2-Step Verification.
3. Then go to myaccount.google.com/apppasswords, make an app password named "Supabase", and copy the 16 letters.
4. Supabase dashboard, project school-dashboard: Authentication, Emails, SMTP Settings. Turn on "Enable custom SMTP":
   - Sender email: the Gmail address
   - Sender name: Halo+
   - Host: smtp.gmail.com
   - Port: 587
   - Username: the Gmail address
   - Password: the 16-letter app password
   - Minimum interval between emails: 60
   Save.
5. Authentication, Rate Limits: set "Emails sent per hour" to 30 and save.
6. Optional: Authentication, Emails, Templates, "Reset password": subject "Reset your Halo+ password".
7. Halo+, You, Admin, "Password reset emails": Turn on. Then log out, Log in, Forgot password, type your own email.
   The email should arrive within a minute and its link should ask you for a new password. If it does not arrive,
   turn the switch back off and tell Claude.

## Resend (only with a domain)

1. resend.com, sign up, Domains, add your domain, add the DNS records it shows, wait for Verified.
2. API Keys, create one with "Sending access".
3. Supabase, Authentication, Emails, SMTP Settings: host smtp.resend.com, port 465, username `resend`, password the API
   key, sender email something like hello@yourdomain, sender name Halo+. Then steps 5 to 7 above.

## Accounts made with the email link

They keep working. Those accounts have no password, so:
- a Google address: Continue with Google signs straight into the same account (same email, same data);
- anyone: Forgot password sets a password (once the sender above is on); until then, George can send them a reset
  from the Supabase dashboard (Authentication, Users, the user, Send password recovery), which also needs the sender.
Trying a password on one of these accounts says exactly that instead of a bare "wrong password".
