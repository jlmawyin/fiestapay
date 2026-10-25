# Recuperación del organizador por correo

Preparación autorizada el 25 octubre. El flujo de recuperación está pendiente de implementación y verificación; este documento no acredita envío.

Usaremos Cloudflare Email Service desde el servidor FiestaPay mediante HTTPS. Evita mantener otro servidor de correo en Contabo. Requiere que la cuenta tenga habilitado Email Sending, un dominio incorporado y un token con permiso **Email Sending: Edit**. [Requisitos oficiales](https://developers.cloudflare.com/email-service/get-started/send-emails/), [API de envío](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/).

## Configuración que hará Jorge

1. En Cloudflare: **Compute → Email Service → Email Sending → Onboard Domain**. Elegir el dominio de FiestaPay disponible en la cuenta. Revisar los registros que propone el asistente antes de aplicar; no sustituir el correo existente del dominio principal.
2. Cloudflare genera los valores reales: MX/SPF para `cf-bounce`, DKIM y DMARC. Copiar exactamente esos valores o dejar que su asistente los configure. No se proporciona un DKIM inventado en este documento. La verificación puede tardar.
3. Crear token limitado a la cuenta necesaria, permiso **Email Sending: Edit**. Guardarlo en el `.env` local, nunca en Git ni en este chat. La integración usará `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `EMAIL_FROM`. Dirección propuesta: `fiestapay@somospanas.com`, solo después de verificar ese dominio.
4. Avisar cuando esté configurado para copiar únicamente esas variables al entorno privado del servicio FiestaPay y ejecutar una prueba al correo indicado por Jorge. No se enviarán invitaciones a contactos ni mensajes de marketing.

Si Email Sending no aparece o exige un plan/pago, detener la activación y registrar esa dependencia; no contratar nada automáticamente. Se mantiene el enlace del organizador como acceso principal.

## Contrato de seguridad y aceptación

- Correo opcional; no obliga a jueces a entregar datos. Guardar dirección solo mediante autorización de organizador y verificarla antes de habilitar recuperación.
- Solicitud pública devuelve respuesta uniforme para no revelar direcciones registradas. Límite por IP y por evento, más presupuesto diario de correo.
- Token aleatorio de un uso, hash en base de datos y caducidad corta. Consumir y rotar `adminKey` en una transacción; dos consumos concurrentes solo permiten uno. Clave anterior deja de autorizar.
- No recuperar la clave original desde su hash. Emitir una clave nueva después de verificar el token. No enviar contraseñas ni mostrar tokens en logs.
- No registrar secretos en URL de servidor; usar fragmento para token de recuperación y retirarlo del navegador inmediatamente. No cargar contenido de terceros en la pantalla de recuperación.
- La API distingue envío aceptado/encolado y entrega acreditada; un proveedor no configurado no simula éxito. Probar email recibido, token caducado, reutilización, dirección no verificada y rotación de acceso.
- WhatsApp sigue disponible para compartir manualmente. Recuperación automática por WhatsApp requiere otra integración y no se presume por un enlace `wa.me`.
