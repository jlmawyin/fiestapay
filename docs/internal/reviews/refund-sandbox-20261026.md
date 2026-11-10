# Automatic sandbox refund — verified 26 October 2026

Release `891886682087881e3914f5bd847d07f1b97cda94` is deployed. [CI 40429173471](https://github.com/jlmawyin/fiestapay/actions/runs/40429173471) passed 308 tests across 29 files, lint, types and build. Independent financial and audio reviews preceded activation. Physical mobile audio remains pending.

A new event `comida-sqd8wvwpcuw6` was created through the public form: USD 1 per attendee, capacity two, minimum/goal USD 2 and deadline **26 October 20:11 America/Guayaquil**. A separate guest browser confirmed one attendee, reviewed the quote and approved the same sandbox order. The original deadline was not changed.

| Reference | Verified result |
|---|---|
| Order | `69754686DJ547011G` |
| Capture | `4DJ8478167395053U`, 100 cents, booked 20:09:43.529 |
| Decision | Failed at 20:11:26.441, basis 100 against minimum 200 |
| Refund | `81V65255AJ038122F`, 100 cents, booked 20:11:29.336 |
| Task | One attempt, status `refunded` |
| Independent PayPal GET | At 20:13:23: capture `REFUNDED`, refund `COMPLETED`, USD 1, matching capture and configured receiver |

No manual refund POST was issued. After another scheduled cycle the ledger still contained one capture and one refund, with the task still at one attempt. Recollected balance was zero. The public UI showed a failed minimum, closed registrations, zero fully paid people and USD 1 returned. Direct quote and RSVP API requests both returned 409. The earlier USD 50 example remained one capture, zero refunds and 5000 cents net. No new webhook correlation is claimed.

The checkout controller timed out before approval was established. The existing order was consulted and remained `created`; that same checkout was recovered, approved and reconciled in the original guest session. No replacement order was created. Buyer credentials were handled privately in memory.

Before deployment, migration 0007 was rehearsed on an isolated restored database: all 23 events retained their legacy exemption and financial data. Only FiestaPay's API was recreated, preserving the SMTP runtime override. Public assets matched the active image, health passed, and other container IDs/start times were unchanged. In-memory checks found zero configured private credential values in the new bundle or reviewed logs. Application downgrade requires financial compatibility and drained obligations.

Private evidence: `.local/refund26-after-deadline.json`, `.local/refund26-after-next-pass.json`, `.local/refund26-provider-verified.json`, `.local/refund26-blocked-actions.log`, `.local/combined-activation.log`, and `output/playwright/refund-completed-20261026.png`. These artifacts are excluded from Git.

Provider references: [refund API](https://developer.paypal.com/api/payments/v2/captures-refund), [refund detail API](https://developer.paypal.com/api/payments/v2/refunds-get). Partial-refund races and idempotency retention retain their disclosed local-test scope.
