#!/usr/bin/env bash
# Restores a backup from scripts/backup.sh into a migrated Roomies database, REPLACING its data:
# every table in `public` is emptied and every account deleted, then the backup is loaded, all in
# one transaction (any error leaves the database as it was).
#
#   DB_URL=postgresql://... BACKUP_KEY=backup-key.pem \
#     bash scripts/restore.sh roomies.dump.cms --replace-all-data
#
# The target must be at the same migration as the source (`supabase db push` first). Restoring
# into prod (ref iqkriekufaebhvptjzhv) also needs RESTORE_INTO_PROD=yes. PSQL overrides the psql
# command. Nothing here prints the connection string or any data.
set -euo pipefail

FILE=${1:?Usage: bash scripts/restore.sh <backup.cms> --replace-all-data}
: "${DB_URL:?Set DB_URL to the target connection string}"
: "${BACKUP_KEY:?Set BACKUP_KEY to the backup private key}"
PSQL=${PSQL:-psql}

if [ "${2:-}" != "--replace-all-data" ]; then
  echo "This replaces all data in the target. Add --replace-all-data to go ahead." >&2
  exit 1
fi
case "$DB_URL" in
  *iqkriekufaebhvptjzhv*)
    if [ "${RESTORE_INTO_PROD:-}" != "yes" ]; then
      echo "The target is prod. Set RESTORE_INTO_PROD=yes if that's what you mean." >&2
      exit 1
    fi
    ;;
esac

# Empty the target first, while foreign keys still cascade (accounts take their identities and
# sessions with them). Then load the backup with triggers and FK checks off, as pg_dump expects
# for a data-only dump.
WIPE="
do \$\$ begin
  execute (select 'truncate ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' cascade'
           from pg_tables where schemaname = 'public');
end \$\$;
delete from auth.users;
set session_replication_role = replica;
"

# COMMIT is sent only if the whole backup decrypted and unzipped; otherwise psql reaches the end
# with the transaction open and rolls it back, so a bad file never leaves the target wiped.
{
  printf 'begin;\n%s\n' "$WIPE"
  if openssl cms -decrypt -binary -inform DER -in "$FILE" -inkey "$BACKUP_KEY" | gunzip; then
    printf '\ncommit;\n'
  else
    echo "Couldn't read the backup; nothing was changed." >&2
    exit 1
  fi
} | $PSQL --dbname="$DB_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 >/dev/null

echo "Restored."
