# FiestaPay

**FiestaPay is an AI party host that collects everyone's share with PayPal.** It is for organizers of meals, house parties, trips and events who want one link to answer questions, build the invitation, prepare each guest's fixed share in integer cents and collect it through PayPal Sandbox — and for judges who want to test the whole flow without a FiestaPay account.

- **Live demo:** https://fiestapay.somospanas.com
- **Judges demo (English):** https://fiestapay.somospanas.com/demo?lang=en
- **Video:** [[VIDEO_URL]] (Jorge's placeholder until recording)
- **Devpost:** [[DEVPOST_URL]] (Jorge's placeholder until submission)
- **Source:** https://github.com/jlmawyin/fiestapay · MIT

**Test it without a FiestaPay account.** Open the judges demo, use a fictional name and follow **Try a PayPal payment**: **Show test account** reveals the shared fictional PayPal Sandbox buyer, so no personal PayPal account or card is needed. Gemini runs server-side, so no Gemini key or account is required; PostgreSQL stays private behind the API; AG Grid Community renders the organizer and judges tables. Everything is PayPal Sandbox, never live money.

**The text flow.** In the public chat, type **“Build a BBQ for 10 at $15 each”**. The agent returns a complete proposal card (type, people, server-computed share per person, date and place); **Review in Create** hands that whole proposal to the creation wizard. The organizer reviews and edits it, then presses **Publish** once — the only publication step, always human. Voice prepares the same steps, asks for microphone consent and leaves the final button to the person; the agent never publishes, pays or confirms.

**Demo funding uses the real fixed-share flow.** The guest agent prepares the quote server-side in integer cents; the person approves it and the capture is verified by the server. RSVP is a separate state from payment. The demo does not use escrow, automatic refunds triggered by a promise, a Buyer Guarantee claim or live money.

**Measured AI draft quality (10 Nov 2026).** `POST /api/ai/draft-event` answered 10/10 AI drafts (5 English, 5 Spanish), with 43 of 44 expected fields correct (97.7 %); median latency ≈ 2.0 s and p90 ≈ 3.0 s. In real Gemini Live sessions, the voice guide navigated and highlighted the target in 4 of 5 runs (the miss was a synthetic-test-audio artifact).

**Measured guest quotes.** In 10 guest-chat turns on one isolated demo event (5 EN, 5 ES), 8 returned a quote and all 8 matched the expected cents. One reply omitted a quote and one returned HTTP 503. Median latency was 3.83 s across all turns (p90 4.60 s). Gemini usage was estimated at $0.18 for the event's 10 turns (about $0.018 per turn, 18 of 19 provider requests metered).

## The judge path in 60 seconds

1. Open the [Judges demo in English](https://fiestapay.somospanas.com/demo?lang=en). In the public chat, type **“Build a BBQ for 10 at $15 each”**. The agent answers with a proposal card; press **Review in Create** to carry the complete proposal into the wizard, review every field and publish manually once.
2. Open the assistant and choose **Talk**. Accept the microphone consent, then say **“Take me to the judges demo”**: the voice agent opens the demo and highlights **Try a PayPal payment**. Describe a party and it leaves your sentence in Create for you to press **Fill with AI**. It can open pages and highlight controls, but it never clicks, publishes, pays or creates anything.
3. Press **Try a PayPal payment** to create a fictional demo meal, join as **Demo Guest** with one companion and ask the guest agent to prepare the payment. It calls the server tools; the screen shows **Approve in PayPal $X** for the server quote. Its voice guide can highlight the quote and payment controls but never presses them.
4. Copy the shared sandbox buyer from **Show test account**, approve personally inside PayPal Sandbox, then return and use **Check / Continue Capture**. The status changes to **Paid** only after the server verifies the capture.
5. Open the organizer dashboard: search, **Pending only**, CSV export, highlighted rows and a server-calculated totals row in **AG Grid Community**. **PayPal activity** shows verified captures and refunds with their reference and amount. Ask for a reminder in a friendly, funny or formal tone, then copy it or open WhatsApp and send it yourself.

Everything on this path is PayPal Sandbox. No real money moves, no escrow or automatic promise-based refund exists, and no message is sent automatically.

## What the AI does

**Only Gemini runs in production.** Text uses `gemini-3.5-flash`; real-time voice uses `gemini-3.8-live` through the Gemini Live API. The server mints a single-use ephemeral token for each voice session, so the API key never reaches the browser. OpenAI and AssemblyAI remain available only as configuration rollbacks; they are not active.

- **AI builds the party.** Start with one sentence or answer a short guided interview. Both use `POST /api/ai/draft-event` and open an editable summary before publication. You can also fill in the invitation manually. **Suggest with AI** proposes a cover and theme. AI-drafted reminders come in friendly, funny or formal tones; the organizer copies them or opens WhatsApp and sends them personally.
- **Public agent.** Text chat has one tool, `draft_invitation`, which turns the person's own sentence into a complete proposal card for **Review in Create**; it never publishes. Text replies can link to existing on-screen labels and the **Guided tour**. Voice has `show_on_screen`, which opens FiestaPay pages, highlights controls and can place the spoken party sentence in Create; the person presses **Fill with AI**.
- **Guest agent.** Tools: `get_event_details`, `get_my_status`, `get_collection_progress`, `prepare_quote`, `propose_rsvp`. It can prepare a payment: the server computes the amount in integer cents and the screen shows **Approve in PayPal $X**. Only the person approves inside PayPal. RSVP remains a separate, on-screen confirmation.
- **Organizer agent.** Read-only: collection progress, who still owes, and reminder drafts.
- **Limits.** 200 AI queries per day in total and 60 per session; voice sessions last at most 120 seconds; 25 seconds per call and 40 seconds per query.

## What PayPal guarantees

PayPal Orders v2 runs with intent `CAPTURE`. The person approves inside PayPal, and the server verifies the capture, currency, amount, order reference and receiver before updating an idempotent ledger. Webhooks pass PayPal's `verify-webhook-signature` check. Amounts are calculated only on the server, in integer cents.

This is PayPal **Sandbox**: no real money is charged or transferred. There is no fund holding, escrow or Payouts, and Buyer Protection depends on PayPal eligibility and terms. Attendance and payment are separate states; a confirmed guest can still be unpaid.

## Stack and quality

React + Vite, Fastify and PostgreSQL, deployed in isolated containers behind Nginx and Cloudflare. PayPal Orders v2 and signed webhooks; Google Gemini Live and text APIs; AG Grid Community for the organizer and judges dashboards. The interface is bilingual ES/EN with a selector, `?lang=en`, and browser-language detection. Event times use America/Guayaquil and amounts are USD.

CI runs the PostgreSQL integration and web suites, lint, type checks and builds.

## Run locally

Requirements: Node.js 24, npm, PostgreSQL 16. This app has no in-memory production database or fake-payment mode.

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL and optional provider credentials in .env.
npm run dev
```

Open http://localhost:5173. The API runs on port 3000 and applies versioned migrations on startup. For a production build: `npm run build`, then `npm start`.

Keep all keys server-side. `.env` and `.env.buyers` are ignored. Set `GEMINI_API_KEY` (optional `GEMINI_LIVE_MODEL`, `GEMINI_TEXT_MODEL`); the browser only ever receives a single-use ephemeral token locked to the model and configuration. `VOICE_PROVIDER=assemblyai` and `AI_TEXT_PROVIDER=openai` (with `ASSEMBLYAI_API_KEY` / `OPENAI_API_KEY`) remain as configuration rollbacks. `LLM_PROVIDER=openai` is accepted for compatibility; any other value is rejected. Missing keys or API failures leave the manual invitation flow available. Consumer chat subscriptions do not configure API access.

PayPal must use one **sandbox Business merchant** and sandbox client ID/secret. Set `PAYPAL_MERCHANT_ID` to that merchant's ID and `PAYPAL_WEBHOOK_ID` to the registered webhook ID, not its URL. Register:

```text
https://fiestapay.somospanas.com/api/paypal/webhook
CHECKOUT.ORDER.APPROVED
CHECKOUT.ORDER.COMPLETED
PAYMENT.CAPTURE.COMPLETED
PAYMENT.CAPTURE.DECLINED
PAYMENT.CAPTURE.REFUNDED
```

An approved order is not a payment. The server verifies the capture, currency, amount, order reference and receiver before updating the ledger. A webhook must pass PayPal signature verification.

## Verify

```sh
npm run check
npm run providers:check
node --env-file=.env scripts/check-webhook.mjs
```

Database integration tests require a dedicated `DATABASE_URL` (for example, database `fiestapay_test`). They create isolated random schemas and remove only those schemas. CI supplies PostgreSQL. Tests without a database are explicitly skipped. Fake PayPal/model adapters exist only in tests and cannot be selected by browser input.

`scripts/smoke-providers.mjs --chat --order --voice` is an **explicit integration probe** against a running local API. It creates demo data, may consume AI credits and creates an unapproved sandbox order. It never substitutes for buyer approval or a real human microphone test. Evidence is saved privately under `.local/`.

## Documents

- [Three-minute judge walkthrough](docs/JUDGES.md)
- [Video script (2:45 maximum)](docs/VIDEO_SCRIPT.md)
- [Devpost submission draft](docs/DEVPOST_DRAFT.md)
- [Project history and release evidence](docs/HISTORY.md)
- [Gemini runtime](docs/GEMINI.md)
- [AI contribution disclosure](docs/AI_TOOLS.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Contabo deployment and recovery](docs/OPERATIONS.md)
- [Approved daily plan (internal history)](docs/internal/PLAN_DIARIO.md)

Deposits, open funds, collaborative expense splitting, physical contributions, discounts and beneficiary payouts are outside committed scope. No live payment processing is enabled.

## Not claimed

Real-money payments, escrow, automatic refunds based on a promise, a Buyer Guarantee beyond PayPal's own eligibility and terms, automatic WhatsApp sending, a new physical-phone payment test, a published video and a completed Devpost submission are not claimed.

## License

MIT, see [LICENSE](LICENSE). Fixed SVG covers are original project illustrations. Fonts are self-hosted through Fontsource; their package licenses are retained. AG Grid Community is used without enterprise features.
