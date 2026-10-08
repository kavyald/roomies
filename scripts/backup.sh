#!/usr/bin/env bash
# Writes an encrypted backup of a Roomies database to stdout (DEPLOYMENT D8): the data of every
# table in `public`, plus `auth.users` and `auth.identities` (the accounts people sign in with).
# The schema isn't included: it's the migrations, and a restore goes into a migrated database.
#
#   DB_URL=postgresql://... BACKUP_CERT=backup-cert.pem bash scripts/backup.sh > roomies.dump.cms
#
# The dump is gzipped and encrypted with OpenSSL CMS (AES-256-GCM, for the certificate's RSA key)
# inside one pipe, so a plain copy never touches the disk. BACKUP_CERT is the public half; the
# private key stays with the owner (scripts/restore.sh). Make a pair once with:
#   openssl req -x509 -newkey rsa:4096 -nodes -days 3650 -subj /CN=roomies-backup \
#     -keyout backup-key.pem -out backup-cert.pem
# PG_DUMP overrides the pg_dump command (it must match the server's major version, 17).
# Nothing here prints the connection string or any data.
set -euo pipefail

: "${DB_URL:?Set DB_URL to the database connection string}"
: "${BACKUP_CERT:?Set BACKUP_CERT to the backup certificate (the public half)}"
PG_DUMP=${PG_DUMP:-pg_dump}

if [ -t 1 ]; then
  echo "Redirect the output to a file." >&2
  exit 1
fi

$PG_DUMP --dbname="$DB_URL" --data-only --no-owner --no-privileges \
  --table='public.*' --table=auth.users --table=auth.identities |
  gzip -9 |
  openssl cms -encrypt -binary -aes-256-gcm -outform DER "$BACKUP_CERT"
