# Informe de Verificación Independiente: FP-J1 y FP-J2

- **Fecha:** 2026-11-08
- **Verificador:** AGY (Auditor Independiente)
- **Directorio:** `<repo>`
- **Rama:** `claude/judges-polish-20261108` (Base: `main` `2865332` = producción)
- **Veredicto FP-J1 (Muse, Web):** **APROBADO**
- **Veredicto FP-J2 (DSH, API Pagos):** **APROBADO**

---

## 1. Verificación de Integridad y Checksums (SHA-256)

Se verificó el archivo `.local/coord/J.sha256` contra los 51 archivos modificados/creados en la rama:
- **Total archivos verificados:** 51/51 coincidentes exactamente (0 discrepancias, 0 faltantes).
- **Inspección de git status:** Cero archivos fuera de alcance. En `apps/api` se modificaron exactamente los 3 archivos permitidos:
  1. `apps/api/src/domain/orders.ts`
  2. `apps/api/src/routes/payments.ts`
  3. `apps/api/test/payment-races.test.ts`
- **Contratos compartidos:** `packages/shared/` se mantiene 100% inalterado (diff limpio contra `2865332`).

---

## 2. Ejecución del Chequeo Integral (`npm run check`)

Comando ejecutado:
`DATABASE_URL=postgres://fiestapay:ci-only-password@127.0.0.1:55433/fiestapay_test npm run check`

Resultados:
- **Lint (ESLint):** Aprobado (cero advertencias o errores).
- **Typecheck (TypeScript):** Aprobado en `@fiestapay/shared`, `@fiestapay/api` y `@fiestapay/web`.
- **Suite de Pruebas (Vitest):**
  - **Archivos evaluados:** 82 pasados (82 total) — *Base anterior: 81 archivos*.
  - **Pruebas ejecutadas:** 776 pasadas (776 total) — *Base anterior: 767 pruebas* (+9 pruebas netas: 7 en `apps/web/src/__tests__/sample-parties.test.tsx` y 2 en `apps/api/test/payment-races.test.ts`).
- **Build de Producción:**
  - `@fiestapay/shared`: Compilación limpia.
  - `@fiestapay/api`: Compilación limpia y migraciones copiadas a `dist/db/migrations`.
  - `@fiestapay/web`: Vite v8.3.4 compiló exitosamente el bundle de cliente (1674 módulos transformados).

---

## 3. Verificación FP-J2: API Pagos y Webhooks PayPal (DSH)

Se implementaron y ejecutaron 6 pruebas adversariales independientes en `.local/coord/agy-j/j2-adversarial.test.ts` conectadas a PostgreSQL y con el simulador `FakePayPal`:

1. **Firma de Webhook Intacta:** Cuando `fake.signatureValid = false`, el endpoint `/api/paypal/webhook` rechaza con código `400 Bad Request`, no registra evento en `webhook_events`, no escribe auditoría y no altera órdenes ni ledger. *(PASA)*
2. **`custom_id` como Localizador Seguro y Verificación de Captura:**
   - Un `custom_id` inexistente no encuentra la orden y responde `503 Service Unavailable` con `Retry-After` para que PayPal reintente, sin marcar nada pagado.
   - Un `custom_id` que apunta a una orden cuya captura no existe en PayPal falla la verificación (`verifyCapturedOrder`) y responde `503`, manteniendo el ledger en 0.
   - Un `custom_id` con orden existente pero con monto manipulado en PayPal es rechazado por verificación de integridad; la orden no pasa a `paid` y el ledger permanece en 0. *(PASA)*
3. **Webhooks Desordenados y Duplicados:**
   - `COMPLETED` tras `DECLINED`: Si una orden fue declinada pero PayPal confirma la captura en su API, `convergeCapture` concilia la captura, marca la orden como `paid` y registra exactamente una fila en `payment_ledger`.
   - `DECLINED` tras `COMPLETED`: Si la orden ya está pagada con captura en ledger, un `DECLINED` tardío es ignorado por `markOrderDeclined` (la orden sigue `paid`, el ledger se preserva intacto con 1 fila).
   - Reenvíos de webhooks con diferente ID de notificación no duplican filas en el ledger (idempotencia garantizada por `UNIQUE(kind, external_id)`). *(PASA)*
4. **Comportamiento Estricto de `markOrderDeclined`:**
   - Órdenes en estado `created`, `approved`, `paid` o `failed` son ignoradas (retorna `false`).
   - Órdenes en `capturing` que ya poseen una fila de captura en `payment_ledger` son ignoradas (retorna `false`).
   - Solo órdenes en `capturing` sin `capture_id` y sin fila en `payment_ledger` son actualizadas a `failed` (retorna `true`). *(PASA)*
5. **Reintento Desbloqueado para el Invitado:**
   - Al pasar la orden a `failed` tras `DECLINED`, se libera el candado de una orden activa por invitado. El invitado puede cotizar de nuevo, crear una nueva orden con identificador distinto y capturar su pago satisfactoriamente. *(PASA)*
