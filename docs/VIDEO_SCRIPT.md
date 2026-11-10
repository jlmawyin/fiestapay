# FiestaPay — video script (2:45 maximum)

Recorded in English, on the deployed app, with English UI (`/demo?lang=en`). The total target is **2:40**, leaving five seconds of margin under the three-minute limit. Record the real sequence: if PayPal login takes longer, cut only dead waiting time; never edit an unverified result into a success.

## 0:00–0:12 — Cold open: the agent navigates, but does not press

**On screen:** `/demo?lang=en`, the FiestaPay orb open, **Talk** selected before recording. The cursor is visible.

**You press:** **Talk** → accept microphone consent → say **“Take me to the judges demo.”** The app navigates to the demo and highlights **Try a PayPal payment**. Hold on the highlight.

**Narration (word for word):**

> This is FiestaPay. I asked its voice agent to take me to the judges demo. It navigated and highlighted the next button — but it did not press it.

## 0:12–0:38 — One sentence builds the party

**On screen:** the judges demo hero, the public chat proposal card, then the creation wizard.

**You press:** open the public chat → type **“Build a BBQ for 10 at $15 each”** → wait for the complete proposal card → **Review in Create**. Let the pre-filled fields appear. Review them; press **Publish** once, manually. Do not skip the human review.

**Narration:**

> FiestaPay is an AI party host that collects everyone's share with PayPal. In the public chat I say: build a BBQ for ten at fifteen each. The agent returns a complete proposal — ten people, the share per person, date and place. Review in Create opens the whole proposal, and I publish it myself after checking every field. The server — not the model — calculates each person's share in integer cents.

## 0:38–1:00 — A guest joins; attendance is not payment

**On screen:** the demo meal and the public invitation.

**You press:** **Try a PayPal payment** → join as **Demo Guest** → add one companion → confirm attendance. Show **2 people attending** and the separate payment state.

**Narration:**

> For the payment, the judges demo creates a fictional meal. I join as Demo Guest and add one companion. Two people are attending. Notice that attendance is separate from payment: saying yes does not mark anyone paid.

## 1:00–1:28 — The guest agent prepares the quote

**On screen:** the guest assistant, the agent reply, and the **Approve in PayPal** card.

**You press:** open the guest assistant → **Talk** (or **Type** if the room is noisy) → say **“How much do I have to pay? Please prepare my payment.”** Show the tool activity and the resulting card.

**Narration:**

> Now I ask the guest agent: how much do I have to pay, and please prepare my payment. The agent calls the event, my status and the quote tools. The server returns the quote in integer cents, pending approval. The screen shows Approve in PayPal with that exact amount. The agent can prepare a quote, but it can never approve it or charge a card.

## 1:28–1:58 — Approval in PayPal, verification on the server

**On screen:** FiestaPay checkout, the PayPal Sandbox login, PayPal approval, the return to FiestaPay, then **Paid**.

**You press:** **Confirm and Create Payment** → **Show test account** (copy email/password off camera) → sign in to PayPal Sandbox → review and **approve personally** → return to FiestaPay → **Check / Continue Capture** if needed → wait for **Paid**. Never show the password or API credentials.

**Narration:**

> I approve personally inside PayPal Sandbox. Back in FiestaPay, the server verifies the capture: the amount, the currency, the order reference and the receiver. Signed webhooks reconcile duplicate notifications and retries. Only after that check does the status change to Paid. An approved order on its own is never a payment.

## 1:58–2:18 — Organizer dashboard in AG Grid

**On screen:** the organizer dashboard and the read-only judges grid.

**You press:** quick search for a guest → toggle **Pending only** → sort a column → **Export CSV** → point at the highlighted rows and the totals row.

**Narration:**

> The organizer sees the collection in AG Grid: quick search, Pending only, CSV export, highlighted rows, and a totals row calculated by the server. Paid and unpaid guests are visible at a glance.

## 2:18–2:32 — An AI-drafted reminder the organizer sends

**On screen:** the reminder composer and the WhatsApp draft.

**You press:** **Draft reminder** → choose **Friendly** → show the generated text → **Copy** → open the WhatsApp draft → close it without sending.

**Narration:**

> For anyone still pending, the AI drafts a reminder in a friendly, funny or formal tone. The organizer copies it, or opens WhatsApp and sends it personally. FiestaPay never messages anyone on its own.

## 2:32–2:45 — Why this is different, and where to try it

**On screen:** a clean end card with the product name, the live URL and the judges-demo URL.

**You press:** nothing. Let the end card hold.

**Narration:**

> SarafuPay centers the conversation on WhatsApp and also has a web checkout. Partiful verifies Ticket Sales, while its Chip In asks the organizer to confirm receipt. FiestaPay connects the AI conversation to a server-verified PayPal Sandbox capture: the agent guides and prepares; people approve in PayPal; only a server-verified capture counts as paid. Try it at fiestapay dot somospanas dot com slash demo.

## Preparation checklist

- **Sandbox buyer:** open **Try a PayPal payment → Show test account** and verify the shared buyer can sign in to PayPal Sandbox before recording. Keep the password off camera and out of the final cut.
- **Language:** use `https://fiestapay.somospanas.com/demo?lang=en`. If the browser language overrides the URL, switch English in the header or use a clean English browser profile.
- **Clean window:** use a private window, close personal tabs and notifications, and press **Reset my demos** so the demo starts from a known state. Do not show organizer keys, recovery links, cookies, `.env` files or API keys.
- **Voice:** test the microphone and consent flow first. Start the voice session close to its line; sessions are capped at 120 seconds. If the session ends, reopen the orb and continue — do not fake the response.
- **Payment realism:** use the demo meal and the shared sandbox buyer. Keep the same order through quote, approval, capture and dashboard. If login is slow, cut only the waiting; keep the real steps. Record the order/capture reference privately alongside the video.
- **Reminder:** demonstrate **Copy** and the WhatsApp draft without sending. No third party should receive a message.
- **Capture:** record at 1080p or higher, with clear cursor movement and readable text. No music. Burn in or upload English captions from this script.
- **Publish:** keep the final video under three minutes, upload it as a public YouTube video, and use that URL for `[[VIDEO_URL]]` in the README and Devpost draft.

## What the script deliberately does not claim

No real-money payment, automatic WhatsApp sending, new physical-phone payment test, published video or completed Devpost submission. All payments are PayPal Sandbox. Measured AI draft quality: 10/10 drafts (5 EN, 5 ES), 43 of 44 expected fields correct (97.7 %), median ≈ 2.0 s, p90 ≈ 3.0 s. Guest-chat evaluation returned 8 exact quotes in 10 turns on an isolated demo, with a median of 3.83 s across all turns.
