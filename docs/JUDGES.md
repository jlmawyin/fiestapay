# Five-minute judge guide

You need a browser with a microphone for the avatar. If the microphone is unavailable, every avatar flow also works in **text mode**. There are no credentials to type.

## 1. Public visitor — 1 minute

1. Open **https://somospanas.com** in English or Spanish. Point out the day/night toggle.
2. Press the avatar welcome card. The Napster avatar introduces Somos Panas and offers to show public events or create a meetup.
3. Ask: *“What is Somos Panas?”* or *“Show me the public events.”* The avatar answers from its FAQ/knowledge and can highlight an allowed control.
4. Point out the live captions, microphone states and “Powered by Napster”. The avatar explains and highlights; it never presses, publishes or pays.

## 2. Creator — 1.5 minutes

1. Open **https://somospanas.com/create**.
2. Start the avatar and answer the interview one question at a time: type of meetup, date, time, place, how many people, and the share.
3. After the type, the avatar calls `suggest_avatars` with a tag. The matching avatars are highlighted; choose one or continue with the current avatar. The chosen avatar will receive the guests.
4. As you answer, `fill_event_draft` highlights the section it is filling and asks *“Does that look right? Shall I continue?”*. Correct anything you want.
5. On the review step, press the final **Publish** button yourself. The avatar never publishes.
6. After publish, the avatar receives the system message `published`. It reminds you to save the **administrator QR** and offers an optional recovery email. The final screen shows the meetup address, QR codes and sharing options.
7. Optional wow moment: after publishing, on the final screen at **https://somospanas.com** (or later from the organizer panel), open **Your avatar with your photo**, upload your own photo with consent and enter your first name. Napster generates a v1 companion. When it is ready, guests are received by that face; the photo is deleted from our database. If generation is still pending, the selected catalog avatar remains available and the demo is not blocked.

## 3. Guest — 1.5 minutes

1. Open a meetup address such as `https://cumpledemaria.somospanas.com`. The root of that subdomain is the invitation.
2. Start the avatar. It greets the guest by the event name (and the site name) because the server passes `eventTitle` and `siteName` in `externalClientProfile`.
3. For a **new meetup**, the share is a collection among friends: there is no online checkout. Ask *“What do I have to pay?”*; the avatar explains the share and the guest finishes with **Confirm attendance**.
4. For a **legacy historical event**, you can still show **Try a PayPal payment**, join as **Demo Guest**, review the server quote and approve it in **PayPal Sandbox**. The shared sandbox buyer is revealed only by the **Show test account** button. No real money moves.
5. If the meetup has a selected catalog avatar, that avatar receives the guest; if the organizer has a ready photo avatar, the photo wins.

## 4. Text mode and limits — 30 seconds

- Choose **I prefer to read** / **Prefiero leer** to open the Napster text session over WebSocket. Same avatar, same tools, no microphone.
- Napster allows **5 concurrent WebRTC sessions** per organization. At capacity the API returns `409 avatar_busy`; the client falls back to text mode instead of blocking the demo.
- Connection creation is serialized to **1 per second**; a `429` honors `Retry-After`. A `403` means no credits.
- A free address such as `https://libre.somospanas.com` shows **This address is free** and the button **Create it by chatting**, which opens the root interview with the suggested subdomain.
- The API key never reaches the browser. The organization uses **82 of 100 agents**: 2 base + 25 catalog avatars × 2 + 15 event photos × 2.

## Demo data

The legacy **/demo** page creates a fictional demo meeting and a **Demo Guest** invitation. It is safe to reset it. No real cards, emails or judge data are used.
