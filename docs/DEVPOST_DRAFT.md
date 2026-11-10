# Devpost submission draft

**Draft only — not submitted.** Updated 10 November 2026 against the current source and verified evidence. The video is [[VIDEO_URL]] and the Devpost project URL is [[DEVPOST_URL]]; both are placeholders until Jorge records and submits. Measured results say when they were measured; source behavior is not presented as a production measurement.

## Project name

FiestaPay

## Elevator pitch

An AI party host that turns one invitation into a verified PayPal payment: the agent explains, prepares and guides — the server does the math, the person approves in PayPal, and only a verified capture counts as paid.

## Inspiration

A December meal with former schoolmates and another with former coworkers: getting everyone together was easy, settling who paid for what was not. A shared meal starts with one message and turns into a thread of repeated questions — where, when, how many, how much, and who already paid. FiestaPay answers those questions in one link and turns “I'll pay you later” into a verified PayPal payment.

## What it does

- An organizer creates a **Meal**, **House party**, **Trip** or **Event** invitation with a fixed share per person, keeps a private organizer link and shares a separate public link.
- **The AI builds the party.** In the public chat, a sentence such as **“Build a BBQ for 10 at $15 each”** returns a complete proposal card: type, people, server-computed share per person, date and place. **Review in Create** hands the whole proposal to the creation wizard; the organizer reviews and edits it and presses **Publish** once, manually. The creation wizard also offers **Describe your invitation in one sentence** → **Fill with AI** (`POST /api/ai/draft-event`) and **Suggest with AI** for a cover and theme. The organizer decides everything before publication.
- **AI-drafted reminders.** The organizer can draft a reminder in a friendly, funny or formal tone, then copy it or open it in WhatsApp and send it personally. FiestaPay never sends automatically.
- Guests join with an alias, confirm attendance and companions, review a **server-calculated** amount and pay through **PayPal Orders v2 (sandbox)**. Attendance, payment and the organizer's confirmation are separate states; nothing is “paid” until the server verifies the capture.
- **Gemini agents in text and real-time voice, in Spanish or English**:
  - **Public agent** (home page and judges demo): the text chat has one tool, `draft_invitation`, which prepares the proposal card without creating or publishing; **Review in Create** is the person's decision. Its replies can link to existing on-screen labels and the **Guided tour**. Voice has `show_on_screen`, which opens FiestaPay pages, highlights controls and can leave a spoken party sentence in Create for the person to press **Fill with AI**. It never clicks, publishes, pays or creates.
  - **Guest agent**: reads the invitation (`get_event_details`), the guest's status (`get_my_status`) and the collection progress (`get_collection_progress`), proposes attendance for on-screen confirmation (`propose_rsvp`), and **prepares the payment** (`prepare_quote`). The server returns the amount in integer cents with status *pending approval*, and the screen shows **Approve in PayPal $X**. Its voice guide can highlight the quote and payment controls but never presses them. The agent can never charge, approve or claim a payment. RSVP remains separate from payment.
  - **Organizer agent**: read-only progress, who still owes, and reminder drafts.
- The organizer dashboard uses **AG Grid Community**: quick search, **Pending only**, CSV export, highlighted rows and a totals row calculated by the server. A separate public **Judges demo** (`/demo`, also `?lang=en`) has sample data, the guided **Try a PayPal payment** walkthrough and the assistant.
- **Bilingual ES/EN** with a header selector, `?lang=en`, and browser-language detection. Event times stay in America/Guayaquil and amounts stay in USD.

## What makes FiestaPay different

