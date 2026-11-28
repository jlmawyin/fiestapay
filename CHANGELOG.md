# CHANGELOG — Somos Panas / FiestaPay

Registro de cambios de contenido y mapa para agentes. Cada entrada anota fecha, pedido, archivos tocados y pruebas ejecutadas.
- 2026-11-28 NAP-U1: chat limpio (deduplicación y filtrado), subtítulos visibles, foto mientras conecta, micrófono con estados, sello «Powered by Napster» y la asistente pasa de «Pana» a «tu guía».
- 2026-11-28 NAP-U2: portada de presentación (lema, botón dorado a /create con avatar, muestra con QR), tema día/noche, logo único, página 404 y limpieza de tarjetas de ejemplo.

- 2026-11-30 — NAP-S1: catálogo `contenido/avatares.json` + esquema, `GET /api/avatars`, `avatarId` en la sesión, `setup --catalog/--list-voices`, `step` en `fill_event_draft` y límite de eventos con avatar a 35 (lint y typecheck; vitest lo corre el director).

## 2026-11-27 — NAP-F6w · «Tu avatar con tu foto» en el panel del organizador

**Pedido:** NAP-F6w — sección opcional en el panel del legado donde el organizador sube SU foto (consentimiento obligatorio, JPG/PNG ≤5 MB validados en el navegador) para que Napster genere un avatar con su cara; nunca bloquea (sin avatar listo todos ven a la general). GET cada 10 s hasta ready, DELETE con confirmación para volver a la general, 409/502 amables con reintento; `open_avatar_settings` lleva y resalta la sección; la invitación dice «Te recibe {organizador}» cuando la sesión trae `agent:'custom'`.

**Archivos:** `apps/web/src/components/avatar/EventAvatarSection.tsx` (nuevo, montado en `OrganizerDashboardView.tsx`), `apps/web/src/api/client.ts` (`EventAvatarError` + GET/POST/DELETE con `X-Fiesta-Admin-Key` de `admin-key.ts`), `useNapsterSession.ts` (expone `agent`) + `NapsterAvatar.tsx` (`onAgent`), saludo en `PublicInviteView.tsx`, `toolRouter.ts` (`open_avatar_settings`), `apps/web/src/i18n/messages/avatar.ts` (27 claves es/en), `apps/web/src/styles/napster-avatar.css`, prueba `napster-event-avatar.test.tsx` (7), `AGENTS.md`.

**Pruebas:** focal 7/7 en verde; `npx eslint` y `tsc --noEmit` limpios; `npm run verificar` exit 0 (88 archivos, 791 pruebas, 0 omitidas) con `DATABASE_URL` de CI.

## 2026-11-27 — NAP-F5b · Retiro de IA propia, avatar Napster único y marca Somos Panas

**Pedido:** NAP-F5b — retirar de la web Gemini/OpenAI/AssemblyAI y la voz/chat propios; `NapsterAvatar` (Pana) único asistente en portada raíz, `/create` y portada del legado (intent create), invitación (eventSlug), panel (eventSlug+clave), demo y tutorial; formularios manuales con aviso que abre la avatar; marca visible «Somos Panas».

**Archivos:** borrados `apps/web/src/voice/`, `components/{voice,assistant,chat}/`, `CreateInterview.tsx`, `PayPalAiPanel.tsx`, `public-chat.ts`, `legacy-orb.ts`, `create-interview.ts`, catálogos `voice/guestChat/chat/orb/demoPaypalAi`, 26 pruebas IA y ~760 líneas de CSS; `api/client.ts` sin métodos IA; `Capabilities` extendida en web con `avatar?`; `UI_LABELS` rebrandeados; `package.json` sin `@google/genai` (lock del director intacto).

**Pruebas:** `npx eslint`, `tsc --noEmit`, suite web 61/485 en verde, 0 omitidas; `npm run verificar` exit 0 (mapa y check en verde con `DATABASE_URL` de CI).

## 2026-11-27 — NAP-F4 · Creador en el legado y botón de reunión en la raíz

**Pedido:** NAP-F4 (defecto NAP-F4w2) — avatar con intent:'create' en /create (CreateWizard) y en la portada del legado (LandingView); el panel manda eventSlug y la clave de organizador en la misma cabecera del panel; botón «Organizar una reunión» en la portada raíz hacia /create del host legado (URL desde app-host, nunca del modelo).

