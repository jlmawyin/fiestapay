# Plantillas, hora local y expositores — 21 octubre 2026

Revisión del hito de cuatro plantillas sobre el mismo formulario y contrato de API. La lectura independiente de `review_templates` y la inspección de Codex identificaron tres desvíos:

- El formulario calculaba las 14:00 locales, las convertía a UTC y eliminaba la zona antes de mostrarlas en `datetime-local`. En Guayaquil aparecían las 19:00; al enviar se guardaban como 00:00 UTC del día siguiente. Reproducción en Node y navegador público; captura privada `output/playwright/templates-before-20261021.png`.
- La API admitía `agenda[].speaker`, pero el formulario no permitía editarlo y la invitación no lo mostraba. La herramienta `get_event_details` ya incluye la agenda guardada completa; no necesita modificar su contrato.
- Los ejemplos de Casa y Viaje no nombraban limpieza y transporte, respectivamente, aunque forman parte del alcance aprobado.

AGY Gemini High corrigió la interfaz y añadió cuatro regresiones en una entrega evaluada. Codex verificó el diff, tipos, lint y las cuatro pruebas con `TZ=America/Guayaquil`. `review_templates` revisó independientemente el resultado: sin bloqueantes; señaló que en UTC el test de fecha no detectaría la versión antigua. Codex fijó `TZ=America/Guayaquil` en CI para mantener esa cobertura. No se modifica el motor financiero, el backend ni el alcance P2.

Grafo no disponible en esta revisión: `index_status`, `search_graph` y `check_index_coverage` devolvieron `Transport closed`. La última generación conocida es del 15 oct; no se trata como evidencia actual. Revisión mediante fuente exacta y diferencias, acotada a los archivos indicados.

## Verificación

- Pruebas locales: cuatro aprobadas, incluyendo envío de las cuatro plantillas, edición/eliminación de agenda, expositor visible y conservación de las 14:00 locales. Typecheck, lint y escaneo de secretos aprobados.
- Pendiente: CI completa y creación de las cuatro invitaciones contra el despliegue público. Registrar por separado los resultados observados. No afirmar checkout sandbox ni respuesta hablada por esta comprobación.
