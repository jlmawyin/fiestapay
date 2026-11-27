# FiestaPay implementation rules

> **Napster API Ignite (27 Nov 2026, Jorge):** the only runtime AI is **Napster** (avatar agents over WebRTC, text over WebSocket, tools, knowledge, FAQ). Gemini, OpenAI and AssemblyAI are being removed from code, dependencies, config and visible text, including the legacy host. Read [docs/ENCARGO-somospanas-napster.md](docs/ENCARGO-somospanas-napster.md) and [docs/internal/PLAN-NAPSTER-IGNITE.md](docs/internal/PLAN-NAPSTER-IGNITE.md) first. Where a section below says Gemini, AGY or Grok, those two documents prevail. Deadline: 30 Nov 2026 23:59 PT.

Updated by Jorge's request on 10 Nov 2026 for the final hackathon stretch (Devpost deadline 12 Nov 2026 15:00 ECT; judges test 1–15 Dec 2026). These rules supersede the October plans (docs/internal/ENCARGO_2026-10-28.md, docs/internal/PLAN_DIARIO.md), which stay as history.

## Product direction

- FiestaPay is an **AI party host that collects everyone's share with PayPal**. AI belongs in the main path: one sentence builds the invitation, the agent explains and guides by voice or text, prepares the payment and drafts reminders.
- Runtime AI is **Napster only** (since 27 Nov 2026): the server calls `POST /public/agents/{id}/connections` with `X-Api-Key` and returns only the single-use token to the browser; the Web SDK `@touchcastllc/napster-companion-api` renders the avatar. The key never reaches the browser. No Gemini, OpenAI or AssemblyAI fallback; if video fails, fall back to Napster text mode, then to the fixed script in `contenido/tutorial.json`. (The previous Gemini setup in docs/GEMINI.md is history and is being removed.)
- The interface is bilingual (Spanish/English) and follows `?lang`, then the saved preference, then the browser language.

## What agents may do in the product

- Agents **do the work and leave it ready; people make the final decision**. Allowed by text or voice: answer; build drafts on request (a whole invitation from one sentence, presentation, reminder texts) and fill the forms with them; prepare a payment (one server quote in integer cents + on-screen "Approve in PayPal") and take the guest to the payment step with the button highlighted; open allowed FiestaPay pages and highlight allowed elements (`show_on_screen`, closed lists in packages/shared/src/ui-guide.ts).
- The person always performs the final step: publish the invitation, confirm the quote review, approve in PayPal, confirm attendance or the event. Agents never pay, approve, refund, moderate, delete, send messages on someone's behalf, or press a final button. Model output is validated against closed lists; no model-supplied URLs or selectors.
- One active quote per guest: if a pending quote or order exists, the agent reuses it instead of creating another.
- Microphone use always needs the person's explicit consent and a click (browsers forbid starting audio on their own). If voice fails (token, connection or provider), the app falls back to the text chat on its own.
- Everything the person reads follows the selected language, including server-built summaries.
- WhatsApp: reminders are drafted by AI and sent by the organizer (copy or open WhatsApp). An agent inside WhatsApp (WhatsApp Business API) is future work, not in scope before the deadline.

## Money and PayPal (unchanged)

- Amounts come from the server in integer cents. No payment success without a server-verified capture. Attendance and payment are separate states. Fixed covers, fixed-price payments and one sandbox receiver; open funds, deposits and physical contributions stay out of scope.
- Never claim captured PayPal funds are held until organizer confirmation. Buyer Protection is subject to PayPal eligibility and terms. Do not change CAPTURE to AUTHORIZE or add escrow/Payouts/split payments.

## Testing, secrets and spending

