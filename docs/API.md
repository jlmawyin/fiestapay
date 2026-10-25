# Shared implementation contract

## October 25 local implementation, awaiting independent acceptance

The current P0–P6 request supersedes incompatible historic P1 rules below. The public invitation is `/e/:slug`; the organizer entry is `/e/:slug/admin?k=:adminKey`. The browser captures the key into localStorage and removes it from the query. The server stores only its SHA-256 digest and compares fixed-length digests with `timingSafeEqual`. Keyed organizer operations require `X-Fiesta-Admin-Key`; the creator cookie alone does not authorize these operations.

- Create/demo/reset return `CreatedEvent` (`{event, adminKey}`); a newly minted key contains 32 random bytes. An existing demo can return a null key. Never put an organizer key into the public invitation or a guest API request.
- `PUT /api/events/:slug` validates the complete event input and requires the organizer key.
- `POST /api/events/:slug/close`, `DELETE /api/events/:slug`, dashboard and confirmation require the organizer key. Closed events remain readable, with new RSVP/quotes/orders rejected.
- `POST /api/events/:slug/admin/key` is a one-time migration path for legacy rows with no key hash, restricted to the original creator session. It cannot rotate or recover a keyed event.
- `POST /api/events/:slug/unlock` accepts `{code}` and establishes private-event access for the browser session. Missing/wrong proof returns 403 on protected public routes. Changing/clearing the code revokes existing unlocks. A valid admin key can authorize private organizer operations.
- `endsAt` and positive capacity are required. Expired events return 410 immediately at `endsAt + 72 hours`, including before the periodic sweep. Startup and a 15-minute loop remove public/personal content through a tombstone, preserving financial references for reconciliation. An organizer delete uses the same tombstone policy.
- Request logs omit query strings and credential headers. API responses use `Cache-Control: no-store`; pages use `Referrer-Policy: no-referrer`.

These routes exist locally; this section does not claim production deployment or completed browser/restart acceptance. Recovery email, automatic funding refunds and moderation are subsequent packages. The product must use only OpenAI `gpt-6-luna` after the pending P5 cleanup; the historic Gemini option described below is transitional code scheduled for removal.

## Historic baseline and unchanged payment contracts

P1 only: one USD sandbox merchant, fixed-price full payment, four templates, fixed local illustrations. No uploads, Payouts, deposits, open fund, Google or live payments. All amounts integer cents. The UI labels captured minus refunded amount `Recaudado` with `antes de comisiones`.

Same-origin JSON API under `/api`. Errors `{error: string}` with proper HTTP status. Browser uses HttpOnly SameSite=Lax cookie. Server checks Origin on mutations, fixes merchant server-side, never trusts browser amounts. Demo identities contain no required email/phone. Public invitation is slug; organizer and guest permissions are separate. No secrets in response except short-lived voice token intentionally issued to browser.

- `GET /api/health` -> `{ok:true}`.
- `GET /api/capabilities` -> Capabilities, providers false unless configured; never fake successful payment/audio/AI.
- `POST /api/demo` -> `{event:FiestaEvent}`; creates organizer cookie and seeded Comida USD25, target100/min50.
- `GET /api/events` -> `{events:FiestaEvent[]}` organizer owned only.
- `POST /api/events` body EventInput -> `{event}`.
- `GET /api/events/:slug` -> `{event,guest:Guest|null}` public event + guest only for that cookie.
- `POST /api/events/:slug/join` body `{name:string}` -> `{guest}`; guest cookie capability, no organizer authority gained from public slug.
- `POST /api/events/:slug/rsvp` body `{status:RsvpStatus,companions:number}` -> `{guest,event}`. All-or-none capacity and serialize with quote/capture.
- `POST /api/events/:slug/quote` -> `{quote:Quote}`. Server calculated, expires, immutable quote version, prior captured amount deducted.
- `POST /api/events/:slug/orders` body `{quoteId:string,confirmed:true}` -> OrderResult. Confirmation human UI before request; one active order/obligation, stable PayPal-Request-Id. Missing PayPal config returns503.
- `POST /api/orders/:orderId/capture` -> `{status:string,guest:Guest}` authenticated owning guest; order capture verified before paid state.
- `GET /api/orders/:orderId` -> `{status,guest}` owner-only reconciliation.
- `POST /api/paypal/webhook` verifies signature with PayPal API before applying completed capture/refund idempotently.
- `GET /api/events/:slug/dashboard` -> Dashboard; organizer only.
- `POST /api/events/:slug/confirm` -> `{event}` organizer only, minimum reached required when configured.
- `POST /api/demo/reset` -> `{event}` new generation only for organizer, archived invitations cannot create new payments; preserve old refs and reconcile late captures to old generation.
- `POST /api/events/:slug/chat` body `{message:string}` -> ChatResult. Text + quote card, never executes payment from LLM. The selected `LLM_PROVIDER` (`openai` by default, or explicitly `gemini`) uses the same authorized backend tools; OpenAI uses Responses API with `gpt-6-luna` and `reasoning.effort=low`; every write must be reviewed/confirmed by human UI. If provider unconfigured return503, UI keeps forms and explains availability.
- `POST /api/events/:slug/voice/token` body `{consent:true}` -> short-lived `{token,sessionConfig,maxSeconds,leaseId}`. Requires a joined guest. Reserves the full maximum duration against a shared PostgreSQL daily allowance before contacting AssemblyAI; failed requests still consume the reservation.
- `POST /api/events/:slug/voice/tool` body `{leaseId,name,arguments}` -> authorized read/proposal tool result. The lease must belong to this session and event and remain unexpired. No tool captures money or saves RSVP without human confirmation.
- Chat has a shared daily request budget and a per-session cap. New cookies and demo reset do not reset global voice/chat allowances. Provider configuration is not proof of availability; forms remain usable when a provider fails.

Shared TypeScript shapes in packages/shared. UI and server may NOT independently rename routes/shapes; propose changes to Codex. Backend serves apps/web/dist in production with SPA fallback excluding API. Development Vite proxies /api to localhost:3000.

Production requires PostgreSQL via DATABASE_URL and persistent sessions/state; no in-memory production fallback. Test provider fakes are test-only and cannot be enabled by browser input. Secrets .env excluded. Tests must cover payments not duplicated, capacity, authorization and reset.
