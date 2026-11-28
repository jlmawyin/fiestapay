# Somos Panas

**Somos Panas** gives every group of friends — *panas* — its own space to organize get-togethers, invite people and keep the plan clear. Each group gets a subdomain such as `tu-grupo.somospanas.com`; every meetup also gets its own address such as `cumpledemaria.somospanas.com`, with a numeric suffix when the name is already taken. A free address offers to create the meetup by conversation. The root portal doubles as the product presentation and supports day and night themes.

A **Napster avatar** welcomes people with a face and a voice. She introduces herself with her own name — Elena Navarro is the default — and never as “Pana”, which means “friend” in Ecuador. She explains the product, answers questions and guides the next step without taking the final action for the person.

## The three visitors

| Visitor | Where they arrive | What the avatar does |
| --- | --- | --- |
| **Public** | `somospanas.com` | Introduces Somos Panas, offers public events, and suggests creating a space or a meetup. |
| **Creator** | The root `/create` interview | Asks one question at a time (type, date, time, place, headcount, share), fills the draft with `fill_event_draft` and its `step`, and offers `suggest_avatars` by meetup tag. The person reviews and publishes. |
| **Guest** | The meetup subdomain | Greets them by the event name, shows the details and guides them to **Confirm attendance**; the person presses the button. |

Visitor type is decided on the server from the host, the account session and the event access rules — never from a browser-provided role.

## The avatar catalog

`contenido/avatares.json` holds **26 eligible avatars** with a display name, gender, preview, voice and one to three closed tags. Each non-default avatar has its own Spanish and English Napster agents, created by `scripts/napster/setup.mjs --catalog`; the default uses `NAPSTER_AGENT_ID_ES` / `NAPSTER_AGENT_ID_EN`.

- `GET /api/avatars` returns only ready entries and never agent ids.
- `suggest_avatars {tag}` is creator-only: the web highlights matching avatars and the person chooses.
- The organizer’s chosen avatar receives the guests. If the organizer also has a ready photo avatar, the photo wins.
- A guest’s `avatarId` from the browser never changes the meetup avatar; the priority is organizer photo, meetup choice, default.

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
- The avatar uses **nine** implicit tools with closed argument lists: `list_open_events`, `open_event`, `start_new_space`, `show_on_screen`, `fill_event_draft`, `draft_reminder`, `show_event_details`, `open_avatar_settings` and `suggest_avatars`. The model never supplies URLs or selectors.
- The avatar UI shows captions, microphone states, deduplicated chat messages and “Powered by Napster”.
- The organizer can upload their own photo with explicit consent. Napster creates a v1 companion and, when it is ready, event-specific agents greet guests with that face. The photo is deleted from our database once the avatar is ready.
- After publish, the web sends the system message `published`; the avatar reminds the organizer to save the administrator QR and offers an optional recovery email.
- FAQ collections exist in Spanish and English; an optional Napster knowledge base uses the two Markdown files served at `/conocimiento/somospanas.{es,en}.md`.

See [docs/NAPSTER.md](docs/NAPSTER.md) for every endpoint and file.

## Payments

- New meetups created from the root use provider `none`: the share is a **collection among friends**, there is no online checkout, and the guest finishes with **Confirm attendance**.
- The legacy FiestaPay host keeps **PayPal Sandbox** for historical events and the payment demos. No real money moves.
- Attendance and payment are separate states. The avatar never charges, refunds or confirms a payment.

## Run it locally

Requirements: Node.js 24, npm and PostgreSQL 16.

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL, PUBLIC_ORIGIN and the NAPSTER_* variables in .env.
npm run napster:diagnostico          # checks the Napster host and saves the avatar catalog
npm run napster:setup -- --companion <id> --voice <voice> --knowledge-base-url https://somospanas.com/conocimiento
npm run napster:setup -- --catalog   # creates the ES/EN agents for every catalog avatar
npm run dev
```

`npm run napster:setup -- --dry-run` prints the base plan without network calls; `--catalog --dry-run` does the same for the catalog. The web app runs at `http://localhost:5173`; the API runs on port 3000.

## Tests

```sh
npm run verificar
```

This validates `contenido/`, runs the Somos Panas map tests and then `npm run check` (lint, typecheck, full test suite and build). Integration tests need PostgreSQL 16 through `DATABASE_URL`; CI supplies it and the suite requires zero skipped tests.

## Relationship to FiestaPay

FiestaPay was the base project: fixed-share events, PayPal Sandbox, guests, RSVP and the legacy demo. **The entire Napster layer and the multi-tenant Somos Panas site — root portal, group spaces, meetup subdomains, site administration, the 26-avatar catalog, avatar sessions, tools, FAQ and knowledge — are new work built during Napster API Ignite.** The legacy FiestaPay host remains as the judges’ demo for the PayPal Sandbox flow.

## Documents

- [Napster integration](docs/NAPSTER.md)
- [Five-minute judge guide](docs/JUDGES.md)
- [Devpost draft](docs/DEVPOST_DRAFT.md)
- [Video script](docs/VIDEO_SCRIPT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [AI contribution disclosure](docs/AI_TOOLS.md)
