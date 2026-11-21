# Traspaso — Somos Panas (pausa 21-nov-2026)

Informe para **cualquier agente nuevo** que retome el proyecto sin historial previo. El código sigue en este monorepo (FiestaPay + capa multiinquilino). **No desplegar ni fusionar a `main` sin Jorge.**

## Resumen del proyecto

**Somos Panas** convierte el mismo despliegue en:

- **Raíz** (`somospanas.com`): portada C2, registro/inicio de sesión, creación de espacios, listado de eventos/recaudaciones **públicos**.
- **Legado** (`fiestapay.somospanas.com`): FiestaPay con PayPal sandbox, sin cambiar el comportamiento acordado en SP-1.
- **Sitio de grupo** (`<slug>.somospanas.com`): tenant propio, proveedor de pago `none`, configuración editable (SP-5), cuentas y roles aislados por host (SP-4).

Un request se clasifica por el encabezado **`Host`** (SP-2). La cookie `fp_session` no lleva `Domain`: raíz y cada subdominio tienen sesiones distintas. Importes en **centavos enteros** en servidor; el libro PayPal solo en legado (SP-8).

**Arquitectura (una línea):** navegador → Nginx → Fastify (`apps/api`) + React/Vite (`apps/web`) → PostgreSQL 16; Gemini para IA del producto legado; Somos Panas no exige llamadas reales a proveedores para cerrar etapas.

Diagrama y tablas en [somospanas/PLAN.md](somospanas/PLAN.md). Estado de etapas en [somospanas/PROGRESO.md](somospanas/PROGRESO.md).

## Cómo levantar y probar

Requisitos alineados con CI (`.github/workflows/ci.yml`):

| Requisito | Valor |
| --- | --- |
| Node | `>=24 <25` |
| Postgres | 16 |
| `DATABASE_URL` | `postgres://fiestapay:ci-only-password@localhost:5432/fiestapay_test` (como CI) |

Pasos habituales:

```bash
npm ci
npx playwright install chromium
export DATABASE_URL=postgres://fiestapay:ci-only-password@localhost:5432/fiestapay_test
npm run verificar          # valida contenido/ + esquemas/ + npm run check
npm run dev                # vista previa local
```

Prueba focal de una etapa (ejemplo):

```bash
npx vitest run apps/api/test/clone-site.test.ts
```

**Regla de oro:** con `DATABASE_URL` mal configurada las pruebas de integración **se omiten**; eso **no** cuenta como verde. Objetivo: **0 omitidas** antes de pedir revisión.

Migraciones: el arranque aplica SQL nuevos vía `apps/api/src/db/migrate.ts` (candado de aviso `778899123`). En `somospanas/plan` están `0001`–`0014`; `0015_site_create_limits` llega con SP-7.

## Reglas del repositorio (obligatorias)

### Migraciones

- **`0001`–`0015`:** inmutables una vez fusionadas. Solo migraciones **aditivas** nuevas (SP-9 añadirá `0014_collections.sql` según PLAN; no confundir con `0014_account_email_verify` de cuentas).
- Nunca editar migraciones ya publicadas en `somospanas/plan`.

### Comentarios (español, con criterio)

- Cabecera en cada **archivo nuevo**: qué hace y de qué depende.
- Comentario corto en cada **función importante**: para qué, entrada, salida.
- En cada arreglo de defecto: **por qué** + id (`SP6-D-4`, `SP7-D-3`, … en `PROGRESO.md`).
- No comentar lo obvio.

### Método y niveles ([somospanas/METODO.md](somospanas/METODO.md))

| Nivel | Qué |
| --- | --- |
| 1 | Contenido (`contenido/`, `datos/`) |
| 2 | Estructura (bloques, tipos de evento) |
| 3 | Diseño (`estilos/tokens.css`) |
| 4 | Lógica, seguridad, subdominios, cuentas, pagos |

**Casi todo el plan SP-1…SP-10 es nivel 4:** no fusionar sin Jorge y veredicto de verificación independiente. SP-11 es nivel 1 (examen).

### Mapa de edición

Tabla «Quiero cambiar…» en [AGENTS.md](../AGENTS.md). Tras cada etapa: actualizar `AGENTS.md`, `CHANGELOG.md` y la fila correspondiente en `PROGRESO.md`.

### Secretos y dinero

- Sin secretos en Git, logs ni prompts de revisión.
- `ACCOUNTS_EMAIL_HMAC_KEY` debe existir en **producción** antes de desplegar cuentas (SP-4).
- Sin cobros live ni envíos SMTP/WhatsApp reales en pruebas sin aprobación de Jorge.

## Dónde está el trabajo ahora

Rama de integración: **`somospanas/plan`**. PRs abiertos:

