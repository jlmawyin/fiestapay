# Devpost submission draft

## Somos Panas — a Napster avatar that hosts your group

**The problem.** Group plans die in scattered chats. “Let’s do dinner” gets buried, and the money question arrives too late. Event tools feel like forms; they do not welcome people or explain the next step.

**What it does.** Somos Panas gives every group of friends a space on a subdomain. Every meetup gets its own address, such as `cumpledemaria.somospanas.com`, with a numeric suffix if the name is taken. A free address offers to create the meetup by conversation.

A Napster avatar greets every visitor with a face and a voice and introduces herself by her own name; Elena Navarro is the default. “Pana” means “friend” in Ecuador and is never the assistant’s name.

Public visitors learn the product. The creator answers a one-question-at-a-time interview for type, date, time, place, headcount and share. `fill_event_draft` fills the draft and highlights its `step`; the avatar asks “Does that look right? Shall I continue?”. `suggest_avatars {tag}` highlights suitable avatars from the 26-avatar catalog; the organizer chooses who receives the guests and publishes personally. After the system message `published`, the avatar reminds them to save the administrator QR and offers an optional recovery email. The guest arrives at the meetup subdomain, hears the event name and finishes with **Confirm attendance**. New meetups are a collection among friends with no online checkout; only the legacy historical host keeps PayPal Sandbox. A consented photo avatar wins over the catalog choice.

**How it uses the Napster API.** The server creates sessions with `POST /public/agents/{agentId}/connections`, using WebRTC for video and WebSocket with `modality: "text"` for the text fallback. It sends a small `externalClientProfile` and a per-visitor `initialSpeech`. The browser uses `@touchcastllc/napster-companion-api`; a short-lived single-use token is the only credential it sees. It has 26 avatars with Spanish and English agents, created by `setup.mjs --catalog`: 2 base + 50 catalog + up to 30 photo agents = 82 of 100.

The avatar has nine implicit tools with closed schemas and per-visitor allowlists. The web validates every call and the person presses the final control. The UI shows captions, deduplicated chat and microphone states. `POST /public/companions` and `GET /public/companions/{id}` power the photo avatar; `POST /public/agents` creates the event agents. The integration handles `409`, `429` with `Retry-After` and `403`, serializes connections to one per second, and closes sessions with `DELETE /public/connections/{id}`. The API key never reaches the browser.

**What is new during Ignite.** FiestaPay was the base project. The entire Napster layer, the multi-tenant site, the root portal, group spaces, meetup subdomains, 26-avatar catalog, sessions, tools, FAQ, knowledge and photo avatar are new work built for this hackathon. The legacy host remains the PayPal Sandbox demo; no real money moves.

**Built with AI agents under the direction of Jorge.** Claude Opus acted as director. Muse and DeepSeek Harness built the web and server work under his direction. The runtime AI in the product is Napster.

<!-- Word count of the summary above (excluding headings): 473 words. -->
