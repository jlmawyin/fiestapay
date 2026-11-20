# Progreso Somos Panas

**Meta:** un solo despliegue sirve la portada de somospanas.com y un sitio por grupo en `<grupo>.somospanas.com`, con configuración propia, eventos públicos solo si su dueño los marca, recaudaciones abiertas y una capa de pagos en la que los sitios nuevos no usan PayPal.

**Director:** Meche

**Última actualización:** 20 de noviembre de 2026, 13:00 America/Guayaquil

**Uso:** desconocido

## Modelos comprobados

Lectura de fuente en `3129041` (`main`), sin ejecutar la suite y sin llamar proveedores.

- Texto de producto declarado en el código: `gemini-3.5-flash`. Voz: `gemini-3.8-live`, token efímero de un solo uso. OpenAI y AssemblyAI quedan como rollback de configuración.
- Pagos: `PayPalAdapter` en `apps/api/src/paypal/types.ts`, inyectable en pruebas. El dominio de órdenes, capturas y reembolsos sigue acoplado a columnas e ids de PayPal. Moneda USD en centavos enteros.
- Identidad actual: cookie `fp_session` HttpOnly, sin `Domain`; clave de organizador por evento; no hay tabla de cuentas.
- Esquema vigente: migraciones `0001`–`0012`. No hay `tenant_id` ni visibilidad de portada.
- Nginx y el certificado del repo nombran solo `fiestapay.somospanas.com`. La nota de octubre en `docs/internal/ESTADO.md` describe la raíz como otro sitio (WordPress).
- Este entorno de planificación tiene Node v22.23.4 y no tiene `node_modules`. El repo exige Node `>=24 <25`. `npm run check` no se ejecutó en SP-0. La primera prueba de esa red queda en SP-1.

SP-0 no modificó código de la aplicación.

## Etapas

| Id | Estado | Meta | Depende de | Paralelo con | Tamaño |
| --- | --- | --- | --- | --- | --- |
| SP-0 | hecho | Plan y tablero, sin código de la app | — | — | pequeño |
| SP-1 | pendiente | Suite y build verdes, y pruebas que fijan el comportamiento actual | — | nadie | pequeño |
| SP-2 | pendiente | Clasificar raíz, legado y sitio por el encabezado Host | SP-1 | nadie | pequeño |
| SP-3 | pendiente | Tablas de sitio, cuenta y visibilidad; eventos actuales en el sitio legado | SP-2 | nadie | mediano |
| SP-4 | pendiente | Registro, sesión y roles admin/miembro, aislados por sitio | SP-3 | SP-8 | grande |
| SP-5 | pendiente | Nombre, textos, colores y módulos editables por el admin | SP-4 | SP-8 | mediano |
| SP-6 | pendiente | Portada C2 y listado solo de lo marcado público | SP-5 | SP-7, SP-8 | grande |
| SP-7 | pendiente | Plantilla `muestra` y clonación sin gente ni dinero | SP-5 | SP-6, SP-8 | pequeño |
| SP-8 | pendiente | Proveedor `none` en sitios nuevos; PayPal solo en el legado | SP-3 | SP-4, SP-5, SP-6, SP-7 | grande |
| SP-9 | pendiente | Recaudaciones anotadas por el grupo, fuera del libro PayPal | SP-6, SP-8 | SP-10 | mediano |
| SP-10 | pendiente | Tutorial de la raíz por voz y texto, sin herramientas de cobro | SP-6 | SP-9 | mediano |

El detalle de archivos, criterios y comandos está en [PLAN.md](PLAN.md).

## Defectos

| Id | Etapa | Descripción | Estado |
| --- | --- | --- | --- |
| — | SP-0 | Ninguno. Esta etapa no cambia la aplicación. | — |

## Bloqueos

Ninguno impide SP-1. Las decisiones D1–D9 están en [PLAN.md](PLAN.md), con recomendación.

- D1 bloquea el corte de producción de la raíz y de `fiestapay.somospanas.com`. Ese corte no forma parte de SP-1–SP-10.
- D2 bloquea un cobro real en Ecuador. SP-8 avanza con el proveedor `none` y deja PayPal en el sitio legado.
- D3, si el dueño rechaza correo y contraseña, bloquea SP-4. Hasta entonces SP-4 sigue la recomendación.
- D5, si el dueño no quiere anotaciones manuales, cambia el alcance de SP-9 antes de escribir `0014_collections.sql`.
- D9, si el dueño quiere otro slug de plantilla, hay que decirlo antes de SP-7.

## Siguiente paso exacto

Meche asigna SP-1 a un constructor. Propiedad única: `apps/api/test/somospanas-baseline.test.ts`. Sin cambios en `apps/api/src`, `apps/web/src`, `packages/shared/src`, migraciones, Dockerfile ni Nginx. Node 24, Postgres 16 como en CI, `npm run check` en cero y la prueba nueva cubre los cinco hechos del criterio de SP-1 en el plan. Al cerrar, actualiza la fila SP-1 de esta tabla, la hora America/Guayaquil y los defectos si aparecen.
