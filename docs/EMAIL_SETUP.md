# Recuperación del organizador por correo

Método vigente: SMTP de Banahosting/cPanel, cuenta `fiestapay@somospanas.com`. Aplicación `2d7c542` con revisión independiente previa. El 25 de octubre se completó el recorrido real: mensajes de verificación y recuperación recibidos en bandeja de entrada, contacto verificado, clave anterior 403 y panel nuevo 200. [Evidencia y límites](reviews/smtp-live-20261025.md).

FiestaPay utiliza el servidor de correo existente. No instala otro, no modifica MX/DNS del dominio ni cuentas existentes. NameSilo es el registrador; Banahosting aloja el correo; Cloudflare mantiene DNS/proxy del sitio.

## Configuración privada

Las cinco variables están cargadas **solo en `/opt/fiestapay/.env.production` del VPS**, permisos 0600. Jorge guardó la contraseña directamente allí; no debe enviarla por chat, archivos locales, Git, logs ni argumentos de comandos. La dirección única autorizada para aceptación se conserva en el chat y no se publica en el repositorio.

| Variable | Configuración |
|---|---|
| `SMTP_HOST` | `mail.somospanas.com`, según los ajustes de cPanel confirmados por Jorge. |
| `SMTP_PORT` | `465`, TLS desde el inicio; también se admite587 con STARTTLS obligatorio. |
| `SMTP_USER` | Cuenta completa `fiestapay@somospanas.com`. |
| `SMTP_PASS` | Contraseña privada; nunca mostrar su valor. |
| `EMAIL_FROM` | `fiestapay@somospanas.com`, una dirección simple. La validación actual rechaza nombres de presentación y listas. |

En cPanel **Email Accounts → Connect Devices** pueden contrastarse los ajustes seguros. [Guía oficial](https://docs.cpanel.net/cpanel/email/set-up-mail-client/). El adaptador Nodemailer valida certificadoTLS, exige cifrado en 587 y desactiva trazas de autenticación/cuerpo y lectura de archivos/URLs. [Opciones oficiales](https://nodemailer.com/smtp).

## Recrear únicamente la API

Editar el archivo no cambia el entorno del contenedor existente. La interpolación de Compose usa `/opt/fiestapay/.env`; la API recibe `.env.production`. No intercambiar estos archivos ni imprimir la configuración resuelta.

Tras la renovación del dominio, el resolutor heredado del VPS y de Docker seguía devolviendo la IP de estacionamiento para el correo. Se añadió [compose.smtp-runtime.yml](../deploy/compose.smtp-runtime.yml): resolutores1.1.1.1/8.8.8.8 **solo para la API de FiestaPay**. No cambia registros DNS, resolutor global, PostgreSQL, proxy ni otras apps. La comparación normalizada confirmó que solo cambió `services.api.dns`; imagen y otros contenedores/arranques quedaron iguales. [Atributo dns de Compose](https://docs.docker.com/reference/compose-file/services/#dns).

Mientras este ajuste esté activo, toda recreación posterior debe incluir ambos archivos:

```sh
cd /opt/fiestapay
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.smtp-runtime.yml config --quiet 2>/dev/null
docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.smtp-runtime.yml up -d --no-deps --no-build --pull never --force-recreate api 2>/dev/null
```

No ejecutar la segunda operación si falla la validación. Verificar salud, `emailConfigured`, resoluciónSMTP y nombre interno de la DB. No usar `docker compose config` sin modo silencioso: puede imprimir secretos. Si hay error, diagnosticar con resultados saneados, sin copiarstderr crudo ni revelar entorno. El ajusteDNS es operativo de Codex; no se atribuye a una nueva revisión de AGY.

## Mantener o rotar la contraseña

Abrir el archivo desde el PowerShell de Jorge:

```powershell
ssh -t root@198.7.114.73 "nano --ignorercfiles /opt/fiestapay/.env.production"
```

Editar únicamente `SMTP_PASS` en el propio VPS. La contraseña puede verse dentro del editor de Jorge; no es entrada oculta. No compartir capturas del archivo ni ponerla en comandos. Para el caso sencillo, las comillas simples conservan literalmente `$` y los símbolos habituales. Si contiene comilla simple o barra invertida, detenerse y determinar el formato correcto sin compartir la contraseña ni adivinar escapes. [Formato oficial de Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax).

Guardar con Ctrl+O, Enter y salir con Ctrl+X. Luego validar configuración sin imprimir valores y recrear únicamente la API. El cargador opcional no fue entregado ni instalado; sus intentos están en AGENT_RUNS.md, no es una dependencia del envío.

## Contrato de recuperación

- Correo opcional; jueces e invitados no deben entregar datos para entrar a la demo. Contacto editable solo con autorización del organizador y verificado antes de habilitar recuperación.
- Respuesta pública uniforme para no revelar direcciones. Límites compartidos por IP, evento y día.
- Token aleatorio de 32 bytes, guardado solo como hash, máximo 15 minutos y un uso. Consumo y rotación de adminKey en una transacción; un ganador ante dos consumos concurrentes. Clave anterior invalidada.
- No recuperar la clave original desde su hash; emitir una nueva. No registrar token ni credenciales. El fragmento del enlace se retira a memoria en el navegador y exige confirmar; no carga terceros.
- Cambiar/quitar contacto o borrar/caducar evento invalida pruebas anteriores; mantener referencias financieras necesarias.
- Distinguir solicitud aceptada, aceptaciónSMTP y recepción. La respuesta uniforme de recuperación no demuestra envío; comprobar entrega registrada y confirmación de entrada/spam. Un servidor desconfigurado no simula éxito.

## Aceptación y mantenimiento

El 25 de octubre se enviaron exactamente dos correos al destino autorizado desde FiestaPay:  verificación y recuperación. Ambos aceptadosSMTP y recibidos en entrada, confirmados por Jorge. Clave vieja403 y nueva200 acreditadas por llamadas/logs y captura humana. Comparación en memoria de valores privados contra cuatro archivos de bundle y logs API: sin coincidencias; `.env` privados no rastreados porGit. [Registro](reviews/smtp-live-20261025.md).

Reapertura manual adicional completada: Jorge volvió a usar el segundo enlace y recibió rechazo; la API registró HTTP400. Reutilización, caducidad y concurrencia ya aprobadas en las pruebas PostgreSQL de la fuente desplegada; no alegar una nueva espera real de 15 minutos. Para futuras pruebas, registrar versión/hora/aceptaciónSMTP/entrada o spam y no enviar a destinatarios distintos sin autorización.

Si un correo cae en spam, Jorge revisa SPF/DKIM y guías de entregabilidad en Banahosting/cPanel. Codex documenta; no modifica esos registros, MX ni el correo del dominio, ni compra planes. WhatsApp conserva el compartir manual; la [decisión de viabilidad](WHATSAPP_VIABILIDAD.md) cubre costos, requisitos y plazo de recuperación automática.
