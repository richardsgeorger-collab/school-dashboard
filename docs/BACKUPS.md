# Backups

- **Nightly database backup:** GitHub Actions in the private repo `richardsgeorger-collab/haloplus-backups` runs
  `pg_dump` of the whole Supabase database every night at 3:17 AM Phoenix as the read-only role `backup_reader`. It
  restores the dump into a throwaway Postgres 17, compares every table's row count with the live database, then encrypts
  the dump with age and keeps it as an artifact for 14 days. A failed run emails the repo owner.
- **The key:** only the private age key (`~/haloplus-backup-key.txt` on George's Mac, plus his password manager) can read
  a backup. GitHub holds the public key only.
- **Restore:** steps are in that repo's README. Never restore a whole dump over the live database. Restore into a
  scratch database and copy back only the rows you need.
- **Scripts:** any script that deletes or overwrites rows goes through `scripts/lib/guard.mjs`. On a real account it
  saves a backup of exactly those rows to `~/haloplus-script-backups/`, prints them, and refuses without
  `--real-accounts`. Throwaway `.invalid` accounts are exempt.
- **Revoking the backup's access:** `drop role backup_reader;` in the Supabase SQL editor.

Nothing here holds a secret or student data, and neither does any commit.
