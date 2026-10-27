# Funding refund source audit — 26 October 2026

Independent AGY Opus source review, delivery 1/3: **blocked**. This is a review of local unapproved code, not a production incident or a completed sandbox refund. No product or test files were changed by the reviewer and no runtime tests were run.

Required corrections:

1. Failed/cancelled refund tasks can currently create another immediate request with a new identifier on every pass. Refreshing only the first 50 failed events also lacks fairness. Automation needs a bounded retry policy or terminal manual review, with outstanding money still represented honestly.
2. A completed refund associated with the capture can differ from the task's expected amount after a concurrent manual partial refund. The current mismatch path marks review without reconciling that real verified movement. The precise remote partial-refund behavior is an inference to test; reconciliation must still handle any legitimate verified movement safely.
3. Completing a leased task locks the task before its event, reversing the event-first order of other financial transactions. Align that order and add a concurrency regression.

The review also recommends persisting the remote refund identifier promptly and isolating failures to each task, so one network error cannot strand the rest of a claimed batch.

The reviewer confirmed several intended guards in the inspected source: legacy deadlines remain exempt, deadline decisions use a clock after the event lock, late captures are recorded, request identifiers and bodies persist before HTTP, pending/error responses do not count as refunds, and rollback restrictions are documented. These observations do not approve the package while blockers remain.

Two constructor lint edits occurred during the review. The reviewer disclosed hashes and inspection limits; the repaired final version requires an independent PostgreSQL review. Detailed source anchors and interleavings are stored privately in `.local/funding-critical-report.md`.
