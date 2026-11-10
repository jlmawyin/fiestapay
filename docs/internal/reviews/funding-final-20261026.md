# Funding and refund acceptance — independent local review

AGY independently approved backend delivery 3 and frontend copy delivery 2 on 26 October 2026. Codex matched all 13 source hashes in the report against the reviewed files. The earlier [critical findings](funding-critical-20261026.md) are resolved within this scope.

- Definite refund failure goes to manual review without creating an endless sequence of new requests. Eligible work selection prevents the first 50 failed events from starving later obligations.
- A legitimate completed refund is reconciled through a verification GET even when its amount differs after another partial refund. Requested or pending money is never counted as returned.
- Completion locks the event before the refund task and rechecks its lease. A known remote refund ID survives verification errors; one task's failure does not abandon the batch.
- Existing events keep their legacy exemption. Late captures and financial obligations survive closure and content deletion.
- The invitation separates attendance and verified full payment. Fee estimates come from the server, the organizer absorbs them, and the guest's quoted amount is unchanged.

Independent execution: 61 focused API/unit tests, 12 persistence/recovery tests, 17 frontend tests and seven Chromium journeys passed. Desktop and 390 px layouts were checked; no real microphone was tested. The full 300-test lint/type/build run is constructor evidence, reused explicitly. Real API calls were not made by reviewers; one attempted PayPal SDK request in the browser harness was aborted.

The current copy says “En proceso de reembolso” for the combined pending bucket and removes implementation details from attendee screens. The actual behavior of a full-refund request after an external partial refund remains a provider assumption covered by a fake variant, not a verified PayPal transaction.

CI for reviewed commit `ee4417d`: [run 40428750524](https://github.com/jlmawyin/fiestapay/actions/runs/40428750524). A restored production snapshot passed migration 0007 in an isolated temporary database: 23 events and the existing USD 50 capture were preserved; no existing deadline or refund task was armed. Production was not migrated during this rehearsal.

Deployment and the separate USD 1 deadline/refund exercise remain pending. Follow [the sandbox acceptance plan](funding-acceptance-plan.md); local tests do not prove that exercise. An application downgrade after migration 0007 requires an explicit financial compatibility check and drained obligations.
