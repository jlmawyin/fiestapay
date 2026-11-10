# Gemini runtime (voice and text) — 9 Nov 2026

Decision: Jorge, 8 Nov 2026 — replace OpenAI (text) and AssemblyAI (voice) with the paid Gemini API. Rollback is configuration only (`VOICE_PROVIDER=assemblyai`, `AI_TEXT_PROVIDER=openai`) or redeploying the previous image.

## Models (chosen in phase 0 from the official docs and a real probe)

| Use | Model | Why |
|---|---|---|
| Voice (Live API, native audio) | `gemini-3.8-live` | Google's default Live model ("low-latency voice agents"); function calling; input/output transcription; barge-in. Probe: not measured separately, Spanish and English. `gemini-3.1-flash-live-preview` is marked legacy. |
| Text assistants and theme suggestion | `gemini-3.5-flash` | Function calling, low thinking, 3.0–5.1 s for 5 production questions in the real probe. `gemini-3.8-flash`, `gemini-3.7-flash` and `gemini-flash-latest` did not answer within 60 s with this key on 9 Nov 2026 (probed twice), so they are not the default. |

Voices: `Kore` (Spanish), `Puck` (English). Native-audio models infer the language from the instruction; there is no `languageCode`.

Prices (paid tier, aistudio.google.com/docs/pricing, 9 Nov 2026): Live audio input $0.005/min, audio output $0.018/min; 3.5 Flash text: see the pricing page (cheaper than 3.8 Flash at $0.75 / $3.75 per 1M). A 90-second voice session costs not measured per session (all real tests together ≈ USD 0.18).

## Security model

- The browser never sees `GEMINI_API_KEY`. The server checks the current AI limits (200 queries/day in total, 60 per session; voice at most 120 s; 25 s per call, 40 s per query), keeps one active voice session, and then mints an **ephemeral token** (`authTokens.create`, API `v1beta`): `uses: 1`, new session within 60 s, expiry = session length + 30 s, and `liveConnectConstraints` that lock the model and the whole `LiveConnectConfig` (system instruction, voice, tools, transcription). A modified client config is ignored by the API; a reused token is rejected (probed: close 1011).
- Voice sessions last at most 120 s.
- Tools are executed by the app, not by the model: each `toolCall` is relayed by the browser to the role's existing tool route, which re-checks session, role, event and lease. Public text has one tool, `draft_invitation`, which prepares a proposal for manual review and never creates or publishes; public voice has `show_on_screen`, which opens FiestaPay pages and highlights buttons but never clicks, publishes, pays or creates.
- `prepare_quote` returns the server amount (integer cents) with `estado: PENDIENTE_DE_APROBACION`. The screen shows **Approve in PayPal $X**, which leads to the existing Orders v2 (CAPTURE) flow. Money moves only when the person approves inside PayPal and the server verifies the capture. No Payouts, split or escrow.

## Variables

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Server only. |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | Invalid names fall back to the default. |
| `GEMINI_TEXT_MODEL` | `gemini-3.5-flash` | Same. |
| `VOICE_PROVIDER` | `gemini` | `assemblyai` = rollback. |
| `AI_TEXT_PROVIDER` | `gemini` | `openai` = rollback. |
| `GEMINI_MODEL` | — | Legacy, ignored (its old value `gemini-2.0-flash-exp` no longer exists). |
