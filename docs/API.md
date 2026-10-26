# Shared implementation contract

## October 25 current contracts

The current P0–P6 request supersedes incompatible historic P1 rules below. The public invitation is `/e/:slug`; the organizer entry is `/e/:slug/admin?k=:adminKey`. The browser captures the key into localStorage and removes it from the query. The server stores only its SHA-256 digest and compares fixed-length digests with `timingSafeEqual`. Keyed organizer operations require `X-Fiesta-Admin-Key`; the creator cookie alone does not authorize these operations.

- Create/demo/reset return `CreatedEvent` (`{event, adminKey}`); a newly minted key contains 32 random bytes. An existing demo can return a null key. Never put an organizer key into the public invitation or a guest API request.
- `PUT /api/events/:slug` validates the complete event input and requires the organizer key.
- `POST /api/events/:slug/close`, `DELETE /api/events/:slug`, dashboard and confirmation require the organizer key. Closed events remain readable, with new RSVP/quotes/orders rejected.
- `POST /api/events/:slug/admin/key` is a one-time migration path for legacy rows with no key hash, restricted to the original creator session. It cannot rotate or recover a keyed event.
- `POST /api/events/:slug/unlock` accepts `{code}` and establishes private-event access for the browser session. Missing/wrong proof returns 403 on protected public routes. Changing/clearing the code revokes existing unlocks. A valid admin key can authorize private organizer operations.
- `endsAt` and positive capacity are required. Expired events return 410 immediately at `endsAt + 72 hours`, including before the periodic sweep. Startup and a 15-minute loop remove public/personal content through a tombstone, preserving financial references for reconciliation. An organizer delete uses the same tombstone policy.
- Request logs omit query strings and credential headers. API responses use `Cache-Control: no-store`; pages use `Referrer-Policy: no-referrer`.

The access/retention routes passed restart/permission checks through the HTTPS origin. Release `2d7c542` includes independently reviewed SMTP recovery and migration0006; the server is healthy, with email honestly disabled until configured. Public DNS and HTTPS were restored and verified on25Oct after18:40ECT; see [routing evidence](reviews/domain-routing-20261025.md). Four authorized SMTP settings are stored only on the VPS; password and authorized recipient remain pending. Jorge reports an independent SMTP inbox test; application mail/recovery acceptance remains pending. Automatic funding refunds and moderation are subsequent packages. The product must use only OpenAI `gpt-6-luna` after the pending P5 cleanup; the historic Gemini option below is transitional code scheduled for removal.

## Verified optional email recovery

- `GET /api/events/:slug/recovery` requires the organizer key and returns availability and masked contact status.
- `PUT /api/events/:slug/recovery/contact` requires that key and `{email}`. It sends a verification message through the configured Banahosting SMTP adapter. It does not block event creation. A new/replaced mailbox is unverified until proof is consumed.
- `DELETE /api/events/:slug/recovery/contact` requires that key and removes the contact and existing proof tokens.
- `POST /api/recovery/request` accepts `{slug,email}` without an admin header. Valid requests return the same `{status:'accepted'}` for unknown, mismatched, unverified and matching contacts. This means the request was accepted; it does not prove SMTP or inbox delivery. An unavailable mail service returns the same503 across contacts.
- `POST /api/recovery/consume` accepts `{token}`. Tokens have distinct verify/recover purposes, are random32bytes, stored only as hashes, expire within15minutes and allow one transactional consumer. Recovery returns the new key once; the previous key immediately loses authority.
- `/recover#t=...` strips the fragment into memory and requires a confirmation click. It supports a new fragment in the same tab and ignores outdated async results. Query tokens are discarded. Public recovery requests never attach the organizer header.
- Shared PostgreSQL counters constrain IP/event windows and daily send attempts across instances and cookies. Changing/removing contact or tombstoning the event invalidates tokens and clears contact data. Financial references remain intact.
- SMTP configuration is server-only: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. Port465 uses TLS;587 requires STARTTLS; certificate validation remains enabled. Acceptance by the outbound server is distinct from receipt/spam. No real mail acceptance is claimed before the [operator protocol](EMAIL_SETUP.md).

## Historic baseline and unchanged payment contracts

P1 only: one USD sandbox merchant, fixed-price full payment, four templates, fixed local illustrations. No uploads, Payouts, deposits, open fund, Google or live payments. All amounts integer cents. The UI labels captured minus refunded amount `Recaudado` with `antes de comisiones`.

Same-origin JSON API under `/api`. Errors `{error: string}` with proper HTTP status. Browser uses HttpOnly SameSite=Lax cookie. Server checks Origin on mutations, fixes merchant server-side, never trusts browser amounts. Demo identities contain no required email/phone. Public invitation is slug; organizer and guest permissions are separate. Provider credentials never enter responses. One-time minted organizer keys and short-lived voice tokens are intentional browser capabilities.

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
