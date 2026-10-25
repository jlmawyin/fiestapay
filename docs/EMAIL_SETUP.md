# Recuperación del organizador por correo

Método aprobado por Jorge el 25 octubre: SMTP de Banahosting/cPanel, con la cuenta `fiestapay@somospanas.com`. Implementación desplegada en Contabo en `2d7c542`, con revisión independiente, pruebas PostgreSQL y Chromium aprobadas. La API está saludable y el envío sigue deshabilitado hasta disponer de configuración válida. Todavía no hay correo recibido ni recuperación real acreditados.

FiestaPay se conecta al servidor SMTP existente desde Contabo. No instala otro servidor de correo ni cambia MX, DNS, cuentas existentes o configuración del dominio. El hosting del correo permanece en Banahosting.

## Configuración que hará Jorge

1. Crear `fiestapay@somospanas.com` en cPanel, con contraseña propia. En **Email Accounts → Connect Devices**, consultar el servidor de salida y los ajustes seguros que muestra su cuenta. Usar ese hostname exacto, sin asumir que el host SMTP es el VPS. [Guía oficial de cPanel](https://docs.cpanel.net/cpanel/email/set-up-mail-client/).
2. Cargar las cinco variables siguientes **solo en el archivo privado del servicio FiestaPay en el VPS**, actualmente `/opt/fiestapay/.env.production`. Jorge las carga o autoriza expresamente su carga; nunca se piden valores por el chat ni se guardan en el `.env` local, Git o logs.

   | Variable | Contenido |
   |---|---|
   | `SMTP_HOST` | Hostname de salida que indica cPanel. |
   | `SMTP_PORT` | `465` con TLS desde el inicio, o `587` con STARTTLS obligatorio. |
   | `SMTP_USER` | Cuenta de correo completa creada en cPanel. |
   | `SMTP_PASS` | Contraseña privada de esa cuenta. |
   | `EMAIL_FROM` | Dirección remitente autorizada para esa cuenta. |

   Guardar los valores con el formato `.env` de Compose. Las comillas simples conservan literalmente caracteres como `$`; si el valor contiene comillas, usar los escapes documentados. No pegar contraseñas en comandos ni imprimir la configuración resuelta. [Reglas oficiales de formato e interpolación](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

3. Indicar la única dirección destinataria autorizada para la primera prueba y avisar cuando estén cargadas las variables. Codex aplica esa configuración recreando exclusivamente el servicio API de FiestaPay: editar el archivo por sí solo no actualiza el entorno del contenedor existente. Verificar conexión cifrada y enviar solo a esa dirección. La aceptación SMTP se registra aparte de la recepción: Jorge confirma bandeja de entrada o spam. No se envían invitaciones a contactos ni marketing.
4. Si aparece spam, Jorge revisa en Banahosting/cPanel el estado de SPF y DKIM y las instrucciones de su proveedor. Codex documenta el resultado; no cambia esos registros ni los MX. No se contrata ningún servicio ni plan adicional.

El adaptador usa Nodemailer con TLS y validación de certificado, sin trazas de autenticación ni contenido. En el puerto 587 se exige STARTTLS; un fallo de TLS no permite continuar sin cifrado. [Opciones oficiales de SMTP/TLS](https://nodemailer.com/smtp). El envío está sujeto a los límites de la cuenta de Banahosting; no se promete capacidad ilimitada. El enlace de organizador sigue siendo el acceso principal.

## Contrato de seguridad y aceptación

- Correo opcional; no obliga a jueces a entregar datos. Guardar dirección solo mediante autorización de organizador y verificarla antes de habilitar recuperación.
- Solicitud pública devuelve respuesta uniforme para no revelar direcciones registradas. Límite por IP y por evento, más presupuesto diario de correo.
- Token aleatorio de un uso, hash en base de datos y caducidad corta. Consumir y rotar `adminKey` en una transacción; dos consumos concurrentes solo permiten uno. Clave anterior deja de autorizar.
- No recuperar la clave original desde su hash. Emitir una clave nueva después de verificar el token. No enviar contraseñas ni mostrar tokens en logs.
- No registrar secretos en URL de servidor; usar fragmento para token de recuperación y retirarlo del navegador inmediatamente. No cargar contenido de terceros en la pantalla de recuperación.
- La API distingue aceptación por SMTP, rechazo, timeout y recepción acreditada; `sendMail` aceptado no prueba bandeja de entrada. Un proveedor no configurado no simula éxito. Las credenciales y el token no aparecen en cuerpos de error, logs, auditoría, bundle o repositorio.
- WhatsApp permite compartir manualmente; la [decisión de viabilidad](WHATSAPP_VIABILIDAD.md) evalúa además recuperación automática, costos y plazo.

## Aceptación real pendiente

La [ruta pública del dominio requiere revisión del dueño](reviews/domain-routing-20261025.md). El correo con enlace de recuperación se prueba de punta a punta después de recuperar acceso HTTPS al dominio correcto; la respuesta directa del VPS no acredita que ese enlace pueda abrirse desde el correo.

1. Con las variables cargadas, enviar un único correo a la dirección autorizada. Registrar hora, aceptación SMTP y confirmación de entrada/spam, sin credenciales ni token.
2. Registrar/verificar el correo opcional; solicitar recuperación; recibir y abrir su enlace; obtener la nueva clave. Comprobar nueva clave válida y anterior 403, con salida solo booleana.
3. Rechazar el mismo token usado otra vez, uno caducado y dos consumos concurrentes. El control transaccional solo permite un ganador.
4. Revisar bundle, fuente comprometida y logs para comprobar ausencia de credenciales. Los tests sin SMTP real acreditan lógica y aislamiento, no entrega de correo.
