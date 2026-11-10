# FiestaPay

**FiestaPay is an AI party host that collects everyone's share with PayPal.** Create an invitation, let guests ask by text or voice, and collect a fixed contribution through PayPal Sandbox. The server calculates every amount; only a server-verified capture counts as paid.

- **Live demo:** https://fiestapay.somospanas.com
- **Judges demo (English):** https://fiestapay.somospanas.com/demo?lang=en
- **Video:** [[VIDEO_URL]]
- **Devpost:** [[DEVPOST_URL]]
- **Source:** https://github.com/jlmawyin/fiestapay · MIT

## The judge path in 60 seconds

1. Open the [Judges demo in English](https://fiestapay.somospanas.com/demo?lang=en). The tour starts with **Describe your party — the AI builds it**: type one sentence, press **Build the party with AI**, and the creation assistant is filled in.
2. Open the assistant and choose **Talk**. Say **“Take me to the judges demo”**: the voice agent navigates to the demo and highlights **Try a PayPal payment**. It can open pages and highlight buttons, but it never clicks, pays or creates anything.
3. Press **Try a PayPal payment** to create a fictional demo meal, join as **Demo Guest** with one companion and ask the guest agent to prepare the payment. It calls the server tools; the screen shows **Approve in PayPal $X** for the server quote.
4. Copy the shared sandbox buyer from **Show test account**, approve personally inside PayPal Sandbox, then return and use **Check / Continue Capture**. The status changes to **Paid** only after the server verifies the capture.
5. Open the organizer dashboard: search, **Pending only**, CSV export, highlighted rows and a server-calculated totals row in **AG Grid Community**. Ask for a reminder in a friendly, funny or formal tone, then copy it or open WhatsApp and send it yourself.

Everything on this path is PayPal Sandbox. No real money moves, and no message is sent automatically.

## What the AI does

**Only Gemini runs in production.** Text uses `gemini-3.5-flash`; real-time voice uses `gemini-3.8-live` through the Gemini Live API. The server mints a single-use ephemeral token for each voice session, so the API key never reaches the browser. OpenAI and AssemblyAI remain available only as configuration rollbacks; they are not active.

- **AI builds the party.** **Describe your invitation in one sentence** → **Fill with AI** (`POST /api/ai/draft-event`) fills the creation assistant. **Suggest with AI** proposes a cover and theme. AI-drafted reminders come in friendly, funny or formal tones; the organizer copies them or opens WhatsApp and sends them personally.
- **Public agent.** Text chat with no tools. Voice has one tool, `show_on_screen`, which opens FiestaPay pages and highlights buttons. Button names in replies are tappable, and **Guided tour** is available in the demo.
- **Guest agent.** Tools: `get_event_details`, `get_my_status`, `get_collection_progress`, `prepare_quote`, `propose_rsvp`. It can prepare a payment: the server computes the amount in integer cents and the screen shows **Approve in PayPal $X**. Only the person approves inside PayPal.
- **Organizer agent.** Read-only: collection progress, who still owes, and reminder drafts.
- **Limits.** 200 AI queries per day in total and 60 per session; voice sessions last at most 120 seconds; 25 seconds per call and 40 seconds per query.

## What PayPal guarantees

PayPal Orders v2 runs with intent `CAPTURE`. The person approves inside PayPal, and the server verifies the capture, currency, amount, order reference and receiver before updating an idempotent ledger. Webhooks pass PayPal's `verify-webhook-signature` check. Amounts are calculated only on the server, in integer cents.

This is PayPal **Sandbox**: no real money is charged or transferred. There is no fund holding, escrow or Payouts, and Buyer Protection depends on PayPal eligibility and terms. Attendance and payment are separate states; a confirmed guest can still be unpaid.

## Stack and quality

React + Vite, Fastify and PostgreSQL, deployed in isolated containers behind Nginx and Cloudflare. PayPal Orders v2 and signed webhooks; Google Gemini Live and text APIs; AG Grid Community for the organizer and judges dashboards. The interface is bilingual ES/EN with a selector, `?lang=en`, and browser-language detection. Event times use America/Guayaquil and amounts are USD.

**1,015 automated tests are green: 451 API tests with PostgreSQL and 564 web tests**, plus lint, type checks and build, independent verification by AGY and CI green on 10 November 2026.

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
- [Approved daily plan](docs/PLAN_DIARIO.md)

Deposits, open funds, collaborative expense splitting, physical contributions, discounts and beneficiary payouts are outside committed scope. No live payment processing is enabled.

## Not claimed

Real-money payments, automatic WhatsApp sending, a new physical-phone payment test, a published video and a completed Devpost submission are not claimed. AI product metrics are pending measurement and appear as metric placeholders in the submission and video documents.

## License

MIT, see [LICENSE](LICENSE). Fixed SVG covers are original project illustrations. Fonts are self-hosted through Fontsource; their package licenses are retained. AG Grid Community is used without enterprise features.
