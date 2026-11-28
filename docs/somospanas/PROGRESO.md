# Progreso Somos Panas

**Meta:** un solo despliegue sirve la portada de somospanas.com y un sitio por grupo en `<grupo>.somospanas.com`, con configuración propia, eventos públicos solo si su dueño los marca, recaudaciones abiertas y una capa de pagos en la que los sitios nuevos no usan PayPal.

**Estado del programa:** **PAUSADO** desde el 21 de noviembre de 2026. Jorge continúa el trabajo desde el IDE de Cursor con modelos más económicos. La documentación de traspaso está en [../TRASPASO.md](../TRASPASO.md).

**Última actualización:** 21 de noviembre de 2026, America/Guayaquil

**Rama de integración:** `somospanas/plan` (no fusionar etapas pendientes a `main` sin OK explícito de Jorge).

## Lectura obligatoria para un agente nuevo

1. [TRASPASO.md](../TRASPASO.md) — arquitectura, comandos, reglas, siguiente paso y plantillas.
2. [PLAN.md](PLAN.md) — criterios por etapa SP-n.
3. [METODO.md](METODO.md) — niveles de cambio y flujo de edición.
4. [AGENTS.md](../../AGENTS.md) — mapa «Quiero cambiar…».

## Hecho en `somospanas/plan` (fusionado)

