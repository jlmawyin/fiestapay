# Plan Somos Panas + avatar Napster (Napster API Ignite 2026)

Director: Claude Opus 5.5 (esfuerzo xhigh) con la habilidad director-claude. Fecha: 27-nov-2026. Estado: **pendiente de aprobación de Jorge**.

## Contexto

Jorge lleva somospanas.com al hackathon Napster API Ignite. Cuando alguien abre el sitio, una avatar con video y voz lo recibe en español (o inglés), presenta Somos Panas y guía a tres tipos de visitante: público, creador e invitado. **La única IA del producto es Napster.** Gemini, OpenAI y AssemblyAI salen del código, de las dependencias, de la configuración y de los textos. La avatar solo explica y guía; las acciones finales las hace la persona en la app.

### Hechos (con fuente)

- **Plazo:** 30-nov-2026 23:59 hora del Pacífico, que es el **1-dic 02:59 en Ecuador**. Jurado del 30-nov al 8-dic; ganadores el 9-dic (napster.com/ignite-official-rules). Jorge confirmó que está inscrito.
- **Criterios:** uso de la API de Napster 30 %, ejecución técnica 25 %, creatividad 25 %, presentación 20 %. Se entrega: demo en línea, video de 3 min o menos, repositorio y resumen de 500 palabras o menos.
- **API de Napster** (developers.napster.com/docs):
  - Host `napster-api.napster.com/public/...`. La guía del hackathon usa `companion-api.napster.com`, así que el host queda configurable y se diagnostica.
  - Autenticación con `X-Api-Key`, solo en el servidor.
  - `POST /public/agents/{id}/connections` recibe `channelType` (`webrtc`, `websocket`), `modality`, `externalClientProfile` e `initialSpeech`. Devuelve un `token` de un uso que caduca en segundos y un `connection.id`. La sesión se cierra con `DELETE /public/connections/{id}`.
  - Web SDK `@touchcastllc/napster-companion-api@2` con `@reduxjs/toolkit`. Se inicia con `init(getToken, {layout})`.
  - `videoPolicy: "deferred"`: el audio llega primero y el video después. Se configura en `PUT /public/agents/{id}/channels/webrtc`.
  - Comandos en sesión: `sendCommand` con `send_message` (rol `system`, `trigger_response:false`) y `set_settings`.
  - Tools: `POST /public/functions`. Con `flow:"implicit"` la llamada llega al navegador (`function_implicitly_called`) y se responde con `send_function_output`, con 10 s de plazo.
  - Conocimiento: base de conocimiento con archivos por URL pública (máx. 30) y una colección FAQ (máx. 50 pares).
  - Avatares: `GET /public/companions/napster-stock` lista el catálogo y `POST /public/companions` crea uno v1 desde `pictureUrl`. Pasa por los estados `pending → generationCompleted → readyToUse`.
  - Modo texto: `channelType:"websocket"` con `modality:"text"`. Tiene su propio cupo de 5 sesiones.
- **Límites:** 5 sesiones de video a la vez (409 `ConcurrentSessionLimitReached`); 1 conexión por segundo (429 con `Retry-After`); sin créditos, 403 `InactiveSubscription`; 100 agentes por organización; 3 minutos de inactividad.
- **Costo:** unos 0,058 USD por minuto con el modelo de Napster. Créditos: **USD 150**. Tope de pruebas de desarrollo: **USD 40** (unos 690 min). Quedan unos 110 USD (unos 1.900 min) para el video y el jurado.
- **Repo:**
  - `somospanas/plan` está en 54e0389.
  - Los PR #49 (SP-7) y #50 (SP-6) son borradores. #49 tiene CI verde. #50 tiene CI rojo porque dos pruebas de `scripts/` no resuelven `@fiestapay/shared`.
  - Al fusionar ambos hay conflicto en `CHANGELOG.md` y `apps/api/src/lib/host.ts`. Ojo: hay que quitar `muestra` de la lista reservada de `site-slug.ts` para enrutar, pero mantener el bloqueo al crear (`sites.ts:77`).
