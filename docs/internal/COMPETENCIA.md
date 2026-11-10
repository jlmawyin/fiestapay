# FiestaPay: competencia y productos parecidos
Investigado el 13 oct 2026. Las fuentes están enlazadas. Lo marcado con (*) es conocimiento general que no volví a verificar hoy.

## 1. Productos existentes

| Producto | Qué hace | En qué se parece | Qué le falta frente a FiestaPay | URL |
|---|---|---|---|---|
| **Partiful** | Invitaciones, RSVP, cuestionarios, avisos por SMS. Desde jun 2026 vende entradas con Stripe | RSVP y cobro a invitados | No tiene agente de IA que responda a los invitados. La venta de entradas solo funciona en EE.UU./UK, usa Stripe y no PayPal, y no divide gastos | https://partiful.com · https://partiful.com/blog/post/introducing-ticketing-on-partiful |
| **PayPal Pool** | Una "vaca" en la app de PayPal (creada en 2024) con meta y enlace para compartir por WhatsApp | Recolectar dinero del grupo con PayPal | Solo existe en EE.UU., UK, DE, IT y ES, **no en Ecuador**. No tiene RSVP, ni agente, ni datos del evento. (Los "Money Pools" originales cerraron el 8 nov 2021) | https://newsroom.paypal-corp.com/2024-11-14-PayPal-Unveils-Innovative-Money-Pooling-Feature,-Simplifying-Group-Expenses-Between-Family-and-Friends |
| **Splitwise** | Registra gastos compartidos y quién le debe a quién. El plan Pro escanea recibos | División de gastos | No organiza eventos ni RSVP, no tiene agente conversacional y no cobra con PayPal dentro de la app | https://www.splitwise.com |
| **Tricount** (bunq) | Divide gastos gratis y envía solicitudes de pago | División y recordatorio de pago | Igual que Splitwise: no maneja el evento, no tiene IA y no cobra con PayPal | https://tricount.com/es-es/ |
| **peiGo** (Ecuador) | Billetera que divide un pago entre hasta 10 contactos y les envía el pedido de dinero | Competidor local de cobro entre amigos | Hay que pagar desde peiGo. No organiza la fiesta ni tiene agente, y no sirve a invitados del extranjero | https://www.peigo.com.ec/funcionalidades/division-de-gastos |
| **Vaquita Express** | App latina para dividir gastos (vaquitas) | División en LatAm | Solo calcula saldos: no cobra, no tiene RSVP ni IA | https://www.vaquitaexpress.io/ |
| **Count Me In** | Concierge de IA en WhatsApp que envía invitaciones, recoge RSVP (también por nota de voz) y manda recordatorios | **El más cercano en RSVP con IA** | No cobra ni divide gastos. Depende de la API de WhatsApp Business | https://count-me.in/ |
| **Weddingkart / EQUA / EventPax** | Concierges de IA en WhatsApp para bodas (sobre todo en India): responden preguntas y gestionan RSVP | Agente que responde a los invitados | Son de pago, B2B para wedding planners. No cobran a los invitados ni manejan PayPal | https://www.weddingkart.co/features/whatsapp-concierge · https://wedding.equa.chat/ · https://www.wedhaven.com/eventpax-for-weddings/ |
| **Serova EventAI** | Agente de WhatsApp para conferencias (en vista previa privada) | Preguntas y respuestas sobre el evento | Está pensado para eventos corporativos y no tiene pagos | https://serova.ai/eventai |
| Evite, Luma, Eventbrite, Paperless Post (*) | Invitaciones y entradas | RSVP y entradas | No dividen gastos entre amigos y no tienen un agente que conteste a los invitados | evite.com · lu.ma · eventbrite.com · paperlesspost.com |

## 2. Proyectos de hackathon parecidos (Devpost/GitHub)

| Proyecto | Qué hace | Diferencia con FiestaPay |
|---|---|---|
| **MeditaSplit** (bunq Hackathon 7.0) | Agente multimodal (voz + foto del recibo) que divide la cuenta y envía solicitudes de bunq, con confirmación humana | **Es la idea más cercana.** Pero gira alrededor de bunq y la cuenta del restaurante, sin evento, RSVP ni preguntas de invitados. https://devpost.com/software/meditasplit |
| **Splitify** (bunq) | Video del recibo → Whisper + Claude → solicitudes de bunq | Solo divide la cuenta. https://github.com/AndreiLeIttu/BunqHackathon |
| **fAIrsplit** (DeepMind x AI Tinkerers, Varsovia 2026) | PWA que lee el recibo con Gemini y deja que cada invitado reclame lo que consumió | Sin agente, sin cobro real y sin evento. https://github.com/vonHousen/give-me-the-money |
| **Split It** (Devpost) | Gemini clasifica los gastos de un evento y hace las transferencias | Sin RSVP ni voz, y no usa PayPal. https://devpost.com/software/split-it-vxc8p0 |
| **Galería del PayPal AI Hackathon** | Todavía **no está publicada** ("haven't published this gallery yet") | No se puede ver la competencia directa hasta después del cierre. https://paypalaihackathon.devpost.com/project-gallery |

## 3. Conclusión

No encontré ningún producto ni proyecto que junte las tres cosas: **un agente que conoce la fiesta y contesta a los invitados (voz y chat), RSVP, y cobro/división con PayPal**. El mercado está partido en dos. Por un lado, los concierges de RSVP en WhatsApp, que no cobran. Por otro, las apps de dividir gastos, que no organizan el evento. Lo más parecido en hackathons es MeditaSplit, que solo resuelve "dividir la cuenta". La diferenciación es **alta en la combinación** y baja en cada pieza por separado, así que el pitch tiene que vender el flujo completo.

**3 diferenciadores para los jueces:**
1. **Un solo agente para todo el ciclo de la fiesta.** Responde "¿a qué hora?" o "¿qué llevo?", confirma la asistencia y genera el link de pago de PayPal (Orders API) para cada uno, con la división calculada en el servidor y la aprobación hecha por el humano en PayPal. Encaja con "Best Use of Agentic Commerce".
2. **Pensado para LatAm y Ecuador, donde no existen PayPal Pool ni la venta de entradas de Partiful.** Funciona en español, con USD y PayPal, que sirve también a los invitados del extranjero, en una PWA sin instalar nada.
3. **Recordatorios por WhatsApp sin la API de WhatsApp Business.** El agente deja el mensaje listo en un enlace `wa.me` y el organizador lo envía con un toque. No cuesta nada, no se bloquean números y el humano mantiene el control. Count Me In, EventPax y los demás dependen de la API de pago.
