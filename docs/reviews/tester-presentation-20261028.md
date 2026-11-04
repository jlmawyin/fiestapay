# Presentación e invitaciones — revisión del 28 octubre

**Aprobado dentro del alcance de presentación**, con integración global y aceptación externa pendientes. Rama `codex/tester-fixes-20261028`; el sitio público conserva9a40f26.

GROK construyó el bloque en tres entregas. La tercera terminó por límite de70turnos antes de redactar su informe; ese resultado queda registrado como tal, sin abrir una cuarta ejecución. AGY evaluó los archivos guardados y, en su revisión2/3, confirmó que el bloque funcional está completo. El fallo de la sesión no se presenta como una ejecución exitosa del constructor.

## Cambios verificados

- Cuatro plantillas con textos propios. Solo Comida muestra desayuno/almuerzo/cena. Inicio y fin aparecen en hora de Ecuador, incluidos encuentros que terminan otro día.
- Resumen antes de publicar, aviso sobre fechas sugeridas y guardas contra publicar datos revisados que después cambiaron. Se conservan la advertencia del ejemplo antiguo y la del nuevo texto de referencia.
- Nombre opcional del organizador y temática guardados en el servidor mediante0009; valores antiguos sin esos campos siguen funcionando. Cuatro ilustraciones locales y16 combinaciones de colores y bienvenida; sin subida de fotos.
- Nuevo invitado sin «Tal vez» seleccionado. Revisión del pago con personas, cuota, total, abono y diferencia recibidos del servidor; comisión y neto ocultos al invitado. Los datos de comisión del servidor y panel se conservan.
- Borrador de WhatsApp con texto UTF-8, inicio/fin y enlace público, sin clave del organizador. Esta revisión verificó construcción y codificación; abrir el borrador real pertenece a la ronda externa.
- Encabezados, avisos, recuperación y navegación global usan «invitación». Casa puede decir «fiesta en casa»; la marca y el encabezado de autorización conservan sus nombres. Textos de chat/voz/panel se terminan en el bloque de asistentes.

## Evidencia independiente

| Conjunto | Resultado |
|---|---|
| Ocho suites web originales de B2 |66aprobadas; los dos casos de navegación tardía ahora ejecutan su cuerpo completo|
| Cinco suites web adicionales |43aprobadas, incluida administración y guardas de publicación/recuperación|
| Metadatos API/PostgreSQL |3aprobadas|
| Arnés propio UI y API de AGY |12+2aprobadas|
| Total de ejecuciones de prueba de esta revisión |126aprobadas,0fallidas,0omitidas|
| ESLint y tipos web/API |Código0|

Se reutiliza evidencia pertinente de la revisión anterior para estilos sin cambios: navegador Edge en1280,390,375 y360píxeles, sin desbordamientos;64pares de colores computados, sin fallos en esos pares. Son pantallas de componentes con datos/proveedores simulados, no una navegación de producción ni prueba física de celular. No se afirma una auditoría universal de todos los estados visuales a partir de esos pares.

Las dos fuentes de App/vista de creación y el selector de su prueba de administración cambiaron en texto; AGY revisó que la navegación, almacenamiento de clave y autorización conservaran su comportamiento. Los componentes de retorno/captura de PayPal mantienen la evidencia de [la revisión anterior](tester-payments-20261028.md). No se modificaron las migraciones0001–0008.

## Límites y siguiente paso

Falta la aceptación del bloque de asistentes, la suite global, CI y migraciones/despliegue de la versión completa. Después se ejecutará la matriz real de14puntos con sus capturas numeradas. Aquí no se hicieron pagos, solicitudes reales de IA, envíos de correo ni mensajes de WhatsApp.

Limitación conocida: una elección previa «Tal vez» sin acompañantes puede verse sin selección en otra sesión de navegador que no conserve su marca local; el valor de la base no se elimina. No se añadió una migración de RSVP en este bloque.

Informes, comandos y hashes calculados desde bytes están en los artefactos locales ignorados `.local/tester-presentation-review-attempt2-*`. Las cifras de esta revisión no deben sumarse a la suite global como si fueran casos nuevos únicos.
