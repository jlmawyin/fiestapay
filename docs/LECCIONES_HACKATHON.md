# Aprendizajes para entregar FiestaPay

Esta guía recoge hechos del proyecto y cómo usarlos en la entrega. No garantiza un premio ni convierte una prueba simulada en una integración real.

| Aprendizaje | Evidencia y consecuencia |
|---|---|
| Probar pronto el riesgo externo | El pagoUSD50 necesitó aprobación de comprador, captura verificada y conciliación. Una credencial válida o una orden APPROVED no bastaban. [Pago](reviews/sandbox-evidence.md). |
| Separar dinero y asistencia | Confirmar RSVP reserva plazas; pagar requiere captura comprobada. El servidor calcula centavos, receptor y obligación. Bloquear o retirar un asistente conserva movimientos financieros y reservas inciertas. [Moderación](reviews/moderation-final-20261027.md). |
| Probar fallos, no solo la ruta feliz | El cierre por mínimo fallido devolvióUSD1 automáticamente y PayPal confirmó COMPLETED. Las carreras, reintentos y errores se probaron con PostgreSQL y proveedores falsos. No hace falta repetir la misma operación externa en cada revisión. [Devolución](reviews/refund-sandbox-20261026.md). |
| Revisar el navegador contra una API | Los componentes de moderación pasaban sus pruebas mientras el cliente omitía la clave del organizador. Edge contra Fastify/PostgreSQL reveló el403. La corrección limita verbos y rutas exactas; los invitados siguen sin enviar esa clave. [Revisión final](reviews/moderation-final-20261027.md). |
| Separar envío y recepción | SMTP aceptado no demuestra llegada. Jorge confirmó los dos mensajes en entrada, verificó el contacto, recuperó su enlace y rechazó el token ya usado. La clave anterior dejó de servir. [Correo](reviews/smtp-live-20261025.md). |
| Validar la evidencia del revisor | Un hash de prueba en un informe no coincidía. Se recalculó por bytes y se repitió solo la prueba afectada; los resultados anteriores se reutilizan únicamente cuando la fuente pertinente sigue igual. [Formulario](reviews/form-20261027.md). |
| Preparar la actualización antes de activarla | La migración0008 se ensayó en un clon restaurado, conservando24eventos y las referencias de pago. La publicación recreó únicamente la API y comprobó que las demás aplicaciones no cambiaron. [Operaciones](OPERATIONS.md). |
| Acotar los loops y la autoridad | GROK construye; AGY comprueba de forma independiente. Timeout consume un intento; pausa ordenada conserva el contador. La cuota se calcula con el helper y se detiene al20%de cinco horas. Claude aporta diagnóstico si está conectado; su ausencia no autoriza inventar una revisión. |

## Aplicación a la presentación

El recorrido principal debe mostrar una fiesta nueva, enlace público separado del privado, dos asistentes, cuenta del servidor y aprobación humana de PayPal. El panel enseña el monto capturado antes de comisiones y el mínimo alcanzado. La captura demuestra recepción en el Business único de la demo; no una transferencia adicional ni conexión de comercios de cada organizador.

La devolución y la recuperación por correo tienen evidencia propia. Mostrarlas como pruebas separadas evita prometer que la espera del plazo cabe en90segundos. La [guía de grabación](DEMO_90_SECONDS.md) sigue siendo un borrador hasta ensayar y registrar la versión final.

La voz tiene cola y simulaciones aprobadas, pero todavía falta la prueba física de Jorge en celular. Si no está acreditada al grabar, el video usa el texto que funcione y declara la limitación. Los proveedores falsos y la emulación de pantalla ayudan a verificar el código; no sustituyen la experiencia humana.

## Próximas comprobaciones

Cerrar OpenAI-only sin perder las garantías existentes; ensayar el recorrido final; comprobar enlaces y compradores de prueba; completar instrucciones y material en inglés antes del corte interno. Usar el31octubre para corregir bloqueantes y el5noviembre como límite de presentación/envío acordado. No introducir fondo abierto, anticipos, aportes físicos o descuentos durante ese cierre.
