# Aceptación de la entrega del 31 de octubre

Estado al reanudar el 27 de octubre de 2026. Esta lista separa evidencia existente de pruebas pendientes; una propuesta o una prueba con PayPal simulado no acredita una operación externa.

| Criterio solicitado | Evidencia disponible | Comprobación que falta |
|---|---|---|
| 1. El invitado no puede editar desde la API | P0 rechazó edición pública; release44d2c3c conserva esa autorización. AGY probó las9rutas de moderación con403sin clave o con clave incorrecta y navegador público sin encabezado de administración. | Conservar la regresión al finalizar P5; no otorgar autoridad por cookie de creador. |
| 2. La clave de organizador abre edición y pagos; otra da 403 | Recuperación SMTP antiguo403/nuevo200 y moderación integrada en navegador con API/PostgreSQL local: acciones200con clave y403sin ella. | Revisar la versión final integrada y conservar enlaces de administración al ensayar. |
| 3. Pago solo tras captura verificada y sin duplicar orderId | CapturaUSD50/webhook real conciliados una vez; AGY añadió regresiones de captura/reembolso concurrentes y de conciliación después de bloquear una sesión. Referencias preservadas al desplegar44d2c3c. | Conservar las garantías en P5 sin repetir el pago ya acreditado. |
| 4. No alcanzar el mínimo a tiempo devuelve el dinero | Release8918866: nuevaUSD1 capturada y devuelta automáticamente, PayPalCOMPLETED, ledgerúnico yacciones409; [evidencia](reviews/refund-sandbox-20261026.md). | Conservar regresión en cambios posteriores; no repetir la operación sin causa. |
| 5. Título/chat con script se muestran como texto | Moderación44d2c3c incluye pruebas independientes de texto literal, límitesIP y permisos. Edge contra Fastify/PostgreSQL comprobó acciones del organizador e interfaz del invitado bloqueado. | Conservar escape y controles al renombrar el componente de chat en P5; el historial anterior no tiene un índice completo automático. |
| 6. Sin secretos en JavaScript ni presencia del proveedor retirado | P5 publicado como9a40f26, CIverde yAGYaprobado: adaptador/tipos/configuración retirados,35hashes JSON cotejados. Recursos públicos corresponden a imagen activa, capabilitiesOpenAI sinflagantiguo, entorno sin variables retiradas, secretosbundle/logs0 comparados en memoria. [Revisión](reviews/openai-only-20261027.md). | Acreditado para9a40f26; conservar en cualquier corrección posterior. No repetir la prueba externa de OpenAI sin causa. |
| 7. Persistencia y borrado a las 72 horas del fin | Retención probada en P0; recreaciones de API conservaron las fiestas y referencias financieras. El27oct se copió un dump fuera del VPS y se restauró en PostgreSQL16 local aislado:24fiestas/20asistentes/3movimientos y esquema0008, con ambas referencias financieras intactas. [Evidencia](reviews/off-vps-backup-20261027.md). | Conservar regresión de retención al finalizar P5. La restauración acredita datos; no simula recuperación completa del servidor y sus servicios externos. |
| 8. Recuperación de administración | Jorge recibió dos correos en entrada, verificó, recuperó, abrió el panel nuevo y confirmó rechazo del enlace reutilizado. Servidor: antiguo403/nuevo200/reuso400. | Reusar esta evidencia si la fuente no cambia; no enviar más correos de prueba para repetirla. |
| 9. Audio completo, sin solaparse ni cortarse en celular | Integrado8918866:18testsvoz+4UI, lint/tipos aprobados; excepción puntual autorizada porJorge. | Prueba física solicitada aJorge; resultado y dispositivo pendientes. |
| 10. Demo de 90 segundos | Creación, enlaces y pago de prueba existen; recorrido completo aún sin aceptación final. | Ensayar con la versión final: crear, compartir manualmente, pagar como invitado y mostrar meta y recepción verificadas. |

## Orden de trabajo

1. P5 publicado y comprobado como9a40f26 el27oct: CIverde, soloAPI, recursos/capabilities/finanzas/secretos y demás servicios correctos. No repetir ese hito.
2. Preparar el paquete de jueces, asignación privada de compradores sandbox y recorrido final sin anunciar funciones pendientes.
3. Completar la prueba física del audio con Jorge; los ensayos de audio simulado y de navegador de escritorio no la sustituyen.
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
