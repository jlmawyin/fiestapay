# Aceptación de la entrega del 31 de octubre

Estado al reanudar el 26 de octubre de 2026. Esta lista separa evidencia existente de pruebas pendientes; una propuesta o una prueba con PayPal simulado no acredita una operación externa.

| Criterio solicitado | Evidencia disponible | Comprobación que falta |
|---|---|---|
| 1. El invitado no puede editar desde la API | Comprobación de acceso de P0 desplegado: edición pública rechazada con 403. | Regresión de autorización sobre la versión final integrada. |
| 2. La clave de organizador abre edición y pagos; otra da 403 | Panel con clave nueva 200 y clave anterior 403 durante la aceptación SMTP. | Regresión del panel y edición después del paquete financiero. |
| 3. Pago solo tras captura verificada y sin duplicar orderId | Captura de USD50 y webhook real de prueba conciliados una vez; pruebas financieras previas aprobadas. | Mantener estas garantías con cierre y devolución concurrentes, primero con PostgreSQL y proveedor simulado. |
| 4. No alcanzar el mínimo a tiempo devuelve el dinero | Plan de aceptación y diseño disponibles. Implementación en curso. | Revisión independiente y, después, devolución real sandbox de una operación nueva de USD1. |
| 5. Título/chat con script se muestran como texto | AGY observó escape de texto JSX y límites por IP en la fuente actual; no equivale a prueba en navegador. | Verificar representación literal en navegador y completar moderación/bloqueo, conservando las referencias de pago. |
| 6. Sin secretos en JavaScript ni presencia del proveedor retirado | Comprobación anterior del bundle/logs sin valores privados; OpenAI real aprobado. | Eliminar código y tipos residuales de Gemini y revisar el bundle final. |
| 7. Persistencia y borrado a las 72 horas del fin | Reinicio del servicio sin pérdida y retención probados en P0; referencias financieras conservadas. | Regresión de tombstones con obligaciones de devolución y comprobación final en otro navegador. |
| 8. Recuperación de administración | Jorge recibió dos correos en entrada, verificó, recuperó, abrió el panel nuevo y confirmó rechazo del enlace reutilizado. Servidor: antiguo403/nuevo200/reuso400. | Reusar esta evidencia si la fuente no cambia; no enviar más correos de prueba para repetirla. |
| 9. Audio completo, sin solaparse ni cortarse en celular | Pruebas locales de cola; queda corrección de lint en WIP separado. | Resolver recuperación del encargo según dirigir-agentes, integrar y realizar prueba humana móvil. |
| 10. Demo de 90 segundos | Creación, enlaces y pago de prueba existen; recorrido completo aún sin aceptación final. | Ensayar con la versión final: crear, compartir manualmente, pagar como invitado y mostrar meta y recepción verificadas. |

## Orden de trabajo

1. Terminar backend financiero y su revisión independiente: plazo, decisión irreversible, devolución durable y conciliación.
2. Conectar la interfaz a los campos reales del servidor: plazo, mínimo, asistentes/pagados y estado de devolución. Mostrar comisión estimada antes del pago y que la absorbe el organizador.
3. Completar moderación, validación del formulario, limpieza OpenAI y recuperación del audio. Las mejoras de carga pueden construirse en archivos separados mientras se completa el backend.
4. Ejecutar regresión integrada y pruebas externas que aún falten. Identificar la versión desplegada y documentar resultados.
5. Ensayar el recorrido de 90 segundos, preparar instrucciones para jueces y cerrar bloqueantes antes del 31.

Máximo dos frentes de construcción. GROK implementa; AGY verifica de forma independiente; Claude atiende recuperación según la habilidad. Los contadores no se reinician al pausar o cambiar de día.

## Operaciones y límites

- La operación de USD50 ya acreditada se conserva. La devolución pendiente se prueba con otra fiesta y USD1, siguiendo [el protocolo financiero](reviews/funding-acceptance-plan.md).
- La demo usa un único receptor Business sandbox. La captura acredita recepción en esa cuenta; no demuestra una transferencia adicional por PayPal Payouts ni conexión de cuentas de otros organizadores.
- Los estados de asistencia y pago son distintos. Un RSVP no es una captura; un reembolso solicitado o pendiente no es dinero devuelto.
- La [recuperación SMTP](reviews/smtp-live-20261025.md) ya está aceptada. [WhatsApp](WHATSAPP_VIABILIDAD.md) se mantiene para compartir y recordar manualmente; Jorge convoca a los probadores.
- No hay nuevas llamadas reales, pruebas humanas, despliegue del paquete financiero ni grabación acreditados por este documento.
- Se mantienen los límites de cuota, la pausa al 20 % de cinco horas, la prohibición de consumir reseteos y el aislamiento de otras aplicaciones del VPS.
