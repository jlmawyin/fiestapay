# Loading interface deployment — 26 October 2026

Approved source: `e03e85bca3fa2e299f4df6f20dcf609c20f9d057`, [draft PR #3](https://github.com/jlmawyin/fiestapay/pull/3), successful CI run `40344856673`. The independent local review remains [loading-ux-20261026.md](loading-ux-20261026.md); no unchanged component/browser tests were repeated during activation.

Codex checked the previous release marker, exact built image ID and four changed source hashes before activating the already built image. API and shared backend sources in this release match the previous production release. Local unapproved funding changes were excluded from the archive and image.

Only the FiestaPay API service was recreated, using both base Compose and the existing SMTP runtime override, with no build and no dependencies restarted. The container became healthy; the public HTTPS health endpoint returned `ok: true`, and the public page contained FiestaPay. A before/after inventory confirmed identical IDs and start times for every other container. The release marker was updated only after successful checks.

The previous image and approved image have retained tags. No database schema changes, payments, outgoing emails or model calls formed part of this deployment. This confirms release activation and service health; it adds no evidence of human mobile audio or real funding refunds.

Operational evidence is stored privately in `.local/production-loading-build.log` and `.local/production-loading-activation.log`, with container inventories on the VPS under `releases/activation-e03-{before,after}.txt`.
