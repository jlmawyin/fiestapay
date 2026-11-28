# Video script — 3:00 maximum

Format: screen recording with the Napster avatar visible, English voice-over and English on-screen captions. Keep each shot moving; no slide deck. Times are targets.

## 0:00–0:20 — Hook

**Show:** quick cuts of the avatar greeting on the root, the creator interview, and a guest invitation on a meetup subdomain.

**Say (EN):** “Group plans get lost in chat. Somos Panas gives every group its own space and every meetup its own address — with a Napster avatar that welcomes people by face and voice.”

## 0:20–0:55 — Public greeting, root

**Show:** `https://somospanas.com` in English. Toggle day and night. Start the avatar with video and voice. It introduces itself as Elena Navarro, offers public events and highlights an allowed control.

**Say (EN):** “This is Elena, the default Somos Panas avatar. She is not called ‘Pana’ — pana means friend in Ecuador. She explains the site, shows public events and points to the next step; I decide and press.”

**Show:** captions, microphone state and “Powered by Napster”.

## 0:55–1:45 — Creator greeting, interview and avatar suggestion

**Show:** `https://somospanas.com/create`. Start the creator avatar. Answer the six questions one at a time: type, date, time, place, headcount and share. After the type, show the highlighted suggestions from `suggest_avatars`; choose a different avatar. Show `fill_event_draft` highlighting the active section and the avatar asking “Does that look right? Shall I continue?”.

**Say (EN):** “The avatar asks one question at a time and fills the draft as we talk. When she knows the meetup type, she suggests avatars by tag. I can choose who will receive my guests, or keep Elena. I review everything and press Publish myself.”

**Show:** the `published` system message, the final address, the administrator QR warning and the optional recovery email.

**Say (EN):** “After I publish, she reminds me to save the administrator QR and offers an optional recovery email.”

## 1:45–2:25 — Guest greeting, meetup subdomain

**Show:** open `https://cumpledemaria.somospanas.com`. Start the guest avatar. It greets the guest by the event name and shows the invitation. For a new meetup, show “Cuota por persona” as a collection among friends and finish on **Confirm attendance**.

**Say (EN):** “The guest arrives at the meetup’s own address. The avatar greets them by the event name. New meetups use a collection among friends, with no online checkout; the last step is simply Confirm attendance. The legacy historical host still shows the PayPal Sandbox demo.”

## 2:25–2:50 — Wow: a photo avatar

**Show:** legacy organizer panel, upload a photo with consent, enter the first name, show the generating state, then the guest page received by that face. If it is still generating, show the general avatar continuing to work.

**Say (EN):** “An organizer can add their own photo with consent. When the Napster companion is ready, the photo avatar receives the guests. The photo is deleted from our database after generation.”

## 2:50–3:00 — Architecture in ten seconds

**Show:** the Mermaid flow: browser → Fastify → `POST /public/agents/{id}/connections` → single-use token → Web SDK → implicit tools → UI.

**Say (EN):** “The server keeps the Napster key and creates the connection. The browser gets only a short-lived token. Nine closed tools prepare the next step, and the person always makes the final click.”