| Etapa | PR | Rama | Último commit | Estado |
| --- | --- | --- | --- | --- |
| SP-7 | [#49](https://github.com/jlmawyin/fiestapay/pull/49) | `cursor/sp-7-plantilla-0788` | `5abd771` | Código y CI OK; falta veredicto y squash |
| SP-6 | [#50](https://github.com/jlmawyin/fiestapay/pull/50) | `cursor/sp-6-portada-b93a` | `3dc9cf3` | Intento 2/3; bloqueo SP6-D-4; rebase tras SP-7 |

Fusionado en `somospanas/plan`: SP-1 (#43), SP-1b (#42), SP-2 (#44), SP-3 (#45), SP-4 (#47), SP-8 (#46), SP-5 (#48).

## Siguiente paso exacto

1. **SP-7 (#49)** — Verificación independiente del diff; confirmar rescate SP7-D-3 (`setRecoveryContact` + 404 coherente). Si **APROBADO**: marcar PR listo; **squash** a `somospanas/plan`. Alcance del PR: `POST /api/sites`, `POST /api/sites/handoff`, `ensureMuestraTemplate`, límites `0015`, `muestra` enrutable pero no elegible al crear.

2. **SP-6 (#50)** — **No** intento 3 hasta fusionar SP-7.
   - **SP6-D-4:** en `apps/web/src/styles/portal-landing.css`, placeholder del compositor con `color: var(--sp-color-ink-muted); opacity: 1;`; prueba en página renderizada (contraste).
   - Rebase/merge `somospanas/plan`: resolver `CHANGELOG.md` y `apps/api/src/lib/host.ts`. **`muestra` debe seguir enrutable**; la lista reservada (`RESERVED_SITE_SLUGS` / `site-slug.ts`) no debe impedir servir `muestra.somospanas.com`.
   - Recomendaciones opcionales: botón sin `opacity: 0.65`; `import.meta.env.DEV`; no duplicar regex en `site-host.ts`; frase de capturas en `CHANGELOG`.
   - Tras verde con **0 omitidas**, verificar y squash.

3. **SP-9 ∥ SP-10** — Dos PR contra `somospanas/plan`, archivos disjuntos según [PLAN.md](somospanas/PLAN.md).

4. **SP-11** — Examen «Cumpleaños»; sesión nueva; un intento; solo archivos del mapa.

## Plantilla corta de encargo

Copiar y completar para Jorge o para un agente en el IDE:

```markdown
## Contexto
Etapa: SP-__
Rama base: somospanas/plan
Rama de trabajo: cursor/sp-__-…-fae2
Depende de: (PRs fusionados / etapas)
Alcance: SOLO lo listado abajo (no refactors colaterales).

## Archivos autorizados
- …

## Criterios de aceptación
- (copiar de PLAN.md § SP-__)
- AGENTS.md, CHANGELOG.md, PROGRESO.md si corresponde
- Comentarios en español según reglas del plan

## Comandos de verificación
export DATABASE_URL=postgres://fiestapay:ci-only-password@localhost:5432/fiestapay_test
npm run verificar
npx vitest run <archivos focal de la etapa>
# Objetivo: 0 pruebas omitidas
```

## Plantilla de verificación

```markdown
VEREDICTO: APROBADO | RECHAZADO
Etapa: SP-__
PR: #
Commit: <sha>
Comandos ejecutados: …
Resultado: <N>/<N> pruebas, <omitidas>

Defectos (si RECHAZADO):
| Id | Archivo:línea | Reproducción | Arreglo esperado |
| --- | --- | --- | --- |
| SP_-D-_ | | | |
```

## Consejos para modelos económicos en el IDE

1. **Un objetivo por tarea** — p. ej. solo SP6-D-4, no «arreglar portada».
2. **Lista explícita de archivos** — copiar rutas del PLAN o del PR; no explorar todo el repo.
3. **Probar antes de afirmar** — `npm run verificar` o vitest focal; si hay omitidas, arreglar `DATABASE_URL` primero.
4. **No tocar fuera del encargo** — propiedad de archivos por etapa en PLAN.md (SP-4 no edita PayPal; SP-7 no edita `App.tsx`, etc.).
5. **Leer primero** este archivo, `PROGRESO.md`, la sección SP-n de `PLAN.md` y la tabla de `AGENTS.md`.
6. **Nivel 4:** entregar diff listo; la fusión la decide Jorge tras veredicto.

## Referencias rápidas

| Documento | Uso |
| --- | --- |
| [somospanas/PLAN.md](somospanas/PLAN.md) | Alcance y criterios SP-0…SP-11 |
| [somospanas/PROGRESO.md](somospanas/PROGRESO.md) | Tablero y orden siguiente |
| [somospanas/METODO.md](somospanas/METODO.md) | Filosofía editable por agentes |
| [AGENTS.md](../AGENTS.md) | Mapa de archivos |
| [CHANGELOG.md](../CHANGELOG.md) | Historial de pedidos |

---

*Documento generado en la pausa del 21-nov-2026. Actualizar `PROGRESO.md` al cerrar cada etapa.*