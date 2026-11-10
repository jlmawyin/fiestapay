# Verificación Independiente FP-BIL-A3 (AGY Verificación 1)

**VEREDICTO: APROBADO CON OBSERVACIONES**

## 1. Verificación de Integridad y Hashes (28/28)
Se comprobó el hash SHA-256 de los 28 archivos de `.local/coord/A3.files` contra `.local/coord/A3.sha256`. Todos coinciden de manera exacta:
- `apps/web/src/__tests__/demo-mobile-overflow.test.tsx`: `cfdd0c0d...`
- `apps/web/src/__tests__/organizer-i18n-parity.test.ts`: `af81a04d...`
- `apps/web/src/__tests__/organizer-journey-en.test.tsx`: `f4aefd38...`
- `apps/web/src/components/dashboard/GuestGrid.tsx`: `4130dba3...`
- `apps/web/src/components/dashboard/ModerationPanel.tsx`: `c7401c7e...`
- `apps/web/src/components/dashboard/OrganizerLinkCard.tsx`: `72070c85...`
- `apps/web/src/components/dashboard/QrShareModal.tsx`: `19fc34ce...`
- `apps/web/src/components/dashboard/RecoveryEmailCard.tsx`: `d71bb99a...`
- `apps/web/src/components/dashboard/reminderHelper.ts`: `4b43ba7a...`
- `apps/web/src/components/events/CreateEventForm.tsx`: `3b0533ae...`
- `apps/web/src/components/illustrations/{Casa,Comida,Evento,Viaje}Cover.tsx`: hashes verificados OK.
- `apps/web/src/i18n/messages/{index,organizerCovers,organizerCreate,organizerDashboard,organizerGrid,organizerModeration,organizerRecovery}.ts`: hashes verificados OK.
- `apps/web/src/index.css`: `be29c235...`
- `apps/web/src/lib/event-presentation.ts`: `4d849a7b...`
- `apps/web/src/views/{CreateEventView,OrganizerDashboardView,OrganizerRecoveryView}.tsx`: hashes verificados OK.
- `packages/shared/src/{index,presentation}.ts`: hashes verificados OK.

Ningún archivo existente fuera del encargo fue modificado. No se alteró ningún test previo.

## 2. Comandos y Métricas
- `npm run build -w @fiestapay/shared`: Código 0 (compilación limpia).
- `npx eslint apps/web packages/shared`: Código 0 (0 errores, 0 avisos).
- `npm run typecheck -w @fiestapay/web`: Código 0 (sin errores de TypeScript).
- `npx vitest run --project web`: Código 0 (52 archivos pasados, 349 tests pasados, 43.77s).
- `npm run build -w @fiestapay/web`: Código 0 (Vite build exitoso en 1.10s).
- Suite adversarial AGY (`.local/coord/agy-a3/adversarial.test.ts`): 10 tests pasados (10/10 OK).

## 3. Comprobaciones de Requisitos
1. **Español original**: Inalterado en toda la plataforma. Ningún test previo fue modificado (los 3 archivos de prueba son adiciones). El único cambio visual en ES son las horas de auditoría presentadas en `America/Guayaquil` mediante `formatEventDateTime`.
2. **Recorrido en inglés**: Formulario de creación/edición, panel, AG Grid (textos por defecto de ag-grid en inglés), pagos, recordatorios, enlaces, modales y portadas SVG («FOOD & BBQ», «HOUSE PARTY», «GROUP TRIP», «EVENT & CELEBRATION») libres de cadenas en español.
3. **Paridad de `EventInput`**: Mismos centavos enteros, fechas ISO y zona horaria para entradas idénticas. Lógica de autorización, clave de organizador, orden de pago y recuperación intactas.
4. **Recordatorios WhatsApp y Share**: `reminderHelper.ts` y `buildInviteShareText` generan textos en el idioma activo con montos del servidor y URL pública; en `es` son idénticos a los históricos; siguen siendo borradores manuales `wa.me`.
5. **Etiquetas literales**: `UI_LABELS[locale].confirmEvent`, `recoverLink` y `myInvitations` se usan literalmente en el panel y vistas.
6. **FP-BIL-A1-M**: La regla `.app-container { width: 100%; min-width: 0; }` en `index.css` corrige el ancho a 375 px impidiendo el desbordamiento de AG Grid sin alterar el diseño de escritorio (`max-width: 1120px; margin: 0 auto;`).

## 4. Hallazgos de Calidad de Copia en Inglés
- **[Mayor]** `packages/shared/src/presentation.ts:45` y `apps/web/src/views/OrganizerDashboardView.tsx:3203`:
  La plantilla `comida` se traduce como `dinner`, provocando «Coming to dinner?», «Edit dinner», «Delete dinner», «Dinner confirmed» incluso cuando la comida es un desayuno o almuerzo.
  *Propuesta:* Cambiar a término neutro: `noun: 'meal'`, `phrase: 'the meal'`, `ofPhrase: 'of the meal'`, `welcome: 'Coming to eat?'`, `join: 'Join the meal'`.
- **[Menor]** `apps/web/src/i18n/messages/organizerDashboard.ts:2740, 2744`:
  Calco de «realización»: «Confirm realization of the dinner» y «before the realization of the dinner can be formally confirmed».
  *Propuesta:* «Confirm that the meal will take place» o «Confirm the meal» y «before the meal can be formally confirmed».
- **[Menor]** `apps/web/src/i18n/messages/organizerDashboard.ts:2736`:
  `minMissing: (money) => \`${money} missing\``. Connota dinero perdido o extraviado.
  *Propuesta:* `\`${money} remaining\`` o `\`${money} to reach minimum\``.
- **[Menor]** `apps/web/src/i18n/messages/organizerGrid.ts:2840`:
  `modPending: 'Payment verifying'`. Construcción poco natural.
  *Propuesta:* `'Payment under verification'` o `'Payment being verified'`.
- **[Menor]** `apps/web/src/lib/event-presentation.ts:206`:
  `buildInviteShareText` usa «Cost per person:» mientras el formulario y panel usan «Share per person».
  *Propuesta:* Unificar a «Share per person:».
- **[Menor]** `apps/web/src/i18n/messages/organizerRecovery.ts:2932, 2938`:
  «Reloading loses it» y «The link does not work».
  *Propuesta:* «Reloading will discard it» y «This link is invalid or expired. Please request a new one.».