- Tests for money, permissions and concurrency are required. Maximum three evaluated deliveries per defect across providers; then evidence and a new hypothesis.
- Real-provider tests only within Jorge's approved budget (Napster: USD 40 of the USD 150 credits for development tests, logged in .local/coord/NAPSTER-GASTO.md; only the director makes real calls; automated tests use a fake); measuring product metrics (accuracy, latency, cost per event) is an approved use of that budget. Sandbox only: no live funds or cards. No real WhatsApp or SMTP sends during tests without Jorge's explicit approval. Use isolated fixtures and preserve historical payments and Jorge's tester event.
- Production data is deleted or archived only with Jorge's explicit approval of the exact items, after a backup; prefer archiving to permanent deletion.
- Keys, prepaid AI balance and daily AI limits must stay active through the judging period (until 15 Dec 2026).
- No secrets in Git, logs, browser, reports or reviewer prompts. No real judge data.
- Do not claim live APIs, human tests, phone tests, video or submission passed without evidence.

## Delivery and operations

- Standing approval (Jorge, 9 Nov 2026) to merge and deploy without asking when all hold: CI green, independent AGY approval of the code and of the operator kit, backup with test restore, zero migrations, zero secret matches, smoke test, and rollback if anything fails. Deploy only through the operator kit; never change other Contabo apps, the DNS apex or global proxy defaults.
- No code freeze (Jorge, 10 Nov 2026): keep improving and deploying with the standing approval above until the Devpost submission; record the video on the deployed version. Video and Devpost submission are Jorge's; never publish on his behalf.
- Public docs stay judge-facing in English (README, docs/JUDGES.md, docs/DEVPOST_DRAFT.md, docs/VIDEO_SCRIPT.md, docs/GEMINI.md, docs/API.md, docs/ARCHITECTURE.md); internal reports and Spanish working notes live under docs/internal/.
- Use graph discovery first and check coverage; docs and new files may need exact source fallback.

## Agent routing (dirigir-agentes)

- One active director (Claude, skill director-claude, since 27 Nov 2026). Builders: Muse and DSH, at most two construction fronts with disjoint ownership; Codex (highest Sol) verifies independently in read-only mode and handles recovery. AGY and Grok are retired. OpenCode paid balance is reserved for second opinions; do not migrate DSH to a paid API automatically.
- Workers never commit or push, never revert others and never edit outside their assigned paths. Changing providers does not reset attempt counters (see dirigir-agentes/references/deepseek.md for DSH).

## Somos Panas — lectura obligatoria al empezar

El programa multiinquilino (**somospanas/plan**) quedó **en pausa** el 21-nov-2026. Antes de tocar código en esa línea:

1. [docs/TRASPASO.md](docs/TRASPASO.md) — traspaso para agentes nuevos (arquitectura, comandos, siguiente paso, plantillas).
2. [docs/somospanas/PROGRESO.md](docs/somospanas/PROGRESO.md) — qué etapas están fusionadas, PRs abiertos y orden de trabajo.
3. [docs/somospanas/PLAN.md](docs/somospanas/PLAN.md) — criterios de la etapa SP-n que vayas a hacer.
4. [docs/somospanas/METODO.md](docs/somospanas/METODO.md) — niveles de cambio; casi todo SP-1…SP-10 es **nivel 4** (no fusionar sin Jorge y veredicto independiente).

**Resumen de reglas Somos Panas:** rama de integración `somospanas/plan` (no `main` sin OK de Jorge); migraciones `0001`–`0015` inmutables una vez fusionadas; comentarios en español con cabecera, funciones importantes y id de defecto en arreglos; `npm run verificar` con Postgres 16 y **0 pruebas omitidas**; `ACCOUNTS_EMAIL_HMAC_KEY` en producción antes de desplegar cuentas; un encargo = un objetivo y solo los archivos que el PLAN asigna a esa etapa.

Las reglas de producto FiestaPay (Gemini, PayPal, hackathon) de las secciones anteriores siguen vigentes en el **sitio legado**; no las contradigas al trabajar tenants nuevos con proveedor `none`.

## Somos Panas — mapa de edición (contenido y diseño)

