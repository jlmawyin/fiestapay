# Napster integration

Napster is the only runtime AI in Somos Panas. There is no other model, voice provider or fallback. If video fails, the client falls back to a Napster text session and then to the fixed tutorial script.

## Connection and session endpoints

- **`POST /public/agents/{agentId}/connections`** — `apps/api/src/napster/client.ts` (`createConnection`).
  - Video: `{ channelType: "webrtc", externalClientProfile, initialSpeech }`.
  - Text: `{ channelType: "websocket", modality: "text", externalClientProfile, initialSpeech }`.
- **`DELETE /public/connections/{connectionId}`** — closes a session when the person leaves; called from `apps/api/src/routes/avatar-session.ts`.
- The server keeps the connection id; the browser receives only `{ token, handle, visitor, lang, agent, avatar? }` (plus the server-decoded `socketUrl` in text mode).
- `externalClientProfile` contains only `visitorType`, `lang`, optional `eventTitle` and optional `siteName`. No names, emails, cookies or other personal data.
- `initialSpeech` is built per visitor and language from `contenido/avatar.json`: public welcome, creator guide, and guest greeting with `{avatar}`, `{evento}` and `{sitio}`. The assistant always presents herself with her avatar’s first name, never as “Pana”.
- The browser uses `@touchcastllc/napster-companion-api` and its `init(getToken)` flow. The API key never reaches the browser.
- The WebRTC channel is configured with `PUT /public/agents/{agentId}/channels/webrtc` and `{ "videoPolicy": "deferred" }` by `scripts/napster/setup.mjs` and by the event-avatar agent creation.
- The web client sends section changes with `send_message` and `role: "system"`, `trigger_response: false`, so the avatar knows where the person is without interrupting. After publish it sends `published`, which makes the avatar remind the organizer about the administrator QR and the optional recovery email.

## Visitor context and tools

`apps/api/src/napster/visitor.ts` decides `public`, `creator` or `guest` on the server:

- site admin of the current site -> creator;
- root or legacy host with `intent: "create"` -> creator;
- legacy event with a valid organizer key -> creator for that event panel;
- event link or event host -> guest, after the same access gate as the event page;
- everything else -> public.

`packages/shared/src/avatar-tools.ts` defines **nine** implicit tools and the per-visitor allowlist:

| Visitor | Tools |
| --- | --- |
| Public | `list_open_events`, `open_event`, `start_new_space`, `show_on_screen` |
| Creator | `start_new_space`, `fill_event_draft`, `draft_reminder`, `show_on_screen`, `open_avatar_settings`, `list_open_events`, `suggest_avatars` |
| Guest | `show_event_details`, `show_on_screen`, `list_open_events` |

Every parameter object is closed with `additionalProperties: false`. `fill_event_draft` accepts an optional `step` from the closed draft sections (`template`, `date`, `startTime`, `location`, `headcount`, `perPersonCents`), so the interview can highlight that section. `suggest_avatars` accepts one tag from the closed `AVATAR_TAGS` list (`fiesta`, `karaoke`, `musica`, `comida`, `reunion`, `deportes`, `ejercicio`, `playa`, `viajes`, `navidad`, `recaudacion`, `estudio`, `cultura`, `eventos`); the web highlights matches and the person chooses. `show_on_screen` accepts only ids from `packages/shared/src/ui-guide.ts`. The person always makes the final click; the avatar never publishes, pays, confirms, deletes or sends messages.

## Catalog and agents

`contenido/avatares.json` holds **26 eligible avatars** with `id`, `firstName`, `displayName`, `gender`, `companionId`, `previewUrl`, `voice`, one to three `tags`, optional `loopUrl`, and `agentIdEs` / `agentIdEn`. Elena Navarro is the only `default`; the default’s agents come from `NAPSTER_AGENT_ID_ES` / `NAPSTER_AGENT_ID_EN` and are never written into the JSON.

- `GET /api/avatars` returns only entries with ready agents (the default is always ready) as `{id, firstName, displayName, gender, previewUrl, loopUrl, tags, default}`. It never returns agent ids.
- `scripts/napster/setup.mjs` creates or updates the base `somospanas-es` and `somospanas-en` agents with `POST /public/agents` or `PATCH /public/agents/{id}`.
- `scripts/napster/setup.mjs --catalog` copies each non-default base agent into `somospanas-avatar-<id>-es` / `-en`, changing companion, voice and the assistant name in the instructions. It is idempotent, counts the organization’s agents first and aborts before exceeding 95; `--list-voices` reports whether Napster exposes a voice list. The 25 non-default avatars need 50 agents.
- `scripts/napster/diagnostico.mjs` probes `GET /public/companions/napster-stock?pageSize=12` and saves the catalog in `.local/napster/catalogo.json` with `previewUrl`, `videoLoopUrl`, `ethnicity`, name and id.
- The custom-avatar flow is limited to **15 event photos**: 2 base agents + 25 catalog avatars × 2 + 15 photos × 2 = 82 agents, below Napster’s 100-agent limit.

