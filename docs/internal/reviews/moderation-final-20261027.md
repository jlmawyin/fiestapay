# Moderación y formulario — aceptación local del 27 de octubre

## Publicación comprobada

Release `44d2c3c7396fb4fc43c98af6416eaff1144f3409` activada enContabo el27oct. [PR4](https://github.com/jlmawyin/fiestapay/pull/4), [CIverde](https://github.com/jlmawyin/fiestapay/actions/runs/40540682440). Imagen `sha256:6c89f0812d90172517909e9ff7e747811c1909712497a5782678110b712e9e13`. Se aplicó0008 al arrancar únicamenteAPI; salud yHTTPS público correctos, referencias de assets coinciden con imagen. Conservados24eventos/23legados, capturaUSD50 sin devolución y captura/refundUSD1 conneto0. Comparación enmemoria:0valoresprivados enbundle/logs. Identificadores/arranques de otroscontenedores idénticos. Backup nuevo privado e imagen8918866anterior conservados, sin rollback automático deDB ni modificación DNS/MX/proxy.

Evidencia operativa privada: `.local/moderation-activation.log` exit0 y marcador `MODERATION_RELEASE_ACTIVATED`. No hubo nueva compra, captura/reembolso, envíoSMTP o prueba física de micrófono.

## Revisión previa a publicar

GROK entregó el módulo en3/3 y AGY lo verificó independientemente en2/3. La primera revisión de navegador detectó que el cliente omitía la clave de organizador en las rutas nuevas; la última entrega lo corrigió con una lista exacta de verbos/rutas y pruebas de solicitudes reales del cliente. No se debilitó la autorización del servidor.

- Check integrado del constructor: **338pruebas/32archivos**, lint, tipos y builds aprobados, PostgreSQL activo.
- AGY1:47pruebas del módulo+42regresiones financieras/presupuesto+7adversariales independientes con PostgreSQL. Verificó permisos, captura en curso después de bloqueo, eliminación lógica sin perder dinero, reservas inciertas, carrera de cupo, revisión de chat, límites por IP y XSS literal.
- AGY2:17pruebas de cliente/interfaz y navegador Edge contra Fastify local con PostgreSQL aislado. Lecturas y acciones de organizador devuelven200con clave, solicitudes sin clave o incorrecta conservan403, invitados no envían la clave ni muestran controles de moderación. Las32fuentes coinciden con el manifiesto antes/después y con la comprobación de Codex.
- [Formulario](form-20261027.md): aviso antes de publicar texto de ejemplo, confirmación sobre los valores actuales y fecha estrictamente futura;52casos y7recorridos de navegador, más una repetición focal de17casos para corregir evidencia de un hash. No sumar las repeticiones como casos únicos.

La migración0008 se ensayó solo sobre una restauración temporal en Contabo: conservó24eventos,20invitados,6mensajes,3movimientos de ledger,6órdenes y1tarea de devolución. La capturaUSD50 y la devoluciónUSD1 conservaron sus referencias y saldos. Se eliminó el clon después del ensayo; otros contenedores no cambiaron. SQLSHA256: `b05a9651750016a571ee5bc1cc0303e64d1f4f2d50324d02740ade3368c14d9d`.

Límites: son pruebas locales con proveedores falsos, no pagos/correos nuevos ni audio físico. El bloqueo identifica una sesión; un navegador nuevo puede unirse con otra. La retirada de un asistente pagado no inventa una devolución individual. Dos rutas de bloqueo de conversaciones existen en servidor pero no tienen botones propios; el panel bloquea asistentes. La migración conserva el historial anterior, pero su índice de conversaciones se crea por actividad del flujo nuevo; no se acredita un archivo histórico completo inmediatamente después de migrar. La limpieza OpenAI-only y la prueba física de voz siguen pendientes. Este informe no acredita despliegue, video ni envío.
