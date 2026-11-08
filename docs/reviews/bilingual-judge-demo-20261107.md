# Bilingual interface and separate Judges demo — 7–8 November 2026

Request from Jorge (7 Nov, via `/dirigir-agentes`): (1) separate a product home page for creating one's own invitations from a visible **Judges demo** with preloaded examples, read-only AG Grid and the PayPal Sandbox walkthrough, keeping demo data and conversations apart, never letting a demo reset touch other gatherings, and preserving every existing gathering and link; (2) Spanish and English with a visible, persisted selector (Spanish default), locale-aware dates and amounts without changing currency or event time zone, assistants answering in the selected language, same OpenAI model and AssemblyAI provider. Transfers and Deuna are out of scope. Both spaces remain **PayPal Sandbox, no real money**.

Director: Claude (own Desktop session; Codex's last checkpoint of 5 Nov had no active jobs or automations). Builders: Muse and OpenCode (free) in parallel, DSH as the authorized fallback after OpenCode's free usage ran out. Independent verifier: AGY Gemini 3.8 Flash High. Base: `origin/main` `42af3ac` (application `8259b4c` in production). Branch `claude/bilingual-judge-demo-20261107`.

## What changed

- **Home page `/`:** explains the product with its origin story (December gatherings with former schoolmates and former coworkers), "how it works" in three steps, **Create my invitation** and a visible **Judges demo** button. **My invitations** lists only the visitor's own (non-demo) gatherings.
- **Judges demo `/demo`:** banner "Fictional data · Sandbox · No real money" and a guided tour: (1) read-only AG Grid sample with the existing ten fictional rows and no network call, (2) **Try a PayPal payment** — the server mints a fresh demo event (`is_demo = true`) in the selected language, the browser joins it as *Demo Guest* with one companion and opens the normal invitation with the shared sandbox buyer card, (3) **Talk to the assistant**. **Create my private demo**, **My demos** and **Reset my demos** live here. Fixed: the `/demo` payment button previously opened the dashboard instead of the payment walkthrough.
- **Demo separation (server):** `POST /api/demo {kind: 'private' | 'payment'}` always creates a new event marked `is_demo` (the column exists since migration 0005: **no new migration**). `GET /api/events` reports `isDemo`. `POST /api/demo/reset` keeps archiving only `is_demo` events of the calling session; nothing is deleted. Earlier demos created through the old buttons were ordinary events; they stay exactly as they were (no data migration without approval) and therefore still appear under My invitations.
- **Languages:** Spanish/English selector in the header, persisted in `localStorage` (`fp_locale`) and selectable with `?lang=en`; `<html lang>` follows. All UI copy of the home page, Judges demo, guest journey (invitation, join, RSVP, quote review, PayPal section copy, return/verification, funding status, guest chat, voice panel) and organizer journey (create/edit form, dashboard, AG Grid, payments, WhatsApp reminder and share drafts, organizer link, QR, recovery email, moderation, `/recover`, cover badges) is available in both languages. Text written by organizers and guests is never translated. Amounts use `formatMoney` (`$50.00` / `$50,00`), always USD integer cents from the server; event times always use America/Guayaquil (the funding panel and audit times no longer use the browser time zone). API errors keep their Spanish `{error}` text; in English the browser translates every fixed message, with an anti-drift test against the API's error literals and a generic English fallback for anything unmapped.
- **Assistants:** the browser sends `x-fiesta-locale` on every request. Public (separate **landing** and **demo** contexts, no event data, no stored history), guest and organizer assistants, in text and voice, receive a language directive and quote the shared button labels (`UI_LABELS`) of the selected language; the program guide describes the new navigation. Deterministic answers (privacy, refunds, buyer protection, credentials, prompt injection, off-topic) and the output filter that blocks execution claims now cover English; the guest chat also applies that filter. Same OpenAI model and tools; no new tools or permissions.
- **Voice:** AssemblyAI Voice Agent API stays. Spanish keeps `language_codes: ['es']` and voice **lola**; English uses `['en']` and voice **jane** (Jorge's choice). Changing language ends an active voice session through the normal Stop path; the browser fallback speaks English only with an English voice.

## Voice language compatibility (documentation, not a live test)

AssemblyAI's Voice Agent documentation lists English and Spanish among the supported input (recognition) and output (speech) languages; `language_codes` pins a language; **lola** is the only Spanish voice (Spain accent); the voice cannot change inside a session. Sources: [language selection](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/language-selection.md), [supported languages](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/supported-languages.md), [voices](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/voices.md). **English voice has never been exercised live**; Spanish was only exercised earlier with a synthetic microphone. Physical-phone audio in either language remains unverified.

## Packages, attempts and independent verification

| Package | Builder | Attempts | AGY verdict |
| --- | --- | --- | --- |
| Shared contract (locale, formatters, shared labels) | Director | — | covered by every package review |
| B1 server demos, `isDemo`, error translations | OpenCode | 1/3 | Approved |
| A1 web base, selector, home page, Judges demo | Muse | 1/3 | Approved with minor observations |
| B2 assistants text/voice by language | OpenCode (partial, free limit reached) → DSH | 3/3 | Approved with observations |
| A2 guest journey | Muse | 1/3 | Approved with observations (moved to A3) |
| A3 organizer journey + phone layout fix | Muse | 2/3 | see below |

A3 attempt 2 was a copy-only polish of the English text requested by the A3 review (the *comida* template is now a neutral "meal", no calques such as "realization"); Spanish strings are byte-for-byte unchanged and no shared label changed. AGY approved it with no findings.

The independent reports are in [`bilingual-judge-demo-20261107/`](bilingual-judge-demo-20261107/) (local paths redacted). Counters are persistent; B2 used its three build attempts. Its remaining observation: a regular expression cannot catch every paraphrased English execution claim; it is a defensive layer on top of the prompts and the absence of any executing tool.

## Verification

- **Baseline** (`42af3ac` + contract, local PostgreSQL 16): 572 tests / 61 files, lint, types and build green.
- **Final integrated branch**, independent AGY run of `npm run check` against an isolated local PostgreSQL 16 container: lint 0, TypeScript 0 errors in shared/api/web, **690 tests passed in 78 files, 0 failed, 0 skipped**, production build OK. AGY also ran its own adversarial suites per package (6 + 18 + ≥8 + 8 + 10 + 6 cases) under a scratch folder that is not part of the product.
- Guarantees with named tests: demo reset archives only `is_demo` events of the calling session and leaves own events, other sessions, orders and ledger untouched (`apps/api/test/demo-i18n.test.ts`); organizer dashboard without key 403 and public link read-only (`persistence-access`, `api` tests); guest scoped to its event; public chat without event data or history, landing and demo contexts separate (`bilingual-assistants`); amounts from server cents and no "paid" without verified capture (existing `api`/`payment-races` suites, unchanged); existing routes and links intact; **no migration added or changed**; no secret or credential in the diff.
- **Local browser check by the director** (Vite + API against an isolated dev database, PayPal/OpenAI/AssemblyAI not configured, so no provider could be called): home page in Spanish and English at 375 px without horizontal overflow; `/demo` in English, where a clipping defect was found (the main container grew to ~954 px because of AG Grid) and then fixed in A3 — after the fix the main container is 375 px and the payment button is on screen; the English payment demo end to end up to the quote (server-created "Demo lunch", *Demo Guest* plus one companion, **2 × $25.00 = $50.00**); the demo listed under **My demos** and absent from **My invitations**; the English invitation and organizer dashboard at 375 px with no Spanish UI text and no "dinner" left.

## Simulated versus real

Everything above used mocked or unconfigured providers. **Zero** OpenAI calls, **zero** AssemblyAI sessions, **zero** PayPal orders or captures, **zero** SMTP messages and **zero** WhatsApp sends were made in this round. Nothing was deployed. The live-test budget approved by Jorge (≤ 6 OpenAI turns / ≤ 30 model calls, ≤ 2 voice sessions × 120 s in ES and EN, ≤ 1 sandbox capture of USD 50) applies only after he approves the deployment.

## Pending

- Jorge's review and approval of the pull request; deployment (zero-migration transition from `8259b4c`, preserving all events, payments and links) only with his approval.
- Bounded live checks after deployment: English and Spanish text replies, one English and one Spanish voice session, one sandbox payment in English.
- Physical-phone voice, video and Devpost submission (deadline 12 Nov 15:00 ECT) remain human tasks.
- Optional, only with approval: marking the earlier demo events created by the old buttons as demos.
