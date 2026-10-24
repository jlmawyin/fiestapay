# Navegación entre invitaciones — 17 octubre 2026

Problema registrado como residual en la revisión del regreso PayPal: una solicitud de entrada, RSVP o creación de orden iniciada en una fiesta puede terminar después de navegar a otra. La respuesta anterior mostraba avisos globales y, en algunos casos, reemplazaba el invitado, evento u orden de la nueva pantalla.

## Alcance y entrega

AGY Gemini High añadió comprobaciones de contexto en los tres handlers: éxito, error y finalización solo actualizan la interfaz si la invitación sigue vigente. `App` monta una instancia de `PublicInviteView` por slug para reiniciar el estado local de los hijos y controles al cambiar de fiesta. Los errores RSVP del contexto vigente siguen llegando al formulario.

La protección descarta efectos en la interfaz; **no cancela ni revierte una operación ya recibida por el servidor**. No cambia la API ni el registro financiero. Una orden creada en la invitación anterior conserva su existencia en el servidor.

Una entrega de construcción evaluada. La llamada AGY terminó al alcanzar el límite de ocho minutos mientras comprobaba lint; dejó el cambio y los tests, pero no un informe final. Codex ejecutó las verificaciones de forma independiente. Claude no pudo iniciar su revisión por sesión OAuth caducada; no se atribuye a Claude revisión de este cambio.

El agente independiente `review_navigation` no encontró defectos funcionales en el parche y ejecutó 8/8 pruebas. Señaló una aserción insuficiente: encontrar el mensaje global de error no demostraba que RSVP lo propagara al formulario. Codex ajustó esa prueba para exigir el `alert` dentro del formulario y el aviso global por separado: 8/8 aprobados de nuevo. Segunda entrega evaluada, sin cambios adicionales de implementación. La revisión es acotada; no acredita pruebas humanas ni APIs externas.

## Prueba del defecto y corrección

El nuevo archivo `invite-navigation.test.tsx` usa `App` y eventos `popstate` reales de DOM, con respuestas API diferidas. Ocho pruebas: resolución y rechazo tardíos para las tres operaciones, estado local y propagación del error RSVP vigente.

Codex ejecutó el mismo archivo sobre una copia aislada de `c6e62d8`, sin modificar el checkout: **6 fallos y 2 aprobados**. Los seis fallos muestran avisos o título de la invitación anterior; no son errores de importación ni fixtures. Con la corrección: **8/8 aprobados; 50 pruebas frontend totales, tipos y lint aprobados**. Proveedores simulados; no acredita checkout externo ni experiencia humana.

Grafo Tier 2, generación `2026-10-15T12:05:02Z`: `App` y `PublicInviteView` con metadatos cambiados; tests excluidos del índice. Verificación por fuente exacta y diff. Las relaciones JSX incompletas del grafo no se interpretaron como ausencia de llamadas.

## Integración

`654eaaf` desplegado en Contabo al inicio del 18 oct (America/Guayaquil), API pública `ok:true`. [CI GitHub](https://github.com/jlmawyin/fiestapay/actions/runs/39099031638) aprobada: **151 pruebas / 15 archivos**, lint, tipos y build. No se modificó el proxy ni las otras aplicaciones. La aceptación de comprador sandbox y micrófono humano continúa pendiente.
