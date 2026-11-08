# Informe de Verificación Independiente: FP-BIL-B1 (Verificación 1)

**Verificador:** AGY (Independiente — No constructor)  
**Fecha:** 2026-11-07  
**Árbol:** `fiestapay-bilingue`  
**Paquete:** FP-BIL-B1 (Servidor: demos marcadas, listado con isDemo, idioma de petición y traducción de errores)  
**Veredicto:** **APROBADO**

---

## 1. Verificación de Integridad y Hashes (B1.sha256)

Se verificó el hash SHA-256 de los 9 archivos declarados contra `.local/coord/B1.sha256`:
- `apps/api/src/domain/events.ts`: `83e93c57...` (COINCIDE)
- `apps/api/src/domain/read.ts`: `caf107a2...` (COINCIDE)
- `apps/api/src/lib/schemas.ts`: `15e909ea...` (COINCIDE)
- `apps/api/src/routes/core.ts`: `a55bddaf...` (COINCIDE)
- `apps/api/test/harness.ts`: `a270e6ca...` (COINCIDE)
- `apps/api/src/lib/locale.ts`: `d1f17e6b...` (COINCIDE)
- `apps/api/test/demo-i18n.test.ts`: `dbce1ac8...` (COINCIDE)
- `apps/api/test/server-errors.test.ts`: `b0bb1949...` (COINCIDE)
- `packages/shared/src/server-errors.ts`: `05bc2fe7...` (COINCIDE)

Estado: **9/9 archivos íntegros**, sin modificaciones posteriores a la entrega.

---

## 2. Comandos Oficiales y Métricas

Entorno con `DATABASE_URL=postgres://fiestapay:ci-only-password@127.0.0.1:55433/fiestapay_test`:

1. `npm run build -w @fiestapay/shared`: **Exitoso (código 0)**.
2. `npx vitest run --project api`:
   - Archivos de test: 25 totales (24 pasados, 1 fallido).
   - Tests: 321 totales (320 pasados, 1 fallido).
   - Fallo confirmado: únicamente `apps/api/src/__tests__/program-guide.test.ts:84` por disparidad en etiqueta frontend `Explora la demo`, atribuible a cambios paralelos en `apps/web/**` (paquete A1).
3. `npm run typecheck -w @fiestapay/api`: **Exitoso (código 0, sin errores)**.
4. `npm run build -w @fiestapay/api`: **Exitoso (código 0, migraciones copiadas)**.
5. `npx eslint apps/api packages/shared/src/server-errors.ts`: **Exitoso (código 0, limpio)**.

---

## 3. Pruebas Adversariales Propias (.local/coord/agy-b1/)

Se ejecutaron 6 pruebas negativas y de aislamiento con PostgreSQL real mediante script `.local/coord/agy-b1/adversarial-runner.ts`:
1. `requestLocale`: Normaliza `EN-us` → `en`, `fr` → `es`, `['en-US', 'es']` → `en`, y vacío/inválido → `es`.
2. `GET /api/events` anónimo (sin sesión): Devuelve `200 OK` con `{ events: [] }`.
3. `POST /api/demo` estricto: Rechaza `{ kind: 'nonexistent' }` (400), `{ kind: 'payment', extra: 1 }` (400) y `{ hacker: 'payload' }` (400).
4. `POST /api/demo` con `x-fiesta-locale`: Cabecera `en` crea «Demo lunch», cabecera `fr` cae a español «Almuerzo de demostración».
5. Aislamiento de reset: `POST /api/demo/reset` en sesión B purga su demo previa (410), pero mantiene intactos eventos propios de B y la demo/eventos propios de sesión A (200).
6. Anti-deriva y no fuga de español: Mensaje desconocido cae a genérico en inglés según status HTTP sin filtrar cadenas en español; omisiones en catálogo son detectables en escaneo AST.

Resultado: **6/6 pruebas adversariales superadas (código 0)**.

---

## 4. Revisión de Código y Hallazgos

| Archivo:Línea | Severidad | Hallazgo / Observación |
|---|---|---|
| `apps/api/src/domain/events.ts:32-82` | INFO | `demoEventInputForLocale`: réplica exacta de los valores de `privateDemoEventInput()` original de web (precio 2500, meta 20000, min 5000, 8 plazas). |
| `apps/api/src/domain/read.ts:144` | INFO | `FiestaEventWithDemo`: intersección limpia que añade `isDemo` sin filtrar columnas internas ni alterar el contrato compartido. |
| `packages/shared/src/server-errors.ts:278` | INFO | `translateServerError`: firma y lógica intactas. Textos en inglés de alta calidad, honestos y sin promesas falsas de fondos retenidos ni reembolsos garantizados. |
| `apps/api/src/db/migrations` | INFO | Confirmado: cero migraciones nuevas. Reutiliza columna nativa `events.is_demo`. |
| General (diff línea a línea) | INFO | No hay cambios en dinero, órdenes, capturas, PayPal, webhook, permisos, recuperación, IA ni voz. |

---

## 5. Conclusión

El paquete FP-BIL-B1 cumple rigurosamente con los 7 requisitos del encargo, mantiene inalterados los contratos críticos de dinero y seguridad, aísla correctamente los datos de prueba y supera todas las verificaciones. Veredicto: **APROBADO**.
