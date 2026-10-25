# Proxy exclusivo FiestaPay: privacidad y dirección de visitante

25 octubre 2026. Configuración en `deploy/nginx.conf`; aplicada solo a `fiestapay.somospanas.com`. Copia anterior conservada por el script de activación. No modifica defaults ni vhosts de otras aplicaciones.

- Desactivado registro de URLs de acceso en ambos bloques de FiestaPay y de errores por solicitud en ese vhost para no conservar `?k=<adminKey>`. Se mantienen logs de aplicación; su sanitización completa es parte del bloque admin aún en construcción. Esto reduce diagnóstico de proxy específico; usar healthchecks, errores de aplicación y comprobación de configuración.
- `Referrer-Policy: no-referrer` comprobada por HTTP. Evita enviar la URL de administración como referente al navegar fuera.
- Restauración de IP por `CF-Connecting-IP` exclusivamente desde las [redes IPv4](https://www.cloudflare.com/ips-v4/) e [IPv6](https://www.cloudflare.com/ips-v6/) oficiales de Cloudflare, verificadas en esta fecha. Nginx sobrescribe X-Forwarded-For con la IP resultante; solicitudes directas no confían en esa cabecera. Revisar rangos publicados antes de futuras actualizaciones.
- `nginx -t` aprobado antes de cada recarga. FiestaPay200, somospanas.com200, sparring200 y ac.visitaremota.com401 antes/después. El401 ya existía antes del cambio de proxy de esta etapa; no se alteró ese servicio ni se afirma haber probado su acceso autenticado.
- Prueba externa: solicitud pública normal200, IP observada en API no pertenece a un edgeCloudflare; solicitud directa200 con cabecera falsa no adopta la IP indicada. Petición manipulada a Cloudflare403 sin alcanzar API. Evidencia local `.local/proxy-ip-evidence.json`, salida solo booleana, sin direcciones personales.

No acredita toda la aceptación P3: moderación y bloqueo de asistentes siguen pendientes. Tampoco controla los registros que pudiera conservar Cloudflare por su cuenta; la comprobación se limita al VPS y las cabeceras configuradas.
