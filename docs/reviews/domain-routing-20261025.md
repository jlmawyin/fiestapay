# Ruta pública del dominio: restablecida

## Verificación posterior a la renovación — 25 octubre, 18:40 Guayaquil

Jorge informó que el dominio vencía hoy y fue renovado a las 18:02 ECT, con nuevo vencimiento el 25 octubre 2027. Aclaró que el registrador es **NameSilo**, el correo se aloja en **Banahosting** y Cloudflare mantiene DNS/proxy. La renovación y su hora son información del dueño; las comprobaciones siguientes son evidencia nueva de Codex:

| Comprobación pública | Resultado |
|---|---|
| A de `fiestapay.somospanas.com`, resolutores 1.1.1.1 y 8.8.8.8 | `104.21.35.239` y `172.67.181.52`, Cloudflare. |
| NS de `somospanas.com`, 8.8.8.8 | `austin.ns.cloudflare.com` y `delilah.ns.cloudflare.com`. |
| HTTPS normal, sin fijar origen, `/api/health` | HTTP200 y `{"ok":true}`; certificado validado. |
| HTTPS normal, `/` | HTTP200 y página FiestaPay. |
| `/api/capabilities` | Correo deshabilitado, sandbox y chat configurados. No se invocaron esos proveedores. |

El bloqueo público queda resuelto. Codex no modificó DNS, MX, SPF, DKIM ni otras aplicaciones. La recuperación por correo aún necesita contraseña SMTP, destinatario autorizado y aceptación real desde FiestaPay. No se repitieron pagos ni pruebas de persistencia ya acreditadas.

## Incidencia anterior, conservada como historial

25 octubre 2026, comprobación posterior al despliegue. El servidor de FiestaPay responde correctamente por HTTPS al fijar la conexión al VPS, pero el acceso normal por dominio falla durante TLS. No se modificaron DNS, MX ni cuentas de correo.

| Comprobación | Resultado |
|---|---|
| DNS público 1.1.1.1 y 8.8.8.8 para `fiestapay.somospanas.com` | Ambos devuelven `162.4.84.247`. |
| Nameservers de `somospanas.com` | `ns1.ns306.parklogic.com` y `ns2.ns306.parklogic.com`. |
| Resolución desde el VPS | Devuelve también `162.4.84.247`. |
| VPS usado por FiestaPay | `198.7.114.73`. |
| HTTPS directo al VPS, con nombre de servidor y certificado verificado | HTTP200 en `/api/health`. |
| Aplicación activa | Commit `97048c12466fb812b551f926f91a962f99e42125`, contenedor saludable; migración0005 aplicada, ledger con la misma captura previa. |
| Acceso normal al dominio desde Windows, VPS y navegador de consulta | Fallo TLS; no demuestra disponibilidad pública. |

El [registro RDAP de Verisign](https://rdap.verisign.com/com/v1/domain/somospanas.com) declara expiración `2027-10-25T02:40:27Z`, último cambio `2026-10-25T09:02:15Z` y esos mismos nameservers. Es información del registro, no evidencia de facturación o de quién realizó el cambio; no se concluye que sea necesario pagar una renovación.

Jorge debe revisar en el registrador la delegación hacia la zona que realmente mantiene sus registros, conservando correo/MX y el resto de sus servicios. No se recomienda cambiar nameservers a ciegas ni migrar el correo. Se solicitó esa revisión porque Jorge prohibió cambios de DNS/MX por parte de Codex.

La primera petición del arnés de persistencia falló antes de HTTP. SQL confirmó cero fiestas ficticias `Comida25USD`; no se creó una orden ni se envió correo. La prueba directa al origen se documentará aparte y no sustituye la aceptación pública del sitio. La recuperación real por enlace requiere restablecer también esa ruta pública.
