# FiestaPay

An AI host for shared gatherings: understand the invitation, confirm attendance, review a server-calculated contribution, and pay with **PayPal sandbox**.

**Hackathon preview.** Deployed source `60593db` (main) has 486 passing database-backed tests across 52 files with 0 skipped; CI run `41868819343` is green (lint, types and build passed). On 4 November, a live mobile-emulation acceptance used one previously reserved sandbox order: one USD 50 capture (2 × USD 25), two paid people, and the organizer's actual **✓ Confirmar Realización** action returned confirmed. Three fixed deterministic FAQ requests returned HTTP 200 with the typing indicator and made zero upstream model calls for those requests; no new voice lease or physical-phone audio was involved. See the [4 November acceptance report](docs/reviews/jury-ready-20261104.md). The historical October capture campaign totalled USD 125 across three captures; a separate USD 1 refund test used a different fixture and is unrelated. Neither is part of this capture. Pending: private sandbox-buyer handoff, physical-phone Spanish voice, video publication and Devpost submission. No claim of 180-second measured runtime, neural entitlement, physical-phone audio, video or submission success.

- Running demo: https://fiestapay.somospanas.com
- [Three-minute judge walkthrough](docs/JUDGES.md) · [AI tools and contributions](docs/AI_TOOLS.md)
- No Google sign-in or real personal information. Use a fictional alias and a sandbox buyer.
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