**Archivos:** `apps/web/src/components/avatar/*` (prop intent), `CreateWizard.tsx`, `LandingView.tsx`, `OrganizerDashboardView.tsx` (solo montar), `PortalLandingView.tsx` (solo el botón), `apps/web/src/lib/app-host.ts` (helper legacyCreateUrl), `apps/web/src/api/client.ts` (clave en avatar-session), `apps/web/src/i18n/messages/avatar.ts`, prueba `napster-legacy-creator.test.tsx`, `CHANGELOG.md`.

**Pruebas:** focal napster web y `npm run verificar` con `DATABASE_URL` de CI.

## 2026-11-27 — NAP-F4w · Invitado, creador y modo texto Napster

**Pedido:** ENCARGO F4w — saludos de invitado («Te invitaron a {evento}», sesión con eventSlug, 404→público silencioso) y creador (dashboard del organizador) con sus tools, e intent:'create' para la siguiente sesión tras crear espacio; modo texto por WebSocket con la misma avatar («Prefiero leer» y respaldo de 409/micro/WebRTC), con recorrido fijo si el chat también falla.

**Archivos:** `apps/web/src/components/avatar/*` (useNapsterSession con texto+eventSlug+404, NapsterAvatar con props y chat, toolRouter con 4 tools nuevas+setVisitor, sessionIntent, reminderPrefill), `apps/web/src/api/client.ts` (mode/socketUrl locales), `apps/web/src/i18n/messages/avatar.ts`, `apps/web/src/styles/napster-avatar.css`, montaje en `PublicInviteView.tsx` y `OrganizerDashboardView.tsx`, puntos de relleno en `CreateWizard.tsx` (descripción) y `ReminderDrafts.tsx` (campo general), pruebas `napster-text-mode.test.tsx`, `napster-visitors.test.tsx`, `napster-tool-router-f4w.test.ts`, `napster-avatar-session-text.test.ts` (+ 5 aserciones F3 superadas por F4w), `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** focales napster web y `npm run verificar` con `DATABASE_URL` de CI.

## 2026-11-27 — NAP-F3 · Avatar Napster en la portada (Público)

**Pedido:** ENCARGO F3 — en la portada raíz, una avatar Napster con video y voz recibe al visitante Público: tarjeta de bienvenida con consentimiento explícito (voz y video los procesa Napster), video inline tras el clic, subtítulos, tools del público ejecutadas por la app con listas cerradas y respaldo fijo de lectura (tutorial.json) si el video no está disponible.

**Archivos:** `apps/web/src/components/avatar/NapsterAvatar.tsx`, `apps/web/src/components/avatar/useNapsterSession.ts`, `apps/web/src/components/avatar/toolRouter.ts`, `apps/web/src/i18n/messages/avatar.ts` (+ registro suelto en `messages/index.ts`), `apps/web/src/styles/napster-avatar.css`, `apps/web/src/api/client.ts` (solo `createAvatarSession`, `endAvatarSession`, `queueAvatarSessionEnd` y `AvatarSessionError`), `apps/web/src/views/PortalLandingView.tsx` (solo monta `<NapsterAvatar />` en el hero), pruebas `napster-avatar.test.tsx`, `napster-tool-router.test.ts`, `napster-avatar-session.test.ts`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npx vitest run src/__tests__/napster-avatar.test.tsx src/__tests__/napster-tool-router.test.ts src/__tests__/napster-avatar-session.test.ts src/__tests__/portal-landing.test.tsx` (web) y `npm run verificar` con `DATABASE_URL` de CI.

## 2026-11-27 — NAP-F6s · Avatar con la foto del organizador

**Pedido:** NAP-F6s — permitir que el organizador del host legado suba su foto con consentimiento, cree un companion Napster v1 y, cuando esté listo, use agentes propios para recibir a invitados y al organizador; borrar la foto al quedar listo.

