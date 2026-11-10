# Informe de Verificación Independiente: FP-BIL-A2 (Intento 1)

**Verificador:** AGY (Independiente)  
**Constructor:** Muse  
**Fecha:** 2026-11-07  
**Veredicto:** APROBADO CON OBSERVACIONES  

---

## 1. Verificación de Integridad y Hashes

Se verificaron los 29 archivos listados en `.local/coord/A2.files` frente a `.local/coord/A2.sha256`. Todos los hashes SHA-256 coincidieron al 100%:
- 4 tests nuevos (`funding-timezone`, `guest-i18n-parity`, `guest-journey-en`, `voice-locale`): hashes intactos.
- 0 tests existentes modificados (confirmado mediante análisis del diff congelado).
- 25 archivos de producto, presentación e i18n: hashes coincidentes con `.local/coord/A2.sha256`.

---

## 2. Comandos y Resultados

1. `npm run build -w @fiestapay/shared`: **Exitoso (código 0)**. Tipos y bundles generados limpiamente.
2. `npx eslint apps/web packages/shared`: **Exitoso (código 0)**. 0 errores, 0 advertencias.
3. `npm run typecheck -w @fiestapay/web`: **Exitoso (código 0)**. Sin discrepancias de tipado.
4. `npx vitest run --project web`: **Exitoso (código 0)**. 49 archivos de prueba pasados (49/49), 326 tests pasados (326/326).
5. `npm run build -w @fiestapay/web`: **Exitoso (código 0)**. Vite build completado sin fallos.
6. **Batería Adversarial AGY** (`.local/coord/agy-a2/adversarial.test.tsx`): **8/8 pruebas superadas (código 0)** tras aislar la inicialización de locale con `LOCALE_STORAGE_KEY`.

---

## 3. Hallazgos

### Hallazgo 1 (Mayor): Texto visual en español dentro de las portadas SVG
- **Archivos y líneas:**  
  - `apps/web/src/components/illustrations/CasaCover.tsx:77` (`<text ...>FIESTA EN CASA</text>`)  
  - `apps/web/src/components/illustrations/ComidaCover.tsx:76` (`<text ...>COMIDA & ASADO</text>`)  
  - `apps/web/src/components/illustrations/EventoCover.tsx:88` (`<text ...>EVENTO & CELEBRACIÓN</text>`)  
  - `apps/web/src/components/illustrations/ViajeCover.tsx:84` (`<text ...>VIAJE EN GRUPO</text>`)  
- **Descripción:** Si bien el atributo `aria-label` de cada SVG se traduce dinámicamente según el locale, el elemento visual `<text>` dentro de cada ilustración SVG permanece hardcodeado en español. En navegación con idioma inglés (`en`), el invitado ve el banner visual de cabecera en español.

### Hallazgo 2 (Menor): Frase de bienvenida en español en borrador de WhatsApp
- **Archivo y línea:** `apps/web/src/lib/event-presentation.ts:191`
- **Descripción:** En `buildInviteShareText`, se asigna `const copy = TEMPLATE_INVITE_COPY[input.template]` en vez de `templateInviteCopy(input.template, locale)`. En consecuencia, la frase de bienvenida (ej. "¿Vienes a comer?") y la frase temática (`theme.phrase`) se incluyen en español en el borrador compartido de WhatsApp incluso con `locale === 'en'`.

### Hallazgo 3 (Menor): Formato de hora de evento sin especificación de ciclo de 24 horas
- **Archivo y línea:** `apps/web/src/components/common/FundingStatusPanel.tsx:17-24`
- **Descripción:** `formatEventInstant` fuerza correctamente la zona horaria `America/Guayaquil` y el sufijo `(UTC-05:00)`, pero no define `hourCycle: 'h23'` en español (a diferencia de `formatInstantInZone`), produciendo formato de 12h con "p. m." en ciertos motores de Intl. Es cosmético y no afecta la hora correcta de Guayaquil.

---

## 4. Comprobaciones de Criterios (1-8)

1. **Fidelidad del Español:** Byte a byte idéntico al original en español. Sin proveedor activo o con `es`, los componentes preservan toda la copia original. Ningún test preexistente fue alterado.
2. **Pureza en Inglés:** Vistas principales (invitación, unirse, asistencia, cotización, PayPal, recaudación, chat y voz) traducidas. Excepción: textos visuales en SVG y borrador de WhatsApp indicados en Hallazgos 1 y 2.
3. **UI_LABELS Literales:** `verifyStatus` contiene literalmente `"🔍 Check Status"` / `"🔍 Verificar Estado"` (`PublicInviteView.tsx:856`). Los botones y etiquetas (`quoteReview`, `generatePayment`, `wantToPay`, etc.) coinciden con los literales citados por el asistente.
4. **Dinero y PayPal:** Intacto. Los cálculos ocurren en centavos enteros en el servidor. `QuoteReviewCard` y `quoteClientSummary` no recalculan importes. Estado `approved` de PayPal no auto-captura y requiere confirmación explícita.
5. **Fechas:** Zona horaria `America/Guayaquil` garantizada en `FundingStatusPanel` y helpers de presentación, independiente de la zona del navegador.
6. **Voz:** Cambio de idioma detiene sesión por la ruta de «Detener», liberando micrófono y lease en el servidor. El fallback elige voces acordes al idioma y se silencia si no hay voz adecuada (nunca habla en el idioma incorrecto). Consentimiento preservado ("AssemblyAI").
7. **Adiciones en Shared:** Estrictamente aditivas en `presentation.ts` e `index.ts`.
8. **Accesibilidad:** Roles y nombres accesibles consistentes y localizados.
