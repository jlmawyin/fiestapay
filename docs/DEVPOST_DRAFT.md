# Devpost submission draft

**Draft only — not submitted.** Based on source `8e13ae6` and the [29 October evidence](reviews/revalidation-20261029.md). Use the English narrative below only with the completed access/video gates at the end. Internal cutoff: 5 November 2026; functional delivery target: 31 October.

## Project name

FiestaPay

## Elevator pitch

Clear invitations, grounded AI guidance, and verified PayPal contributions for the gatherings people actually organize.

## Inspiration

A shared meal can begin with a simple message and turn into a long thread of repeated questions: where, when, how many people, how much, and who has paid. FiestaPay grew from the organizer's wish to use it for real gatherings. We focused the hackathon version on a single, understandable payment flow rather than adding physical contributions or several payment arrangements.

## What it does

An organizer creates a Meal, House party, Trip or Event invitation, reviews the details, and keeps a private management link. Guests use a separate public link and fictional demo aliases without Google sign-in. They confirm attendance and companions, review a server-calculated amount, and approve a PayPal sandbox checkout.

Attendance, payment and organizer confirmation are different states. Two people at USD 25 each owe USD 50; confirming attendance alone does not make that paid. The organizer sees verified contributions, paid/unpaid attendance and progress toward the event minimum. Sharing opens a WhatsApp draft that the organizer controls.

Guest and organizer assistants have distinct context and permissions. Text guidance uses event facts and server tools. AssemblyAI voice is implemented, but physical Spanish mobile acceptance and some voice-response verification are still pending; the demonstration must not present those as completed tests. Assistants cannot approve PayPal, change the recipient, confirm the gathering, or execute refunds.

## How we built it

The mobile-oriented React interface calls a Fastify API backed by PostgreSQL. PayPal Orders/capture verification and signed webhooks feed an idempotent ledger. Amounts are integer cents calculated on the server. Organizer management requires a separate secret key whose hash is stored server-side; optional verified recovery rotates that key.

The runtime text assistant uses OpenAI Responses, gpt-6-luna with low reasoning. AssemblyAI provides voice conversation transport. AG Grid Community supports the organizer view. The service runs in isolated containers on an Ubuntu Contabo VPS behind a dedicated Nginx host and Cloudflare HTTPS. Optional mail recovery uses Banahosting SMTP. Provider credentials remain server-side.

Codex coordinated development and integration. Claude, Grok, AGY and DeepSeek contributed in the roles recorded in [AI_TOOLS.md](https://github.com/jlmawyin/fiestapay/blob/codex/tester-fixes-20261028/docs/AI_TOOLS.md); their output was checked against source, tests and observed behavior. Tools used only for an installation probe are not presented as application implementation.

## Challenges

A checkout approval is not a captured payment. We had to reconcile external-tab returns, tolerate duplicate notifications and retries, and keep financial calculations out of the model. Another challenge was keeping a public invitation useful while preventing it from revealing organizer access or private payment lists.

Voice testing taught us to separate synthetic input and transport events from an actual complete response heard on a phone. An intermediate completion event can precede a tool continuation. We preserved inconclusive observations instead of counting them as successful conversations.

## Accomplishments

The approved source passed 426 automated tests with no skips, with PostgreSQL in CI, plus lint, type checks, build and 26 independent review checks. A real sandbox campaign verified USD 50 + USD 50 + USD 25 with one capture entry per order. A separate historical USD 1 case verified an automatic refund after a funding minimum failed. These are recorded operations, not fabricated provider responses or a claim that a judge's new session has already paid.

The latest browser matrix accepts 12 of 14 points, including corrected sharing text and contrast. Two assistant points remain partial because of voice limitations. We do not claim full acceptance, a physical phone test, a published video or completed submission.

## What we learned

Trust comes from precise states and clear boundaries. The assistant explains; the server calculates and verifies; the human approves. Independent evidence matters more than a generated success message. A small coherent flow is more useful than a long list of unverified features.

## What's next

Complete the remaining physical voice checks and human walkthrough, then produce a truthful short demonstration. For an independent version, explore organizer-specific PayPal accounts and more contribution modes only after the required product, platform and approval work. They are not implemented hackathon claims.

## Built with

TypeScript, React, Vite, Node.js, Fastify, PostgreSQL, PayPal sandbox, OpenAI Responses API, AssemblyAI Voice Agent API, AG Grid Community, Docker, Nginx, Contabo, Cloudflare HTTPS, Banahosting SMTP.

## Links and release gates

- Hosted demo: https://fiestapay.somospanas.com/
- Reviewed application source: [8e13ae6](https://github.com/jlmawyin/fiestapay/tree/8e13ae61b06e5463c3438a70736b09da3146a50c) — MIT; [repository](https://github.com/jlmawyin/fiestapay).
- Testing instructions: [JUDGES.md](https://github.com/jlmawyin/fiestapay/blob/codex/tester-fixes-20261028/docs/JUDGES.md); Spanish UI labels explained in English.
- Video: **not yet recorded or published**. Insert a verified public YouTube link only after recording, review and English narration/subtitle synchronization.
- Test access: sandbox buyers exist, but allocation and their approved private handoff to judges remain pending. Do not publish passwords/API keys in Git, this draft, logs, screenshots or chat. Do not claim checkout is self-service for judges until the handoff is complete.
- Verify a fresh invitation can be created during judging; old events expire 72 hours after their end. Keep the service and test access available through 15 December. This is an operational obligation, not evidence that future uptime is assured.

The [official rules](https://paypalaihackathon.devpost.com/rules), checked 29 October, call for a working PayPal-plus-AI project, public open-source repository, usable test access, and a public YouTube demonstration under three minutes with English materials or translation. The internal cutoff remains 5 November even though the official submission date is later. This document is a local draft, not a Devpost draft saved online or a submission receipt.
