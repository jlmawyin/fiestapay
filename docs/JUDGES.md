# Judge walkthrough

**FiestaPay helps an organizer create a gathering, share its invitation, track attendance and collect a fixed contribution per person through PayPal.** Open the [live application](https://fiestapay.somospanas.com/).

**All payments in this demo use PayPal Sandbox. No real money is charged or transferred. Do not use a personal PayPal account or a real card.** A sandbox capture credits the shared Business test account. **✓ Confirmar Realización** changes the application's event status; it does not release escrow or trigger a payout.

## Three-minute walkthrough

### See the product immediately

1. In the **Explora la demo** card, select **Ver panel de ejemplo (AG Grid)**, or open the [read-only example panel](https://fiestapay.somospanas.com/demo). It uses the real AG Grid component: search for a guest, sort a column and inspect attendance/payment states. All ten rows and amounts are clearly labelled fictional; they are not evidence of captured payments. No organizer key or account is needed for this example.
2. Select **Crear mi demo privada** to create your own sandbox gathering and open its authorized organizer panel. Save its organizer link, then open the separate public invitation. Existing personal invitations are in the collapsed history; no tester records have been deleted to tidy the home page.
3. For the shortest payment route, choose **Probar pago con PayPal**. This explicit action prepares your own fictional meal and a guest with one companion. On the invitation, use **Ver cuenta de prueba**, then **Copiar correo** and **Copiar contraseña** for the dedicated shared **Personal sandbox** buyer. Review the server quote **2 × USD 25 = USD 50**, confirm it and approve checkout personally on PayPal Sandbox. The app never logs in or approves automatically.
4. The separate **Prueba en vivo** card creates your own gathering with your chosen details. The application works normally; payments still use **Sandbox**, without real money. **Quiero pagar** on any invitation takes you to the first missing step and does not create or charge an order.

The single **FiestaPay orb** opens **Escribir** (text) or **Hablar** (voice). Public help needs no event. Voice requires consent and an explicit start; switching to text or closing the orb stops voice. The public text conversation belongs only to the current open window. Messages are processed by OpenAI, and the server keeps consumption metadata without storing public message contents. Event-specific and organizer conversations retain their separate permissions. Organizer-link recovery is unchanged at [Recover access](https://fiestapay.somospanas.com/recover).

### Full sandbox payment route

Use the dedicated shared sandbox buyer shown by **Ver cuenta de prueba** in the payment demo. The times below are a target for the manual route, not a claim of a completed human test; PayPal login and network latency can take longer.

| Time | Action | What to check |
| --- | --- | --- |
| 0:00–0:50 | Open the live app, choose **Nueva invitación** and **Comida**, enter fictional organizer/venue details, USD 25 per person, capacity 2, minimum and goal USD 50, and future start/end/funding-deadline times. Review and publish. | Keep the organizer link private and copy the separate public link. |
| 0:50–1:10 | Open the public link in a private window or another browser. Enter a fictional name and use **Unirme a comer**; after joining select **✓ ¡Sí, voy!**, add one companion with **+ / Añadir un acompañante**, and save with **Actualizar mi Asistencia**. | There are two people; attendance alone does not show payment. |
| 1:10–2:15 | Review **2 × USD 25 = USD 50**, confirm the quote and approve checkout with only the allocated Personal sandbox buyer. Return to FiestaPay and use **Verificar / Continuar Captura** for the same order if needed. | Wait for the server to verify capture and show **Pagado**. |
| 2:15–2:45 | Return through the saved organizer link and inspect the panel. | One guest group, two paid people and USD 50 collected before fees; reaching the minimum does not itself confirm the gathering. |
| 2:45–3:00 | Use **✓ Confirmar Realización** if enabled, then inspect the separate attendance/payment/event states. | Confirmation changes event status. No escrow release or payout is claimed. |

Optional assistant and physical mobile voice checks are described below. A separate three-minute voice acceptance session is not part of the timing of this manual checkout walkthrough.

The 4 November accepted payment reused the existing order's checkout in an external PayPal tab and then used **Verificar / Continuar Captura**. An older yellow-button checkout flow appears in historical October evidence; it is not the current acceptance record and does not by itself prove capture.

## Current evidence and historical matrix

The current two-card and unified-orb application is deployed from **f89aee1**: **546 tests in 60 files, zero skipped**, lint, TypeScript and build passed in [main CI](https://github.com/jlmawyin/fiestapay/actions/runs/42040307112), with independent source and operational reviews. Published desktop and mobile-emulation checks verified both cards, public AG Grid, the payment-demo preparation through **2 × USD 25 = USD 50**, the opt-in sandbox account response and both copy controls, and one text/voice orb without creating a voice lease. This round created no payment order or capture, made no runtime model request and did not establish a successful login with the new shared buyer. That buyer's actual PayPal login still needs a manual check. See the [current release evidence](reviews/demo-orb-20261105.md).

The preceding judge-discovery release **eac09c0** separately verified public AG Grid filtering/sorting, a private organizer demo, unauthorized dashboard 403 and one real public text reply. Its [release evidence](reviews/judge-discovery-20261104.md) remains historical.

The earlier accepted payment used source **60593db** (486 tests, CI `41868819343`), with one existing reserved order, one USD 50 sandbox capture, two paid people and **✓ Confirmar Realización** confirmed. Both browser rounds used Playwright Edge mobile emulation at 390×844 — not a physical phone. The new release preserves that financial engine and its historical records.

The earlier 29 October browser matrix for source `8e13ae6` recorded 12/14 accepted points, with voice points 12 and 13 partial. That matrix is historical and does not describe the current source. Physical-phone Spanish voice, including a measured three-minute session, and a full unassisted human walkthrough remain pending.

Open [FiestaPay](https://fiestapay.somospanas.com/) on a phone or desktop browser. The interface is Spanish; translations appear below. **No Google account, personal email, real PayPal account or real card is required.** Use fictional names throughout.

## Before testing checkout

PayPal checkout uses a **Personal sandbox buyer**, deliberately shared for this demo. Choose **Probar pago con PayPal**, then **Ver cuenta de prueba** and the copy buttons. The dedicated fictitious account is public by design; it is separate from the Business receiver and API credentials. Its actual values are supplied by the server and never included in this repository or browser bundle. If the account is unavailable, contact the maintainer and continue exploring the panel; do not substitute a real account or card. A configured badge is not payment evidence. Keep organizer links private.

## Organizer: create and share

1. Select **Nueva invitación** (New invitation) and **Comida** (Meal). Set a fictional organizer name, venue and inclusions, USD 25 per person, capacity 2, and a USD 50 minimum/goal. Choose future start/end times and a funding deadline before the gathering; do not copy expired demonstration dates.
2. Review the summary and publish. Keep the **Enlace de organizador** (Organizer link) private. It is the management credential. Share only the separate **Enlace público** (Public link).
3. Open **Compartir en WhatsApp** (Share on WhatsApp). Check the venue and both times, then close the draft without sending. This manual draft does not contact anyone automatically.

House party, Trip and Event use the same fixed per-person payment flow with their own labels. Event can include agenda items; the committed Trip flow is a single payment, not deposit plus balance.

## Guest: attend, review and pay

4. Open the public link in a separate browser or private window. Enter a fictional alias and use **Unirme a comer**. After joining, select the **✓ ¡Sí, voy!** attendance option, add one companion with **+ / Añadir un acompañante**, and save with **Actualizar mi Asistencia**: two people total. Attendance and payment are separate; attending alone must not mark anyone paid.
5. Open the **FiestaPay orb**, choose **Escribir** and ask about the venue, times, price or minimum. The assistant provides event guidance; it cannot approve PayPal, confirm the gathering or execute refunds. A form remains available if an AI provider fails. In the 4 November test, three fixed FAQs (privacy, refund timing and confirmation status) returned HTTP 200 with the typing indicator and no upstream model call; dynamic venue, time or price questions are outside that fixed-FAQ result.
6. Review the server-calculated quote: **2 × USD 25 = USD 50**. The guest confirms the displayed amount before an order is created. Never accept an amount chosen only by an assistant response.
7. Approve checkout with the allocated sandbox buyer. The accepted route completed the existing order's checkout in an external PayPal tab; after returning, use **Verificar / Continuar Captura** on that same order. The older yellow-button flow shown in historical evidence is not proof of this acceptance. Canceling or approving an order alone does not prove capture; consult the same order before retrying.
8. Wait for **Pagado** (Paid). In the organizer dashboard, check one registered guest, two paid people and USD 50 collected before fees. Paid people include companions; a guest row and a person count are different measures.

The three historical October campaign captures total USD 125 in their own event. A separate, unrelated USD 1 refund case used a different fixture; it is not linked to the USD 125 campaign or to this USD 50 capture, and none should be added together. Their references and the [payment evidence](reviews/sandbox-evidence.md) prove earlier operations, not a payment in your new session.

## Organizer: interpret the result

9. Return with your saved organizer link. Reaching the minimum enables **✓ Confirmar Realización** (Confirm the gathering). The assistant can explain this, but the organizer decides. Confirmation changes the application's event status; it does not release escrow or run a payout.
10. Inspect paid/unpaid states. Reminders open drafts for the organizer to send manually. The public link must not grant editing, payment-list access or organizer chat history.
11. To repeat, create a new invitation from **Mis invitaciones** (My invitations). Delete only an event you created if desired; do not reset shared sessions or alter historical payment evidence. Events remain available until organizer deletion or 72 hours after their end, with minimal financial records retained for reconciliation.

## Optional capabilities and present limits

- **Public voice before the event:** the informational voice launcher is available before creating or joining an event. Open the **FiestaPay orb**, choose **Hablar** (Speak), accept the Spanish consent and explicitly start the conversation before any token is created. Use **Detener** (Stop), switch to text or close the orb to end it. The 4 November live check launched this path without minting a lease or reserving voice seconds. Guest and organizer voice remain role-scoped and require joining or organizer access. Source configuration uses provider voice Lola with an `es-ES`/`es-US` browser fallback; account entitlement and physical audio remain unverified. No physical-phone Spanish audio or measured 180-second session is claimed.
- **Voice limits:** the maximum conversation time is 180 seconds; 60 seconds of inactivity ends the session; the shared daily reservation budget is 1,800 seconds. These are configured limits, not a measured runtime or proof of provider availability.
- **Recovery email:** optional and verified separately; no email is needed for the main route. Accepted historical recovery rotated the key and invalidated the old link. No judge mailbox is required.
- **Funding failure:** a separate [USD 1 sandbox case](reviews/refund-sandbox-20261026.md) verified one automatic refund after a minimum failed. It is not part of this short route. Do not change an existing deadline or refund an evidence transaction to recreate it.

This demo uses one Business sandbox recipient for all organizers. Earlier release `60593db` added public voice/session and UI changes; the current update adds two home cards, the explicit demo-payment entry, a dedicated shared sandbox buyer and one text/voice orb, preserving the public example panel and informational text chat. Neither adds a second merchant or changes the sandbox financial engine. Capture credits the shared Business account. Independent merchant onboarding and PayPal Payouts are outside the demo. PayPal handles checkout credentials; Buyer Protection depends on eligibility and applicable terms rather than automatically covering every payment.

Submission preparation still requires a human walkthrough, physical mobile voice results, video publication and Devpost submission. No completed human test, recording or submission is asserted here.

## In-app navigation help

Open the FiestaPay orb and choose **Escribir** (text) or **Hablar** (voice). Tell it which screen you are on. For example: “Estoy en la portada, ¿qué botón abre AG Grid?” or “Quiero probar el pago de la demo, ¿qué pulso primero?”. It names actual visible buttons and keeps payment confirmation in your hands. The public text assistant does not remember previous clicks; include your current step in the question.
