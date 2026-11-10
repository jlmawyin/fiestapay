# October 28 deployment evidence

Status: **deployed and infrastructure checks accepted**. This is not acceptance of the new14-point browser/payment/assistant campaign.

- Source: `6b33b4fe3664fa5f00321933999691edd2b52456`, [PR6](https://github.com/jlmawyin/fiestapay/pull/6), [CI40682712044](https://github.com/jlmawyin/fiestapay/actions/runs/40682712044) successful.
- Active image: `sha256:75d16a8f783956bfd3c3cf17d803e9a68774573cc861656e88320c02d3305705`.
- Previous release: `9a40f2657377118294e7ee5f5fbb1aca56b566e1`; its image and private backups are retained.
- Public HTTPS and active assets: accepted at [FiestaPay](https://fiestapay.somospanas.com/).

## Independent review and transfer

AGY's final source review approved416 tests plus11 adversarial cases, lint, types and builds. The final independent operations review approved33 constructor tests and13 adversarial cases. Source, scripts and transfer fingerprints were checked by Codex before execution.

The host uses deployed files without a Git checkout. The builder therefore consumes a trusted Git archive transferred by the operator, checks its byte hash and full commit in the global PAX header, and rejects unsafe archive members. The constructor's report omitted the leading digit from the archive hash in a sample command; independent review documented the typo and verified the actual64-character hash. Execution used the independently measured hash.

## Backup, restoration and migration

The first preflight stopped before creating a backup because the existing backup script lacked execute permission. Codex verified its unchanged content and enabled owner execution; no helper or application code was changed for that permission correction.

The second preflight created a private backup and restored it into a newly owned scratch database. Migrations0009 and0010 were applied there. All19 preexisting tables retained their normalized data, with zero broken financial references and no legacy funding deadlines armed. Expected new metadata remained NULL, old voice leases received the guest audience, and organizer history started empty. The scratch database was removed after verification; production was not migrated by this step.

Activation took a fresh backup and recreated only the FiestaPay API using both Compose files. Its postchecks accepted the exact image, health, schema9–10 and all preexisting financial invariants. Existing ledger rows and order identities, immutable fields and known provider references were preserved; no ledger rows, orders or events were added during that activation comparison. Other containers retained their identities and start times. No database rollback occurred.

A preactivation dump was copied outside the VPS with a matching byte hash and restrictive Windows ACL. It is excluded from Git and is not attached as a public artifact. A historical backup must not be restored over newer payments; use an isolated restoration and reconcile later activity first.

## Secrets and boundaries

Five configured secret values were compared in VPS memory against the browser bundle and API logs: zero matches in both. Values were not printed or supplied to reviewers. Public PayPal client ID was intentionally excluded from the secret list. No retired Gemini environment variables were present. Voice was configured for120 seconds per lease and1800 daily reserved seconds; configuration alone does not prove a working conversation.

No DNS, MX, SMTP configuration or unrelated application was changed. No new SMTP message, PayPal charge, OpenAI chat turn or AssemblyAI voice session was performed by these deployment operations.

## Browser campaign remains pending

AGY's first two browser-harness deliveries were rejected for false-evidence, persistence and contract defects. Its third delivery ended with provider `INVALID_ARGUMENT400`, without a usable correction; three deliveries are exhausted. No real credentials were loaded into that harness and its synthetic results are not acceptance evidence. Claude's MCP is unavailable. A narrowly scoped exception for Codex to execute the browser tests has been requested from Jorge; it has not been assumed.

The new campaign still has zero executed payments, text turns and voice leases. Its cumulative caps remain three captures/USD125,24 text endpoint turns and eight voice leases/960 reserved seconds. The14-point report and numbered screenshot ZIP await that actual round. Spanish voice input and physical phone testing also remain unverified; an offline English SAPI voice reading Spanish text is not native Spanish or hardware acceptance.
