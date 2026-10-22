#!/bin/zsh
# Read-only SQL on the live database through the Supabase Management API (George, 2026-10-13: "prove it from real data,
# read only"). Uses the Supabase CLI's own login from the macOS keychain; nothing secret is stored here.
# Only a select or with statement runs, and the API is asked for a read-only transaction too.
#   scripts/sql-ro.sh "select count(*) from public.profiles"
T="$(security find-generic-password -s 'Supabase CLI' -w)"; T="${T#go-keyring-base64:}"
q="$1"
python3 -c 'import sys; q=sys.argv[1].strip().lower(); sys.exit(0 if q.startswith(("select","with")) else 2)' "$q" || { echo "read-only: select/with only"; exit 2; }
python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1], "read_only": True}))' "$q" | curl -s -X POST -H "Authorization: Bearer $T" -H "content-type: application/json" --data @- "https://api.supabase.com/v1/projects/kiacmspgvntzwngijibr/database/query"
