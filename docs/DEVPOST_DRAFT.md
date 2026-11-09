# Devpost submission draft

**Draft only — not submitted.** Updated 9 November 2026 for production `f803ab3` (Gemini voice and text, live since 9 Nov ~09:10Z). Devpost closes **Thursday 12 November 2026, 15:00 ECT**. Jorge records the video and submits; nothing here has been published on his behalf. Items marked *(pending)* must be re-checked against production before they are pasted into Devpost.

## Project name

FiestaPay

## Elevator pitch

Talk to your party: a Gemini voice agent explains the invitation, prepares your share, and hands you a verified PayPal checkout — the server does the math, you approve the payment.

## Inspiration

A December meal with former schoolmates and another with former coworkers: getting everyone together was easy, settling who paid for what was not. A shared meal starts with one message and turns into a thread of repeated questions — where, when, how many, how much, and who already paid. FiestaPay answers those questions in one link and turns "I'll pay you later" into a verified PayPal payment.

## What it does

- An organizer creates a Meal, House party, Trip or Event invitation with a fixed share per person, keeps a private management link, and shares a public link (WhatsApp draft they control).
- Guests join with an alias, confirm attendance and companions, review a **server-calculated** amount and pay through **PayPal Orders v2 (sandbox)**. Attendance, payment and the organizer's confirmation are separate states; nothing is "paid" until the server verifies the capture.
- **Voice and text agents powered by Gemini.** A floating assistant offers *Type* or *Talk* in Spanish or English:
  - **Public agent** (home page): explains FiestaPay; no tools, no private data.
  - **Guest agent**: reads the invitation (`get_event_details`), the guest's status, the collection progress, proposes attendance for on-screen confirmation, and **prepares the payment** (`prepare_quote`): the server returns the amount in integer cents with status *pending approval*, and the screen shows **Approve in PayPal $25.00**. The agent can never charge, approve or claim a payment.
  - **Organizer agent**: summarizes the event, funding and roster with the organizer key.
- The organizer dashboard uses **AG Grid Community** (read-only grid of guests, payments and balances); a public **Judges demo** (`/demo`, also `?lang=en`) has sample data, a guided **Try a PayPal payment** walkthrough and the assistant.
- *(pending — deploy of PR "agentic")* **Describe your gathering in one sentence** ("BBQ for 10 on Saturday with $150") pre-fills the creation assistant — the server computes the per-person share — and **Draft reminders** writes editable WhatsApp reminders for guests who still owe money; the organizer sends them by hand.

## How we built it

React + Vite front end, Fastify API and PostgreSQL, deployed in isolated containers on a Contabo VPS behind Nginx and Cloudflare HTTPS.

**PayPal:** Orders v2 with intent CAPTURE, approval inside PayPal, server-side capture verification, signed webhooks and an idempotent ledger. Amounts are integer cents computed only on the server. One sandbox merchant receives all payments; no Payouts, split or escrow.

**Gemini (Google AI, paid API):**
- **Gemini Live API — `gemini-3.8-live`** (native audio) for real-time voice: the browser streams 16 kHz PCM from the microphone and plays 24 kHz audio back, with barge-in and live input/output transcription on screen. Voices *Kore* (Spanish) and *Puck* (English).
- The browser never sees the API key. After checking the voice lease (daily seconds, one active session, rate limit), the server mints a **single-use ephemeral token** that must open a session within 60 s and is **locked to the model and the full session configuration** (system instruction, voice, tools). Sessions last at most 120 s.
- **Function calling as the agentic layer:** Gemini asks for a tool, the browser relays the call to the role's server route, and the server re-checks session, role, event and lease before answering. Tools only read or prepare; payment approval stays with the person inside PayPal.
- **`gemini-3.5-flash`** powers the text assistants and the invitation theme suggestion, with the same tools, policy filters (never "paid" without a verified capture) and a deterministic rules fallback when the model is unavailable.

## Challenges

- A checkout approval is not a captured payment: returns from another tab, duplicate notifications and retries must converge on one ledger entry.
- Keeping the agent useful without letting it touch money: the model never sees or produces the amount; it calls a tool and repeats what the server says.
- Real-time voice in the browser: microphone resampling, playback queues and interruption, and a consent notice that names the real provider before any audio is sent.
- Securing a browser-to-Gemini connection without exposing the key (ephemeral tokens locked to the configuration).

## Accomplishments

- 822 automated tests (lint, type checks, build) green in CI with PostgreSQL; independent review of code and deployment operator.
- Real end-to-end Gemini checks before and after deployment: a guest asked by voice "How much do I have to pay? Please prepare my payment" and the agent called the event and quote tools, the server returned USD 25.00 pending approval, and the **Approve in PayPal** card appeared. These used a synthetic microphone in Chromium; Jorge's own phone test is a separate item.
- Earlier real sandbox campaign: USD 50 + USD 50 + USD 25 captures with exactly one ledger entry per order, and an automatic USD 1 refund when a funding minimum failed.

## What we learned

The model explains; the server calculates and verifies; the human approves. Precise states and clear boundaries build more trust than a confident answer.

