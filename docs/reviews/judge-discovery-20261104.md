# Final judge-discovery corrections

Jorge approved the proposed corrections on 4 November, preserving organizer-link recovery and prioritizing visible AG Grid and a clear PayPal route.

## Changes

- Public `/demo` uses the real AG Grid with ten explicitly fictional, read-only rows, search and sorting. It requires no organizer credential and cannot modify real invitations.
- The home page puts this preview first, followed by a separate private sandbox-demo action. Personal history and demo maintenance are collapsed rather than deleting tester events.
- A private demo creates a new owned gathering with future dates; the real organizer panel still requires its secret link. Missing access offers recovery and a public invitation instead of an unexplained permission error.
- The guest journey explains joining, attendance, quote review and PayPal. **Quiero pagar** only focuses the next required step; payment calculations, order creation and capture verification remain server controlled.
- Home text chat uses the existing OpenAI provider without event access, tools or a stored/shared public transcript. It shares existing daily/session consumption limits and has an IP limit. SQL 0012 only makes the budget record's event reference nullable; its foreign key remains intact.
- Requests time out after 30 seconds, including body parsing, with safe read retries and explicit uncertainty for timed-out mutations. Invitation/panel failures show recovery choices. Date ranges show the time zone once.

## Source and local verification

- Final `npm run check`: **521 tests in 56 files, zero skips**, lint, TypeScript and build passed, using a dedicated local PostgreSQL instance. No production environment or payment was used by these tests.
- Public-chat coverage includes 13 database-backed cases with a fake provider and eight UI cases; timeout and authorization regression tests also pass.
- Independent AGY approvals: public chat review 1, UI reviews 1–3. Source/CSS omissions in bounded inline payloads are recorded in local review receipts; approval is not an exhaustive audit or a real API test.
- Local Edge: real AG Grid sorting and filtering; desktop/mobile horizontal overflow zero. On 390×844 mobile emulation the primary AG Grid button starts at y=562.8 and its center is unobstructed. Screenshot inspected. This is emulation, not physical-phone evidence.
- Deployment operators: 31 local tests pass. Independent operational review and production evidence are recorded separately when complete; this document alone does not assert deployment.

## Scope and preserved evidence

The original report's global shared history/privacy leak was not reproduced: two fresh sessions had empty history and the server scopes event chat to the caller. The new public chat stores its visible transcript only in its own open-window state. This bounded observation is not a claim of exhaustive privacy verification.

No new payment capture, voice session, SMTP message or WhatsApp send is authorized or required for this correction round. Existing sandbox capture and recovery evidence remains historical and is not repeated. Physical-phone Spanish audio, video publication and submission remain dependent on actual human evidence.

## Published release and final browser results

- PR [9](https://github.com/jlmawyin/fiestapay/pull/9) merged to `main` as **eac09c0b1a1de384e23077e7f883586665c153f5**. Its tree matches reviewed source `72061cf`. [Main CI](https://github.com/jlmawyin/fiestapay/actions/runs/41965535239) succeeded. That source is running on Contabo, image `sha256:70d87ef833b78a9294d4af3efbdde3038795466c14b02c2913f8f2b368fc92e2`, schemas 0001–0012.
- The reviewed release restored a fresh backup into an isolated scratch database, applied only SQL 0012 and verified all 20 existing tables unchanged, including financial references. The scratch database was removed. Activation preserved every existing event/order/ledger record, left other containers unchanged, passed public health/assets checks and found zero matches for five configured secrets in the browser bundle and logs. No database rollback or mail/DNS changes occurred.
- The fresh backup was copied to the existing restricted offsite directory: 201,362 bytes, SHA-256 `292ada86384f7e0da7e258469cd079fb7b1deb45b2040939446e2aa0e406ba83`. Hash and Jorge/SYSTEM-only ACL verified. No dump is attached to this report.
- **Live mobile emulation, 390×844:** home AG Grid CTA at y=544, unobstructed; no horizontal overflow; reset initially hidden. `/demo` uses real AG Grid: filtering reduced ten rows to one, clearing restored ten, sorting became ascending, with zero API POSTs from the preview.
- **One real public-chat call:** HTTP 200 in 4,689 ms; typing indicator observed; the reply explained the sandbox journey without claiming actions. A separate fresh browser context showed neither that question nor its answer. No second model call was made.
- **One new private fixture:** the home CTA opened its own organizer panel with AG Grid. A fresh visitor and a joined guest both received **403** from the dashboard API. No organizer key or QR is included in the screenshots.
- **Guest mobile route:** joining and saving attendance returned HTTP 200. **Quiero pagar** first focused the alias field, then led to the quote. The server displayed two people, USD 25 each, total USD 50 and the explicit confirmation/payment-preparation control. Requests were limited to join, RSVP and quote: **zero new orders or captures**. This verifies payment discovery and the prepayment route; the prior accepted USD 50 capture remains historical evidence.
- `/recover` opened normally without sending mail. Its handlers and security contract were unchanged.

One browser collector initially used an incorrect accessible textbox name and timed out before joining. It was recovered using the actual `attendee-name` field. This was a test-harness error, not evidence of a product defect. Final browser processes were closed. No physical phone, microphone session, human walkthrough, video or submission was claimed by this round.
