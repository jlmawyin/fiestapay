# Judge walkthrough

**FiestaPay helps an organizer create a gathering, share its invitation, track attendance and collect a fixed contribution per person through PayPal.** Open the [live application](https://fiestapay.somospanas.com/).

**All payments in this demo use PayPal Sandbox. No real money is charged or transferred. Do not use a personal PayPal account or a real card.** A sandbox capture credits the shared Business test account. **✓ Confirmar Realización** changes the application's event status; it does not release escrow or trigger a payout.

## Three-minute walkthrough

Have the privately allocated sandbox buyer ready before starting. The times below are a target for the manual route, not a claim of a completed human test; PayPal login and network latency can take longer.

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

Prepared against deployed source **60593db**. That source passed 486 database-backed tests in 52 files with 0 skipped (CI run `41868819343`), and had independent AGY source acceptance for screen, voice and chat. The 4 November live check used Playwright Edge mobile emulation at 390×844 — not a physical phone — with one existing reserved order, one USD 50 sandbox capture, two paid people and **✓ Confirmar Realización** confirmed.

The earlier 29 October browser matrix for source `8e13ae6` recorded 12/14 accepted points, with voice points 12 and 13 partial. That matrix is historical and does not describe the current source. Physical-phone Spanish voice, including a measured three-minute session, and a full unassisted human walkthrough remain pending.

Open [FiestaPay](https://fiestapay.somospanas.com/) on a phone or desktop browser. The interface is Spanish; translations appear below. **No Google account, personal email, real PayPal account or real card is required.** Use fictional names throughout.

## Before testing checkout

PayPal checkout requires an allocated **Personal sandbox buyer**. The maintainer must provide login instructions through the approved judging-access channel before submission; passwords are never included in this public repository. Without that handoff you can inspect invitations, attendance and assistant guidance, but cannot complete the payment step. A configured badge is not evidence of a payment, and no private buyer password or organizer/admin key belongs in these documents.

## Organizer: create and share

1. Select **Nueva invitación** (New invitation) and **Comida** (Meal). Set a fictional organizer name, venue and inclusions, USD 25 per person, capacity 2, and a USD 50 minimum/goal. Choose future start/end times and a funding deadline before the gathering; do not copy expired demonstration dates.
2. Review the summary and publish. Keep the **Enlace de organizador** (Organizer link) private. It is the management credential. Share only the separate **Enlace público** (Public link).
3. Open **Compartir en WhatsApp** (Share on WhatsApp). Check the venue and both times, then close the draft without sending. This manual draft does not contact anyone automatically.

House party, Trip and Event use the same fixed per-person payment flow with their own labels. Event can include agenda items; the committed Trip flow is a single payment, not deposit plus balance.

## Guest: attend, review and pay

4. Open the public link in a separate browser or private window. Enter a fictional alias and use **Unirme a comer**. After joining, select the **✓ ¡Sí, voy!** attendance option, add one companion with **+ / Añadir un acompañante**, and save with **Actualizar mi Asistencia**: two people total. Attendance and payment are separate; attending alone must not mark anyone paid.
5. Open **Chat** and ask about the venue, times, price or minimum. The assistant provides event guidance; it cannot approve PayPal, confirm the gathering or execute refunds. A form remains available if an AI provider fails. In the 4 November test, three fixed FAQs (privacy, refund timing and confirmation status) returned HTTP 200 with the typing indicator and no upstream model call; dynamic venue, time or price questions are outside that fixed-FAQ result.
6. Review the server-calculated quote: **2 × USD 25 = USD 50**. The guest confirms the displayed amount before an order is created. Never accept an amount chosen only by an assistant response.
7. Approve checkout with the allocated sandbox buyer. The accepted route completed the existing order's checkout in an external PayPal tab; after returning, use **Verificar / Continuar Captura** on that same order. The older yellow-button flow shown in historical evidence is not proof of this acceptance. Canceling or approving an order alone does not prove capture; consult the same order before retrying.
8. Wait for **Pagado** (Paid). In the organizer dashboard, check one registered guest, two paid people and USD 50 collected before fees. Paid people include companions; a guest row and a person count are different measures.

The three historical October campaign captures total USD 125 in their own event. A separate, unrelated USD 1 refund case used a different fixture; it is not linked to the USD 125 campaign or to this USD 50 capture, and none should be added together. Their references and the [payment evidence](reviews/sandbox-evidence.md) prove earlier operations, not a payment in your new session.

## Organizer: interpret the result

9. Return with your saved organizer link. Reaching the minimum enables **✓ Confirmar Realización** (Confirm the gathering). The assistant can explain this, but the organizer decides. Confirmation changes the application's event status; it does not release escrow or run a payout.
10. Inspect paid/unpaid states. Reminders open drafts for the organizer to send manually. The public link must not grant editing, payment-list access or organizer chat history.
11. To repeat, create a new invitation from **Mis invitaciones** (My invitations). Delete only an event you created if desired; do not reset shared sessions or alter historical payment evidence. Events remain available until organizer deletion or 72 hours after their end, with minimal financial records retained for reconciliation.

## Optional capabilities and present limits

- **Public voice before the event:** the informational voice launcher is available before creating or joining an event. Press **Hablar** (Speak), accept the Spanish consent shown before any token is created, and use **Detener** (Stop) to end it. The 4 November live check launched this path without minting a lease or reserving voice seconds. Guest and organizer voice remain role-scoped and require joining or organizer access. Source configuration uses provider voice Lola with an `es-ES`/`es-US` browser fallback; account entitlement and physical audio remain unverified. No physical-phone Spanish audio or measured 180-second session is claimed.
- **Voice limits:** the maximum conversation time is 180 seconds; 60 seconds of inactivity ends the session; the shared daily reservation budget is 1,800 seconds. These are configured limits, not a measured runtime or proof of provider availability.
- **Recovery email:** optional and verified separately; no email is needed for the main route. Accepted historical recovery rotated the key and invalidated the old link. No judge mailbox is required.
- **Funding failure:** a separate [USD 1 sandbox case](reviews/refund-sandbox-20261026.md) verified one automatic refund after a minimum failed. It is not part of this short route. Do not change an existing deadline or refund an evidence transaction to recreate it.

This demo uses one Business sandbox recipient for all organizers. Release `60593db` adds public voice/session and UI changes; it does not add a second merchant or change the sandbox financial engine. Capture credits the shared Business account. Independent merchant onboarding and PayPal Payouts are outside the demo. PayPal handles checkout credentials; Buyer Protection depends on eligibility and applicable terms rather than automatically covering every payment.

Submission preparation still requires the private buyer handoff, a human walkthrough, physical mobile voice results, video publication and Devpost submission. No completed human test, recording or submission is asserted here.
