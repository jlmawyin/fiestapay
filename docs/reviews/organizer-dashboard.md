# Panel y recordatorios — 24 octubre 2026

## Cambio

El panel mostraba asistencia y montos, pero solo ofrecía compartir la invitación general. Ahora cada invitado confirmado con saldo pendiente dispone de un enlace `wa.me` individual. El mensaje contiene alias, fiesta, saldo exacto recibido del servidor y enlace público. Se abre para que el organizador elija destinatario, revise y envíe; no requiere teléfono guardado ni envía automáticamente.

La primera columna mantiene visibles el nombre, «Confirmado, sin pagar» y el saldo. Los pagos parciales conservan su pendiente; quienes ya pagaron, no asisten o no confirmaron no reciben recordatorio de cobro. El estado pagado requiere importe pagado positivo. AG Grid permanece de consulta, ordenable y con diez filas por página. En móvil se desliza la tabla para acceder a los demás campos y al recordatorio; las etiquetas de paginación están en español.

La confirmación del evento se describe como decisión de celebrar la fiesta, separada de asistencia y pagos. No cambia el contrato de API ni el cálculo financiero.

## Construcción y revisión independiente

1. AGY Gemini 3.8 Flash High construyó el primer cambio. El wrapper agotó 420 segundos después de guardar archivos, sin informe final: no se le atribuyen pruebas aprobadas ni conteo de tokens. Codex detectó desbordamiento a 438 px en viewport de 390 px. `review_templates` identificó dos brechas: respuestas tardías podían mezclar invitados de A con enlace de B; el test de montaje no acreditaba los enlaces renderizados.
2. Codex limpió los datos al cargar, descartó respuestas antiguas de carga/confirmación y añadió comprobación del slug. Sustituyó el test por seis regresiones sobre renderizadores reales con un adaptador de AG Grid para jsdom. El revisor independiente aceptó esta segunda entrega por fuente.
3. Ajuste final de ancho descontando la barra vertical del navegador y paginación compacta, sin selector de tamaño. Revisión independiente acotada aprobada. Tres entregas evaluadas; no continuar el mismo loop.

Cupo AGY comprobado antes: Gemini semanal 94,4 %, ventana de cinco horas 91 %. Después: semanal 94 %, cinco horas 100 % tras su reinicio. No se compraron créditos. La modificación previa del usuario en `.gitignore` se conserva fuera de estos commits.

## Pruebas

- Seis regresiones locales aprobadas: estados de asistencia/pago, dos enlaces elegibles con importes USD 50/25, codificación de acentos y `&`, ausencia de operaciones automáticas, actualización de evento/saldo del servidor (incluido 1333 centavos) y desaparición del enlace tras pago o cambio de asistencia.
- Navegación: B falla después de A; A responde tarde después de B; confirmación de A responde tarde después de entrar en B. Los casos impiden mostrar recordatorios mezclados o aplicar la confirmación a la vista nueva.
- Lint y tipos locales aprobados. Los tests con adaptador de tabla no acreditan el diseño ni el comportamiento de la librería AG Grid; estos se comprueban en navegador.
- Vista previa en navegador con datos de una sesión de prueba leídos de la API pública: saldo 5000, pagado/recaudado 0. Estado junto al nombre, enlace correctamente codificado y acceso al recordatorio con desplazamiento horizontal de la tabla. Viewport 390 px; `clientWidth=scrollWidth=375`, sin desbordamiento de página. La primera prueba de desplazamiento manipuló la barra auxiliar de AG Grid y no movió sus celdas; se corrigió el procedimiento usando un gesto horizontal sobre la tabla, sin cambiar producción por ese resultado.
- Commit `f0a5f3e`. [CI completa aprobada](https://github.com/jlmawyin/fiestapay/actions/runs/40081584759): **163 pruebas / 17 archivos**, lint, tipos, build y PostgreSQL.
- Desplegado únicamente el servicio API de FiestaPay en Contabo, saludable; `/api/health` devuelve `ok:true` y `RELEASE_COMMIT` identifica `f0a5f3ea3d0298647ef6317aee745ddafa16a525`. Sin cambios a PostgreSQL, proxy, DNS o aplicaciones vecinas.
- Navegador contra el dominio público: sesión creada para esta prueba, alias ficticio, un acompañante, dos asistentes y saldo 5000. El panel conserva recaudado/pagado 0. Enlace individual con nombre/fiesta/URL pública y USD 50 correctos, `target=_blank` y `rel=noopener noreferrer`. Capturas de escritorio y móvil; desplazamiento horizontal real permite llegar al recordatorio y la página no desborda (`clientWidth=scrollWidth=375` en viewport de 390 px). Se leyó el enlace sin abrir/enviar WhatsApp.

Evidencia privada en `.local/dashboard-public-20261024.log`, `.local/dashboard-preview-20261024.log`, `.local/dashboard-agy-20261024.json`, `.local/dashboard-agy-quota-after-20261024.json`, `.local/dashboard-ledger-20261024.log` y `output/playwright/dashboard-*-20261024.png`. La consulta agregada conserva 3 órdenes `created`, 0 movimientos financieros y 0 webhooks registrados. No se creó una orden PayPal ni se llamó a Gemini/AssemblyAI desde FiestaPay durante esta entrega. Esto no acredita captura sandbox externa, entrega de WhatsApp ni uso móvil humano.

## Cobertura

Tier 2 del grafo `fiestapay`, generación 15 oct. Se buscaron GuestGrid/Dashboard/WhatsApp y se trazó `dashboardFor` en ambos sentidos; búsqueda y trazas sin páginas pendientes. Cobertura de los archivos con metadatos cambiados, helper nuevo sin índice y tests excluidos: lectura directa de fuente actual y del diff. No es una auditoría completa ni una aceptación de pagos externos o voz humana.
