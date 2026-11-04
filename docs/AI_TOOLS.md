# AI contribution disclosure

- **Codex:** architecture, shared API contract, integration, deployment, provider checks, test evaluation and release coordination. Jorge makes product decisions and supplies accounts.
- **Claude Code (Opus, high):** API implementation, PostgreSQL model, PayPal adapter, reconciliation and tests; subsequent fixes based on independent findings.
- **Antigravity / Gemini 3.8 Flash High:** React interface, original SVG covers, mobile flows and browser voice integration.
- **Antigravity / Claude Opus 5.5 High:** independent review of money, idempotency and concurrency. Review findings are evaluated by Codex, not treated as proof of correctness.
- **Grok 4.7, highest configured reasoning:** adversarial review of authorization, reset boundaries and AI consumption controls; integration of the OpenAI migration and webhook signature correction under `dirigir-agentes`.
- **DeepSeek Harness:** later recovery of WhatsApp logistics, assistant guidance, funding facts and contrast, independently reviewed by AGY. On 4 November it completed factual privacy and refund wording after OpenCode reported exhausted free usage, preserving the same task counter. Command permission failures were not bypassed.
- **OpenCode / DeepSeek V4.1 Flash Free:** constructed the 4 November public voice/session lifecycle and initial chat presentation changes in isolated artifacts made from explicitly selected, non-secret source snapshots. Its active MCP could not access the product checkout directly. Codex checked base hashes before integrating the proposed changes, with independent AGY source review; artifact tests and source acceptance do not establish physical phone audio or deployment. This is a development tool, not a runtime component.
- **OpenAI API (`gpt-6-luna`, low reasoning):** the only runtime text assistant, through Responses API function calling. A missing key, timeout, or provider error keeps the manual forms available. There is no second runtime model.
- **AssemblyAI Voice Agent API:** runtime speech conversation and client-side tool calls routed to authorized server handlers.

FiestaPay is a new project. Its voice transport approach reuses lessons and protocol patterns from Jorge's previous **Sparring** project, including sending `session.update` before waiting for `session.ready`, PCM16 mono audio at 24 kHz and interruption cleanup. The event/payment product, database and authorization model are new.

No generated narration, fake provider adapter or prerecorded flow is presented as a successful live integration. Final submission materials must describe only features verified on the frozen release.
