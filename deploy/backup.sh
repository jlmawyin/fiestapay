#!/bin/sh
set -eu
umask 077
backup_dir=/opt/fiestapay/backups
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_dir/fiestapay-$stamp.dump"
docker exec fiestapay-db-1 pg_dump -U fiestapay -d fiestapay -Fc > "$target"
test -s "$target"
printf 'Backup created: %s\n' "$target"
