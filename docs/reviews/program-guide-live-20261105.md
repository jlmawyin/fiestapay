# Deployed assistant navigation acceptance — 5 November 2026

Application source: `8259b4c1376d7466cd96b1f52a52fe13d0ab5d77`, merged in PR13. Main CI [42108356081](https://github.com/jlmawyin/fiestapay/actions/runs/42108356081) succeeded. Live: https://fiestapay.somospanas.com/ . The application image starts `58daebd8`.

The shared guide is connected to public, guest and organizer prompts in text and voice. It explains visible controls without claiming to see clicks, private event facts or financial execution.

| # | Check | Evidence and limit |
|---|---|---|
| 1 | Source and regression | 572 tests / 61 files, zero skips; lint, types and build; independent Flash source A2/B1 approval. |
| 2 | Six prompt contexts | Shared guide composition, actual UI label parity and privacy/classifier regressions tested locally; guest/organizer runtime not called again. |
| 3 | Public AG Grid guidance | Real UI question / HTTP200: “Ver panel de ejemplo (AG Grid)”, read-only, ten fictional rows, no key. |
| 4 | Sandbox buyer guidance | Real UI question / HTTP200: “Copiar contraseña”, manual paste in PayPal Sandbox. No account endpoint was queried and no credential was supplied to a model. |
| 5 | Payment return | Real UI question / HTTP200: “Verificar Estado” or “Verificar / Continuar Captura”, same order, no duplicate order and no success without server capture. No order or payment created. |
| 6 | Organizer confirmation | Real public UI question / HTTP200: “✓ Confirmar Realización”; manual and does not move/retain/release money. Public assistant explicitly cannot verify button availability. |
| 7 | Real voice provider | One public session accepted the exact expanded system configuration. One text-injected question returned “Probar pago con PayPal” and 366720 bytes of complete audio with matching transcript/reply completion. This is not microphone or ASR testing. |
| 8 | Voice cleanup | Provider emitted session.ended; the same application lease was released with HTTP200. First direct QA cleanup lacked Origin and returned403; corrected same-lease cleanup, no second token. |
| 9 | Visible orb | Text and voice options verified on mobile emulation (390×844), consent before voice start. Nine inspected PNGs; no physical-device claim. |
| 10 | Answer rendering | Four exact previously captured live answers replayed through the UI with provider requests intercepted: readable bold labels, no literal Markdown stars. These are explicitly simulated UI replays, not additional model calls. |
| 11 | Deployment preservation | Zero SQL migrations. Activation preserved payments, orders, events and other containers; bundle/log scan compared five private secrets, zero matches. Full runtime environment and private environment-file hashes unchanged; mode0600. |
| 12 | Restore and backup | Isolated restore checked twenty tables and schema1–12, scratch removed. Existing activation backup copied offsite, bytes/hash and Jorge/SYSTEM ACL verified; no rollback. |
| 13 | Budget and execution | Closed round: four text calls, one voice reservation (180 seconds reserved; probe bounded below60 seconds), zero orders/captures/fixtures/emails/WhatsApp sends. Constructor/recovery/review counters retained. |
| 14 | Remaining human acceptance | Physical Spanish microphone/ASR and three-minute uninterrupted phone conversation, buyer login, video and Devpost are not established by this round. |

## Execution limitations

The initial source CI passed all assertions but caught an AG Grid async callback after jsdom teardown (`window is not defined`). One unchanged rerun and the exact main CI both passed; no tests/configuration were weakened. An extra read-only preview locator collection timed out after runtime checks; this is not proof of a product defect or a new preview acceptance result. Owned browser processes were absent after kernel cleanup.

The first four PNGs show the chat's initial scroll position. PNGs06–09 show actual answer text using clearly-labelled response replay; the JSON records retain the real four HTTP responses. Voice PCM/WAV is actual service output from text input, not prerecorded narration or a physical-phone demonstration. The successful voice cleanup required correcting the QA Origin header and a private exact-session read-only lookup; no product change or direct database update was used.

Tier2 graph discovery was supplemented by exact source reads where coverage reported metadata changes. No exhaustive code or security audit is claimed. Independent operator reviews and 44 unit tests, plus nine fake-WebSocket tests, precede the actual deployment and one real provider probe.
