# Privacy

Last updated 2026-09-24. Plain words; the short version is that your data is yours, we keep only what the app needs to work, and you can take it or delete it any time.

## Who we are

School Dashboard is an independent planner made by a student for students who use Halo at Grand Canyon University. It is not affiliated with, endorsed by, or connected to Grand Canyon University. Contact: CONTACT_EMAIL_PLACEHOLDER.

## What we collect

- **Your account**: an email address (or the email from your Google account). Never a password: sign-in is by email link or Google.
- **What you sync from Halo, when you choose to**: your classes, assignments, due dates, grades, rubrics, instructor feedback, announcements, class resources and messages. The bookmark or extension reads these from Halo while you are logged in there and sends them to your account. It never sees, reads or stores your GCU password, and your Halo session is never sent anywhere but to Halo.
- **What you add**: items, notes, study hours, preferences, recordings and files you choose to upload, feedback you send.
- **How the app is used**: which onboarding steps were completed or skipped, when a sync ran and from what kind of device, and how much AI each account uses (tokens and cost). This is aggregate operational data; we do not sell it or share it with advertisers.
- **Payments**: handled by Stripe. We never see or store card numbers. We keep your Stripe customer id and your subscription status.
- **Notifications**: if you turn them on, the push subscription for that device.

## AI features

On paid plans, some features send text to Anthropic's API through our server: an announcement to be read, a syllabus, a lecture transcript, your question to the coach with a summary of your open work. Only what the feature needs is sent, and Anthropic's API does not train on it. Every call is capped and metered per account.

## Cookies and analytics

The app itself uses browser storage to work offline; no advertising cookies. The landing page may use a Meta Pixel to measure whether ads lead to sign-ups. The app can send a handful of funnel events (sign-up, Halo connected, upgrade) to that pixel; no class data, grades or content ever go to Meta.

## Where it lives

Data is stored with Supabase (Postgres, in the United States). Each account can read only its own rows; this is enforced by the database, not the app, and tested.

## Your choices

- **Export**: You → Advanced → Export everything gives you one JSON file with all of it.
- **Delete**: You → Advanced → Delete my account removes every row and the account itself, immediately and permanently.
- **Notifications, AI, sync**: each is a switch you control.

## Children

The app is for college students and is not directed at children under 13.

## Changes

If this changes in a way that matters, the app will say so on the You tab before the change takes effect.