**Archivos:** migración `0016_event_avatars.sql`, `apps/api/src/domain/event-avatars.ts`, `apps/api/src/routes/event-avatar.ts`, `apps/api/src/routes/avatar-session.ts`, `apps/api/src/napster/client.ts`, `apps/api/src/app.ts`, `packages/shared/src/avatar-session.ts`, `scripts/napster/diagnostico.mjs`, `apps/api/test/event-avatar.test.ts`, `apps/api/test/avatar-session.test.ts`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run lint` y typecheck de shared/API en verde; pruebas focales de avatar y `event-avatar.test.ts` en verde con fetch falso. El director ejecuta `npm run verificar`.

## 2026-11-27 — NAP-F5a · Retiro de proveedores de IA y marca Somos Panas

**Pedido:** NAP-F5a — dejar Napster como única IA del servidor: borrar módulos, rutas, configuración, scripts y pruebas de los proveedores anteriores; reportar `avatar` en capacidades; cambiar la marca visible del servidor a Somos Panas; actualizar documentación pública y este registro.

**Archivos:** `apps/api/src/ai/**` (borrado), rutas `chat.ts`, `organizer-assistant.ts`, `suggest.ts`, `reminders.ts`, `voice.ts` (borradas), pruebas de chat/voz/draft/suggest/reminders/policy (borradas), `apps/api/src/app.ts`, `config.ts`, `index.ts`, `routes/deps.ts`, `routes/settings.ts`, `routes/core.ts`, `payments/provider.ts`, `packages/shared/src/index.ts`, `ui-guide.ts`, `apps/api/package.json`, `scripts/check-providers.mjs`, `scripts/smoke-providers.mjs` (borrado), `.env.example`, `email/compose.ts`, `domain/events.ts`, `docs/GEMINI.md` (borrado), `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/JUDGES.md`, `docs/HISTORY.md`, `docs/DEVPOST_DRAFT.md`, `docs/AI_TOOLS.md`, `docs/DEMO_90_SECONDS.md`, `docs/OPERATIONS.md`, `docs/TRASPASO.md`, `docs/ENCARGO-somospanas-napster.md`, `CHANGELOG.md`.

**Pruebas:** `npm run lint` y typecheck del API/shared en verde. El director ejecuta `npm run verificar`. La web queda pendiente de F5b.

## 2026-11-27 — NAP-F2/F4s · Modo texto, instrucciones, conocimiento y FAQ

**Pedido:** NAP-F4s — extender `POST /api/avatar-session` con `mode:'video'|'text'` (WebSocket + `modality:'text'` y URL del socket resuelta por el servidor), mejorar las instrucciones y los tres saludos, publicar conocimiento es/en, ampliar la FAQ y configurar dos colecciones por idioma y una base de conocimiento opcional en `setup.mjs`.

**Archivos:** `packages/shared/src/avatar-session.ts`, `apps/api/src/routes/avatar-session.ts`, `contenido/avatar.json`, `contenido/preguntas.json`, `contenido/conocimiento/somospanas.{es,en}.md`, `apps/web/public/conocimiento/somospanas.{es,en}.md`, `scripts/napster/setup.mjs`, `scripts/napster/setup.d.mts`, `apps/api/test/avatar-session.test.ts`, `apps/api/test/avatar-setup.test.ts`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run lint`, `npm run typecheck`; el director ejecuta `npx vitest run apps/api/test/avatar-session.test.ts apps/api/test/avatar-setup.test.ts packages/shared/test/avatar-tools.test.ts` y `npm run verificar` (sin red hacia Napster).

## 2026-11-21 — Pausa y traspaso

**Pedido:** Documentar pausa del programa Somos Panas (21-nov-2026) y traspaso para agentes que retomen desde el IDE sin contexto previo.

**Archivos:** `docs/TRASPASO.md` (nuevo), `docs/somospanas/PROGRESO.md`, `AGENTS.md`, `CHANGELOG.md`.

**Estado documentado:** fusionadas en `somospanas/plan` SP-1 (#43), SP-1b (#42), SP-2 (#44), SP-3 (#45), SP-4 (#47), SP-8 (#46), SP-5 (#48); PR abierto SP-7 (#49, `5abd771`, pendiente veredicto y squash); PR abierto SP-6 (#50, `3dc9cf3`, intento 2/3, bloqueo SP6-D-4); pendientes SP-9, SP-10, SP-11. Orden siguiente: verificar y fusionar #49 → SP6-D-4 e integración SP-7 en #50 → verificar y fusionar #50 → SP-9 ∥ SP-10 → SP-11.

**Pruebas:** Solo documentación; sin cambios de aplicación. No se ejecutó `npm run verificar` (ninguna prueba del mapa valida estos archivos de traspaso).

## 2026-11-20 — SP-6 · Portada C2 y listado público

**Pedido:** ENCARGO SP-6 (intento 1/3) — la raíz `somospanas.com` muestra la portada C2 leída de `contenido/`; `GET /api/portal/events` lista solo eventos `public`; admin de sitio marca visibilidad; legado FiestaPay conserva `LandingView`; botón crear espacio llama `POST /api/sites` (estado no disponible con 404 hasta SP-7).

**Archivos:** `apps/api/src/domain/portal.ts`, `apps/api/src/routes/portal.ts`, `apps/api/src/app.ts`, `apps/web/src/views/PortalLandingView.tsx`, `apps/web/src/lib/app-host.ts`, `apps/web/src/styles/portal-landing.css`, `apps/web/src/App.tsx`, `apps/web/src/api/client.ts`, `apps/web/src/lib/legacy-orb.ts`, `contenido/portada.json`, `contenido/paginas.json`, `esquemas/portada.schema.json`, pruebas portal y visual, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/portal-listing.test.ts apps/web/src/__tests__/portal-landing.test.tsx`, capturas Playwright `sp6-portada-mobile-390x844.png` y `sp6-portada-desktop-1440x960.png` (API real + `apps/web/dist`, Postgres 16 en el harness de integración).

### 2026-11-20 — SP-6 · Correcciones verificador (intento 2)

**Pedido:** SP6-D-1…D-7 — idioma en barra de portada; enlaces tutorial/iniciar sesión; sin TutorialView en raíz; contraste WCAG AA; listado sin `legacy` y badge Ejemplo en `template`; PUT `accessCode` en evento `public` → 400; validación de slug en compositor; recomendaciones de prueba/mock, override de host solo dev/test, pie Somos Panas.

**Archivos:** `PortalLandingView.tsx`, `App.tsx`, `portal-landing.css`, `portal.ts`, `events.ts`, `packages/shared/src/site-slug.ts`, `portal-listing.test.ts`, `portal-landing.test.tsx`, `app-root-portal.test.tsx`, `portal-contrast.test.ts`, `portal-visual.test.ts`, `contenido/portada.json`, `app-host.ts`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar` (mapa somospanas verde); `npx vitest run apps/api/test/portal-listing.test.ts apps/web/src/__tests__/portal-landing.test.tsx` (19/19); Playwright 390×844 y 1440×960 con API + dist; `npm run check` sigue con 3 fallos ajenos en `apps/api/test/api.test.ts` (`startsAt` pasado, SP-7).

## 2026-11-20 — SP-7 · Plantilla y clonación

**Pedido:** ENCARGO SP-7 — plantilla idempotente `muestra`, `POST /api/sites` en la raíz (sesión verificada, límite por usuario/IP), clonación de colores/módulos/textos sin gente ni dinero; handoff de un solo uso en el subdominio; eventos privados de sitios no legados ocultan cuerpo en raíz/legado salvo admin del sitio; subdominio `muestra` enrutable si existe fila (sigue reservado al crear).

**Archivos (intento 1):** `apps/api/src/domain/sites.ts`, `apps/api/src/routes/sites.ts`, `apps/api/src/domain/access.ts`, `apps/api/src/routes/core.ts`, `apps/api/src/app.ts`, `apps/api/src/lib/host.ts`, `apps/api/src/db/migrations/0015_site_create_limits.sql`, `apps/api/test/clone-site.test.ts`, `apps/api/test/payment-provider.test.ts`, `packages/shared/src/server-errors.ts`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/clone-site.test.ts apps/api/test/accounts.test.ts` (Postgres 16 como CI).

### 2026-11-20 — SP-7 · Corrección verificador SP7-D-1 (intento 2)

**Pedido:** SP7-D-1 — cerrojo de eventos private de grupo centralizado en `findEventBySlug`/`getEventBySlug` con `EventPortalGate` en join, rsvp, quote, orders, dashboard, chat, moderación, recuperación, voz, recordatorios y organizador; R-1 comentario/caso cookie sin Domain; R-2 `muestra` con `discoverable=false`; R-4 TODO `fundingForNewEvent` en altas futuras de eventos por sitio.

**Archivos:** `apps/api/src/domain/read.ts`, `apps/api/src/domain/access.ts`, `apps/api/src/domain/events.ts`, `apps/api/src/domain/rsvp.ts`, `apps/api/src/domain/quotes.ts`, `apps/api/src/domain/orders.ts`, `apps/api/src/domain/dashboard.ts`, `apps/api/src/domain/moderation.ts`, `apps/api/src/domain/recovery.ts`, `apps/api/src/ai/chat.ts`, `apps/api/src/routes/core.ts`, `apps/api/src/routes/payments.ts`, `apps/api/src/routes/chat.ts`, `apps/api/src/routes/moderation.ts`, `apps/api/src/routes/recovery.ts`, `apps/api/src/routes/voice.ts`, `apps/api/src/routes/reminders.ts`, `apps/api/src/routes/organizer-assistant.ts`, `apps/api/src/domain/sites.ts`, `apps/api/test/clone-site.test.ts`, `apps/api/test/api.test.ts`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/clone-site.test.ts apps/api/test/accounts.test.ts apps/api/test/payment-provider.test.ts` (Postgres 16 como CI).

### 2026-11-21 — SP-7 · Corrección verificador SP7-D-2 (intento 3)

**Pedido:** SP7-D-2 anti-enumeración en recuperación; `listOwnedEvents` con cerrojo en raíz/legado; R-3 y comentarios (sites, read, insertEvent).

**Archivos:** `apps/api/src/domain/access.ts`, `apps/api/src/domain/recovery.ts`, `apps/api/src/domain/events.ts`, `apps/api/src/domain/read.ts`, `apps/api/src/domain/sites.ts`, `apps/api/src/routes/core.ts`, `apps/api/test/recovery.test.ts`, `apps/api/test/clone-site.test.ts`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/clone-site.test.ts apps/api/test/accounts.test.ts apps/api/test/payment-provider.test.ts apps/api/test/recovery.test.ts` (Postgres 16 como CI).

### 2026-11-21 — SP-7 · Rescate SP7-D-3

**Pedido:** SP7-D-3 — `setRecoveryContact` recibía el cerrojo como `_gate` y no lo usaba. Con SMTP encendido y correo válido, un evento private de un tenant group en raíz o legado llegaba a `assertAdminKey` (403, o 200 con la clave: fila, correo y `charge`) en vez del 404 «Evento no encontrado» de un slug inexistente. Tras validar SMTP y el correo, si `groupPrivateEventHiddenOnPortal` es verdadero se lanza ese 404 antes de `lockBySlug`, sin charge, sin filas y sin correo. El admin del propio sitio sigue. Revisión de `_gate` y de parámetros `gate` en dominios por slug: el único ignorado era este.

**Archivos:** `apps/api/src/domain/recovery.ts`, `apps/api/src/domain/access.ts` (comentario de la función booleana), `apps/api/test/recovery.test.ts`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`; `npx vitest run apps/api/test/clone-site.test.ts apps/api/test/accounts.test.ts apps/api/test/payment-provider.test.ts apps/api/test/recovery.test.ts` (Postgres 16, `DATABASE_URL` como CI).

## 2026-11-20 — SP-5 · Configuración editable del sitio

**Pedido:** ENCARGO SP-5 — el admin del subdominio guarda nombre, textos, colores y módulos validados con Ajv y contraste en servidor; lectura pública en `/api/site/profile`; voz pública del sitio en `/api/site/voice/public/token` responde 404 con `asistente` apagado; legado ignora el módulo; pantalla de ajustes y tema CSS por sitio en la web.

**Archivos:** `apps/api/src/domain/tenant-settings.ts`, `apps/api/src/routes/settings.ts`, `apps/api/src/routes/accounts.ts`, `apps/api/src/domain/access.ts`, `apps/api/src/app.ts`, `apps/web/src/App.tsx`, `apps/web/src/views/SiteHomeView.tsx`, `apps/web/src/views/SiteSettingsView.tsx`, `apps/web/src/lib/site-*.ts`, `contenido/sitio.json`, `esquemas/sitio-ui.schema.json`, `scripts/lib/validar-contenido.mjs`, `apps/api/test/tenant-settings.test.ts`, `apps/api/test/accounts.test.ts`, `apps/web/src/__tests__/site-settings-view.test.tsx`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/tenant-settings.test.ts` (Postgres 16 como CI).

### 2026-11-20 — SP-5 · Correcciones verificador (intento 2)

**Pedido:** SP5-D-1 tokens `--sp-color-*` visibles en sitio; SP5-D-2 comentarios entrada/salida; SP5-D-3 `displayName` solo espacios; SP5-D-4 `additionalProperties` en errores Ajv; SP5-D-5 voz sitio 404 hasta SP-10 sin orbe FiestaPay; SP5-D-6 textos en `contenido/sitio.json`; SP5-D-7 pruebas orbe/recaudación; contraste ink sobre yellow.

**Archivos:** `tenant-settings.ts`, `settings.ts`, `site-theme.ts`, `SiteHomeView.tsx`, `SiteSettingsView.tsx`, `App.tsx`, `client.ts`, `contenido/sitio.json`, pruebas web/api, `CHANGELOG.md`, `AGENTS.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/tenant-settings.test.ts apps/api/test/accounts.test.ts` (Postgres 16 como CI).

### 2026-11-20 — SP-5 · Correcciones verificador (intento 3)

**Pedido:** SP5-D-7 — `LEGACY_ORB_MODES` y `shouldRenderLegacyOrb` con pruebas que fallan al quitar la guarda de host sitio o al incluir `site-home`; perfil de prueba con `asistente: true`.

**Archivos:** `apps/web/src/lib/legacy-orb.ts`, `App.tsx`, `apps/web/src/__tests__/app-site-orb.test.tsx`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/tenant-settings.test.ts apps/api/test/accounts.test.ts apps/web/src/__tests__/app-site-orb.test.tsx` (Postgres 16 como CI).

## 2026-11-20 — SP-8 · Proveedor de pago intercambiable

**Pedido:** ENCARGO SP-8 — sitios nuevos con `none` (503 al crear orden, sin filas en `orders`, sin `funding_status` open); legado PayPal sandbox intacto; interfaz sin botón PayPal en `none`; `GET /api/demo/buyer` solo en host legado.

**Archivos:** `packages/shared/src/payments.ts`, `packages/shared/src/index.ts`, `packages/shared/src/server-errors.ts`, `apps/api/src/payments/provider.ts`, `apps/api/src/domain/events.ts`, `apps/api/src/domain/rsvp.ts`, `apps/api/src/domain/read.ts`, `apps/api/src/domain/orders.ts`, `apps/api/src/domain/funding.ts`, `apps/api/src/domain/funding-refunds.ts`, `apps/api/src/routes/payments.ts`, hook en `apps/api/src/app.ts`, `apps/web/src/components/invite/PayPalSection.tsx`, `apps/web/src/components/invite/QuoteReviewCard.tsx`, `apps/web/src/components/invite/PaymentWizard.tsx`, `apps/web/src/views/PublicInviteView.tsx`, `apps/web/src/i18n/messages/paypal.ts`, `apps/api/test/payment-provider.test.ts`, `apps/web/src/__tests__/payment-provider-none.test.tsx`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar` y `npx vitest run apps/api/test/payment-provider.test.ts apps/api/test/payment-races.test.ts apps/api/test/funding.test.ts apps/api/test/webhook-header.test.ts` (+ `payment-provider-none.test.tsx` vía `npm run check`).

### 2026-11-20 — SP-8 · Correcciones verificador (intento 3)

**Pedido:** SP8-D-2 `paymentProvider` en respuestas RSVP/PUT y cliente fail-closed; SP8-D-6 webhooks DECLINED/REFUNDED y prueba `executeTask` en tenant `none`.

**Archivos:** `domain/rsvp.ts`, `domain/events.ts`, `domain/read.ts`, `routes/payments.ts`, `PublicInviteView.tsx`, `PaymentWizard.tsx`, `payment-provider.test.ts`, `payment-provider-none.test.tsx`, `CHANGELOG.md`.

## 2026-11-20 — SP-4 · Cuentas y roles

**Pedido:** ENCARGO SP-4 — registro e inicio de sesión en la raíz (scrypt, HMAC de correo, verificación por token), cookie HttpOnly sin `Domain`, aislamiento admin entre sitios, legado con `X-Fiesta-Admin-Key` intacto; migración `0014_account_email_verify.sql`; trigger `events_fill_legacy_tenant_id` sin retirar (inserts de prueba aún omiten `tenant_id`).

**Archivos:** `apps/api/src/db/migrations/0014_account_email_verify.sql`, `apps/api/src/domain/accounts.ts`, `apps/api/src/routes/accounts.ts`, `apps/api/src/domain/access.ts` (membresías), `apps/api/src/app.ts`, `apps/web/src/views/AccountRegisterView.tsx`, `AccountLoginView.tsx`, `AccountVerifyView.tsx`, `apps/web/src/App.tsx`, `contenido/cuentas.json`, `apps/api/test/accounts.test.ts`, `apps/web/src/__tests__/accounts-form.test.tsx`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/accounts.test.ts apps/api/test/persistence-access.test.ts` (Postgres 16; intento 2 corrige D-1–D-6 del verificador).

### 2026-11-20 — SP-4 · Correcciones verificador (intento 2)

**Pedido:** SP4-D-1 scopes en `email_attempt_windows`; D-2 sin enumeración; D-3 solo `/api/site/*` en host sitio; D-4 rotación de sesión; D-5 límites/cupo compartido; pruebas de 429, PUT/member y 404 en sitio.

**Archivos:** `0014_account_email_verify.sql`, `domain/accounts.ts`, `app.ts`, `accounts.test.ts`, vistas `Account*.tsx`, `CHANGELOG.md`.

## 2026-11-20 — SP-3 · Tablas de sitio, cuenta y visibilidad

**Pedido:** ENCARGO SP-3 — la base conoce sitios (`tenants`), cuentas (`users`, `memberships`), visibilidad `private` por defecto, `chargeable` true en filas actuales; cada evento existente recibe `tenant_id` del legado `fiestapay` sin tocar `orders` ni `payment_ledger`.

**Archivos:** `apps/api/src/db/migrations/0013_tenants.sql`, `apps/api/src/domain/events.ts`, `apps/api/src/lib/host.ts` (`legacyTenantId`), `apps/api/test/tenants-migration.test.ts`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar` y `npx vitest run apps/api/test/tenants-migration.test.ts apps/api/test/payment-races.test.ts apps/api/test/funding.test.ts` (Postgres 16 como CI).

## 2026-11-20 — SP-2 · Clasificar el Host

**Pedido:** ENCARGO SP-2 — cada request conoce si es raíz, legado, sitio o inválido; el legado se comporta igual; sitios sin tabla responden 404; mutaciones amarradas al host; webhook solo en legado.

**Archivos:** `apps/api/src/lib/host.ts`, hook en `apps/api/src/app.ts`, `apps/api/test/host.test.ts`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar` y `npx vitest run apps/api/test/host.test.ts apps/api/test/unit.test.ts` (Postgres 16 como CI).

### 2026-11-20 — SP-2 · Defectos D-1 y D-2 (intento 2)

**Pedido:** D-1 — eximir `GET`/`HEAD` `/api/health` del corte por Host en producción (healthcheck `127.0.0.1` sin legado local); D-2 — comentarios de entrada/salida en funciones clave de `host.ts`.

**Archivos:** `apps/api/src/lib/host.ts`, `apps/api/src/app.ts`, `apps/api/test/host.test.ts`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/host.test.ts apps/api/test/unit.test.ts` (Postgres 16).

## 2026-11-20 — SP-1b · El mapa

**Pedido:** ENCARGO SP-1b — mapa para que un agente encuentre dónde cambiar textos, colores y tipos de evento; `npm run verificar` y `npm run dev`.

**Archivos:** `AGENTS.md` (tabla «Quiero cambiar…»), `CHANGELOG.md`, `bloques/LEEME.md`, `contenido/portada.json`, `contenido/tutorial.json`, `contenido/tipos-evento.json`, `contenido/paginas.json`, `contenido/preguntas.json`, `esquemas/*.schema.json`, `estilos/tokens.css`, `scripts/lib/validar-contenido.mjs`, `scripts/verificar.mjs`, `scripts/somospanas/*.test.ts`, `package.json` (script `verificar`, dependencias Ajv).

**Pruebas:** `npm run verificar` (validación JSON, `scripts/somospanas/portada.test.ts`, `tutorial.test.ts`, `tipos-evento.test.ts`, `tokens.test.ts`, `validacion-contenido.test.ts`, y `npm run check`).

### 2026-11-20 — SP-1b · Defectos D-1 y D-2 (intento 2)

**Pedido:** D-1 prueba real de tokens 390×844 y 1440×960 en CI; D-2 comentarios en `ejecutar` y `validadorEvento`; quitar `ajv-formats` sin uso.

**Archivos:** `estilos/tokens.css` (alturas de viewport), `scripts/somospanas/tokens.test.ts`, `scripts/somospanas/fixtures/tokens-muestra.html`, `scripts/verificar.mjs`, `scripts/somospanas/tipos-evento.test.ts`, `scripts/lib/validar-contenido.mjs`, `AGENTS.md`, `.github/workflows/ci.yml` (`playwright install` + `npm run verificar`), `package.json` (dependencia `playwright`, sin `ajv-formats`).

**Pruebas:** `npm run verificar`.