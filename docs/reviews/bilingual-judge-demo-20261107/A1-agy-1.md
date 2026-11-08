# Informe de Verificación Independiente — Paquete FP-BIL-A1 (Verificación 1)

- **Fecha:** 2026-11-07
- **Verificador:** AGY (independiente)
- **Directorio:** `<repo>`
- **Paquete evaluado:** FP-BIL-A1 (Base bilingüe web + portada de producto + Demo para jueces)

---

## 1. VEREDICTO

**APROBADO CON OBSERVACIONES**

La entrega de A1 cumple estrictamente con el contrato estipulado en `.local/coord/FP-BIL-A1.md`, el diff congelado `.local/coord/A1.diff` y la lista de `.local/coord/A1.files`. La suite de tests pasa en su totalidad, no hay errores de linter ni de tipos, y 18 pruebas adversariales independientes confirman la solidez en i18n, enrutamiento, seguridad, aislamiento de demos y accesibilidad.

---

## 2. Comprobación de Integridad y Hashes

Se verificaron los hashes SHA256 de los 44 archivos listados en `.local/coord/A1.files` contra `.local/coord/A1.sha256`:
- **Archivos verificados:** 44 / 44.
- **Discrepancias / Mismatches:** 0 (100% íntegros).
- **Archivos fuera de scope:** Ninguno. Todos pertenecen a la lista autorizada en el encargo.
- **Aserciones preexistentes:** Ninguna aserción de dinero, permisos o privacidad fue debilitada en `demo-entry.test.tsx`, `judge-discovery.test.tsx` o `presentation-copy.test.tsx`.

---

## 3. Comandos y Métricas de Ejecución

1. `npm run build -w @fiestapay/shared` → **Exit 0** (compilación limpia).
2. `npx vitest run --project web` → **Exit 0** (45 archivos pasados, 305 tests pasados en 38.32s).
3. `npx eslint apps/web` → **Exit 0** (0 errores, 0 advertencias).
4. `npm run typecheck -w @fiestapay/web` → **Exit 0** (0 errores en `tsc --noEmit`).
5. `npm run build -w @fiestapay/web` → **Exit 0** (bundle Vite generado en 1.07s).
6. **Pruebas adversariales independientes** (`.local/coord/agy-a1/adversarial-suite.test.tsx`): **Exit 0** (18 tests pasados, 0 fallos).

---

## 4. Comprobación de Requisitos (Puntos 1 al 10)

1. **i18n base:** Sin proveedor, `useI18n()` devuelve `es`, importes `$50,00` y catálogos en español intactos. `?lang=en` selecciona y persiste en `fp_locale`, actualiza `<html lang="en">` y remueve únicamente `lang` de la URL conservando `?k=`, `?paypal=`, `token`, `PayerID` y `#t=`. Excepciones en `localStorage` no rompen la app.
2. **Rutas:** `/e/:slug`, `/e/:slug/admin?k=` (captura y remoción atómica de la clave), `/e/:slug/dashboard`, `/recover#t=`, `/create` y `/demo` intactas.
3. **Portada `/`:** CTAs `UI_LABELS.createInvitation` → `/create` y `UI_LABELS.judgesDemo` → `/demo`. «Mis invitaciones» excluye estrictamente `isDemo: true` y conserva eventos legados. Aviso sandbox visible sin afirmaciones de pagos reales ni custodia.
4. **`/demo`:** 3 pasos con AG Grid (10 filas de muestra, solo lectura, sin fetch en montaje ni filtrado). Pago lanza `POST /api/demo` `{kind:'payment'}`, une a `DEMO_GUEST_NAME[locale]`, RSVP y abre `/e/:slug` con `fp_demo_payment_slug`. Manejo de timeout 408 conservado (bloquea duplicados inciertos). Demo privada crea `{kind:'private'}` y abre panel. «Mis demos» solo lista `isDemo: true`. Reinicio exclusivo en `/demo` con modal de confirmación hacia `POST /api/demo/reset`.
5. **`UI_LABELS`:** Uso literal de todas las etiquetas compartidas en ambos idiomas.
6. **Cliente API:** Cabecera `x-fiesta-locale` enviada en todas las llamadas (incluidos chat público y tokens de voz). En `en`, los errores se traducen con `translateServerError` conservando el código de estado; en `es`, textos idénticos.
7. **Asistente público:** Conversaciones `landing` y `demo` aisladas en memoria por contexto; envían `context` al backend. No se escribe en storage. Cambio de idioma conserva el historial.
8. **Pureza de idioma y formatos:** En `en`, ni portada ni `/demo` contienen palabras testigo en español. Formatos `$50,00` (es) y `$50.00` (en). Zona horaria `America/Guayaquil` forzada en fechas independientemente del navegador.
9. **Accesibilidad y responsive:** Un `h1` por vista. `LanguageSelector` con nombre accesible y enlace `label/select`. Botones con nombre accesible. CSS de cabecera y cinta con `flex-wrap: wrap` y media queries para ≤ 390 px.
10. **Propiedad:** Sin modificaciones fuera de la propiedad de A1.

---

## 5. Hallazgos

- **[Menor] `apps/web/src/lib/event-presentation.ts:36-40`:**
  Uso de rodeo local `EventWithDemoFlag` e `isDemoEvent`. Ya que `FiestaEvent.isDemo` existe en `@fiestapay/shared`, es redundante pero funcionalmente correcto y autorizado. Candidato a limpieza en la ola 2.
- **[Menor] `apps/web/src/components/common/Header.tsx:34-47` / `apps/web/src/App.tsx:103-112`:**
  El logo navega a inicio e invoca `scrollIntoView` en un `setTimeout(..., 0)` protegido por `try/catch`. En navegadores muy lentos, si el DOM no está listo el scroll falla de forma silenciosa sin romper la navegación.
