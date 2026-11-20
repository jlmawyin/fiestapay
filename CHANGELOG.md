# CHANGELOG — Somos Panas / FiestaPay

Registro de cambios de contenido y mapa para agentes. Cada entrada anota fecha, pedido, archivos tocados y pruebas ejecutadas.

## 2026-11-20 — SP-2 · Clasificar el Host

**Pedido:** ENCARGO SP-2 — cada request conoce si es raíz, legado, sitio o inválido; el legado se comporta igual; sitios sin tabla responden 404; mutaciones amarradas al host; webhook solo en legado.

**Archivos:** `apps/api/src/lib/host.ts`, hook en `apps/api/src/app.ts`, `apps/api/test/host.test.ts`, `AGENTS.md`, `CHANGELOG.md`.

**Pruebas:** `npm run verificar` y `npx vitest run apps/api/test/host.test.ts apps/api/test/unit.test.ts` (Postgres 16 como CI).

## 2026-11-20 — SP-1b · El mapa

**Pedido:** ENCARGO SP-1b — mapa para que un agente encuentre dónde cambiar textos, colores y tipos de evento; `npm run verificar` y `npm run dev`.

**Archivos:** `AGENTS.md` (tabla «Quiero cambiar…»), `CHANGELOG.md`, `bloques/LEEME.md`, `contenido/portada.json`, `contenido/tutorial.json`, `contenido/tipos-evento.json`, `contenido/paginas.json`, `contenido/preguntas.json`, `esquemas/*.schema.json`, `estilos/tokens.css`, `scripts/lib/validar-contenido.mjs`, `scripts/verificar.mjs`, `scripts/somospanas/*.test.ts`, `package.json` (script `verificar`, dependencias Ajv).

**Pruebas:** `npm run verificar` (validación JSON, `scripts/somospanas/portada.test.ts`, `tutorial.test.ts`, `tipos-evento.test.ts`, `tokens.test.ts`, `validacion-contenido.test.ts`, y `npm run check`).

### 2026-11-20 — SP-1b · Defectos D-1 y D-2 (intento 2)

**Pedido:** D-1 prueba real de tokens 390×844 y 1440×960 en CI; D-2 comentarios en `ejecutar` y `validadorEvento`; quitar `ajv-formats` sin uso.

**Archivos:** `estilos/tokens.css` (alturas de viewport), `scripts/somospanas/tokens.test.ts`, `scripts/somospanas/fixtures/tokens-muestra.html`, `scripts/verificar.mjs`, `scripts/somospanas/tipos-evento.test.ts`, `scripts/lib/validar-contenido.mjs`, `AGENTS.md`, `.github/workflows/ci.yml` (`playwright install` + `npm run verificar`), `package.json` (dependencia `playwright`, sin `ajv-formats`).

**Pruebas:** `npm run verificar`, `npm run check` (Postgres 16).