- **SarafuPay** centers the conversation on WhatsApp and also offers a web page and checkout ([SarafuPay on Devpost](https://devpost.com/software/sarafupay)). FiestaPay does not claim to be the only product with a web checkout or with WhatsApp in the flow; its focus is an AI host that builds the invitation, prepares a server quote and guides the person to a verified PayPal Sandbox capture while the person keeps every final action.
- **Partiful** separates Ticketing from Chip In. Its help page states that Ticket Sales independently verify payment, while **Chip In** asks the organizer to confirm receipt outside the product ([Partiful help](https://help.partiful.com/en-us/articles/15525466-do-you-independently-verify-that-guests-have-paid)). FiestaPay's contrast is scoped to that distinction: it verifies the PayPal capture server-side for the fixed share, keeps attendance and payment as separate states, and does not claim that Partiful never verifies anything.
- The common thread is factual, not a slogan: FiestaPay puts the AI in the invitation and payment-preparation path, but money moves only through a person-approved, server-verified PayPal Sandbox capture — no escrow, automatic promise-based refunds, Buyer Guarantee claim or live money.

## How we built it

React + Vite front end, Fastify API and PostgreSQL, deployed in isolated containers on a Contabo VPS behind Nginx and Cloudflare HTTPS.

**PayPal.** Orders v2 with intent `CAPTURE`, approval inside PayPal, server-side capture verification, signed webhooks (`verify-webhook-signature`) and an idempotent ledger. Amounts are integer cents computed only on the server. One sandbox Business merchant receives all payments; there is no Payouts, split, escrow or fund holding.

**Gemini (Google AI, paid API).**

- **Gemini Live API — `gemini-3.8-live`** for real-time voice with native audio, barge-in, live transcription and function calling. Spanish voice *Kore*; English voice *Puck*.
- The browser never sees the API key. The server checks the voice lease and mints a **single-use ephemeral token** that must open a session within 60 seconds and is locked to the model and the full session configuration (system instruction, voice, tools, transcription). Voice sessions last at most 120 seconds.
- **Function calling is the agentic layer.** Gemini asks for a tool; the browser relays the call to the role's server route; the server re-checks session, role, event and lease before answering. Tools only read or prepare. Payment approval stays with the person inside PayPal.
- **`gemini-3.5-flash`** powers the text assistants, the invitation draft and the theme suggestion, with the same role-scoped tools, policy filters (never “paid” without a verified capture) and a deterministic rules fallback when the model is unavailable.
- **Limits:** 200 AI queries per day in total, 60 per session; voice at most 120 seconds per session; 25 seconds per call and 40 seconds per query.

**AG Grid Community.** Quick search, **Pending only**, CSV export, highlighted rows and a server-calculated totals row, shared by the organizer dashboard and the read-only judges demo.

## Challenges

- A checkout approval is not a captured payment: returns from another tab, duplicate notifications and retries must converge on one ledger entry.
- Keeping the agent useful without letting it touch money: the model never sees or produces the amount; it calls a tool and repeats what the server says.
- Real-time voice in the browser: microphone resampling, playback queues, interruption, and a consent notice that names the real provider before any audio is sent.
- Securing a browser-to-Gemini connection without exposing the key: single-use ephemeral tokens locked to the full configuration.
- Making a bilingual demo safe for judges: demo records are marked on the server, kept apart from a visitor's own invitations, and resettable without touching anyone else's data.

## Accomplishments

- Automated PostgreSQL integration tests and web tests run in CI alongside lint, type checks and builds.
- A complete sandbox path from a server quote to buyer approval in PayPal to a server-verified **Paid** state, with an idempotent ledger and signed webhooks.
- A production AI party builder: one sentence becomes a filled invitation, with cover and theme suggestions and AI-drafted reminders.
- A judge-facing demo that opens with the AI working, keeps all data fictional, and leads to a real PayPal Sandbox checkout.
- **Measured AI draft quality (10 Nov 2026):** `POST /api/ai/draft-event` answered 10/10 AI drafts (5 English, 5 Spanish), with 43 of 44 expected fields correct (97.7 %: type, people, server-computed share per person, start time and place); median latency ≈ 2.0 s and p90 ≈ 3.0 s. The voice guide navigated and highlighted its target in 4 of 5 real Gemini Live sessions (the miss was a synthetic-test-audio artifact).
- **Measured guest quotes (10 Nov 2026).** In 10 guest-chat turns on one isolated demo event (5 EN, 5 ES), 8 returned a quote and all 8 matched the expected cents. One reply omitted a quote and one returned HTTP 503. Median latency was 3.83 s across all turns (p90 4.60 s). Gemini usage was estimated at $0.18 for the event's 10 turns (about $0.018 per turn, 18 of 19 provider requests metered).

## What we learned

The model explains; the server calculates and verifies; the human approves. Precise states and clear boundaries build more trust than a confident answer. A good agent is not one that does everything — it is one that knows exactly what it must hand back to the person.

## What's next

A **WhatsApp Business agent** is the natural next surface: guests already coordinate in WhatsApp, so the same role-scoped tools could answer, prepare a quote and hand off to PayPal there. After that: organizer-specific PayPal accounts, scheduled reminders and more contribution modes — only once the platform and approval work they require exist. These are not hackathon claims.

## Built with

TypeScript, React, Vite, Node.js, Fastify, PostgreSQL, PayPal Orders v2 + Webhooks (sandbox), Google Gemini API (Gemini Live `gemini-3.8-live`, `gemini-3.5-flash`, ephemeral tokens, function calling), AG Grid Community, Lucide icons, Docker, Nginx, Contabo, Cloudflare.

## Tools (models and services and how they are used)

| Tool | How FiestaPay uses it |
|---|---|
| PayPal Orders v2 (sandbox) | Create order (`CAPTURE`) from a server quote, buyer approval inside PayPal, server capture verification. |
| PayPal Webhooks | Signed notifications reconciled into an idempotent ledger. |
| Gemini Live API (`gemini-3.8-live`) | Real-time voice agents (public, guest, organizer) with function calling and live transcription. |
| Gemini ephemeral tokens | Single-use, short-lived browser credentials locked to model + configuration; the API key stays on the server. |
| Gemini API (`gemini-3.5-flash`) | Text assistants with the same tools; one-sentence invitation draft; cover and theme suggestions; reminder wording. |
| AG Grid Community | Organizer dashboard and judges demo grid. |
| AI coding agents (development only) | Claude Code directed the work; Muse and DeepSeek Harness built packages; Antigravity (Gemini) verified independently. See [AI_TOOLS.md](AI_TOOLS.md). |

## Links and submission gates

- Hosted demo: https://fiestapay.somospanas.com — English: `?lang=en`; judges demo: https://fiestapay.somospanas.com/demo?lang=en
- Source: https://github.com/jlmawyin/fiestapay — MIT. Judge instructions: [JUDGES.md](JUDGES.md).
- Video: [[VIDEO_URL]] — script in [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md).
- Devpost: [[DEVPOST_URL]] — **not submitted yet**.
- Test access: **Try a PayPal payment → Show test account** reveals the shared fictional sandbox buyer. Never publish Business/API credentials or organizer keys.
- Keep the service and test access available through the judging period.

Still not claimed: real-money payments, automatic WhatsApp sending, a new physical-phone payment test, a published video or a completed Devpost submission. All payments are PayPal Sandbox.
