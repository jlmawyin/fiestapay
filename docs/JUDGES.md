# Three-minute judge walkthrough

## 0:00–0:40 — The avatar greets you

1. Open `https://somospanas.com` or the legacy judges demo.
2. Start the **Napster avatar** by text or voice. The microphone only starts after consent and a click.
3. The avatar introduces Somos Panas and offers the public events or the guided tutorial. It explains and highlights controls; it never presses them.

The only runtime AI is **Napster**. The server creates the session and the browser receives only a short-lived token. If video fails, the app falls back to Napster text mode and then to the fixed tutorial script.

## 0:40–1:30 — The legacy event and quote

1. Open the judges demo and press **Try a PayPal payment**. This creates a fictional demo meal and joins as **Demo Guest** with one companion.
2. Point out that attendance and payment are separate states.
3. Request a quote. The server computes the amount in integer cents and shows **Approve in PayPal**.
4. The avatar can explain and highlight the control, but it cannot approve, charge or mark anything paid.

## 1:30–2:20 — Approve in PayPal Sandbox

1. Choose **Confirm and Create Payment**. The order uses PayPal Orders v2 with intent `CAPTURE`.
2. Sign in with the shared sandbox buyer from **Show test account** and approve personally inside PayPal.
3. Return and use **Check / Continue Capture** if needed.
4. **Paid** appears only after the server verifies the capture, currency, amount, order reference and receiver. Signed webhooks reconcile duplicates and retries.
5. No fund holding, escrow or Payouts is involved; Buyer Protection depends on PayPal eligibility and terms.

## 2:20–3:00 — Organizer dashboard

1. Open the organizer dashboard: search, **Pending only**, sorting, CSV export and server-calculated totals.
2. Show **PayPal activity** with verified captures and refunds.
3. Close on the product boundary: the avatar guides and prepares; the person approves in PayPal; only a server-verified capture counts as paid.

## Honest limits

- Payments are sandbox only; no real money, live cards, escrow or beneficiary payouts.
- The avatar never publishes, confirms, sends messages, pays or approves on the person's behalf.
- A physical-phone payment test, a published video and the Devpost submission are not claimed by this walkthrough.
