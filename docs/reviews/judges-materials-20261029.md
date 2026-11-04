# Judge materials review — 29 October 2026

Task: `FP-JUDGES-MATERIALS-20261029`. Verdict: **APPROVED_DRAFT**, independent AGY delivery **2/3**. This approves presentation drafts, not full application acceptance, a recorded video, human testing or a Devpost submission.

## Scope and review

Codex prepared README status, [English judge instructions](../JUDGES.md), the [90-second storyboard](../DEMO_90_SECONDS.md), [Devpost copy](../DEVPOST_DRAFT.md), [AI disclosure](../AI_TOOLS.md) and [human tester guidance](../TESTERS_29_OCT.md). AGY reviewed those six documents against the existing API, architecture and historical payment, refund and SMTP evidence. It requested two non-blocking spacing fixes in the storyboard; both were applied. Root also narrowed the Devpost test wording to “426 automated tests with PostgreSQL in CI” so it does not classify every browser/unit test as a database integration test. No results changed. No product source, payment, permission or audio implementation changed.

The review confirms consistent server arithmetic (2 × USD 25 = USD 50), separate attendance/payment/event states, one Business sandbox receiver and honest limits on PayPal protection. CAPTURE credits that sandbox receiver; organizer confirmation does not release escrow or make a payout. Historical USD 125 captures and the separate USD 1 automatic refund are explicitly historical evidence. The script requires one real event/order through the recording, not an unrelated successful receipt.

## Evidence and limitations

Deployed application source remains `8e13ae61b06e5463c3438a70736b09da3146a50c`; the accepted source evidence remains 426 tests with no skips plus 26 independent checks. The browser matrix remains [12/14 accepted, voice points 12 and 13 partial](revalidation-20261029.md). No build, deployment, capture, chat turn, voice lease, email, WhatsApp message or human session was executed for this documentation delivery. Local Markdown checks cover relative links, whitespace and heuristic secret patterns; they do not prove an unassisted human walkthrough.

The published evidence ZIP, backup and previous payment history were preserved. The original and recovery runtime budgets are closed: no additional calls are authorized by these documents.

## Remaining publication gates

- Allocate fictional Personal sandbox buyer access through an approved private handoff; no credentials in public sources, PRs, logs or screenshots. The handoff method and judge access remain pending.
- Receive Jorge's human tester results (target 29 October, 20:00 ECT). Agents do not count as human testers and send no invitations.
- Check Spanish voice and complete responses on a physical phone, including guest minimum/refund and organizer questions. Synthetic input and intermediate `reply.done` flags do not complete these checks. No new automated voice budget is assumed.
- Record the working 90-second route, add English narration/subtitles and publish a public video under three minutes. It is currently a storyboard, not footage. Show text fallback if voice remains unverified.
- Finish Devpost submission by the internal 5 November cutoff and maintain working test access through 15 December. The [official rules](https://paypalaihackathon.devpost.com/rules) do not extend our internal deadline. This file does not assert submission or future uptime.

## Attempts, usage and operational notes

Delivery 1 returned from the canonical bridge but failed while serializing a Unicode arrow under Windows cp1252. Its stdout was empty; verdict and usage are unknown. It remains consumed and is not called approved. Delivery 2 used the same canonical AGY bridge and Gemini model with Python UTF-8 output; it returned `ok=true`, exit 0 and `APPROVED_DRAFT` in 155.77 s. No model/account/permission/quota override was used. No third review was needed for the two requested spacing fixes.

Delivery 2 model: `gemini-3.8-flash-high`, effort `high`; input 104,924, output 13,798 (including 10,755 thinking), cache read 232,806; reported total 118,722 excluding cache. Delivery 1 usage is unavailable and must not be represented as zero. After review, the actual Gemini group was 98.5% five-hour / 60.1% weekly. The bridge's aggregate 4.8% stop belongs to Claude/GPT, which was not used. Codex's separate guard snapshot was 65% five-hour / 42% weekly; both exceed the inclusive 20%/5% stop thresholds.

Private execution records remain in ignored `.local/`; no environment files or credentials were supplied to the reviewer. Current graph coverage for these Markdown paths was stale/missing metadata, so exact source reads supplied the evidence; no graph-completeness or new code-audit claim is made.
