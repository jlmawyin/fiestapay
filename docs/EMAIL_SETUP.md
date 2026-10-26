# Recuperación del organizador por correo

Método aprobado por Jorge el 25 octubre: SMTP de Banahosting/cPanel, con la cuenta `fiestapay@somospanas.com`. Implementación desplegada en Contabo en `2d7c542`, con revisión independiente, pruebas PostgreSQL y Chromium aprobadas. Jorge informa que su prueba SMTP llegó a bandeja de entrada. Esa prueba del dueño no acredita todavía envío desde FiestaPay ni recuperación real. La API está saludable y su envío sigue deshabilitado mientras falta la contraseña.

FiestaPay se conecta al servidor SMTP existente desde Contabo. No instala otro servidor de correo ni cambia MX, DNS, cuentas existentes o configuración del dominio. El hosting del correo permanece en Banahosting.

## Configuración que hará Jorge

1. Cuenta creada por Jorge en cPanel. Parámetros autorizados: servidor `mail.somospanas.com`, puerto `465`, usuario y remitente `fiestapay@somospanas.com`. En **Email Accounts → Connect Devices** se pueden contrastar los ajustes seguros. [Guía oficial de cPanel](https://docs.cpanel.net/cpanel/email/set-up-mail-client/).
2. Cargar las cinco variables siguientes **solo en el archivo privado del servicio FiestaPay en el VPS**, actualmente `/opt/fiestapay/.env.production`. Jorge las carga o autoriza expresamente su carga; nunca se piden valores por el chat ni se guardan en el `.env` local, Git o logs.

   | Variable | Contenido |
   |---|---|
   | `SMTP_HOST` | Hostname de salida que indica cPanel. |
   | `SMTP_PORT` | `465` con TLS desde el inicio, o `587` con STARTTLS obligatorio. |
   | `SMTP_USER` | Cuenta de correo completa creada en cPanel. |
   | `SMTP_PASS` | Contraseña privada de esa cuenta. |
   | `EMAIL_FROM` | Dirección remitente autorizada para esa cuenta. |

   Guardar los valores con el formato `.env` de Compose. Las comillas simples conservan literalmente caracteres como `$`; si el valor contiene comillas, usar los escapes documentados. No pegar contraseñas en comandos ni imprimir la configuración resuelta. [Reglas oficiales de formato e interpolación](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

   Codex cargó los cuatro parámetros autorizados en el VPS, manteniendo permisos `0600` y `SMTP_PASS` vacío. No se recreó el servicio ni se envió correo. `EMAIL_FROM` admite una sola dirección: se usa `fiestapay@somospanas.com`, sin el nombre de presentación `FiestaPay <…>`, que la validación actual rechaza. La contraseña se introducirá directamente en el VPS; nunca mediante chat, archivo local o argumento de un comando.

   Durante la propagación posterior a la renovación, el resolutor del VPS conservaba la IP de estacionamiento para `mail.somospanas.com`; el TTL observado era209segundos. El DNS público devuelve `50.31.177.117`. Una conexión diagnóstica a esa IP desde el VPS, conservando el hostname original para validar certificado TLS, recibió saludoSMTP220 sin autenticación ni envío. Esto acredita conectividad/TLS, no una sesión SMTP autenticada. No se cambió el resolutor, `/etc/hosts` ni DNS; antes del envío se volverá a comprobar la resolución normal.

   La comprobación dentro de `fiestapay-api-1` confirmó también `162.4.84.247` y timeout465. El registro antiguo volvió a aparecer tras vencer el primer TTL: no se promete una hora de propagación. El bloqueo SMTP continúa aunque el HTTPS público del sitio esté resuelto. No repetir sondeos hasta el siguiente paso útil, como completar la contraseña.

### Introducir la contraseña desde el propio VPS

Destinatario único autorizado recibido por el chat el25oct19:16; no publicarlo en Git ni volver a solicitarlo. La comprobación de presencia de ese momento confirmó contraseña aún vacía, otroscuatroajustes cargados y permisos0600. No se envió correo. Después de guardar la contraseña, continuar con el destinatario ya autorizado.

El cargador opcional de entrada oculta no fue entregado: GROK agotó dos intentos sin archivos y AGY agotó la revisión sin informe. No se instaló ni aprobó ese cargador. La edición estándar del archivo está disponible con Nano en el VPS; esta guía usa el formato documentado de Compose, sin atribuirle pruebas nuevas de los agentes.

En **PowerShell de Jorge**, abrir el archivo remoto:

```powershell
ssh -t root@198.7.114.73 "nano --ignorercfiles /opt/fiestapay/.env.production"
```

Buscar `SMTP_PASS=` y completar únicamente esa línea, rodeando el valor con comillas simples. No pegar la contraseña en comandos de PowerShell, en el chat ni en archivos locales. Las comillas simples conservan literalmente `$` y los símbolos habituales. **Si la contraseña contiene comilla simple (`'`) o barra invertida (`\`), detenerse y avisar solo de ese tipo de carácter, sin compartir la contraseña**: se dará el formato específico antes de guardar. No adivinar escapes. [Formato oficial de Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax).

Guardar con **Ctrl+O**, **Enter** y salir con **Ctrl+X**. La contraseña puede verse dentro del editor de Jorge; no es un formulario de entrada oculta. No compartir captura ni salida del archivo. Avisar únicamente «guardada» y nombrar el destinatario autorizado. Codex comprobará solo presencia/configuración válida, aplicará exclusivamente la API cuando corresponda y distinguirá aceptación SMTP de recepción. Editar este archivo no activa el correo por sí solo.

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

La [ruta pública del dominio ya está restablecida y verificada por HTTPS](reviews/domain-routing-20261025.md). Sigue pendiente la contraseña SMTP y la única dirección destinataria autorizada; después se comprobará el enlace desde el correo.

1. Con las variables cargadas, enviar un único correo a la dirección autorizada. Registrar hora, aceptación SMTP y confirmación de entrada/spam, sin credenciales ni token.
2. Registrar/verificar el correo opcional; solicitar recuperación; recibir y abrir su enlace; obtener la nueva clave. Comprobar nueva clave válida y anterior 403, con salida solo booleana.
3. Rechazar el mismo token usado otra vez, uno caducado y dos consumos concurrentes. El control transaccional solo permite un ganador.
4. Revisar bundle, fuente comprometida y logs para comprobar ausencia de credenciales. Los tests sin SMTP real acreditan lógica y aislamiento, no entrega de correo.