Método completo: [docs/somospanas/METODO.md](docs/somospanas/METODO.md). Cada cambio de contenido o tokens termina con `npm run verificar` (validación de JSON + pruebas + `npm run check`). La vista previa local de la app es `npm run dev`.

| Quiero cambiar… | Archivo | Prueba |
| --- | --- | --- |
| Sitios, cuentas, visibilidad y tenant legado en la base | `apps/api/src/db/migrations/0013_tenants.sql` + alta en `apps/api/src/domain/events.ts` | `apps/api/test/tenants-migration.test.ts` |
| Proveedor de pago por sitio (`none` vs `paypal_sandbox` en legado) | `packages/shared/src/payments.ts`, `apps/api/src/payments/provider.ts`, dominio/rutas en `orders`/`funding`/`payments`, `PayPalSection.tsx` | `apps/api/test/payment-provider.test.ts`, `apps/web/src/__tests__/payment-provider-none.test.tsx`, `payment-races`, `funding`, `webhook-header` |
| Clasificación raíz / legado / sitio por `Host` (`legacyTenantId`) | `apps/api/src/lib/host.ts` + hook en `apps/api/src/app.ts` | `apps/api/test/host.test.ts` |
| Registro, sesión, verificación de correo y roles por sitio | `apps/api/src/domain/accounts.ts`, `apps/api/src/routes/accounts.ts`, membresías en `apps/api/src/domain/access.ts`, vistas en `apps/web/src/views/Account*.tsx`, textos en `contenido/cuentas.json` | `apps/api/test/accounts.test.ts`, `apps/web/src/__tests__/accounts-form.test.tsx` |
| Configuración del sitio (nombre, colores, módulos) | `apps/api/src/domain/tenant-settings.ts`, `apps/api/src/routes/settings.ts`, `esquemas/sitio.schema.json`, pantallas `apps/web/src/views/Site*.tsx`, `apps/web/src/lib/legacy-orb.ts`, `apps/web/src/styles/site-shell.css`, textos en `contenido/sitio.json`, tokens base en `estilos/tokens.css` | `apps/api/test/tenant-settings.test.ts`, `apps/web/src/__tests__/site-settings-view.test.tsx`, `site-home-view.test.tsx`, `app-site-orb.test.tsx` |
| Plantilla `muestra`, alta `POST /api/sites` (raíz, cuenta verificada) y canje `POST /api/sites/handoff` en el subdominio | `apps/api/src/domain/sites.ts`, `apps/api/src/routes/sites.ts`, semilla `ensureMuestraTemplate`, migración `0015_site_create_limits.sql`, corte de host en `apps/api/src/app.ts` | `apps/api/test/clone-site.test.ts` |
| Texto de la portada (hero, barra, ejemplos C2) | `contenido/portada.json` | `scripts/somospanas/portada.test.ts` |
| Pasos del tutorial | `contenido/tutorial.json` | `scripts/somospanas/tutorial.test.ts` |
| Tipos de evento (catálogo / formulario) | `contenido/tipos-evento.json` + `esquemas/evento.schema.json` | `scripts/somospanas/tipos-evento.test.ts` |
| Colores, tipografía y espaciados | `estilos/tokens.css` | `scripts/somospanas/tokens.test.ts` (tokens + estilos computados 390×844 y 1440×960 vía Playwright; la portada C2 en navegador llega en **SP-6**) |
| Orden de secciones en la portada | `contenido/paginas.json` | `scripts/somospanas/portada.test.ts` |
| Preguntas frecuentes | `contenido/preguntas.json` | validación en `npm run verificar` |
| Validación del JSON guardado por el admin del sitio | `esquemas/sitio.schema.json` | `apps/api/test/tenant-settings.test.ts` y `npm run verificar` |
| Textos de la pantalla de ajustes del sitio | `contenido/sitio.json` | `apps/web/src/__tests__/site-settings-view.test.tsx` |
| Qué bloque usa cada sección | `bloques/LEEME.md` | — |

Historial de pedidos: `CHANGELOG.md`.
