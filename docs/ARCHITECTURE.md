# Architecture

The same-origin React interface calls a Fastify API backed by PostgreSQL. Cloudflare fronts the Nginx virtual host on Contabo. The database has no published port. API and database run in independent containers with persistent storage isolated from other applications.

```mermaid
flowchart LR
  Browser[Browser] --> CF[Cloudflare HTTPS]
  CF --> Nginx[Nginx virtual host]
  Nginx --> API[Fastify API]
  API --> DB[(PostgreSQL)]
  API --> PayPal[PayPal sandbox]
  API --> Napster[Napster Omniagent]
  Browser -->|short-lived token| Napster
```

Sessions use an opaque HttpOnly cookie; only its hash is stored. Organizer access requires a separate secret link and the `X-Fiesta-Admin-Key` header. The server stores only the key digest and compares fixed-length digests in constant time. Group sites use their own host and cookie; the site admin role is checked from `memberships`. Private group events are hidden on the root and legacy hosts except from their own site admin.

Money is integer USD cents calculated on the server. RSVP, the payment ledger and organizer confirmation are separate concepts. Event-row locks serialize capacity changes. PayPal request IDs and unique ledger entries provide retry convergence. The legacy host keeps PayPal Sandbox; new group sites use provider `none` and do not offer online checkout.

The only runtime AI is Napster. The server creates a short-lived avatar connection and returns only the token and an opaque handle. The browser never receives the Napster key. The avatar uses the closed tool list from `packages/shared/src/avatar-tools.ts`; tool output is validated in the browser and the person presses the final control. There is no other model, voice provider or fallback. If video fails, the client falls back to Napster text mode and then to the fixed tutorial script.

Microphone use requires explicit consent and a click. The server keeps no microphone audio. Event and guest data follow the access rules in `apps/api/src/domain/access.ts`; the avatar session applies the same gate as the event page.
