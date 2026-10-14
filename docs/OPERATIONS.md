# Contabo deployment and recovery

FiestaPay uses `/opt/fiestapay` and Docker Compose project `fiestapay`. Only the dedicated `fiestapay.somospanas.com` virtual host may be changed. Never replace shared proxy defaults, WordPress, Sparring or other applications.

Private files on the host (mode 0600): `.env` for `POSTGRES_PASSWORD`, `.env.production` for API credentials. Neither belongs in source archives or Git. `deploy/compose.yml` injects the production origin and private database URL. PostgreSQL has no published port; administration uses SSH.

## Release procedure

1. Record the release commit. Run CI and independent review. Build an archive excluding `.env*`, `.local`, `.git`, dependencies and generated output.
2. Back up the current FiestaPay deployment and database using `sh deploy/backup.sh`. Keep the previous image ID. Do not reset the database during a release.
3. Upload source only, then in `/opt/fiestapay` run `docker compose --env-file .env -f deploy/compose.yml build api` and `docker compose --env-file .env -f deploy/compose.yml up -d api`.
4. Wait for health. Apply only `deploy/nginx.conf` to `/root/nginx-core/conf.d/fiestapay.conf`. Back up that file first. Run `docker exec web-proxy-core nginx -t` before reloading.
5. Check HTTPS, `/api/health`, provider capabilities and a new isolated demo. Verify `somospanas.com`, existing proxy applications and container health before/after.
6. Revert only FiestaPay's image/config if needed. Additive migrations should remain; never roll back by deleting payment history.

AssemblyAI uses a direct browser WebSocket; the reverse proxy preserves upgrade headers for application WebSocket routes. `VOICE_ENABLED`, maximum session seconds and daily reserved seconds bound credit consumption. Provider configuration does not prove provider availability.

## TLS

The dedicated certificate is managed with Certbot HTTP-01. Its webroot is `/root/nginx-core/certs/fiestapay-acme`, visible inside the shared proxy through its existing certificates mount. `renew-certificate.sh` renews only the FiestaPay certificate and validates Nginx before reload. Check renewal scheduling on the host; a checked-in script alone is not proof of an active timer.

## Backup/restore drill

`backup.sh` creates a private custom-format dump under `/opt/fiestapay/backups`. Run `restore-drill.sh /opt/fiestapay/backups/fiestapay-TIMESTAMP.dump` to restore into a newly created temporary database, query event/ledger counts and remove that scratch database. It never overwrites production. Retain a separate copy outside the VPS for disaster recovery before final acceptance; a backup on the same disk is not that protection.

## Remaining operational acceptance

Record actual deploy, rollback, backup and restore evidence in [ESTADO.md](ESTADO.md). Monitor credentials, voice quota, API failures, certificate expiry and hosting through 15 December. Buyer sandbox accounts, human rehearsal and freeze/submission tasks remain explicit milestones in the daily plan.
