# Contabo deployment and recovery

FiestaPay uses `/opt/fiestapay` and Docker Compose project `fiestapay`. Only the dedicated `fiestapay.somospanas.com` virtual host may be changed. Never replace shared proxy defaults, WordPress, Sparring or other applications.

Private files on the host (mode 0600): `.env` for `POSTGRES_PASSWORD`, `.env.production` for API credentials. Neither belongs in source archives or Git. `deploy/compose.yml` injects the production origin and private database URL. PostgreSQL has no published port; administration uses SSH.

## Release procedure

1. Record the release commit. Run CI and independent review. Build an archive excluding `.env*`, `.local`, `.git`, dependencies and generated output.
2. Back up the current FiestaPay deployment and database using `sh deploy/backup.sh`. Keep the previous image ID. Do not reset the database during a release.
3. Upload source only. Preserve **both** `deploy/compose.yml` and `deploy/compose.smtp-runtime.yml`: the runtime override keeps SMTP DNS resolution scoped to the API container. In `/opt/fiestapay`, build with `docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.smtp-runtime.yml build api`, retain the approved and previous image IDs, then activate with `docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.smtp-runtime.yml up -d --no-deps --no-build api`. This recreates only FiestaPay's API; it must not recreate the database or other applications.
4. Wait for health. Routine API releases do not require a proxy change. Only when the dedicated vhost itself must change, back up `/root/nginx-core/conf.d/fiestapay.conf`, apply only FiestaPay's configuration and run `docker exec web-proxy-core nginx -t` before reloading. Never replace global defaults.
5. Check HTTPS, `/api/health`, provider capabilities and asset references. Compare the IDs/start times of every other container before/after. Reuse previously accepted provider evidence unless a relevant change requires a new bounded test; do not repeat paid/SMTP probes as a routine health check.
6. Keep the previous image for recovery, but do not assume an older API understands the new financial schema. After migration0007, **no automatic downgrade**: pause only the FiestaPay API on a failed financial invariant, preserve the database and inspect compatibility before choosing an image. Never restore an older database over actual payment/refund history to undo a deployment.

The26October activation of `8918866` rehearsed migration0007 against a temporary restored database first, preserved23legacy events and the USD50 capture, and verified that other containers were unchanged. It also compared private environment values in memory against the built browser assets and API logs, reporting only match counts. See [release/refund evidence](reviews/refund-sandbox-20261026.md) and [current state](ESTADO.md). Those are historical results, not a claim that a later release has passed the same checks.

AssemblyAI uses a direct browser WebSocket; the reverse proxy preserves upgrade headers for application WebSocket routes. `VOICE_ENABLED`, maximum session seconds and daily reserved seconds bound credit consumption. Provider configuration does not prove provider availability.

## TLS

The dedicated certificate is managed with Certbot HTTP-01. Its webroot is `/root/nginx-core/certs/fiestapay-acme`, visible inside the shared proxy through its existing certificates mount. `renew-certificate.sh` renews only the FiestaPay certificate and validates Nginx before reload. The dedicated fiestapay-renew.timer was enabled on 14 October; it checks daily at 08:00 UTC with a randomized delay. Verify it with systemctl list-timers fiestapay-renew.timer. A checked-in script alone is not proof of an active timer or successful future renewal.

## Backup/restore drill

`backup.sh` creates a private custom-format dump under `/opt/fiestapay/backups`. Run `restore-drill.sh /opt/fiestapay/backups/fiestapay-TIMESTAMP.dump` to restore into a newly created temporary database, query event/ledger counts and remove that scratch database. It never overwrites production. Retain a separate copy outside the VPS for disaster recovery before final acceptance; a backup on the same disk is not that protection.

On 27October, a private copy was downloaded to Jorge's machine, verified by SHA256 and fully restored into a new temporary PostgreSQL16 database. It preserved 24events, 20guests, schema0008 and both accepted financial references. The temporary database was removed. This does not simulate recovery of the entire VPS or its external services. See [off-VPS restore evidence](reviews/off-vps-backup-20261027.md).

## Remaining operational acceptance

Record actual deploy, rollback, backup and restore evidence in [ESTADO.md](ESTADO.md). Monitor credentials, voice quota, API failures, certificate expiry and hosting through 15 December. Buyer sandbox accounts, human rehearsal and freeze/submission tasks remain explicit milestones in the daily plan.
