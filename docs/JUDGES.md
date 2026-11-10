# Judge walkthrough (3 minutes)

**FiestaPay is an AI party host that collects everyone's share with PayPal.** The walkthrough below starts with the AI working, then follows one sandbox contribution from a server quote to a server-verified **Paid** state. Open the [Judges demo in English](https://fiestapay.somospanas.com/demo?lang=en).

**All payments are PayPal Sandbox. No real money is charged or transferred. Do not use a personal PayPal account or a real card.** Use fictional names. A sandbox capture credits the shared Business test account; it is not escrow, a payout or proof of real-money processing.

## Before you start

- Open https://fiestapay.somospanas.com/demo?lang=en. The interface is bilingual ES/EN: use the header selector, `?lang=en`, or let the browser language choose. The demo route also has a **Guided tour**.
- Use a clean or private window. **Reset my demos** clears only demos created in that browser; it never touches a visitor's own invitations.
- Get the shared fictional buyer now: **Try a PayPal payment → Show test account → Copy email / Copy password**. This is a dedicated Personal sandbox account, separate from the Business receiver and from all API credentials.
- The timings are a target for a manual route, not a claim of a completed human test. PayPal login and network latency can take longer.

## 0:00–0:25 — The AI builds the party

1. On `/demo?lang=en`, find **Describe your party — the AI builds it** and the button **Build the party with AI**.
2. Type one sentence, for example: **“BBQ for 10 on Saturday.”**
3. Press **Build the party with AI**. The creation assistant is filled in; review the details. Use **Suggest with AI** to propose a cover and theme.
4. Point out the boundary: the AI drafts the invitation, but the **server** computes the per-person amount in integer cents. The organizer can edit everything before publishing.

The same capability lives in the normal creation wizard as **Describe your invitation in one sentence** → **Fill with AI** (`POST /api/ai/draft-event`). AI reminders are drafted later in friendly, funny or formal tones; the organizer sends them personally.

## 0:25–0:55 — The voice agent guides you

1. Open the **FiestaPay orb**, choose **Talk**, accept the microphone consent and start.
2. Say: **“Take me to the judges demo.”** The public voice agent's only tool, `show_on_screen`, navigates to the judges demo and highlights **Try a PayPal payment**.
3. Show that the agent does **not** press the button. It can open pages and highlight controls; it never clicks, pays or creates anything. Button names in its replies are tappable, and **Guided tour** is available in the demo.
4. Say **“Stop”**, switch to text or close the orb to end voice. Voice sessions are capped at 120 seconds.

The runtime is **Gemini only**: voice is `gemini-3.8-live` through the Gemini Live API, and the browser connects with a single-use ephemeral token minted by the server. The API key never reaches the browser.

## 0:55–1:35 — The guest agent prepares the payment

1. Press **Try a PayPal payment**. This creates a fictional demo meal, joins it as **Demo Guest** with one companion and opens the normal invitation.
2. Point out that **2 people are attending** and that attendance is separate from payment.
3. Open the guest assistant and ask: **“How much do I have to pay? Please prepare my payment.”**
4. The agent calls the role-scoped tools: `get_event_details`, `get_my_status`, `get_collection_progress` and `prepare_quote`. The server returns the demo quote in integer cents, with status *pending approval*.
5. The screen shows **Approve in PayPal** with the server amount. The agent can prepare the quote, but it cannot approve, charge or mark anything paid. That decision belongs to the person.

## 1:35–2:10 — Approve in PayPal, then check the paid state

1. Choose **Confirm and Create Payment**. The order is PayPal Orders v2 with intent `CAPTURE`.
2. Sign in to PayPal Sandbox with the shared test account from **Show test account**, review the amount and **approve personally inside PayPal**.
3. Return to FiestaPay. Use **Check / Continue Capture** on the same order if the return does not resolve automatically.
4. Wait for **Paid**. The server verifies the capture, currency, amount, order reference and receiver before writing to the idempotent ledger. Signed webhooks (`verify-webhook-signature`) reconcile duplicates and retries.
5. Emphasize the trust boundary: an approved order is not a payment, and only a server-verified capture changes the state to paid. No fund holding, escrow or Payouts is involved; Buyer Protection depends on PayPal eligibility and terms.

## 2:10–3:00 — Organizer dashboard and AI reminder

1. Open the organizer dashboard. In **AG Grid Community**, use quick search, toggle **Pending only**, sort a column and export **CSV**. Show the highlighted rows and the totals row calculated by the server.
2. Ask the organizer assistant for a read-only summary: collection progress, who still owes and reminder drafts. It cannot change the ledger, approve payments or confirm attendance.
3. Draft a reminder in a **friendly**, **funny** or **formal** tone. Use **Copy** or open the WhatsApp draft; the organizer sends it personally. FiestaPay never sends messages automatically.
4. Close on the product boundary: *the agent guides and prepares; people approve in PayPal; only a server-verified capture counts as paid.*

## Honest limits

- Payments are sandbox only; no real money, live cards, escrow or beneficiary payouts.
- WhatsApp messages are drafts the organizer sends manually. No automatic sending is claimed.
- Attendance and payment are separate states; the organizer's confirmation changes the event status only.
- A new physical-phone payment test, a published video and Devpost submission are not claimed by this walkthrough.
- AI product metrics are still being measured and appear as metric placeholders in the submission and video documents.

## Current evidence and history

The current quality baseline is **1,015 automated tests green** (451 API with PostgreSQL + 564 web), with lint, type checks, build, independent AGY verification and CI green on 10 November 2026.

Older test counts, provider names and browser results are kept for traceability in [HISTORY.md](HISTORY.md), with their original reports under `docs/reviews/` and `docs/evidence/`. Those reports are historical evidence, not a description of the current runtime.
