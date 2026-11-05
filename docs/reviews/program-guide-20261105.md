# Shared FiestaPay navigation guide — 5 November 2026

The public, guest and organizer assistants share the same verified UI map in text and voice. The guide names the actual demo, AG Grid, payment, copy-account, quotation, reconciliation, organizer-confirmation and microphone controls. It asks where the visitor is instead of pretending to see clicks or private event facts.

The preview remains read-only. Sandbox credentials are never supplied in an AI answer: the guide explains the existing opt-in controls and their availability conditions. Orders are reconciled by the same reference; guidance never initiates payment or claims a capture. Recovery, financial code, tools, authorization, audio transport and environment configuration are preserved.

## Verification

- Full local check: 572 tests, 61 files, zero skips; lint, types and build passed.
- Shared-guide tests cover all six prompt compositions, actual UI string parity and 15 classifier regressions. Existing privacy/payment tests remain intact.
- Independent AGY Flash source A review 2 and source B review 1 approved; source constructor used three deliveries. Classifier recovery used two attempts: the first timed out; Argon approved the narrowed candidate in the second, followed by Flash verification.
- Release operators: 44 local unit tests, independent A/B approval; zero new SQL and full preservation checks required before activation.
- Technical voice probe: nine fake-WebSocket tests and independent approval. A real provider session and physical microphone are different checks; neither is established by these unit tests.

## Boundaries and remaining acceptance

No new payment, order, fixture, email or WhatsApp send is part of this update. The next bounded release smoke allows four public text questions and one public technical voice session with text input and returned audio. Phone microphone, Spanish speech recognition and a three-minute human session remain unproven until tested on a physical device.

Two artifact-only worker boundary incidents were retained in the private execution journal: an extra local JSON file not integrated, and a test-isolation fallback after a denied command. The director repeated the original authorized test command successfully; neither incident changes product permissions or acceptance.
