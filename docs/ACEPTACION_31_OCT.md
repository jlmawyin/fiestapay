# Aceptación: entrega del 31 octubre

Estado de referencia: 25 octubre 2026. Una prueba automatizada de proveedor simulado no acredita una transacción externa, un correo recibido ni audio humano. Registrar versión, fecha, dispositivo, resultado y evidencia por criterio. Usar compradores sandbox y nombres ficticios.

| # | Criterio de Jorge | Cómo probarlo | Evidencia actual |
|---|---|---|---|
| 1 | Enlace público no edita | Navegador sin clave: llamar directamente edición/cierre/borrado/panel; esperar 403 y comprobar DB sin cambios. Repetir con cookie de invitado. | API y navegador local aprobados por AGY; en VPS97048c1, cuatro rutas sin clave403 y datos intactos por conexión directa. DNS público pendiente. |
| 2 | Enlace organizador válido; incorrecto 403 | Abrir enlace admin en navegador distinto, editar descripción y consultar pagos. Repetir con clave aleatoria, truncada y de otra fiesta. Verificar ausencia de clave en DTO público/log. | Navegador local y API verificados; origen del VPS devuelve clave correcta200/incorrecta403 y edición válida200, sin cookies de creador. |
| 3 | Pago solo por captura, sin duplicado | Aprobar USD50, capturar, repetir orderId y reenviar webhook. Contar una captura/5000 centavos. URL manipulada/APPROVED sin captura conserva pendiente. | Pago real sandbox y reintento 24oct; webhook externo aceptado 25oct sin duplicación, versión1bf3434. |
| 4 | No llega al mínimo → reembolso | Fiesta de prueba, mínimo superior a lo cobrado, fecha límite corta; pagar y esperar job. Verificar PayPal refund COMPLETED, importe/moneda/captura, ledger único y saldo/progreso correctos. Probar timeout, doble ejecución y captura tardía. | Iniciación automática pendiente; conciliación de reembolsos simulados ya existía. |
| 5 | Script se muestra como texto | Título/chat `<script>window.__xss=1</script>`; ninguna ejecución, texto visible; repetir en panel. | React escapa texto por defecto; falta prueba específica del flujo nuevo. |
| 6 | Sin secretos ni Gemini en JS | Build, búsqueda del nombre/proveedor y de valores secretos solo en memoria, salida con conteos. Inspeccionar `/api/capabilities`; revisar source maps y bundles. | Claves Gemini retiradas de entorno; código residual en eliminación. |
| 7 | Persistencia y autoborrado | Crear, guardar enlaces, recargar, navegador distinto, reinicio exclusivo API, verificar misma fiesta. Reloj controlado de test: fin+71:59 vigente, fin+72h inaccesible; conservar conciliación financiera mínima. | PG/retención/captura tardía aprobados; fixture del VPS sobrevivió reinicio de API y se eliminó con su clave200→410. Prueba directa al origen; ruta pública pendiente. |
| 8 | Recuperación | Registrar/verificar correo opcional, perder enlace, solicitar, recibir email, consumir token, probar clave nueva y antigua; rechazar reutilización/caducidad y dos consumos simultáneos. | SMTP Banahosting en construcción; variables solo en VPS y primer destinatario autorizado pendientes. [Configuración y prueba real](EMAIL_SETUP.md). |
| 9 | Audio móvil completo/secuencial | Tres conversaciones desde celular, inicio intacto, dos respuestas juntas se encolan, denegar micrófono y reconectar sin repetición; registrar latencia. | Prueba WebSocket histórica real; micrófono humano/móvil pendiente. |
| 10 | Demo de90s | Crear, copiar/abrir WhatsApp sin enviar a terceros, abrir enlace público en otro navegador, pagar, ver meta y recepción Business; grabar recorrido real. | Pago y consulta OpenAI reales acreditados por separado; recorrido integrado y significado de payout pendientes. |

## Guardas de dinero

Asistencia y pago son estados distintos: «va» no significa «pagó». Contar pagados solo desde capturas verificadas menos devoluciones. Todo cálculo en centavos en servidor. Reembolsos solo sandbox, con identificador idempotente persistido antes de llamar PayPal. Nunca marcar completado por solicitud aceptada o por timeout. No borrar evidencias financieras al ocultar/eliminar la fiesta.

La [API PayPal](https://developer.paypal.com/api/payments/v2/captures-refund) permite devolver una captura y usar `PayPal-Request-Id`. La estimación de comisión debe identificar tarifa/mercado, quién la absorbe y que la cifra definitiva procede de PayPal; no se traslada automáticamente al invitado ni se altera la cotización de USD50.

## Evidencia externa ya obtenida

- Pago: orden `45D94071LC923231F`, captura `33J98639UB477180H`, USD50, una fila de captura y saldo0 después del reintento y webhook. [Detalle](reviews/sandbox-evidence.md).
- Desglose obtenido directamente de esa captura el25oct06:19UTC: brutoUSD50, comisiónPayPalUSD3, netoUSD47. Es evidencia de esa operación concreta; no promete la misma comisión en toda transacción futura. Artefacto `.local/capture-fee-evidence.json`.
- OpenAI público: fiesta `comida-5fp2zhn8`, HTTP200, herramientas `get_event_details`, `get_my_status`, `prepare_quote`; cuenta 2×25=50 con confirmación. SQL posterior: cero órdenes y cero movimientos financieros en esa fiesta. Esto demuestra que el asistente no cobró por su cuenta. Evidencia local ignorada `.local/openai25-evidence.log` y captura `output/playwright/openai-chat-20261024.png` (archivo producido el25oct; nombre histórico).
