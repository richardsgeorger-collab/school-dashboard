#!/bin/zsh
# The site for the e2e tests that serve Halo+ locally (LOCAL_SITE=dist-site), built against the real accounts server
# with its public settings from KEYS_ENV (Loop 308: a build without them is local-only, nobody can sign in, and the
# auto-sync test failed as if auto-sync were broken). Only the public URL and anon key are read.
#   KEYS_ENV=... scripts/build-local-site.sh
set -e
: "${KEYS_ENV:?KEYS_ENV is needed}"
U=$(grep '^VITE_SUPABASE_URL=' "$KEYS_ENV" | cut -d= -f2- | tr -d '"')
A=$(grep '^VITE_SUPABASE_ANON_KEY=' "$KEYS_ENV" | cut -d= -f2- | tr -d '"')
[ -n "$U" ] && [ -n "$A" ] || { echo "KEYS_ENV has no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY"; exit 2; }
VITE_SUPABASE_URL=$U VITE_SUPABASE_ANON_KEY=$A SITE_BASE=/ npx vite build --outDir dist-site