## Avatar choice for a meetup

- `POST /api/events` accepts an optional `avatarId` that must exist and have ready agents; otherwise it returns `400 avatar_unknown`.
- `PUT /api/events/:slug/avatar-choice` with `X-Fiesta-Admin-Key` changes `events.avatar_id`; `{avatarId:null}` restores the default.
- Guest priority in `POST /api/avatar-session` is: (a) a ready organizer photo avatar, (b) `events.avatar_id`, (c) the default. A browser `avatarId` never changes a guest’s avatar.
- The response includes `avatar: {id, firstName, previewUrl}`; a custom photo returns `{id:"event", firstName, previewUrl:null}`. Agent ids never leave the server.

## FAQ and knowledge

- `scripts/napster/setup.mjs` creates two FAQ collections from `contenido/preguntas.json`: `somospanas-faq-es` and `somospanas-faq-en`, each assigned to its language agent (`POST /public/faqs`).
- The optional knowledge base is created with `POST /public/knowledge-bases` and two files are uploaded with `POST /public/knowledge-bases/{id}/files`: the public URLs of `somospanas.es.md` and `somospanas.en.md` under `/conocimiento/`.
- Both collections are attached to the base agents through `faqCollections` and `knowledgeBaseId`.

## Organizer photo avatar

The organizer authenticates with the event key (`X-Fiesta-Admin-Key`). The route accepts the root host, the legacy host and the meetup's own event host.

1. `POST /api/events/:slug/avatar` requires `consent: true`, a first name and a JPEG/PNG data URL. The route validates magic bytes, a 5 MB decoded limit and a 7 MB body limit.
2. The photo is stored temporarily in `event_avatars.photo_bytes` (migration `0016_event_avatars.sql`) and served at `GET /media/avatar/{token}` with `Cache-Control: no-store`.
3. The server calls **`POST /public/companions`** with `version: "v1"`, the first name, a short Spanish description and the public `pictureUrl`.
4. `GET /public/companions/{id}` is polled at most once every 10 seconds. When the status is `readyToUse` or `completed`, the server reads each base agent with `GET /public/agents/{id}` and creates `somospanas-<event-slug>-es` / `-en` with `POST /public/agents`, copying voice, language, provider settings, functions, FAQ, knowledge and channel options. Each new agent gets the deferred WebRTC channel.
5. The event row is marked `ready`, the agent ids are stored and `photo_bytes` is cleared. The media URL then returns 404. `DELETE /api/events/:slug/avatar` deletes both Napster agents and the row, returning to the general avatar.
6. `POST /api/avatar-session` uses the event’s custom agent when it is ready and reports `agent: "custom"`; otherwise it uses the meetup choice or the default.

## UI behavior

- Video shows live captions; text mode keeps the same conversation in a readable list.
- Consecutive duplicate or JSON-only messages are filtered, and the chat list has a bounded size.
- The microphone button exposes ready, listening, processing, denied and error states; it requires an explicit consent click and shows a retry path when permission is denied.
- The interface displays “Powered by Napster”.
- The root portal has day and night themes and serves as the product presentation.

## Errors and limits

- `409 ConcurrentSessionLimitReached` -> HTTP 409 `avatar_busy` (at most 5 concurrent WebRTC sessions).
- `429 RequestRateLimitExceeded` -> the client honors `Retry-After`, waits at most 3 seconds and retries once; otherwise HTTP 429 `avatar_rate_limited`.
- `403 InactiveSubscription` -> HTTP 503 `avatar_no_credits`; missing key or disabled avatar -> 503 `avatar_disabled`; upstream failures -> 502 `avatar_upstream`.
- Unknown or unready catalog ids -> 400 `avatar_unknown`.
- Connection creation is serialized process-wide to at least 1 request per second, with a small timer margin.
- The organization stays at 82 agents with the 26-avatar catalog and 15 event photos.
- The server never logs or returns the API key or connection token. `X-Api-Key` exists only in server-side requests.

## Relevant files

`apps/api/src/napster/client.ts`, `catalog.ts`, `visitor.ts`, `profile.ts`; `apps/api/src/routes/avatar-session.ts`, `avatars.ts`, `event-avatar.ts`; `apps/api/src/domain/event-avatars.ts`; `apps/api/src/db/migrations/0016_event_avatars.sql`, `0018_event_avatar_choice.sql`; `packages/shared/src/avatar-session.ts`, `avatar-tools.ts`, `avatar-tags.ts`; `scripts/napster/setup.mjs`, `diagnostico.mjs`; `contenido/avatar.json`, `avatares.json`, `preguntas.json`, `conocimiento/`.