- **Pruebas que fallan:**
  - Las 3 de cupo en `api.test.ts:205` usan una fecha fija, `2026-11-20`, que ya pasó. #49 trae el arreglo (fecha relativa).
  - `app-site-orb`: probablemente supera el timeout de 5 s al importar `App` en frío en Windows/OneDrive.
  - `verificar.mjs:22` usa `spawnSync` con `shell:false`, así que `npx`/`npm` (`.cmd`) fallan en Windows.
- **IA actual:**
  - Dependencia `@google/genai` en `apps/api` y `apps/web`. OpenAI y AssemblyAI se llaman con `fetch`.
  - Unos 25 módulos en `apps/api/src/ai/*` y `apps/web/src/voice/*`. `VoiceInvitationAgent.tsx` tiene 2088 líneas.
  - Se reutiliza: `packages/shared/src/ui-guide.ts` (listas cerradas), `guide/showOnScreen.ts` (validación), `runTool`/`runOrganizerTool` con `/voice/tool`, `voice-lease.ts` (presupuesto, consentimiento, un lease por sesión).
- **Marca visible «FiestaPay»:** unas 166 líneas en unos 35 archivos (i18n, prompts, correos, `index.html`, datos de demo). El nombre del tenant legado está sembrado en `0013`, una migración inmutable; se cambia desde la configuración del sitio (SP-5), no con una migración.

### Decisiones de Jorge (27-nov)

- Inscrito. Git autorizado: ramas, commit, push y fusión a `somospanas/plan` con CI verde, 0 pruebas omitidas y veredicto independiente de Codex.
- Sobre el VPS: somospanas ya está ahí; hoy se revisa juntos cómo desplegar.
- SDK autorizado. Créditos: tope de USD 40 en pruebas, de un total de USD 150.
- El legado `fiestapay.somospanas.com` **también pasa a Napster**.
- La invitación desde una frase y los recordatorios pasan a **tools de la avatar**.
- **Dos agentes, `es` y `en**, con el mismo avatar, conocimiento y tools.
- Un **git worktree** temporal en `C:\Users\Jorge\OneDrive\hackathon\somospanas-napster`, sin `.env`, que se borra al fusionar.
- **Solo Napster como IA del producto.** Los agentes de desarrollo (Claude, Muse, DSH, Codex) no son parte del producto y se declaran en el resumen, como pidió Jorge.

### Inferencias y riesgos

1. **Plazo de 3,5 días.** Congelamos funciones el 30-nov a las 12:00 en Ecuador. La foto del creador es un extra que no bloquea.
2. **Regla de «trabajo nuevo»** (FAQ de la guía): solo agregar la API a un proyecto existente va contra el espíritu del concurso. Somos Panas nace sobre FiestaPay, así que el resumen dice con honestidad qué existía y qué es nuevo: la portada multisitio y toda la capa Napster.
3. **Las bases permiten otras IA si se declaran.** Igual las quitamos porque es decisión de Jorge. Las voces que ofrece Napster son de su propia plataforma.
4. **El despliegue con #49 incluye la migración aditiva 0015.** La aprobación permanente del 9-nov exige cero migraciones, así que este despliegue necesita el OK de Jorge y un respaldo.
5. **El tiempo de generación de un avatar v1 no está confirmado.** Se mide el sábado con una foto de Jorge.
6. **Los archivos de conocimiento piden una URL pública.** Antes del primer despliegue solo habrá FAQ e instrucciones.
7. **Uso de Claude:** plan Pro y umbral del 20 %. La continuación automática está armada (hoy 16:08 ECT y 3-dic 08:01 ECT).

## Arquitectura de la capa Napster

```text
Navegador (React)                         Fastify (apps/api)                     Napster
NapsterAvatar ──POST /api/avatar-session──▶ valida visitante por Host/sesión ──X-Api-Key──▶ POST /agents/{id}/connections
   │  ◀────── { token, handle } ──────────  guarda connection.id (memoria)                (webrtc, profile, initialSpeech)
   │  SDK init(getToken) ─────────────────────────── WebRTC audio→video (deferred) ──────▶ agente es|en
   │  function_implicitly_called ─▶ router de tools (listas cerradas) ─▶ API propia (/api/portal/events, /voice/tool)
   │  send_function_output ◀─ resultado validado
   └─ salir/cerrar ─POST /api/avatar-session/end─▶ DELETE /connections/{id}
