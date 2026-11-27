# FiestaPay

**FiestaPay is an AI party host that collects everyone's share with PayPal.** It is for organizers of meals, house parties, trips and events who want one link to answer questions, build the invitation, prepare each guest's fixed share in integer cents and collect it through PayPal Sandbox — and for judges who want to test the whole flow without a FiestaPay account.

- **Live demo:** https://fiestapay.somospanas.com
- **Judges demo (English):** https://fiestapay.somospanas.com/demo?lang=en
- **Video:** [[VIDEO_URL]] (Jorge's placeholder until recording)
- **Devpost:** [[DEVPOST_URL]] (Jorge's placeholder until submission)
- **Source:** https://github.com/jlmawyin/fiestapay · MIT

**Test it without a FiestaPay account.** Open the judges demo, use a fictional name and follow **Try a PayPal payment**: **Show test account** reveals the shared fictional PayPal Sandbox buyer, so no personal PayPal account or card is needed. The Napster avatar runs server-side, so no provider key is required in the browser; PostgreSQL stays private behind the API; AG Grid Community renders the organizer and judges tables. Everything is PayPal Sandbox, never live money.

**The text flow.** The Napster avatar explains the product and guides by text or voice. It can prepare drafts and highlight the next control, but the person always reviews, publishes and approves. The avatar never publishes, pays, confirms or sends messages on the person's behalf.

**Demo funding uses the real fixed-share flow.** The guest quote is prepared server-side in integer cents; the person approves it and the capture is verified by the server. RSVP is a separate state from payment. The demo does not use escrow, automatic refunds triggered by a promise, a Buyer Guarantee claim or live money.

## The judge path in 60 seconds

1. Open the [Judges demo in English](https://fiestapay.somospanas.com/demo?lang=en) and create the fictional demo meal.
2. Join as **Demo Guest**, confirm attendance and request a quote. The amount is computed on the server in integer cents.
3. Press **Try a PayPal payment**, copy the shared sandbox buyer from **Show test account**, and approve personally inside PayPal Sandbox.
4. Return and use **Check / Continue Capture**. The status changes to **Paid** only after the server verifies the capture.
5. Open the organizer dashboard to see totals, payment activity and reminder drafts. The organizer copies or sends any message personally.

Everything on this path is PayPal Sandbox. No real money moves, no escrow or automatic promise-based refund exists, and no message is sent automatically.

## What the avatar does

**Napster is the only runtime AI.** The server creates short-lived Napster avatar sessions; the API key stays on the server. The avatar can explain the product, answer from the knowledge and FAQ, list public events and highlight allowed controls.

- **Avatar only.** It never publishes, pays, confirms, deletes or sends messages for the person.
- **Tools.** It uses the closed tool list in `packages/shared/src/avatar-tools.ts`; the browser validates the output and the person presses the final control.
- **Fallback.** If video fails, the app falls back to Napster text mode and then to the fixed tutorial script.
- **Limits.** Napster sessions are rate-limited by the server; the browser never receives the provider key.

## What PayPal guarantees

PayPal Orders v2 runs with intent `CAPTURE`. The person approves inside PayPal, and the server verifies the capture, currency, amount, order reference and receiver before updating an idempotent ledger. Webhooks pass PayPal's `verify-webhook-signature` check. Amounts are calculated only on the server, in integer cents.

This is PayPal **Sandbox**: no real money is charged or transferred. There is no fund holding, escrow or Payouts, and Buyer Protection depends on PayPal eligibility and terms. Attendance and payment are separate states; a confirmed guest can still be unpaid.

## Stack and quality

React + Vite, Fastify and PostgreSQL, deployed in isolated containers behind Nginx and Cloudflare. PayPal Orders v2 and signed webhooks; Napster Omniagent for the avatar; AG Grid Community for the organizer and judges dashboards. The interface is bilingual ES/EN with a selector, `?lang=en`, and browser-language detection. Event times use America/Guayaquil and amounts are USD.

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

Keep all keys server-side. `.env` and `.env.buyers` are ignored. Set `NAPSTER_ENABLED`, `NAPSTER_API_KEY`, `NAPSTER_API_BASE` and `NAPSTER_AGENT_ID_ES` / `NAPSTER_AGENT_ID_EN`; the browser only ever receives a short-lived connection token. Missing keys leave the avatar disabled and the manual flows available.

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

Database integration tests require a dedicated `DATABASE_URL` (for example, database `fiestapay_test`). They create isolated random schemas and remove only those schemas. CI supplies PostgreSQL. Tests without a database are explicitly skipped. Fake PayPal and avatar adapters exist only in tests and cannot be selected by browser input.

## Documents

- [Three-minute judge walkthrough](docs/JUDGES.md)
- [Video script (2:45 maximum)](docs/VIDEO_SCRIPT.md)
- [Devpost submission draft](docs/DEVPOST_DRAFT.md)
- [Project history and release evidence](docs/HISTORY.md)
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