| Etapa | PR | Notas |
| --- | --- | --- |
| SP-1 | [#43](https://github.com/jlmawyin/fiestapay/pull/43) | Red de seguridad: suite y comportamiento legado fijado. |
| SP-1b | [#42](https://github.com/jlmawyin/fiestapay/pull/42) | Mapa: `contenido/`, `esquemas/`, `npm run verificar`, tabla en `AGENTS.md`. |
| SP-2 | [#44](https://github.com/jlmawyin/fiestapay/pull/44) | Clasificación del `Host` (raíz, legado, sitio). |
| SP-3 | [#45](https://github.com/jlmawyin/fiestapay/pull/45) | Migración `0013_tenants.sql`; visibilidad y `legacyTenantId`. |
| SP-4 | [#47](https://github.com/jlmawyin/fiestapay/pull/47) | Cuentas con `email_hash` HMAC; sesión por host; roles admin/miembro. |
| SP-8 | [#46](https://github.com/jlmawyin/fiestapay/pull/46) | Proveedor `none` en sitios nuevos; PayPal solo en legado. |
| SP-5 | [#48](https://github.com/jlmawyin/fiestapay/pull/48) | Configuración editable del sitio (nombre, colores, módulos). |

Migraciones presentes en `somospanas/plan`: `0001`–`0014` (`0013_tenants`, `0014_account_email_verify`). La `0015_site_create_limits` vive en el PR de SP-7 hasta fusionarse.

## Etapas

Detalle de archivos y comandos en [PLAN.md](PLAN.md). Casi todas las etapas son **nivel 4** (no fusionar sin revisión de Jorge y veredicto independiente).

| Id | Estado | Nivel | Meta | PR / rama | Falta |
| --- | --- | --- | --- | --- | --- |
| SP-0 | hecho | — | Plan y tablero | — | — |
| SP-1 | fusionado | 4 | Red de seguridad | #43 | — |
| SP-1b | fusionado | 2 | El mapa | #42 | — |
| SP-2 | fusionado | 4 | Clasificar Host | #44 | — |
| SP-3 | fusionado | 4 | Tablas sitio/cuenta/visibilidad | #45 | — |
| SP-4 | fusionado | 4 | Cuentas y roles | #47 | — |
| SP-5 | fusionado | 4 | Configuración del sitio | #48 | — |
| SP-8 | fusionado | 4 | Pagos intercambiables | #46 | — |
| SP-7 | **PR abierto** | 4 | Plantilla `muestra` y clonación | [#49](https://github.com/jlmawyin/fiestapay/pull/49) · `cursor/sp-7-plantilla-0788` · `5abd771` | Verificación independiente (sin veredicto); marcar listo; fusionar con **squash** |
| SP-6 | **PR abierto** | 4 | Portada C2 y listado público | [#50](https://github.com/jlmawyin/fiestapay/pull/50) · `cursor/sp-6-portada-b93a` · `3dc9cf3` (intento **2/3**) | Corregir **SP6-D-4**; luego intento 3; rebase sobre `somospanas/plan` **después** de fusionar SP-7 |
| SP-9 | pendiente | 4 | Recaudaciones anotadas (`0014_collections.sql`) | — | Arrancar en paralelo con SP-10 tras SP-6 |
| SP-10 | pendiente | 4 | Tutorial raíz voz/texto | — | Arrancar en paralelo con SP-9 tras SP-6 |
| SP-11 | pendiente | 1 | Examen «Cumpleaños» | — | Tras SP-9 y SP-10 |

### SP-7 (listo en código, pendiente de cierre)

- `POST /api/sites` (cuenta verificada en raíz; límites 20/IP y 5/usuario; migración `0015_site_create_limits`).
- `POST /api/sites/handoff` (canje de código en el subdominio nuevo).
- `ensureMuestraTemplate` con `discoverable=false`.
- Slug `muestra` **enrutable** (`muestra.somospanas.com` responde) y **reservado solo al crear** un espacio nuevo.
- Último rescate: **SP7-D-3** — `setRecoveryContact` aplica el cerrojo de evento privado de grupo y responde 404 igual que un slug inexistente (`5abd771`).
- CI y **1221/1221** pruebas en verde, **0 omitidas** en el PR.

### SP-6 (bloqueo menor + dependencia de SP-7)

- **SP6-D-4 (bloqueante):** contraste del placeholder del compositor **4.40:1**; arreglo en `portal-landing.css`: `.portal-compositor-row input::placeholder { color: var(--sp-color-ink-muted); opacity: 1; }` con prueba sobre la página renderizada.
- Antes del intento 3: **fusionar SP-7**, traer `somospanas/plan` a la rama SP-6 y resolver conflictos en `CHANGELOG.md` y `apps/api/src/lib/host.ts`. SP-6 re-exporta `RESERVED_SITE_SLUGS` (incluye `muestra`) desde `packages/shared/src/site-slug.ts`: no debe romper el enrutado de `muestra.somospanas.com`; `muestra` sigue enrutable y solo reservado al crear.
- Recomendaciones no bloqueantes: quitar `opacity: 0.65` del botón; usar `import.meta.env.DEV` directo; no repetir la regex en `site-host.ts`; corregir la frase del `CHANGELOG` sobre capturas.
- Los 3 fallos de `api.test.ts` en SP-6 se corrigen al integrar SP-7.

### SP-9 y SP-10 (no lanzadas; en paralelo después de SP-6)

Heredan de etapas ya fusionadas:

- **SP-9** ([PLAN.md § SP-9](PLAN.md)): migración `0014_collections.sql`; anotaciones de recaudación fuera de `orders`/`payment_ledger`; listado en portada solo si `public`; módulo `recaudacion` en SP-5; portada y `GET /api/portal/events` de SP-6; proveedor `none` de SP-8.
- **SP-10** ([PLAN.md § SP-10](PLAN.md)): `contenido/tutorial.json`; guía y voz en **solo raíz**; ids cerrados en `ui-guide.ts`; sin herramientas de cobro; mismos textos que la web; depende de la portada SP-6 y cuentas SP-4 en la barra.

### SP-11 (examen, después de SP-9 y SP-10)

Un agente **nuevo**, un solo intento, agrega el tipo «Cumpleaños» y una pregunta frecuente leyendo solo `AGENTS.md` y los archivos del mapa (nivel 1).

## Defectos abiertos

| Id | Etapa | Descripción | Estado |
| --- | --- | --- | --- |
| — | SP-7 | Verificación independiente no cerró con veredicto | pendiente |
| SP6-D-4 | SP-6 | Placeholder del compositor por debajo del contraste mínimo (4.40:1) | pendiente |
| — | SP-6 | Conflictos de merge con `somospanas/plan` tras SP-7 (`CHANGELOG.md`, `host.ts` / `muestra`) | pendiente hasta fusionar #49 |

## Despliegue y producción

- Antes de desplegar **cuentas (SP-4)** en producción debe existir **`ACCOUNTS_EMAIL_HMAC_KEY`** en el entorno del VPS (misma semántica que en pruebas; nunca en Git).
- Desplegar al VPS o fusionar `somospanas/plan` → `main` requiere **OK explícito de Jorge** (no hay aprobación automática para este plan).

## Bloqueos

- **D1** (PLAN): el corte de la raíz de producción hacia esta app sigue fuera de SP-1–SP-11.
- **D5**: si Jorge rechaza anotaciones manuales, cambia el alcance de SP-9 antes de escribir `0014_collections.sql`.

## Siguiente paso exacto (orden)

```text
1. Verificar PR #49 (SP-7) → veredicto APROBADO → marcar listo → squash a somospanas/plan
2. En #50 (SP-6): arreglo SP6-D-4 + rebase/merge de somospanas/plan (conflictos CHANGELOG + host.ts)
3. Verificar PR #50 → intento 3/3 si hace falta → squash a somospanas/plan
4. SP-9 ∥ SP-10 (dos PRs, propiedad de archivos según PLAN.md)
5. SP-11 (examen)
```

Detalle operativo, comandos y plantillas: [../TRASPASO.md](../TRASPASO.md).