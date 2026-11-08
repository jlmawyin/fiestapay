# Bilingual release live — deployment and bounded live checks, 8 November 2026

Jorge approved merging PR 15 (relayed from his side session) and then, in this session, the deployment ("Yes, deploy") and a bounded live-test budget: up to 6 OpenAI text turns (≤ 30 model calls), up to 2 AssemblyAI voice sessions of 120 s (Spanish and English), up to 1 PayPal Sandbox capture of USD 50, and zero SMTP or WhatsApp sends.

## Deployment

- **Release:** `main` = `64465cb4ffb7e7e6947b104668d2f5d3ffd359b2` (merge of PR 15). [Main CI 42443967019](https://github.com/jlmawyin/fiestapay/actions/runs/42443967019) succeeded. Previous production: `8259b4c` / image `sha256:58daebd8…`. New image: `sha256:4d312e0d5e9f531e2c45e70406a297ea7c38863a201723c16a3bfec4f528e5ed`.
- **Operator:** the zero-SQL transition kit reviewed and used on 5 November (`docs/reviews/program-guide-live-20261105.md`), with only its accepted base moved from F89 to `8259b4c` (and F89 now rejected). Its 44 offline unit tests passed before freezing (one test intentionally requires an unfrozen spec, so it fails after freezing). AGY Gemini 3.8 Flash reviewed the operator change and the frozen package read-only: approved with observations. The archive is `git archive` of the exact commit (SHA-256 `dc339137…77e9`).
- **Stages** (each a separate, sanitized result):
  - `upload` and `validate`: the base matched production and there were no new migrations.
  - `build`: candidate image recorded and not activated; Compose files and old SQL unchanged.
  - `preflight`: fresh backup (mode 0600), restored into a scratch database. All 20 tables and the migration rows compared identical, 0 migration rows were added, 0 payment references broke, and the scratch database was dropped. Production was not migrated.
  - `activate`: only the FiestaPay API was recreated. Health and financial checks passed; 0 events, orders or ledger rows were added and the database was not rolled back. The other containers were unchanged; the five private values were compared against the browser bundle and API logs with 0 matches; `RELEASE_COMMIT` was recorded.
- **Independent checks by the director after activation:** `RELEASE_COMMIT` = `64465cb`, API healthy on the new image, database container not restarted (still started 19 Oct). Every other container on the host kept the same ID and start time. Public `/api/health` and `/api/capabilities` were correct (PayPal, chat, voice and email configured; sandbox). Neighbouring sites answered as before (somospanas.com → www 200, sparring 200, ac.visitaremota.com its own 401). No proxy or DNS change was made.
- **Backups:** the activation backup `fiestapay-20261108T042143Z.dump` (191 121 bytes, SHA-256 `c1bc5a41…1c7a`) was copied off the VPS to Jorge's machine. Its hash matched and access is restricted to Jorge and SYSTEM. Before switching the primary checkout to `main`, its uncommitted voice work was backed up to branch `respaldo-voz-wip-20261108` and to a folder outside the repository.
- **Live site in a browser at 375 px:** `/demo?lang=en` shows the Judges demo with the 10-row sample and the payment button on screen, with no horizontal overflow; the Spanish home page shows **Crear mi invitación** and **Demo para jueces**.

## Bounded live checks (real providers)

| Check | Result |
| --- | --- |
| T1 public landing, English | HTTP 200, English, quotes "Create my invitation" and `/create`, says payments are Sandbox tests. |
| T2 public Judges demo, English | HTTP 200, English, quotes "Judges demo", "View sample dashboard (AG Grid)" (10 fictional read-only rows) and "Try a PayPal payment" ($25 per person, does not pay by itself). |
| T3 public landing, Spanish | HTTP 200, Spanish, quotes «Crear mi invitación» and «Demo para jueces», no real money. |
| Payment demo, English | Server created "Demo lunch" with `isDemo: true` and an organizer key; joined as *Demo Guest*, RSVP yes with one companion. |
| T4 guest, English | HTTP 200: start time in Guayaquil time and outstanding balance **$50.00** from the server. |
| T5 organizer, English | HTTP 200: 2 people (one guest plus one companion), nobody paid, $50 minimum not reached. |
| Voice, English | Public token with `language_codes ['en']`, voice `jane`, English greeting; AssemblyAI accepted the exact configuration, a text-injected question got an English spoken answer (5.7 s of audio), session ended, lease released (HTTP 200). |
| Voice, Spanish | `['es']`, voice `lola`; exact configuration accepted, Spanish answer (11 s of audio) naming «Ver panel de ejemplo (AG Grid)» inside the Demo para jueces, session ended, lease released. |

No reply claimed to have executed a payment, refund or confirmation. Observation: the English voice answer said the sample dashboard is "on the home page" instead of inside the Judges demo (the Spanish answer was precise). That is a small inaccuracy of the voice model's wording, not a configuration fault.

**Consumption, read-only database counts before/after:** AI requests +5, voice leases +2 (0 left open), orders +0, ledger +0, events +1 (the fictional payment demo, marked as demo). Model calls are at most 13 (three public single calls plus up to five per guest/organizer turn), within the approved 30. **Not used:** the sandbox capture (0 of 1). Completing it requires signing in with the shared PayPal Sandbox buyer, which the assistant does not do on a production host; Jorge will run it himself. 0 SMTP and 0 WhatsApp.

## Still pending

The sandbox payment by Jorge in English or Spanish; voice with a real microphone on a physical phone; video and Devpost (deadline 12 November, 15:00 ECT).
