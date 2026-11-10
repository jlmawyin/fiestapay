# Project history and release evidence

This page keeps the release narrative and evidence links that used to sit in the README. It is historical context, not a description of the current runtime. The current product facts are in [README](../README.md); judge-facing steps are in [JUDGES.md](JUDGES.md).

**Do not treat older test counts, provider names or browser results below as current claims.** Each entry names the source and the scope that was actually verified at that time.

## 4 November 2026 — first accepted sandbox payment

On source `60593db`, an accepted browser run verified one USD 50 sandbox capture (2 × USD 25), two paid people and the organizer's **✓ Confirmar Realización** action. That was mobile-emulation evidence at 390×844, not a physical-phone test. The [jury-ready acceptance report](reviews/jury-ready-20261104.md) is the historical record. The financial engine and its records were preserved in later releases.

## 5 November 2026 — two cards and one assistant orb

Release `f89aee1` introduced the two home cards, the public AG Grid example, the explicit sandbox-payment demo entry and a single text/voice orb. The release report recorded 546 tests in 60 files at that time, zero skipped, lint, TypeScript and build green, plus independent source and operational review. Published desktop and mobile-emulation checks covered both cards, public AG Grid, the payment-demo preparation through 2 × USD 25 = USD 50, the opt-in sandbox account response and the copy controls. That round created no payment order or capture and made no runtime model request. See the [cards/orb release report](reviews/demo-orb-20261105.md).

## 8 November 2026 — bilingual release

The interface became available in Spanish (default) and English with a header selector remembered per browser, or `?lang=en`. The bilingual release added the separate **Judges demo** (`/demo`), the read-only AG Grid sample, the guided **Try a PayPal payment** walkthrough, server-marked demo records, **My demos** and **Reset my demos**, and assistants that answer in the selected language. Amounts stayed USD integer cents from the server and event times stayed in America/Guayaquil. See the [bilingual release report](reviews/bilingual-judge-demo-20261107.md) and the [deployment and live-check evidence](reviews/bilingual-live-20261108.md).

Earlier releases used OpenAI for text and AssemblyAI for voice (with the *jane* English and *lola* Spanish voices). Since 9 November 2026 those providers are **configuration rollbacks only**; they are not the active runtime.

## 9 November 2026 — Gemini runtime

Jorge's 8 November decision replaced the earlier text and voice providers with the paid Gemini API. Runtime voice is `gemini-3.8-live` through the Gemini Live API with single-use ephemeral tokens; text assistants and theme suggestions use `gemini-3.5-flash`. The API key never reaches the browser. See [GEMINI.md](GEMINI.md) and the [AI contribution disclosure](AI_TOOLS.md).

## 10 November 2026 — current quality baseline

The current tree reports **1,015 automated tests green: 451 API tests with PostgreSQL and 564 web tests**, with lint, type checks and build green, plus independent verification by AGY and CI green on 10 November 2026. This is the current test count; older counts in the entries above are kept only to match their evidence reports.

Still not claimed: real-money payments, automatic WhatsApp sending, a new physical-phone payment test, a published video or a completed Devpost submission. Sandbox captures, browser automation and synthetic-microphone voice sessions are labelled as such in their reports.
