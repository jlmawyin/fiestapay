# Somos Panas

**Somos Panas** gives every group of friends — *panas* — its own space to organize get-togethers, invite people, and chip in with clear accounts. Each group gets a subdomain such as `tu-grupo.somospanas.com`; the root site at `somospanas.com` lists only the events their owners marked public.

A **Napster avatar** welcomes people with a face and a voice. It explains the product, answers questions and guides the next step without ever taking the final action for the person.

## The three visitors

| Visitor | Where they arrive | What the avatar does |
| --- | --- | --- |
| **Public** | `somospanas.com` | Introduces Somos Panas, offers public events, and suggests creating a space. |
| **Creator** | A group site or the legacy meetup flow | Guides the meeting step by step, fills the event draft and drafts reminders; the person reviews and publishes. |
| **Guest** | An event invitation link | Greets them by the event name and guides them to confirm attendance or review a contribution; the person presses the button. |

Visitor type is decided on the server from the host, the account session and the event access rules — never from a browser-provided role.

## How Napster is integrated

```text
Browser                    Fastify API                     Napster
   |  POST /api/avatar-session |                              |
   |-------------------------->| POST /public/agents/{id}/     |
   |                           |      connections              |
   |<--- token + handle -------|                              |
   |  Web SDK / WebSocket      |                              |
   |<=================== audio, video or text ===============>|
   |  implicit tool call ----->| validated in the browser     |
   |  final click: the person  |                              |
```

- The API key stays on the server. The browser receives only a short-lived connection token and an opaque handle.
- Video sessions use **WebRTC** with `videoPolicy: "deferred"`; if video is unavailable, the client falls back to a **Napster text session over WebSocket**.
- The avatar uses eight implicit tools with closed argument lists: `list_open_events`, `open_event`, `start_new_space`, `show_on_screen`, `fill_event_draft`, `draft_reminder`, `show_event_details`, `open_avatar_settings`. The model never supplies URLs or selectors.
- The organizer of a legacy meeting can upload their own photo with explicit consent. Napster creates a v1 companion and, when it is ready, event-specific agents greet guests with that face. The photo is deleted from our database once the avatar is ready.
- FAQ collections exist in Spanish and English; an optional Napster knowledge base uses the two Markdown files served at `/conocimiento/somospanas.{es,en}.md`.

See [docs/NAPSTER.md](docs/NAPSTER.md) for every endpoint and file.

## Run it locally

Requirements: Node.js 24, npm and PostgreSQL 16.

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL, PUBLIC_ORIGIN and the NAPSTER_* variables in .env.
npm run napster:diagnostico   # checks the Napster host and saves the avatar catalog
npm run napster:setup -- --companion <id> --voice <voice> --knowledge-base-url https://somospanas.com/conocimiento
npm run dev
```

`npm run napster:setup -- --dry-run` prints the plan without network calls. The web app runs at `http://localhost:5173`; the API runs on port 3000.

## Tests

```sh
npm run verificar
```

This validates `contenido/`, runs the Somos Panas map tests and then `npm run check` (lint, typecheck, full test suite and build). Integration tests need PostgreSQL 16 through `DATABASE_URL`; CI supplies it and the suite requires zero skipped tests.

## Relationship to FiestaPay

FiestaPay was the base project: fixed-share events, PayPal Sandbox, guests, RSVP and the legacy demo. **The entire Napster layer and the multi-tenant Somos Panas site — root portal, group spaces, site administration, avatar sessions, tools, FAQ and knowledge — are new work built during Napster API Ignite.** The legacy FiestaPay host remains as the judges' demo for the PayPal Sandbox flow.

Payments remain **PayPal Sandbox only**. No real money, escrow, Payouts or automatic message sending is claimed.

## Documents

- [Napster integration](docs/NAPSTER.md)
- [Five-minute judge guide](docs/JUDGES.md)
- [Devpost draft](docs/DEVPOST_DRAFT.md)
- [Video script](docs/VIDEO_SCRIPT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [AI contribution disclosure](docs/AI_TOOLS.md)
