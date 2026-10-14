#!/usr/bin/env bash
# Proves scripts/backup.sh and scripts/restore.sh round-trip, on LOCAL Supabase only: fingerprints
# every backed-up table (row count + md5 of the rows), backs up with a throwaway key, restores into
# the same database (wipe + reload), and checks the fingerprints match. The data ends up the same,
# but run it when no tests are using the database. Usage: bash scripts/backup-roundtrip.sh
set -euo pipefail

CONTAINER=${CONTAINER:-supabase_db_roomies}
DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres # as the container sees it
export DB_URL PG_DUMP="docker exec -i $CONTAINER pg_dump" PSQL="docker exec -i $CONTAINER psql"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

FINGERPRINT="
select format(
  'select %L, count(*), md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from %s x',
  t, '|', '', t)
from (
  select format('%I.%I', schemaname, tablename) as t from pg_tables where schemaname = 'public'
  union all select 'auth.users' union all select 'auth.identities'
) tables order by t
\gexec
"
fingerprint() { printf '%s\n' "$FINGERPRINT" | $PSQL --dbname="$DB_URL" -At --no-psqlrc -v ON_ERROR_STOP=1; }

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=roomies-roundtrip \
  -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null

fingerprint >"$work/before.txt"
BACKUP_CERT="$work/cert.pem" bash scripts/backup.sh >"$work/backup.cms"
BACKUP_KEY="$work/key.pem" bash scripts/restore.sh "$work/backup.cms" --replace-all-data
fingerprint >"$work/after.txt"

if diff -q "$work/before.txt" "$work/after.txt" >/dev/null; then
  echo "Round trip OK: $(wc -l <"$work/before.txt" | tr -d ' ') tables match ($(wc -c <"$work/backup.cms" | tr -d ' ') bytes encrypted)."
else
  echo "Round trip changed the data. Tables that differ:" >&2
  diff "$work/before.txt" "$work/after.txt" | grep '^[<>]' | cut -d'|' -f1 | sort -u >&2
  exit 1
fi
