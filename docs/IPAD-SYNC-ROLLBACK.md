# iPad and phone sync: how it is switched, and how to roll it back

## What it is
A second way for the 😇 Sync Halo bookmark to deliver: on a touch device (iPad, iPhone, Android), the bookmark uploads
the Halo export to the student's own pending slot through the `sync-drop` function, then opens Halo+, which takes it and
shows the usual review. Desktop is unchanged: it still hands the export to the open Halo+ tab first, and only uses the
server when no Halo+ tab answers. The copy-paste box still appears whenever anything fails.

## The switches (You tab, the admin card "iPad and phone sync", no deploy needed)
- **Per account**: off by default. Turn it on for one email to test.
- **Everyone**: off. Turns it on for all accounts.
- **Kill switch**: off. On means the server path refuses everything at once; bookmarks fall back to the Copy box.

A bookmark only carries the sync key when its account has the path on, so bookmarks saved before this, or with it off,
are exactly the old bookmark.

## Roll back, fastest first
1. You tab, iPad and phone sync card, Kill switch: On. Takes effect on the next tap, for everyone. Nothing else changes.
2. Same card, Everyone: Off, and per-account toggles off. Newly copied bookmarks stop carrying a key.
3. Code: `git revert <the loop 128 commit>` and push; the site redeploys in a few minutes. The database tables and the
   `sync-drop` function can stay (they do nothing with the switches off). To remove the function too:
   `npx supabase functions delete sync-drop --project-ref kiacmspgvntzwngijibr`.
