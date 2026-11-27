# Napster integration

Napster is the only runtime AI in Somos Panas. There is no other model, voice provider or fallback. If video fails, the client falls back to a Napster text session and then to the fixed tutorial script.

## Connection and session endpoints

- **`POST /public/agents/{agentId}/connections`** — `apps/api/src/napster/client.ts` (`createConnection`).
  - Video: `{ channelType: "webrtc", externalClientProfile, initialSpeech }`.
  - Text: `{ channelType: "websocket", modality: "text", externalClientProfile, initialSpeech }`.
- **`DELETE /public/connections/{connectionId}`** — closes a session when the person leaves; called from `apps/api/src/routes/avatar-session.ts`.
- The server keeps the connection id; the browser receives only `{ token, handle, visitor, lang, agent }` (plus the server-decoded `socketUrl` in text mode).
- `externalClientProfile` contains only `visitorType`, `lang`, optional `eventTitle` and optional `siteName`. No names, emails, cookies or other personal data.
- `initialSpeech` is built per visitor and language from `contenido/avatar.json`: public welcome, creator guide, and guest greeting with `{evento}` and `{sitio}`.
- The browser uses `@touchcastllc/napster-companion-api` and its `init(getToken)` flow. The API key never reaches the browser.
- The WebRTC channel is configured with `PUT /public/agents/{agentId}/channels/webrtc` and `{ "videoPolicy": "deferred" }` by `scripts/napster/setup.mjs` and by the event-avatar agent creation.
- The web client sends section changes with `send_message` and `role: "system"`, `trigger_response: false`, so the avatar knows where the person is without interrupting.

## Visitor context and tools

`apps/api/src/napster/visitor.ts` decides `public`, `creator` or `guest` on the server:

- site admin of the current site -> creator;
- legacy host with `intent: "create"` -> creator;
- legacy event with a valid organizer key -> creator for that event panel;
- event link -> guest, after the same access gate as the event page;
- everything else -> public.

`packages/shared/src/avatar-tools.ts` defines eight implicit tools and the per-visitor allowlist:

| Visitor | Tools |
| --- | --- |
| Public | `list_open_events`, `open_event`, `start_new_space`, `show_on_screen` |
| Creator | `start_new_space`, `fill_event_draft`, `draft_reminder`, `show_on_screen`, `open_avatar_settings`, `list_open_events` |
| Guest | `show_event_details`, `show_on_screen`, `list_open_events` |

Every parameter object is closed with `additionalProperties: false`. `show_on_screen` accepts only ids from `packages/shared/src/ui-guide.ts` (`ROOT_UI_TARGETS` plus the existing UI targets). The web router validates the call and performs only the allowed UI action. The person always makes the final click; the avatar never publishes, pays, confirms, deletes or sends messages.

## FAQ and knowledge

- `scripts/napster/setup.mjs` creates two FAQ collections from `contenido/preguntas.json`: `somospanas-faq-es` and `somospanas-faq-en`, each assigned to its language agent (`POST /public/faqs`).
- The optional knowledge base is created with `POST /public/knowledge-bases` and two files are uploaded with `POST /public/knowledge-bases/{id}/files`: the public URLs of `somospanas.es.md` and `somospanas.en.md` under `/conocimiento/`. The knowledge provider value required by Napster is `azureOpenAI`; that is only the embedding provider name, not a runtime model.
- Both collections are attached to the base agents through `faqCollections` and `knowledgeBaseId`.

## Base agents and catalog

- `scripts/napster/setup.mjs` creates or updates `somospanas-es` and `somospanas-en` with `POST /public/agents` or `PATCH /public/agents/{id}`, using the instructions from `contenido/avatar.json`, the shared functions, the language and the chosen companion/voice.
- `scripts/napster/diagnostico.mjs` probes `GET /public/companions/napster-stock?pageSize=12` on the two documented hosts and saves the catalog in `.local/napster/catalogo.json` with `previewUrl`, `videoLoopUrl`, `ethnicity`, name and id. The director chooses the companion and voice; they are not hardcoded in source.

## Avatar from the organizer's photo

This flow is only for the legacy host, where organizers authenticate with the event key (`X-Fiesta-Admin-Key`).

1. `POST /api/events/:slug/avatar` requires `consent: true`, a first name and a JPEG/PNG data URL. The route validates magic bytes, a 5 MB decoded limit and a 7 MB body limit.
2. The photo is stored temporarily in `event_avatars.photo_bytes` (migration `0016_event_avatars.sql`) and served at `GET /media/avatar/{token}` with `Cache-Control: no-store`.
3. The server calls **`POST /public/companions`** with `version: "v1"`, the first name, a short Spanish description and the public `pictureUrl`.
4. `GET /public/companions/{id}` is polled at most once every 10 seconds. When the status is `readyToUse` or `completed`, the server reads each base agent with `GET /public/agents/{id}` and creates `somospanas-<event-slug>-es` / `-en` with `POST /public/agents`, copying voice, language, provider settings, functions, FAQ, knowledge and channel options. Each new agent gets the deferred WebRTC channel.
5. The event row is marked `ready`, the agent ids are stored and `photo_bytes` is cleared. The media URL then returns 404. `DELETE /api/events/:slug/avatar` deletes both Napster agents and the row, returning to the general avatar.
6. `POST /api/avatar-session` uses the event's custom agent when it is ready and reports `agent: "custom"`; otherwise it uses the base agent and reports `"default"`.

The same limit applies to 40 events with a custom avatar, keeping the organization below the 100-agent cap.

## Errors and limits

- `409 ConcurrentSessionLimitReached` -> HTTP 409 `avatar_busy` (at most 5 concurrent WebRTC sessions).
- `429 RequestRateLimitExceeded` -> the client honors `Retry-After`, waits at most 3 seconds and retries once; otherwise HTTP 429 `avatar_rate_limited`.
- `403 InactiveSubscription` -> HTTP 503 `avatar_no_credits`; missing key or disabled avatar -> 503 `avatar_disabled`; upstream failures -> 502 `avatar_upstream`.
- Connection creation is serialized process-wide to at least 1 request per second, with a small timer margin.
- The server never logs or returns the API key or connection token. `X-Api-Key` exists only in server-side requests.

## Relevant files

`apps/api/src/napster/client.ts`, `visitor.ts`, `profile.ts`; `apps/api/src/routes/avatar-session.ts`, `event-avatar.ts`; `apps/api/src/domain/event-avatars.ts`; `apps/api/src/db/migrations/0016_event_avatars.sql`; `packages/shared/src/avatar-session.ts`, `avatar-tools.ts`; `scripts/napster/setup.mjs`, `diagnostico.mjs`; `contenido/avatar.json`, `contenido/preguntas.json`, `contenido/conocimiento/`.
