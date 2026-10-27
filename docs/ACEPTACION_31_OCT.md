# Aceptación de la entrega del 31 de octubre

Estado al reanudar el 27 de octubre de 2026. Esta lista separa evidencia existente de pruebas pendientes; una propuesta o una prueba con PayPal simulado no acredita una operación externa.

| Criterio solicitado | Evidencia disponible | Comprobación que falta |
|---|---|---|
| 1. El invitado no puede editar desde la API | Comprobación de acceso de P0 desplegado: edición pública rechazada con 403. | Regresión de autorización sobre la versión final integrada. |
| 2. La clave de organizador abre edición y pagos; otra da 403 | Panel con clave nueva 200 y clave anterior 403 durante la aceptación SMTP. | Regresión del panel y edición después del paquete financiero. |
| 3. Pago solo tras captura verificada y sin duplicar orderId | Captura de USD50 y webhook real de prueba conciliados una vez; pruebas financieras previas aprobadas. | Mantener estas garantías con cierre y devolución concurrentes, primero con PostgreSQL y proveedor simulado. |
| 4. No alcanzar el mínimo a tiempo devuelve el dinero | Release8918866: nuevaUSD1 capturada y devuelta automáticamente, PayPalCOMPLETED, ledgerúnico yacciones409; [evidencia](reviews/refund-sandbox-20261026.md). | Conservar regresión en cambios posteriores; no repetir la operación sin causa. |
| 5. Título/chat con script se muestran como texto | AGY observó escape de texto JSX y límites por IP en la fuente actual; no equivale a prueba en navegador. | Verificar representación literal en navegador y completar moderación/bloqueo, conservando las referencias de pago. |
| 6. Sin secretos en JavaScript ni presencia del proveedor retirado | Comprobación anterior del bundle/logs sin valores privados; OpenAI real aprobado. | Eliminar código y tipos residuales de Gemini y revisar el bundle final. |
| 7. Persistencia y borrado a las 72 horas del fin | Reinicio del servicio sin pérdida y retención probados en P0; referencias financieras conservadas. | Regresión de tombstones con obligaciones de devolución y comprobación final en otro navegador. |
| 8. Recuperación de administración | Jorge recibió dos correos en entrada, verificó, recuperó, abrió el panel nuevo y confirmó rechazo del enlace reutilizado. Servidor: antiguo403/nuevo200/reuso400. | Reusar esta evidencia si la fuente no cambia; no enviar más correos de prueba para repetirla. |
| 9. Audio completo, sin solaparse ni cortarse en celular | Integrado8918866:18testsvoz+4UI, lint/tipos aprobados; excepción puntual autorizada porJorge. | Prueba física solicitada aJorge; resultado y dispositivo pendientes. |
| 10. Demo de 90 segundos | Creación, enlaces y pago de prueba existen; recorrido completo aún sin aceptación final. | Ensayar con la versión final: crear, compartir manualmente, pagar como invitado y mostrar meta y recepción verificadas. |

## Orden de trabajo

1. Completar moderación y sus guardas, sin alterar el cierre financiero y la cola de audio aprobados.
2. Verificar independientemente permisos, bloqueo, historial y formulario. Mantener las regresiones de dinero, concurrencia y voz.
3. Eliminar el proveedor Gemini del producto y mantener únicamente OpenAI, con timeout y salida manual. La prueba física del audio sigue pendiente de Jorge.
4. Ejecutar regresión integrada y solo las pruebas externas todavía necesarias. Identificar la versión desplegada, revisar el bundle final y documentar resultados.
5. Ensayar el recorrido de 90 segundos, preparar instrucciones para jueces y cerrar bloqueantes antes del 31. La versión8918866 ya incluye financiero/interfaz/audio revisados y devolución externa acreditada; no reconstruir ese hito.

Máximo dos frentes de construcción. GROK implementa; AGY verifica de forma independiente; Claude atiende recuperación según la habilidad. Los contadores no se reinician al pausar o cambiar de día.

## Operaciones y límites

- Las operaciones acreditadas de USD50 y la devolución de USD1 se conservan. El [protocolo financiero](reviews/funding-acceptance-plan.md) queda como referencia; no repetir una devolución ya completada sin un cambio que lo justifique.
- La demo usa un único receptor Business sandbox. La captura acredita recepción en esa cuenta; no demuestra una transferencia adicional por PayPal Payouts ni conexión de cuentas de otros organizadores.
- Los estados de asistencia y pago son distintos. Un RSVP no es una captura; un reembolso solicitado o pendiente no es dinero devuelto.
- La [recuperación SMTP](reviews/smtp-live-20261025.md) ya está aceptada. [WhatsApp](WHATSAPP_VIABILIDAD.md) se mantiene para compartir y recordar manualmente; Jorge convoca a los probadores.
- El paquete financiero se desplegó como8918866 el26oct y la devolución externa está acreditada en su informe. Esta actualización documental no ejecuta nuevas llamadas, pruebas humanas ni grabaciones.
- Se mantienen los límites de cuota, la pausa al 20 % de cinco horas, la prohibición de consumir reseteos y el aislamiento de otras aplicaciones del VPS.

## Procedimientos de prueba conservados

Registrar versión, fecha, dispositivo, resultado y evidencia por criterio; usar compradores y nombres ficticios. No repetir las operaciones ya acreditadas si su fuente no cambia.

| Criterio | Procedimiento |
|---|---|
| 1 | Sin clave y después con cookie de invitado, llamar edición/cierre/borrado/panel directamente. Esperar403 y datos sin cambios. |
| 2 | Abrir administración en otro navegador; editar y consultar pagos. Probar clave aleatoria, truncada y de otra fiesta; verificar que no aparezca en DTO público ni logs. |
| 3 | La evidencia USD50 ya incluye captura, reintento y webhook único. Mantener regresión negativa: URL manipulada o APPROVED sin captura siguen pendientes. |
| 4 | Conservar la evidencia USD1/COMPLETED y mantener regresión local de carreras/crashes. Si un cambio exige nueva aceptación externa, definir otra fiesta y un protocolo acotado antes de ejecutarla. |
| 5 | Título y chat `<script>window.__xss=1</script>` deben quedar visibles como texto; no se ejecutan en invitación ni panel. |
| 6 | Revisar bundle/source maps/capabilities y ausencia de proveedor retirado. Comparar valores privados solo en memoria y mostrar únicamente conteos. |
| 7 | Crear, conservar enlaces, recargar/otro navegador/reinicioAPI aislado. En tests, fin+71:59 vigente y fin+72h inaccesible; conservar conciliación financiera. |
| 8 | La aceptación SMTP ya incluye contacto verificado, recuperación, clave nueva válida/vieja403 y reuso400; caducidad/concurrencia constan enPG. |
| 9 | Tres conversaciones en celular: inicio completo, cola de dos respuestas, micrófono denegado y reconexión sin repetir operaciones; registrar latencia. |
| 10 | Crear, abrir compartir WhatsApp sin enviar a terceros, abrir invitación en otro navegador, pagar, mostrar meta y recepción Business; grabar el recorrido real. |

Evidencia externa conservada: orden `45D94071LC923231F`, captura `33J98639UB477180H`, USD50 una sola vez. Esa captura mostró bruto50/comisión3/neto47; no establece una tarifa universal. OpenAI público consultó herramientas y preparó2×25=50 con confirmación sin crear órdenes ni movimientos. Véanse [pago](reviews/sandbox-evidence.md) y [correo](reviews/smtp-live-20261025.md).
