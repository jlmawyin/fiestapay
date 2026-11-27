# CHANGELOG — Somos Panas / FiestaPay

Registro de cambios de contenido y mapa para agentes. Cada entrada anota fecha, pedido, archivos tocados y pruebas ejecutadas.

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