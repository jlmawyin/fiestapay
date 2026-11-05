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
