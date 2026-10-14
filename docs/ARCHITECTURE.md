# Architecture

The same-origin React interface calls a Fastify API backed by PostgreSQL. Cloudflare fronts a dedicated Nginx virtual host on Contabo. The database has no published port. API and database have independent containers and persistent storage isolated from other applications.

```mermaid
flowchart LR
  Browser[Mobile browser] --> CF[Cloudflare HTTPS]
  CF --> Nginx[FiestaPay virtual host]
  Nginx --> API[Fastify API]
  API --> DB[(PostgreSQL)]
  API --> PayPal[PayPal sandbox]
  API --> Gemini[Gemini function calling]
  Browser --> Voice[AssemblyAI voice WebSocket]
  Voice --> Browser
  Browser -->|authorized tool request| API
```

Sessions use an opaque HttpOnly cookie; only its hash is stored. Organizer access is scoped to the creating session. Public invitations expose event information and the caller's own attendance, never another guest's payment details. Reset archives the prior generation; payment references remain associated with the historical event.

Money is integer USD cents calculated on the server. RSVP, payment ledger and organizer confirmation are separate concepts. Event-row locks serialize capacity changes. PayPal request IDs and unique ledger entries provide retry convergence. See financial review records and tests for the current validated behavior; code availability alone does not establish acceptance.

Chat and voice use the same tool dispatcher. Model output is untrusted. Tools cannot choose a merchant, alter a price, approve a PayPal transaction or confirm an event. Proposed RSVP changes and quotes require human confirmation. The voice API issues only short-lived provider tokens after consent and an atomic database reservation against the shared daily voice budget.

Browser audio is sent directly to AssemblyAI with a temporary token; server keys never reach the browser. FiestaPay does not persist microphone audio. Chat history is stored per event/session. Do not enter personal information; use fictional demo aliases.