```

- **Servidor:**
  - `apps/api/src/napster/client.ts`: host configurable, timeouts, errores tipados para 409, 429 (`Retry-After`) y 403, y una cola de 1 conexión por segundo.
  - `apps/api/src/routes/avatar-session.ts`: `POST /api/avatar-session` y `/end`. El tipo de visitante lo decide el servidor (raíz, sitio o evento con su cerrojo de acceso), no el navegador.
  - `externalClientProfile` lleva solo el tipo de visitante, el idioma, el título del evento y el nombre del sitio. Sin datos personales.
- **Variables (solo nombres):** `NAPSTER_ENABLED`, `NAPSTER_API_KEY`, `NAPSTER_API_BASE`, `NAPSTER_AGENT_ID_ES`, `NAPSTER_AGENT_ID_EN`.
- **Configuración en Napster por código:**
  - `scripts/napster/setup.mjs` es idempotente. Crea las tools, la FAQ, la base de conocimiento, los agentes es/en (avatar del catálogo, voz, instrucciones, idioma) y el canal webrtc `deferred`. Guarda los ids en `.local/napster/ids.json`.
  - `scripts/napster/diagnostico.mjs` prueba el host con un GET gratuito y nunca imprime la clave.
- **Web:**
  - `apps/web/src/components/avatar/NapsterAvatar.tsx` muestra primero la tarjeta de bienvenida y consentimiento. El micrófono solo se activa tras un clic.
  - Tiene subtítulos (`message_received`) y un router de tools que valida contra listas cerradas y nunca usa URLs del modelo.
  - Ante 409, 403 o un fallo de video pasa a **modo texto Napster** (websocket text). Si eso también falla, muestra el guion fijo de `contenido/tutorial.json`.
- **Tools** (todas implícitas, ejecutadas por la app y validadas):

| Visitante | Tools |
| --- | --- |
| Público (raíz) | `list_open_events`, `open_event{ref}` (solo refs de la última lista), `start_new_space{slug?,name?}` (rellena el compositor), `show_on_screen{target}` |
| Creador (su sitio) | `fill_event_draft{título, fecha, hora, lugar, descripción, tipo}` (rellena el formulario; la persona publica), `draft_reminder{texto}` (el organizador copia o abre WhatsApp), `show_on_screen`, `open_avatar_settings` |
| Invitado (`/e/<slug>`) | `show_event_details`, `show_on_screen` (resalta confirmar o aportar; la persona pulsa) y, en el legado, `prepare_payment` (una cotización por invitado, reutiliza `/voice/tool`) |

- **Contexto:** al cambiar de página, la app envía `send_message` con rol `system` y `trigger_response:false`.
- **Conocimiento:** `contenido/avatar.json` (instrucciones e `initialSpeech` por tipo, en es y en), `contenido/conocimiento/somospanas.{es,en}.md` (servido públicamente tras desplegar) y la FAQ desde `contenido/preguntas.json`. Solo describe funciones que existen.
- **Foto del creador (extra):**
  1. En los ajustes del sitio, con casilla de consentimiento («es mi foto»), se sube un jpg o png de hasta 5 MB a una URL pública no adivinable.
  2. Se llama a `POST /public/companions` v1 y se consulta su estado.
  3. Cuando está `readyToUse`, se crean los agentes es/en del sitio con ese avatar, se borra la foto del servidor y se ofrece «volver al avatar general».
  4. Máximo 20 sitios, para respetar el límite de 100 agentes. Si hace falta persistir los ids, va una migración aditiva `0016` (con el OK de Jorge al desplegar).

## Frentes y orden

Constructores: **Muse** y **DSH**, máximo dos frentes, con rutas disjuntas. **Codex** (el Sol más alto) verifica en solo lectura y rescata. El director redacta los encargos, ejecuta las pruebas, hace commit, push y fusión, y no programa. Contadores por defecto: 3 intentos, intercambio con 3 más y rescate de Codex con 2.

| Día (ECT) | Frente | Quién | Rutas | Meta comprobable |
| --- | --- | --- | --- | --- |
| Vie 27 | Inicio | Director | — | Sondas reales de Muse, DSH y Codex; checkpoint |
| Vie 27 | F0 | DSH | `scripts/verificar.mjs`, `apps/web/vitest.config.ts` o `app-site-orb.test.tsx` | `npm run verificar` corre en Windows; el orbe pasa |
| Vie 27 | F1 | Muse | carpeta principal: ramas de #49 y #50 | #49: plan fusionado + CHANGELOG → CI verde → veredicto → squash. #50: plan + host.ts (`muestra` enrutable) + SP6-D-4 + arreglo del CI de shared → squash. 0 omitidas |
| Vie 27–Sáb 28 | F2 | DSH | worktree: `apps/api/src/napster/**`, `routes/avatar-session.ts`, `scripts/napster/**`, `packages/shared/src/avatar-session.ts`, sus pruebas | Endpoint con un fetch falso: token, 409, 429 y 403; sin red en las pruebas |
| Sáb 28 | F3 | Muse | `apps/web/src/components/avatar/**`, `packages/shared/src/avatar-tools.ts`, `ui-guide.ts` (lista raíz), montaje en `PortalLandingView` | Avatar en la portada para el Público; consentimiento; tools del público; modo texto |
| Sáb 28 | Real | Director + Jorge | `.env` (lo llena Jorge) | Diagnóstico del host; Jorge elige avatar y voz; `setup.mjs`; sesión corta real; **despliegue 1** |
| Dom 29 | F4 | DSH (servidor) ∥ Muse (web) | perfiles, `initialSpeech`, tools de creador e invitado, conocimiento | Los 3 saludos con nombre del evento; borrador y recordatorio por tool |
| Dom 29 | F5 | DSH (api) ∥ Muse (web) | `apps/api/src/ai/**`, `voice/**`, deps, `config.ts`, i18n, marca | `git grep -iE "gemini|openai|assemblyai|genai"` vacío en el código; legado con Napster; marca Somos Panas; **despliegue 2** |
| Lun 30 | F6 | El constructor libre | ajustes del sitio, `napster/companions.ts` | Avatar con la foto de Jorge en su sitio (si se genera a tiempo) |
| Lun 30 | Docs | Director | README, `docs/JUDGES.md`, `docs/NAPSTER.md` (reemplaza `GEMINI.md`), `DEVPOST_DRAFT.md`, `VIDEO_SCRIPT.md`, `AGENTS.md` | Resumen ≤ 500 palabras con declaración de agentes de IA; guion de 3 min |
| Lun 30 | Cierre | Jorge | — | Congelamiento a las 12:00, despliegue final, video y entrega antes de las 20:00 ECT |

Fuera de alcance antes del plazo: SP-9 (recaudaciones anotadas, migración) y SP-11 (examen). La avatar no promete funciones que no existen.

## Verificación

- Por frente: `npm run verificar` con Postgres 16 (`somospanas-pg`) y **0 omitidas**, más las pruebas focales del encargo y el veredicto de Codex en solo lectura.
- Pruebas obligatorias de permisos: el visitante lo decide el servidor, un evento privado no se filtra, no hay URLs del modelo y la lista de tools es cerrada. También las de dinero en el legado (`payment-races`, `funding`, `webhook-header`, una cotización por invitado).
- Prueba real (director, dentro del tope de USD 40, con registro en `.local/coord/NAPSTER-GASTO.md`):
  1. Diagnóstico del host.
  2. Setup.
  3. Sesión de unos 2 minutos por tipo de visitante en `localhost`.
  4. Comprobar 409 y 403 con un fetch falso, no con dinero.
- **La prueba con voz y cámara la hace Jorge**; no la daré por pasada sin su evidencia.
- Tras cada despliegue: smoke en somospanas.com (portada, `GET /api/portal/events`, token de la avatar) y rollback si falla.

## Lo que necesito de Jorge

1. Poner `NAPSTER_API_KEY` en el `.env` local, y luego en el VPS. No la leo ni la imprimo.
2. Revisar hoy el VPS: qué rama corre, si la raíz somospanas.com ya apunta a esta app y cómo desplegar. Y dar el OK a la migración 0015 con respaldo.
3. Elegir el avatar general y la voz cuando le muestre de 3 a 4 opciones del catálogo.
4. Una foto propia, con consentimiento, para la prueba del avatar con foto.