## What's next

Organizer-specific PayPal accounts, more contribution modes and reminders on a schedule — only after the platform and approval work they require. They are not hackathon claims.

## Built with

TypeScript, React, Vite, Node.js, Fastify, PostgreSQL, PayPal Orders v2 + Webhooks (sandbox), Google Gemini API (Gemini Live `gemini-3.8-live`, `gemini-3.5-flash`, ephemeral tokens, function calling), AG Grid Community, Lucide icons, Docker, Nginx, Contabo, Cloudflare.

## Tools (models and services and how they are used)

| Tool | How FiestaPay uses it |
|---|---|
| PayPal Orders v2 (sandbox) | Create order (CAPTURE) from a server quote, buyer approval inside PayPal, server capture verification. |
| PayPal Webhooks | Signed notifications reconciled into an idempotent ledger. |
| Gemini Live API (`gemini-3.8-live`) | Real-time voice agents (public, guest, organizer) with function calling and live transcription. |
| Gemini ephemeral tokens | Single-use, short-lived browser credentials locked to model + configuration; the API key stays on the server. |
| Gemini API (`gemini-3.5-flash`) | Text assistants with the same tools; invitation theme suggestion; *(pending)* one-sentence event drafts and reminder wording. |
| AG Grid Community | Organizer dashboard and judges demo grid. |
| AI coding agents (development only) | Claude Code directed the work; Muse and DeepSeek Harness built packages; Antigravity (Gemini) verified independently. See `docs/AI_TOOLS.md`. |

---

## Versión en español (para referencia de Jorge)

**FiestaPay** — Habla con tu fiesta: un agente de voz con Gemini explica la invitación, prepara tu cuota y te entrega un pago de PayPal verificado; el servidor hace las cuentas y tú apruebas el pago.

- El organizador crea la invitación con cuota fija y comparte el enlace. Los invitados se unen con un alias, confirman asistencia y pagan con **PayPal Orders v2 (sandbox)**; nada cuenta como pagado hasta que el servidor verifica la captura.
- **Agentes de voz y texto con Gemini** (ES/EN): público (sin herramientas), invitado (consulta la invitación y su estado, propone asistencia y **prepara el pago**: el servidor calcula el importe en centavos y la pantalla muestra «Aprobar en PayPal $25.00») y organizador (resúmenes con su clave).
- Voz en tiempo real con **Gemini Live (`gemini-3.8-live`)** mediante **tokens efímeros** de un solo uso bloqueados al modelo y la configuración; la clave nunca llega al navegador. Texto con **`gemini-3.5-flash`** y respaldo por reglas.
- Panel del organizador con **AG Grid**; demo para jueces en `/demo`.

---

## Video script (≤ 2:45, record on the phone/desktop, English UI `?lang=en`, no music)

| Time | Screen | Narration (English) |
|---|---|---|
| 0:00–0:15 | Home page | "Organizing a shared meal is easy. Collecting everyone's share is not. FiestaPay turns one invitation link into verified PayPal payments — with a Gemini voice agent that helps every guest." |
| 0:15–0:40 | Create my invitation (wizard) *(if the one-sentence draft is live: type "BBQ for 10 on Saturday with $150", press Fill with AI)* | "The organizer creates an invitation with a fixed share per person. The server, not the AI, calculates every amount in cents." |
| 0:40–1:30 | Guest invitation → Join → Confirm attendance → open assistant → **Talk** → consent | Say: "How much do I have to pay? Please prepare my payment." Show the agent answering and the **Approve in PayPal $25.00** card. Narrate: "Gemini Live runs in the browser with a single-use ephemeral token. The agent calls our server tools, the server returns the amount, and the agent can only prepare — never approve — the payment." |
| 1:30–2:05 | Approve in PayPal → PayPal sandbox login (Jorge) → return → status Paid | "The guest approves inside PayPal. Only after the server verifies the capture does FiestaPay mark it as paid; a signed webhook keeps the ledger idempotent." |
| 2:05–2:30 | Organizer dashboard (AG Grid) *(and Draft reminders if live)* | "The organizer sees verified payments, balances and progress in AG Grid, and can ask the organizer agent for a summary." |
| 2:30–2:45 | Judges demo `/demo?lang=en` | "Everything runs in PayPal sandbox with no real money. Try it at fiestapay.somospanas.com/demo." |

Recording checklist: real microphone on the device; PayPal sandbox buyer from **Try a PayPal payment → View test account**; no secrets or organizer keys on screen; upload as public YouTube video under 3 minutes.

## Links and release gates

- Hosted demo: https://fiestapay.somospanas.com/ (English: `?lang=en`; judges: `/demo?lang=en`).
- Source: https://github.com/jlmawyin/fiestapay — MIT. Testing instructions: `docs/JUDGES.md`.
- Video: **not yet recorded** (Jorge, Wednesday 11 November).
- Test access: **Try a PayPal payment → View test account** reveals the shared fictional sandbox buyer; never publish Business/API credentials or organizer keys.
- Keep the service and test access available through the judging period.
