# Devpost submission draft

## Somos Panas — a Napster avatar that hosts your group

**The problem.** Group plans die in scattered chats. Someone says “let’s do dinner,” the details get buried, and the money question arrives too late. Existing event tools feel like accounting forms; they do not welcome people or explain what to do next.

**What it does.** Somos Panas gives every group of friends its own space on a subdomain. The public homepage lists only events their owners marked public. A Napster avatar greets each visitor with a face and a voice:

- **Public:** introduces Somos Panas, shows open events and offers to create a space.
- **Creator:** guides a meeting step by step, fills the event draft and drafts reminders; the person reviews and publishes.
- **Guest:** greets people by the event name and guides them to confirm attendance or review a contribution.

The organizer of a legacy meeting can upload their own photo with explicit consent. Napster generates a v1 companion; once it is ready, event-specific agents welcome guests with the organizer’s face. The photo is deleted from our database after generation.

**How it uses the Napster API.** The server creates sessions with `POST /public/agents/{agentId}/connections`, using WebRTC for video and WebSocket with `modality: "text"` for the text fallback. It sends a small `externalClientProfile` (visitor type, language, event title and site name) and a per-visitor `initialSpeech`. The browser uses `@touchcastllc/napster-companion-api` with `videoPolicy: "deferred"`; a short-lived token is the only credential it sees. The avatar has eight implicit tools with closed schemas; the web client validates each call, and the person always presses the final control. Section changes are sent as `send_message` with `role: "system"` and `trigger_response: false`. Spanish and English FAQ collections are attached to their agents, with an optional knowledge base built from two public Markdown files. `POST /public/companions` and `GET /public/companions/{id}` power the custom photo avatar, then `POST /public/agents` creates the event agents. The integration handles `409` concurrency, `429` with `Retry-After`, `403` for no credits, serializes connection creation to one per second, and closes sessions with `DELETE /public/connections/{id}`. The API key never reaches the browser.

**What is new during Ignite.** FiestaPay was the base project. The entire Napster layer, the multi-tenant Somos Panas site, the root portal, group spaces, avatar sessions, tools, FAQ, knowledge and custom photo avatar are new work built for this hackathon. The legacy FiestaPay host remains the PayPal Sandbox demo; no real money moves.

**Built with AI agents under the direction of Jorge.** Claude Opus acted as director. Muse and DeepSeek Harness built the web and server work under his direction. The only runtime AI in the product is Napster.

**Stack:** TypeScript, React, Vite, Node.js, Fastify, PostgreSQL, Napster Omniagent.

<!-- Word count of the summary above (excluding headings): 436 words. -->
