# Proxy exclusivo FiestaPay: privacidad y dirección de visitante

25 octubre 2026. Configuración en `deploy/nginx.conf`; aplicada solo a `fiestapay.somospanas.com`. Copia anterior conservada por el script de activación. No modifica defaults ni vhosts de otras aplicaciones.

- Desactivado registro de URLs de acceso en ambos bloques de FiestaPay y de errores por solicitud en ese vhost para no conservar `?k=<adminKey>`. Se mantienen logs de aplicación; su sanitización completa es parte del bloque admin aún en construcción. Esto reduce diagnóstico de proxy específico; usar healthchecks, errores de aplicación y comprobación de configuración.
- `Referrer-Policy: no-referrer` comprobada por HTTP. Evita enviar la URL de administración como referente al navegar fuera.
- Restauración de IP por `CF-Connecting-IP` exclusivamente desde las [redes IPv4](https://www.cloudflare.com/ips-v4/) e [IPv6](https://www.cloudflare.com/ips-v6/) oficiales de Cloudflare, verificadas en esta fecha. Nginx sobrescribe X-Forwarded-For con la IP resultante; solicitudes directas no confían en esa cabecera. Revisar rangos publicados antes de futuras actualizaciones.
- `nginx -t` aprobado antes de cada recarga. FiestaPay200, somospanas.com200, sparring200 y ac.visitaremota.com401 antes/después. El401 ya existía antes del cambio de proxy de esta etapa; no se alteró ese servicio ni se afirma haber probado su acceso autenticado.
- Prueba externa: solicitud pública normal200, IP observada en API no pertenece a un edgeCloudflare; solicitud directa200 con cabecera falsa no adopta la IP indicada. Petición manipulada a Cloudflare403 sin alcanzar API. Evidencia local `.local/proxy-ip-evidence.json`, salida solo booleana, sin direcciones personales.

No acredita toda la aceptación P3: moderación y bloqueo de asistentes siguen pendientes. Tampoco controla los registros que pudiera conservar Cloudflare por su cuenta; la comprobación se limita al VPS y las cabeceras configuradas.

## Revisión independiente completada

AGY Gemini Flash High entregó el informe `FP-PROXY-REVIEW-20261025`, entrega 2/3, el 25 octubre. Aprobó el cambio acotado tras leer configuración, script de activación y evidencia anterior; no realizó nuevas llamadas al VPS ni pruebas humanas. Los hashes revisados coinciden con las fuentes: nginx `FA5AD65B2B365CE0F8BF56ED004A7D58774C82AE559BA595008FAB9739BECE7F`; activación `F27A49E60701A060DBFEF894811D2B7A4B160DA44847E55437FD99B7CF3A7A7B`.

El resultado conserva las limitaciones anteriores: coincidencia de respuestas HTTP de otros sitios no demuestra su funcionamiento completo; quedan fuera registros de Cloudflare y sanitización del servidor de la aplicación. Informe operativo ignorado por Git: `.local/proxy-review.md`. Uso de esta revisión: 82 648 tokens de entrada, 9 200 de salida. El puente reportó 25,8 % agregado restante (grupo Claude/GPT); no representa el saldo de Gemini, que al iniciar estaba en 99,5 % semanal y 100 % de cinco horas.
