# CHANGELOG — Somos Panas / FiestaPay

Registro de cambios de contenido y mapa para agentes. Cada entrada anota fecha, pedido, archivos tocados y pruebas ejecutadas.

## 2026-11-20 — SP-4 · Cuentas y roles

**Pedido:** ENCARGO SP-4 — registro e inicio de sesión en la raíz (scrypt, HMAC de correo, verificación por token), cookie HttpOnly sin `Domain`, aislamiento admin entre sitios, legado con `X-Fiesta-Admin-Key` intacto; migración `0014_account_email_verify.sql`; trigger `events_fill_legacy_tenant_id` sin retirar (inserts de prueba aún omiten `tenant_id`).

**Archivos:** `apps/api/src/db/migrations/0014_account_email_verify.sql`, `apps/api/src/domain/accounts.ts`, `apps/api/src/routes/accounts.ts`, `apps/api/src/domain/access.ts` (membresías), `apps/api/src/app.ts`, `apps/web/src/views/AccountRegisterView.tsx`, `AccountLoginView.tsx`, `AccountVerifyView.tsx`, `apps/web/src/App.tsx`, `contenido/cuentas.json`, `apps/api/test/accounts.test.ts`, `apps/web/src/__tests__/accounts-form.test.tsx`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar`, `npx vitest run apps/api/test/accounts.test.ts apps/api/test/persistence-access.test.ts` (Postgres 16 como CI).

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

**Pruebas:** `npm run verificar`, `npm run check` (Postgres 16).