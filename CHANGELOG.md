# CHANGELOG — Somos Panas / FiestaPay

Registro de cambios de contenido y mapa para agentes. Cada entrada anota fecha, pedido, archivos tocados y pruebas ejecutadas.

## 2026-11-21 — Pausa y traspaso

**Pedido:** Documentar pausa del programa Somos Panas (21-nov-2026) y traspaso para agentes que retomen desde el IDE sin contexto previo.

**Archivos:** `docs/TRASPASO.md` (nuevo), `docs/somospanas/PROGRESO.md`, `AGENTS.md`, `CHANGELOG.md`.

**Estado documentado:** fusionadas en `somospanas/plan` SP-1 (#43), SP-1b (#42), SP-2 (#44), SP-3 (#45), SP-4 (#47), SP-8 (#46), SP-5 (#48); PR abierto SP-7 (#49, `5abd771`, pendiente veredicto y squash); PR abierto SP-6 (#50, `3dc9cf3`, intento 2/3, bloqueo SP6-D-4); pendientes SP-9, SP-10, SP-11. Orden siguiente: verificar y fusionar #49 → SP6-D-4 e integración SP-7 en #50 → verificar y fusionar #50 → SP-9 ∥ SP-10 → SP-11.

**Pruebas:** Solo documentación; sin cambios de aplicación. No se ejecutó `npm run verificar` (ninguna prueba del mapa valida estos archivos de traspaso).

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