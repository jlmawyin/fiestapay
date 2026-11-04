#!/bin/sh
set -eu
dump=${1:?Pass a FiestaPay backup dump path}
case "$dump" in /opt/fiestapay/backups/fiestapay-*.dump) ;; *) echo 'Unexpected backup path' >&2; exit 1;; esac
test -s "$dump"
scratch="fiestapay_restore_$(date -u +%Y%m%d%H%M%S)"
cleanup() { docker exec fiestapay-db-1 dropdb -U fiestapay --if-exists "$scratch"; }
trap cleanup EXIT INT TERM
docker exec fiestapay-db-1 createdb -U fiestapay "$scratch"
docker exec -i fiestapay-db-1 pg_restore -U fiestapay -d "$scratch" --exit-on-error < "$dump"
docker exec fiestapay-db-1 psql -U fiestapay -d "$scratch" -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS restored_events FROM events; SELECT count(*) AS restored_ledger_entries FROM payment_ledger;'
echo 'Restore verified in a temporary database; production was not modified.'
