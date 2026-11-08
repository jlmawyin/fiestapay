# FiestaPay

An AI host for shared gatherings: understand the invitation, confirm attendance, review a server-calculated contribution, and pay with **PayPal sandbox**.

**Hackathon preview.** The cards/orb source passed 546 tests in 60 files with zero skips, lint, types and build, with independent AGY source review. See the [cards/orb release report](docs/reviews/demo-orb-20261105.md) for publication and runtime evidence. The [earlier 4 November acceptance](docs/reviews/jury-ready-20261104.md), on source `60593db`, verified one USD 50 sandbox capture (2 × USD 25), two paid people and the organizer's actual **✓ Confirmar Realización** action. That is historical mobile-emulation evidence, not a new payment or physical-phone test for this update. Physical-phone Spanish voice, video publication and Devpost submission still require actual evidence. No escrow, payout, measured 180-second conversation, neural entitlement or submission success is claimed.

- Running demo: https://fiestapay.somospanas.com
- [Three-minute judge walkthrough](docs/JUDGES.md) · [AI tools and contributions](docs/AI_TOOLS.md)
- No Google sign-in or real personal information. Use a fictional alias and a sandbox buyer.

**Bilingual release (pending approval and deployment):** the interface is available in **Spanish (default) and English** with a header selector remembered per browser, or `?lang=en` — for example the [Judges demo in English](https://fiestapay.somospanas.com/demo?lang=en). The home page now explains the product and leads to **Create my invitation**; a separate **Judges demo** (`/demo`) holds the read-only AG Grid sample, the guided **Try a PayPal payment** walkthrough and the assistant. Demo events are marked as demos on the server, listed under **My demos**, and **Reset my demos** never touches your own invitations. The assistants answer in the selected language (same OpenAI model); English voice uses AssemblyAI's English recognition and the *jane* voice, Spanish keeps *lola*. Amounts stay USD integer cents from the server and event times stay in America/Guayaquil. See the [bilingual release report](docs/reviews/bilingual-judge-demo-20261107.md).

Before that release, the live home page separates **Explora la demo** (AG Grid example, private demo, **Probar pago con PayPal**) from **Prueba en vivo** (your own gathering, still sandbox). The payment demo supplies a dedicated shared Personal sandbox account through **Ver cuenta de prueba** / **Show test account** and copy buttons. One FiestaPay orb offers **Escribir**/**Type** or **Hablar**/**Talk**; opening it does not start a microphone or voice reservation.

For that deliberately public test account only, configure `PAYPAL_DEMO_BUYER_PUBLIC=true`, `PAYPAL_DEMO_BUYER_EMAIL` and `PAYPAL_DEMO_BUYER_PASSWORD` in the service's private environment. The endpoint fails closed without the opt-in or exact HTTPS PayPal sandbox configuration. Actual values never belong in Git or the frontend bundle. Business/API credentials remain private. This feature has no SQL migration and does not change the payment engine or organizer-link recovery.

- Four fixed-cover templates: Meal, House party, Shared trip, Event.
- Attendance and payment are separate states. A confirmed guest can still be unpaid.
- Example: two attendees at USD 25 each → USD 50. The human reviews the quote and approves PayPal checkout.
- Organizer dashboard uses AG Grid Community, collected amount before fees, a funding minimum, and a manually sent WhatsApp reminder.
- OpenAI chat (`gpt-6-luna`, Responses API, low reasoning) and AssemblyAI voice share server tools. A public informational voice agent is available before joining; guest and organizer voice remain role-scoped. Tools propose attendance and prepare quotes; they cannot approve a payment.

## Run locally

Requirements: Node.js 24, npm, PostgreSQL 16. This app has no in-memory production database or fake-payment mode.

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL and optional provider credentials in .env.
npm run dev
```

Open http://localhost:5173. The API runs on port 3000 and applies versioned migrations on startup. For a production build: `npm run build`, then `npm start`.

Keep all keys server-side. `.env` and `.env.buyers` are ignored. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL=gpt-6-luna`. `LLM_PROVIDER=openai` is accepted for compatibility; any other value is rejected. Missing keys or API failures leave the manual invitation flow available. Consumer chat subscriptions do not configure API access.

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

## Deployment and project documents

- [Contabo deployment and recovery](docs/OPERATIONS.md)
- [Judge walkthrough](docs/JUDGES.md)
- [4 November jury-ready acceptance](docs/reviews/jury-ready-20261104.md)
- [90-second storyboard — not yet recorded](docs/DEMO_90_SECONDS.md)
- [Devpost text draft and submission gates](docs/DEVPOST_DRAFT.md)
- [Architecture and trust boundaries](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Approved daily plan](docs/PLAN_DIARIO.md)
- [AI contribution disclosure](docs/AI_TOOLS.md)

Deposits, open funds, collaborative expense splitting, physical contributions, discounts and beneficiary payouts are outside committed P1. No live payment processing is enabled.

## License

MIT, see [LICENSE](LICENSE). Fixed SVG covers are original project illustrations. Fonts are self-hosted through Fontsource; their package licenses are retained. AG Grid Community is used without enterprise features.
