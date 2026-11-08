# Informe de Verificación Independiente: FiestaPay Create Wizard (A1 y A2)

- **Fecha:** 2026-11-08
- **Verificador:** AGY (independiente, no constructor)
- **Rama:** `claude/create-wizard-20261108` (base `main` 97d8206 + contrato 2c03a6e)
- **Veredicto A1 (Web - Asistente por pasos):** APROBADO
- **Veredicto A2 (API - `POST /api/ai/suggest-presentation`):** APROBADO

---

## 1. Verificación de Integridad de Código y Hashes (CREATE.sha256)

Los 22 archivos entregados (17 de A1 y 5 de A2) coinciden con los hashes registrados en `.local/coord/CREATE.sha256`:

```
0912109fee2faea4f5656dbd17712beab833fc84dc49f9b5715179e04d8077d8 *apps/api/src/__tests__/program-guide.test.ts
036121d1b430bed50728ca74e9467353d109c8d1b108802080eb1496ec548139 *apps/api/src/ai/program-guide.ts
728df3ecebbabd443ff5c4f6cb977494a040858372ec04ad2ad1051027a88724 *apps/web/src/__tests__/admin-navigation.test.tsx
585d7d9899126ea9703733d93d106d316c858036a4e1447a80700e3775b44a4d *apps/web/src/__tests__/create-wizard.test.tsx
749314f4fa2aa3885677eb0e59b73e99b2921d1f80b71a302c291416562498e2 *apps/web/src/__tests__/form-example-warning.test.tsx
ec1f792a7838f5587904e16296871e645cda8d5aac0a17e55a682e9fa8047172 *apps/web/src/__tests__/loading-ux.test.tsx
6d3fe657f6889723623eecd4af6021dd1a8bf96a45599e05f31056ab77203efb *apps/web/src/__tests__/organizer-journey-en.test.tsx
f818caa86d0ffe6d593086b455f160f8172232d294f7533e58228981ec907197 *apps/web/src/__tests__/presentation-copy.test.tsx
c0ca7f6a030f2197b23ca29d44756405d76c638709cb45e0729aea0266ac8f54 *apps/web/src/api/client.ts
e6f4fd7109b3ecba6d95ee70bb6b3b5592f5779ea88e28243cc189100da16ab3 *apps/web/src/components/events/CreateEventForm.tsx
7d7377ccc1d515e7a665c24c7bcf5dfe3e0854255db93fe69780037ba8aa0776 *apps/web/src/components/events/CreateWizard.tsx
c79303b37b2f8aa8c2d1cef6276ad40392aa8cc041f7aada2c30bbc9fbc64212 *apps/web/src/components/events/event-form-model.ts
8cfcb2c8a946e1f92603489c5b312da5b33d6e712015f8bb492805739a90925e *apps/web/src/i18n/messages/organizerCreate.ts
4279966248572102a23bccc60d683e84dd344e362155b6229ffdecee5f370a0f *apps/web/src/index.css
bf20bbade23871db41b0159f3c1584ee79fd502c3342fb11d5ec294bf1a554dc *apps/web/src/lib/event-presentation.ts
0dd8b9d07968da5662170382f331c067e05155d64213e4d9f164a398d753d178 *apps/web/src/views/CreateEventView.tsx
95c948d77007ac985982ba72597154b04a4d6b69f7fb32a7664cad17210fce2e *packages/shared/src/presentation.ts
5ca8a59d5e700b6bf0ae9eb31366995390d62963ce2e59b216df647303e2df3e *apps/api/src/ai/suggest-presentation.ts
87fd0c354a51e896912604439dc993f9130a96f90d045e81f46f19155a9b484d *apps/api/src/app.ts
53e478791ab6c3f4ccec10baeddcc588649f5f22421a715aa93598f323b42bd2 *apps/api/src/lib/schemas.ts
7a8837db02b8ff515833b8af4c1e51cc8b0bee727b06890051254df5acfefa03 *apps/api/src/routes/suggest.ts
e31f97a4fe3deb7faeb4c5f65b7211d305bf6d1b4c43eed066837f795ec51a28 *apps/api/test/suggest-presentation.test.ts
```

No se modificó ningún archivo de producto durante la verificación.

---

## 2. Comandos y Totales Ejecutados

1. **Suite completa (`npm run check`):**
   - Comando: `$env:DATABASE_URL="postgres://fiestapay:ci-only-password@127.0.0.1:55433/fiestapay_test"; npm run check`
   - **Resultado:** Código 0 (éxito).
   - **Archivos de prueba:** 81 pasados (base main: 79; +2 archivos).
   - **Pruebas unitarias/integración:** 767 pasadas (base main: 701; +66 pruebas).
   - **Lint y Typecheck:** Cero errores en `@fiestapay/shared`, `@fiestapay/api` y `@fiestapay/web`.
   - **Build:** Correcto (Shared tsc, API tsc + copy-sql.mjs, Web vite build con 110 módulos).

2. **Pruebas adversariales independientes A1 (Web):**
   - Comando: `npx vitest run -c .local/coord/agy-create/vitest.web.config.ts`
   - **Resultado:** 1 archivo pasado, 6 pruebas pasadas (6/6).

