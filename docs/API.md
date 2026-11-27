# API contract (Somos Panas)

Fastify serves JSON under `/api`. The root host is `somospanas.com`, group sites use `<slug>.somospanas.com`, and the legacy host keeps its existing event flow. Mutations require an allowed browser origin.

## Accounts and sites

- `POST /api/accounts/register`, `POST /api/accounts/verify`, `POST /api/accounts/login`, `POST /api/accounts/logout`, `GET /api/accounts/me`.
- `POST /api/sites` (root, verified account): `{slug, displayName}` -> `{site, handoff}`.
- `POST /api/sites/handoff` (site host): redeems the one-use handoff code.
- `GET /api/site/profile`, `GET /api/site/settings`, `PUT /api/site/settings` (site admin).
- `PATCH /api/site/events/:slug/visibility` (site admin): `{visibility}`.
- `GET /api/site/events/:slug` (site admin): private event of that site.

## Public directory and events

- `GET /api/portal/events` (root): public events only.
- `POST /api/events`, `GET /api/events/:slug`, `POST /api/events/:slug/join`, `POST /api/events/:slug/rsvp`, `POST /api/events/:slug/unlock`.
- `POST /api/events/:slug/quote`, `POST /api/events/:slug/orders`, `POST /api/orders/:orderId/capture`, `GET /api/orders/:orderId`.
- `GET /api/events/:slug/dashboard`, `POST /api/events/:slug/confirm`, `POST /api/events/:slug/close`, `POST /api/demo`, `POST /api/demo/reset`.
- `POST /api/paypal/webhook` verifies the PayPal signature before applying a capture or refund.
- Moderation, recovery and reminder-draft routes remain limited to the organizer and keep the existing event access checks.

## Napster avatar

- `POST /api/avatar-session` body `{lang, intent?, eventSlug?, mode?}` -> `{token, handle, visitor, lang, agent, socketUrl?}`.
  - `mode:'video'` (default) creates a WebRTC connection; `mode:'text'` creates a WebSocket text session and returns the server-decoded socket URL.
  - The server decides `visitor` from the host, account and event access rules. It returns only the short-lived token and an opaque handle.
- `POST /api/avatar-session/end` body `{handle}` -> 204, idempotent.
- `GET /api/capabilities` reports `paypal`, `paymentProvider`, `avatar` and `email`; it never announces an unconfigured provider.

## Shared shapes and limits

Amounts are integer cents computed on the server. The quote and order contracts live in `packages/shared`. Tests use fake payment and avatar adapters; browser input cannot select them. Missing PayPal or Napster configuration keeps the manual flows available and reports the corresponding capability as false.
