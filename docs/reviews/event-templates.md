# Plantillas, hora local y expositores — 21 octubre 2026

Revisión del hito de cuatro plantillas sobre el mismo formulario y contrato de API. La lectura independiente de `review_templates` y la inspección de Codex identificaron tres desvíos:

- El formulario calculaba las 14:00 locales, las convertía a UTC y eliminaba la zona antes de mostrarlas en `datetime-local`. En Guayaquil aparecían las 19:00; al enviar se guardaban como 00:00 UTC del día siguiente. Reproducción en Node y navegador público; captura privada `output/playwright/templates-before-20261021.png`.
- La API admitía `agenda[].speaker`, pero el formulario no permitía editarlo y la invitación no lo mostraba. La herramienta `get_event_details` ya incluye la agenda guardada completa; no necesita modificar su contrato.
- Los ejemplos de Casa y Viaje no nombraban limpieza y transporte, respectivamente, aunque forman parte del alcance aprobado.

AGY Gemini High corrigió la interfaz y añadió cuatro regresiones en una entrega evaluada. Codex verificó el diff, tipos, lint y las cuatro pruebas con `TZ=America/Guayaquil`. `review_templates` revisó independientemente el resultado: sin bloqueantes; señaló que en UTC el test de fecha no detectaría la versión antigua. Codex fijó `TZ=America/Guayaquil` en CI para mantener esa cobertura. No se modifica el motor financiero, el backend ni el alcance P2.

Grafo no disponible en esta revisión: `index_status`, `search_graph` y `check_index_coverage` devolvieron `Transport closed`. La última generación conocida es del 15 oct; no se trata como evidencia actual. Revisión mediante fuente exacta y diferencias, acotada a los archivos indicados.

## Verificación

- Pruebas locales: cuatro aprobadas, incluyendo envío de las cuatro plantillas, edición/eliminación de agenda, expositor visible y conservación de las 14:00 locales. Typecheck, lint y escaneo de secretos aprobados.
- [CI completa](https://github.com/jlmawyin/fiestapay/actions/runs/39574617903): 155 pruebas en 16 archivos, lint, tipos y build. `6d203e2` desplegado el 21 oct en el servicio aislado de FiestaPay, saludable, API `ok:true`.
- Cuatro creaciones reales mediante formulario público, con lectura posterior de persistencia y vista de invitación. RSVP/cotización por API autenticada, dos asistentes: Comida USD 50, Casa USD 36, Viaje USD 130, Evento USD 80. Pagado/recaudado cero; no se creó orden ni se solicitó captura. Se conservó el mismo motor financiero.
- Casa sin cupo ni agenda, Evento con actividad/expositor añadido y visible; desayuno/almuerzo/cena seleccionables. Fecha elegida 31 oct 14:00 ECT persistida como 19:00 UTC. Lectura privada `.local/templates-readback-20261021.log`; capturas `output/playwright/template-*-20261021.png`. A 390 px no hubo desbordamiento horizontal en formulario/invitación; fila de expositor inspeccionada visualmente. No es prueba humana ni auditoría completa móvil.
- Consulta real sobre el expositor mediante chat Gemini: **503 del proveedor**, un intento; no se acredita esa respuesta. Evidencia `.local/templates-chat-20261021.log`. Sin prueba de checkout, webhook externo ni voz humana en este hito.