6. **Orden Estricto de Bloqueos en Concurrencia:**
   - `markOrderDeclined` toma exactamente los mismos candados transaccionales y en el mismo orden que las rutas de dinero: `lockEvent(known.event_id)` -> `lockGuest(known.guest_id)` -> `lockOrder(known.id)`. La prueba concurrente con múltiples transacciones simultáneas demostró ausencia total de interbloqueos (*deadlocks*). *(PASA)*

---

## 4. Verificación FP-J1: Web, Demo, Iconos y Portadas (Muse)

Se implementaron y ejecutaron 7 pruebas independientes en `.local/coord/agy-j/j1-verification.test.ts`:

1. **Muestras Fijas en `/demo`:**
   - Existen exactamente 3 fiestas de muestra (`Asado del Domingo`, `Cumpleaños de Sofía`, `Escapada a la Playa`) con invitados ficticios, asistencia y montos en centavos formateados.
   - Son 100% estáticas en memoria; no realizan llamadas de red (`fetch`) ni consultas a base de datos.
   - Rotuladas explícitamente como ficticias («Datos ficticios · Sandbox · Sin dinero real» / «Fictional data · Sandbox · No real money»).
   - Ningún dato se presenta como captura o pago real verificado de PayPal. *(PASA)*
2. **Dependencia `lucide-react`:**
   - Declarada con versión exacta `"0.475.0"` (sin prefijos `^` ni `~`) en `apps/web/package.json`.
   - `package-lock.json` raíz es completamente coherente (versión fijada en 0.475.0). *(PASA)*
3. **Contrato de `UI_LABELS` Intacto:**
   - `packages/shared/src/i18n.ts` no sufrió modificaciones.
   - Se preservan las etiquetas con símbolos textuales requeridos por el asistente (`✨ Sugerir con IA`, `Abrir PayPal ↗`, `✓ Confirmar Realización`). *(PASA)*
4. **Portadas SVG Modernas por Tema:**
   - Las 4 portadas (`CasaCover`, `ComidaCover`, `EventoCover`, `ViajeCover`) fueron rediseñadas con estilo editorial/geométrico plano.
   - Utilizan variables CSS dinámicas del tema (`--theme-surface`, `--theme-ink`, `--theme-accent`, `--theme-tint`), adaptándose a los 16 temas.
   - Exponen accesibilidad completa: `role="img"`, `aria-label` descriptivo en ES/EN y gradientes con IDs generados con `useId()` para evitar colisiones. *(PASA)*
5. **Cero Cambios de Lógica de Pagos en Web:**
   - La inspección de diff en `PaymentWizard.tsx` y `PayPalSection.tsx` confirma que únicamente se sustituyeron emojis por iconos vectoriales Lucide con `aria-hidden="true"`. La lógica de negocio, montos, cuotas y flujo de captura permanecen intactos. *(PASA)*
6. **Diseño Responsivo Móvil (375 px):**
   - Las tarjetas y el grid de `/demo` implementan estilos fluidos (`minWidth: 0`, flex vertical y contenedores responsivos) que previenen desbordamientos en anchos de 375 px. *(PASA)*
7. **Integridad de Aserciones en Tests Modificados:**
   - Las modificaciones en tests existentes (`chat-provider.test.tsx`, `guest-journey-en.test.tsx`, `payment-wizard.test.tsx`, etc.) solo actualizaron selectores de texto para remover emojis. Ninguna aserción sobre permisos, montos o llamadas a capture fue eliminada o debilitada. *(PASA)*

---

## 5. Tabla de Hallazgos y Severidad

| Código | Área | Descripción | Severidad | Estado |
|---|---|---|---|---|
| **H-01** | J2 (API) | Reconciliación PayPal: Cuando un webhook llega sin orden registrada o captura transitoria, responde 503 Retry-After de forma segura sin aplicar ledger. | **Info** | Comportamiento seguro verificado |
| **H-02** | J2 (API) | Orden de bloqueos: `markOrderDeclined` replica exactamente `lockEvent` -> `lockGuest` -> `lockOrder`, previniendo deadlocks con `convergeCapture`. | **Info** | Óptimo y verificado |
| **H-03** | J1 (Web) | Accesibilidad Lucide: Todos los iconos decorativos insertados cuentan con `aria-hidden="true"`. | **Info** | Cumple estándar WCAG AA |
| **H-04** | J1 (Web) | Fallback de Fiesta Demo: `samplePartyById` cuenta con fallback seguro a la fiesta 0 si se solicita un identificador no mapeado. | **Info** | Resiliente |

---

## 6. Conclusión y Veredictos Finales

- **FP-J1 (Muse, Web):** **APROBADO** (Cumplimiento riguroso de diseño, iconos, accesibilidad, demo estática y pruebas).
- **FP-J2 (DSH, API Pagos):** **APROBADO** (Cumplimiento de seguridad financiera, verificación estricta contra PayPal, idempotencia y desbloqueo de reintentos).
