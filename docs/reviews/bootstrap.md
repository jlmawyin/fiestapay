# Bootstrap review record — 14 October 2026

This is an integration record, not a claim of completed hackathon acceptance. Reviewers were independent of the original constructors. No review used real payments or real judge data.

## Financial review

AGY Opus 5.5 High reviewed the original order, payment, RSVP, quote, PayPal verification and database code using direct source. It did not execute tests. Its findings led to these corrections by Claude and Codex:

| Finding | Final behavior | Verification |
|---|---|---|
| Late create response revived superseded orders | Persist external reference without reviving superseded/archived intent | Delayed create versus RSVP/reset tests |
| Capture raced with RSVP/new order | Claim durable capturing state under event/guest/order locks before network call | Gated concurrent capture and RSVP tests |
| Ambiguous capture could permit another charge | Keep claim through timeout, read reconciliation and elapsed time; retry original idempotency key | Aged uncertain capture remains locked |
| Out-of-order webhook was discarded | Unknown/transient capture/refund returns retriable error without marking processed | Refund-before-capture and late-order tests |
| Refunded capture rejected as never captured | Verify original capture amount for completed/partly refunded/refunded status | Partial/full refunded capture tests |
| Refund race/duplicate handling | Check duplicate and refundable balance under event lock | Concurrent refunds and duplicate full refund tests |
| Historical capture lacked audit distinction | Apply to original generation, emit stale-order audit | Archived/superseded capture tests |
| Reconciliation read lacked own throttle | Bounded per-route read rate | Route configuration inspected |

Final verification: PostgreSQL integration tests, frontend regressions, lint, typecheck and build. A real PayPal sandbox order was created, but buyer approval/capture and real signed-webhook delivery are still pending. Fake-provider tests do not prove those integrations. A definitive failed capture can remain reserved pending retry/reconciliation; no timeout alone authorizes a new charge.

## Frontend review

Independent reviewer corrected stale quote confirmation, RSVP failure propagation and late voice callbacks after cancellation. Seven focused regression tests were added; the full frontend suite passes. This does not establish human mobile microphone acceptance or full accessibility.

## Grok adversarial review

Grok 4.7 xhigh reviewed supplied session, origin, AI budget, voice, event/reset and Compose source. It reported no concrete cross-session authorization flaw, global quota bypass or reset of another organizer's events in that scope. It specifically excluded unprovided payment/RSVP handlers, shared tool implementation, origin hook, migrations and transaction implementation from its conclusion. Codex's integration suite covers those separate boundaries; this is not a blanket security approval.

## Gemini protocol

Native function responses retain the call ID and the original model parts, including opaque thought signatures. The regression checks these are preserved. Contract reference: [Google function calling documentation](https://ai.google.dev/gemini-api/docs/generate-content/function-calling). Provider returned 503 high demand during public integration checks; text assistant acceptance remains open.
