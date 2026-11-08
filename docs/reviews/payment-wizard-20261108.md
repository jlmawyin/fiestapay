# Step-by-step payment assistant — 8 November 2026

Request from Jorge (with annotated screenshots): the invitation's **Tu camino al pago / Your path to payment** described four steps while the forms to fill sat further down, so guests read in one place and acted in another. Each step should explain itself and be filled right there, in order, so nobody feels lost. The guest name belongs inside step 1, and the paid amount belongs in the header.

## Behaviour

- Four steps in order: **Únete con tu nombre / Join with your name**, **Confirma tu asistencia / Confirm your attendance**, **Revisa tu importe / Review your amount**, **Paga en PayPal Sandbox / Pay in PayPal Sandbox**. Only the first pending step is open, with a short explanation and its existing form inside. Later steps are locked (`aria-disabled`, form not rendered, "Opens after completing …"). Finished steps fold into a one-line summary.
- Step 1 shows "✓ Te uniste como <alias>". Step 2 saves with **Guardar y seguir / Save and continue** and can be reopened with **Cambiar / Change** (a new server quote is still required after a change). "Maybe" or "No" keep steps 3–4 closed. Step 3 holds the server quote and its confirmation. Step 4 holds the active-order check and the PayPal section; it is marked paid only after the server verifies the capture.
- The header shows "Abonado $0,00 · Falta $50,00" / "Paid $0.00 · Remaining $50.00" from server cents.
- The former **Quiero pagar / I want to pay** shortcut is removed. Each open step links to the assistant ("¿Dudas con este paso? Pregúntale al asistente"), which opens the text tab through a documented `fiestapay:open-assistant` event without sending a message or starting voice.
- The assistant program guide (text and voice, three roles, both languages) now describes the four-step assistant with the shared labels and keeps every previous safety rule.
- `JoinForm`, `QuoteReviewCard` and `PayPalSection` are unchanged; `RsvpForm` only changes its save-button label. Order creation, capture, reconciliation, PayPal return handling, the payment-demo shortcut and closed/revoked states keep their logic.

## Verification

- Builder: Muse (attempt 1/3). Independent verifier: AGY Gemini 3.8 Flash High — **approved** with no blocking or major findings ([report](payment-wizard-20261108/WIZ-agy-1.md)): `npm run check` green with **701 tests in 79 files** (main had 690/78), 15/15 file hashes, 8/8 adversarial checks.
- Local browser at 375 px by the director (local API without provider keys, so no real calls), Spanish then English:
  - step 1 opens with the alias field and later steps are locked;
  - after joining, step 1 folds to "Te uniste como Alumno1", step 2 opens and receives focus, and the header shows "Abonado $0,00";
  - after "Sí, voy" plus one companion, step 3 opens with **2 × $25,00 = $50,00**;
  - **Cambiar** reopens step 2 and locks steps 3–4;
  - the assistant link opens the chat without sending anything;
  - English shows no Spanish UI text and the page never scrolls horizontally.
- No payment, OpenAI, AssemblyAI, SMTP or WhatsApp call was made.

## Deployment

Jorge approved merging and deploying. PR 17 merged as `main` = `81f5f054671207fc4b1d453f3ee1662d37c4e373` ([main CI 42451573104](https://github.com/jlmawyin/fiestapay/actions/runs/42451573104) succeeded) and deployed on 8 November 2026 at 05:47 UTC with the same reviewed zero-SQL operator, base moved to `64465cb` (AGY approved the operator change).

- **Before activation:** fresh backup restored into a scratch database (20 tables identical, 0 migration rows added, 0 payment references broken).
- **Activation:** recreated only the FiestaPay API on image `sha256:f278295c…`. It added 0 events, orders or ledger rows and did not roll back the database. Other containers were unchanged, and the five private values were not found in the bundle or logs.
- **Offsite copy:** the activation backup `fiestapay-20261108T054754Z.dump` was copied off the VPS with a matching hash and restricted access.
- **Public check (view only, 375 px):** step 1 is open and steps 2–4 are locked. **Quiero pagar** is gone and there is no horizontal overflow.
