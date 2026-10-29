# Judge walkthrough

Prepared against deployed source **8e13ae6** and the [29 October evidence](reviews/revalidation-20261029.md). The browser matrix has 12/14 accepted points; the two assistant points are partially verified because voice evidence remains incomplete. This guide has not yet been followed unassisted by a human judge. Sandbox-buyer allocation must be completed before submission.

Open [FiestaPay](https://fiestapay.somospanas.com/) on a phone or desktop browser. The interface is Spanish; translations appear below. **No Google account, personal email, real PayPal account or real card is required.** Use fictional names throughout.

## Before testing checkout

PayPal checkout requires an allocated **Personal sandbox buyer**. The maintainer must provide login instructions through the approved judging-access channel before submission; passwords are never included in this public repository. Without that handoff you can inspect invitations, attendance and assistant guidance, but cannot complete the payment step. A configured badge is not evidence of a payment.

## Organizer: create and share

1. Select **Nueva invitación** (New invitation) and **Comida** (Meal). Set a fictional organizer name, venue and inclusions, USD 25 per person, capacity 2, and a USD 50 minimum/goal. Choose future start/end times and a funding deadline before the gathering; do not copy expired demonstration dates.
2. Review the summary and publish. Keep the **Enlace de organizador** (Organizer link) private. It is the management credential. Share only the separate **Enlace público** (Public link).
3. Open **Compartir en WhatsApp** (Share on WhatsApp). Check the venue and both times, then close the draft without sending. This manual draft does not contact anyone automatically.

House party, Trip and Event use the same fixed per-person payment flow with their own labels. Event can include agenda items; the committed Trip flow is a single payment, not deposit plus balance.

## Guest: attend, review and pay

4. Open the public link in a separate browser or private window. Join with a fictional alias and one companion: **two people total**. Confirm attendance. Attendance and payment are separate; attending alone must not mark anyone paid.
5. Open **Chat** and ask about the venue, times, price or minimum. The assistant provides event guidance; it cannot approve PayPal, confirm the gathering or execute refunds. A form remains available if an AI provider fails.
6. Review the server-calculated quote: **2 × USD 25 = USD 50**. The guest confirms the displayed amount before an order is created. Never accept an amount chosen only by an assistant response.
7. Approve checkout with the allocated sandbox buyer. The yellow PayPal button opens checkout. **Abrir PayPal ↗** opens a separate tab; when returning, use **Verificar / Continuar Captura** if the status has not refreshed. The interface shows verification progress. Canceling or approving an order alone does not prove capture; consult the same order before retrying.
8. Wait for **Pagado** (Paid). In the organizer dashboard, check one registered guest, two paid people and USD 50 collected before fees. Paid people include companions; a guest row and a person count are different measures.

The three previously verified campaign captures total USD 125 in their own historical event. A newly created event should not inherit those payments. Their references and the [payment evidence](reviews/sandbox-evidence.md) prove earlier operations, not a payment in your new session.

## Organizer: interpret the result

9. Return with your saved organizer link. Reaching the minimum enables **Confirmar realización** (Confirm the gathering). The assistant can explain this, but the organizer decides. Confirmation changes the application's event status; it does not release escrow or run a payout.
10. Inspect paid/unpaid states. Reminders open drafts for the organizer to send manually. The public link must not grant editing, payment-list access or organizer chat history.
11. To repeat, create a new invitation from **Mis invitaciones** (My invitations). Delete only an event you created if desired; do not reset shared sessions or alter historical payment evidence. Events remain available until organizer deletion or 72 hours after their end, with minimal financial records retained for reconciliation.

## Optional capabilities and present limits

- **Voice:** microphone consent is required; audio is processed by AssemblyAI. Text/form controls remain available. Synthetic-input service tests do not establish Spanish speech or playback on a physical phone. Guest minimum/refund voice and final organizer-response correlation remain unverified. If testing is assigned, record the actual response, initial audio, overlap and behavior of **Detener** (Stop); do not treat a transport completion signal as a correct answer.
- **Recovery email:** optional and verified separately; no email is needed for the main route. Accepted historical recovery rotated the key and invalidated the old link. No judge mailbox is required.
- **Funding failure:** a separate [USD 1 sandbox case](reviews/refund-sandbox-20261026.md) verified one automatic refund after a minimum failed. It is not part of this short route. Do not change an existing deadline or refund an evidence transaction to recreate it.

This demo uses one Business sandbox recipient for all organizers. Capture credits that account. Independent merchant onboarding and PayPal Payouts are outside the demo. PayPal handles checkout credentials; Buyer Protection depends on eligibility and applicable terms rather than automatically covering every payment.

Submission preparation still requires the private buyer handoff, a human walkthrough, physical mobile voice results and the final public video. No completed human test, recording or submission is asserted here.
