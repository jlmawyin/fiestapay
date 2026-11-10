# FiestaPay implementation rules

Updated by Jorge's request on 10 Nov 2026 for the final hackathon stretch (Devpost deadline 12 Nov 2026 15:00 ECT; judges test 1–15 Dec 2026). These rules supersede the October plans (docs/ENCARGO_2026-10-28.md, docs/PLAN_DIARIO.md), which stay as history.

## Product direction

- FiestaPay is an **AI party host that collects everyone's share with PayPal**. AI belongs in the main path: one sentence builds the invitation, the agent explains and guides by voice or text, prepares the payment and drafts reminders.
- Runtime AI is **Gemini (Gemini Developer API, prepaid key)**: `gemini-3.5-flash` for text and `gemini-3.8-live` for real-time voice through single-use ephemeral tokens minted by the server (see docs/GEMINI.md). The key never reaches the browser. OpenAI and AssemblyAI remain only as configuration rollbacks. The Google Cloud USD 300 trial credit does not cover the Gemini Developer API; Vertex AI is not used (Live ephemeral tokens do not exist there).
- The interface is bilingual (Spanish/English) and follows `?lang`, then the saved preference, then the browser language.

## What agents may do in the product

- Agents **do the work and leave it ready; people make the final decision**. Allowed by text or voice: answer; build drafts on request (a whole invitation from one sentence, presentation, reminder texts) and fill the forms with them; prepare a payment (one server quote in integer cents + on-screen "Approve in PayPal") and take the guest to the payment step with the button highlighted; open allowed FiestaPay pages and highlight allowed elements (`show_on_screen`, closed lists in packages/shared/src/ui-guide.ts).
- The person always performs the final step: publish the invitation, confirm the quote review, approve in PayPal, confirm attendance or the event. Agents never pay, approve, refund, moderate, delete, send messages on someone's behalf, or press a final button. Model output is validated against closed lists; no model-supplied URLs or selectors.
- One active quote per guest: if a pending quote or order exists, the agent reuses it instead of creating another.
- Microphone use always needs the person's explicit consent and a click (browsers forbid starting audio on their own). If voice fails (token, connection or provider), the app falls back to the text chat on its own.
- Everything the person reads follows the selected language, including server-built summaries.
- WhatsApp: reminders are drafted by AI and sent by the organizer (copy or open WhatsApp). An agent inside WhatsApp (WhatsApp Business API) is future work, not in scope before the deadline.

## Money and PayPal (unchanged)

- Amounts come from the server in integer cents. No payment success without a server-verified capture. Attendance and payment are separate states. Fixed covers, fixed-price payments and one sandbox receiver; open funds, deposits and physical contributions stay out of scope.
- Never claim captured PayPal funds are held until organizer confirmation. Buyer Protection is subject to PayPal eligibility and terms. Do not change CAPTURE to AUTHORIZE or add escrow/Payouts/split payments.

## Testing, secrets and spending

- Tests for money, permissions and concurrency are required. Maximum three evaluated deliveries per defect across providers; then evidence and a new hypothesis.
- Real-provider tests only within Jorge's approved budget (Gemini: USD 10 total, logged in .local/coord/GEMINI-GASTO.md); measuring product metrics (accuracy, latency, cost per event) is an approved use of that budget. Sandbox only: no live funds or cards. No real WhatsApp or SMTP sends during tests without Jorge's explicit approval. Use isolated fixtures and preserve historical payments and Jorge's tester event.
- Production data is deleted or archived only with Jorge's explicit approval of the exact items, after a backup; prefer archiving to permanent deletion.
- Keys, prepaid AI balance and daily AI limits must stay active through the judging period (until 15 Dec 2026).
- No secrets in Git, logs, browser, reports or reviewer prompts. No real judge data.
- Do not claim live APIs, human tests, phone tests, video or submission passed without evidence.

## Delivery and operations

- Standing approval (Jorge, 9 Nov 2026) to merge and deploy without asking when all hold: CI green, independent AGY approval of the code and of the operator kit, backup with test restore, zero migrations, zero secret matches, smoke test, and rollback if anything fails. Deploy only through the operator kit; never change other Contabo apps, the DNS apex or global proxy defaults.
- No code freeze (Jorge, 10 Nov 2026): keep improving and deploying with the standing approval above until the Devpost submission; record the video on the deployed version. Video and Devpost submission are Jorge's; never publish on his behalf.
- Public docs stay judge-facing in English (README, docs/JUDGES.md, docs/DEVPOST_DRAFT.md, docs/VIDEO_SCRIPT.md, docs/GEMINI.md, docs/API.md, docs/ARCHITECTURE.md); internal reports and Spanish working notes live under docs/internal/.
- Use graph discovery first and check coverage; docs and new files may need exact source fallback.

## Agent routing (dirigir-agentes)

- One active director (Claude or Codex). Builders: Muse and DSH, at most two construction fronts with disjoint ownership; AGY Gemini Flash verifies independently; AGY Gemini 4 Argon handles recovery. Grok is retired. OpenCode free usage is exhausted and its paid balance is reserved for emergencies; do not migrate DSH to a paid API automatically.
- Workers never commit or push, never revert others and never edit outside their assigned paths. Changing providers does not reset attempt counters (see dirigir-agentes/references/deepseek.md for DSH).
