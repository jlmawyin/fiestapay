# @fiestapay/api

Fastify (Node 24, TypeScript, ESM) API for Somos Panas: fixed per-person fee, one USD PayPal
**sandbox** receiver, PostgreSQL persistence, hashed cookie sessions, and the Napster avatar
session endpoint whose tools can read state and prepare drafts but can never move money.

Routes follow `docs/API.md` exactly; shapes come from `packages/shared/src/index.ts`.

## Run

```bash
npm run dev -w @fiestapay/api        # tsx watch, reads ../../.env if present
npm run build -w @fiestapay/api      # tsc + copy SQL migrations into dist/
npm run start -w @fiestapay/api      # node dist/index.js
npm run migrate -w @fiestapay/api    # apply SQL migrations only
```

`src/index.ts` is the process entry point; `buildApp({ pool, config?, paypal?, email? })`
from `src/app.ts` is the testable factory. Migrations run on boot unless `MIGRATE_ON_BOOT=0`.

## Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | — | PostgreSQL. The process refuses to start without it; there is no in-memory fallback. |
| `PUBLIC_ORIGIN` | yes | — | Canonical origin. Used for origin validation and PayPal return/cancel URLs. |
| `ALLOWED_ORIGINS` | no | — | Extra comma-separated origins. In development `localhost:5173/3000` are added automatically. |
| `PORT` / `HOST` | no | `3000` / `0.0.0.0` | |
| `PAYPAL_CLIENT_ID` | no | — | Public; echoed in `/api/capabilities` for the JS SDK. |
| `PAYPAL_CLIENT_SECRET` | no | — | Server only. |
| `PAYPAL_MERCHANT_ID` | no | — | Fixed receiver; checked on every capture. |
| `PAYPAL_WEBHOOK_ID` | no | — | Required for `/api/paypal/webhook`; without it the route answers 503. |
| `PAYPAL_BASE_URL` | no | `https://api-m.sandbox.paypal.com` | Rejected unless it is a PayPal sandbox host. |
| `PAYPAL_TIMEOUT_MS` | no | `12000` | |
| `NAPSTER_ENABLED` | no | `false` | Enables the avatar session endpoint. |
| `NAPSTER_API_KEY` | no | — | Server only; never reaches the browser. |
| `NAPSTER_API_BASE` | no | `https://napster-api.napster.com` | Provider base URL. |
| `NAPSTER_AGENT_ID_ES` / `NAPSTER_AGENT_ID_EN` | no | — | Agent IDs per language. |
| `QUOTE_TTL_SECONDS` | no | `900` | Quote lifetime. |
| `SESSION_COOKIE_NAME` / `SESSION_TTL_SECONDS` | no | `fp_session` / 30 days | |
| `BODY_LIMIT_BYTES` | no | `65536` | |
| `RATE_LIMIT` / `RATE_LIMIT_MAX` | no | on / `300` per minute per IP | Per-route limits are tighter. |
| `WEB_DIST_DIR` / `SERVE_WEB` | no | `apps/web/dist` / on | SPA fallback for non-`/api` GETs. |

Missing provider configuration is reported honestly: `/api/capabilities` returns `false` and the
dependent route answers `503` with the reason. Nothing is ever faked as a successful payment.

## Money and authorization invariants

- Amounts are integer USD cents computed server-side from the event price, the confirmed RSVP
  and verified payments (`fixedQuote` from the shared package). Browser amounts are ignored.
- An order intent is stored **before** the PayPal call with a stable `PayPal-Request-Id`, so a
  timeout is resumed instead of creating a second order. At most one open order per guest is
  enforced by a partial unique index.
- A capture becomes money only after verifying merchant id, amount, currency, order id and
  capture id. The capture call, the signed webhook and the owner status read all converge on
  `payment_ledger`, whose `(kind, external_id)` unique key applies each capture or refund once.
- Refunds must match a recorded capture and cannot exceed it; they lower the gross collected
  amount and never auto-cancel the event.
- RSVP changes serialize on the event row, admit the whole party or none against capacity,
  invalidate quotes and supersede the open order. Captured money is never auto-refunded: a
  surplus simply leaves `dueCents` at 0 for human reconciliation.
- `POST /api/demo/reset` starts a new generation for that organizer only. Old events stay in the
  database (guests, orders, ledger) but are archived: no new payments, while late captures still
  reconcile against the old generation.
- Every mutation (session creation included) requires an allowed `Origin`; there is no CORS.
  The webhook is exempt and authenticated by its PayPal signature instead.

## Avatar boundary

`POST /api/avatar-session` creates a short-lived Napster connection and returns only the token,
an opaque handle and (for text mode) the socket URL. The server decides the visitor type from
the host, account and event access rules. The avatar uses the closed tool list in
`packages/shared/src/avatar-tools.ts`; it prepares drafts and highlights controls, and the person
presses the final control.

## Tests

```bash
npm test                      # from the repo root
DATABASE_URL=postgresql://... npm test
```

Unit tests (money, origin, validation, PayPal verification) always run. The PostgreSQL
integration suites are **skipped, never reported as passing**, when `DATABASE_URL` is absent.
The PayPal adapter is injected: `test/fake-paypal.ts` lives under `test/` so no production
module can import it, and no request can select it.