3. **Pruebas adversariales independientes A2 (API):**
   - Comando: `$env:DATABASE_URL="postgres://fiestapay:ci-only-password@127.0.0.1:55433/fiestapay_test"; npx vitest run -c .local/coord/agy-create/vitest.api.config.ts`
   - **Resultado:** 1 archivo pasado, 6 pruebas pasadas (6/6).

---

## 3. Resultados Adversariales A1 (Web)

- **ADV-A1-1 (Paso abierto, orden, «Cambiar», campos por tipo y tope includes):** PASÓ. Un único paso abierto (`data-step-state="open"`), pasos futuros bloqueados (`data-step-state="locked"`). Repliegue y re-apertura con «Cambiar». Chips 2/3/4 h (`role="radio"`) calculan fin y deducen comida. La validación inline en paso 3 (`CreateWizard.tsx:401-402`) bloquea si `includes.length > 20` (`m.errIncludesTooMany`) o si algún elemento excede 120 caracteres (`m.errIncludesTooLong`), garantizando el tope 20 × 120.
- **ADV-A1-2 (Paridad de `EventInput` y fechas ISO):** PASÓ. La misma interacción en ES y EN genera un `EventInput` idéntico. Fechas ISO correctas en America/Guayaquil y dinero en centavos enteros (`30.00` → `3000`). Validaciones de servidor en `apps/api/src/lib/schemas.ts` intactas.
- **ADV-A1-3 (`suggestThemeFor` y botón IA):** PASÓ. `suggestThemeFor` evaluado en 17 casos exhaustivos por tipo, hora, estilo y palabras clave; siempre devuelve un tema perteneciente a la plantilla. La llamada a `api.suggestPresentation` omite organizador, clave y datos personales. Ante error/timeout/429 simula fallo sin bloquear la publicación del evento.
- **ADV-A1-4 (Edición de eventos existentes):** PASÓ. `CreateEventForm.tsx` refactorizado conserva todos los campos iniciales (`initial`), preserva la clave si no se modifica (`accessTouched`), y emite el payload actualizado. Pruebas históricas (`loading-ux.test.tsx`, `admin-navigation.test.tsx`) no sufrieron debilitamiento de aserciones.
- **ADV-A1-5 (Guía del asistente `program-guide.ts`):** PASÓ. Describe el asistente con `UI_LABELS[locale]` (`createWizardTitle`, `stepWhat`, etc.) en ES y EN, y mantiene la regla de no divulgar credenciales (`isSafeDemoAccountUiQuestion`).
- **ADV-A1-6 (Paridad i18n y CSS móvil):** PASÓ. Todas las claves de `createEventCatalog` tienen traducción no vacía en ES y EN. CSS con media queries `@media (max-width: 379px)` y `@media (max-width: 420px)` sin desbordamiento.

---

## 4. Resultados Adversariales A2 (API)

- **ADV-A2-1 (Esquema estricto y validaciones):** PASÓ. `presentationSuggestionSchema` (`schemas.ts:122-131`) es `.strict()`; rechaza campos desconocidos (400), título vacío o > 120 (400), más de 10 pistas o pistas > 60 chars (400).
- **ADV-A2-2 (Origen, sesión y presupuesto de IA):** PASÓ. Origen inválido responde 403. Crea cookie `fp_session`. Al alcanzar 60 consultas en `ai_requests`, responde 429 con mensaje estándar. Límite de tasa Fastify propio de 5/min.
- **ADV-A2-3 (Garantía de plantilla y JSON roto):** PASÓ. Si el modelo devuelve un tema ajeno a la plantilla o JSON corrupto, cae a `source: 'rules'` con `description: null` y tema válido de la plantilla (`suggest-presentation.ts:97,138`).
- **ADV-A2-4 (Filtro de seguridad en descripciones):** PASÓ. Descarta descripciones con URLs, correos, montos de dinero, promesas de pago/reembolso/escrow, claves o longitud > 280 caracteres (`suggest-presentation.ts:69-77`).
- **ADV-A2-5 (Sin OpenAI, timeout e inyecciones):** PASÓ. Sin `OPENAI_API_KEY` o ante timeout/error responde 200 con reglas (nunca 5xx). Las entradas van cercadas con `fenceData`. Salida acotada a `maxOutputTokens: 400` y `tools: []`.
- **ADV-A2-6 (Aislamiento de BD y archivos autorizados):** PASÓ. Cero lecturas/escrituras en `events`. Registro en `ai_requests` con `event_id: null`. Cambios restringidos estrictamente a `app.ts` (registro de ruta) y `schemas.ts` (esquema nuevo).

---

## 5. Hallazgos

- **Ninguno bloqueante.** Todos los requisitos de los planes `PLAN-CREACION.md`, `FP-CREATE-A1.md` y `FP-CREATE-A2.md` se cumplen con rigurosidad.
- **Observación menor (Info):** En `apps/web/src/components/events/CreateWizard.tsx:401`, la validación de 20 elementos de `includes` se realiza en el paso 3 al hacer clic en «Guardar y seguir», lo cual proporciona una excelente experiencia al usuario con feedback inline inmediato.

---

## 6. Veredictos Finales

- **PAQUETE A1 (Web - Asistente de creación por pasos):** **APROBADO**
- **PAQUETE A2 (API - `POST /api/ai/suggest-presentation`):** **APROBADO**
