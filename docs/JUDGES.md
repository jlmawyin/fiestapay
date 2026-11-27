# Five-minute judge guide

You need a browser with a microphone for the avatar. If the microphone is unavailable, every avatar flow also works in **text mode**. There are no credentials to type.

## 1. Public visitor — 1 minute

1. Open **https://somospanas.com** in English or Spanish.
2. Press the avatar welcome card. The Napster avatar introduces Somos Panas and offers to show public events or create a space.
3. Ask: *“What is Somos Panas?”* or *“Show me the public events.”* The avatar answers from its FAQ/knowledge and can highlight an allowed control.
4. Point out that the avatar explains and highlights; it never presses, publishes or pays.

## 2. Creator — 1.5 minutes

1. Open **https://fiestapay.somospanas.com/create** on the legacy host.
2. Start the avatar and dictate a meeting: *“Dinner for eight on Saturday at seven, fifteen dollars each.”*
3. The avatar uses `fill_event_draft` to prepare the form. Review the fields and press the final **Publish** button yourself.
4. Open the organizer panel. Ask for a reminder; the avatar drafts it with `draft_reminder`, and you copy or send it manually.
5. **Wow moment:** in the organizer's avatar settings, upload your own photo, confirm that it is your photo, and enter your first name. Napster generates a v1 companion. When it is ready, the page shows the custom avatar and the photo is deleted from our database. If generation is still pending, the general avatar remains available and the demo is not blocked.

## 3. Guest — 1.5 minutes

1. Open the invitation link from the published meeting.
2. Start the avatar. It greets the guest by the event name (and the site name) because the server passes `eventTitle` and `siteName` in `externalClientProfile`.
3. Ask *“What do I have to pay?”* The avatar can show the event details and highlight the quote/payment control.
4. On the legacy demo you can press **Try a PayPal payment**, join as **Demo Guest**, review the server quote and approve it personally in **PayPal Sandbox**. The shared sandbox buyer is revealed only by the **Show test account** button. No real money moves.
5. If the meeting has a custom photo avatar, the guest is received by that face.

## 4. Text mode and limits — 30 seconds

- Choose **I prefer to read** / **Prefiero leer** to open the Napster text session over WebSocket. Same avatar, same tools, no microphone.
- Napster allows **5 concurrent WebRTC sessions** per organization. At capacity the API returns `409 avatar_busy`; the client falls back to text mode instead of blocking the demo.
- The avatar is rate-limited to 1 connection per second; a `429` honors `Retry-After`.
- The API key never reaches the browser.

## Demo data

The legacy **/demo** page creates a fictional demo meeting and a **Demo Guest** invitation. It is safe to reset it. No real cards, emails or judge data are used.
