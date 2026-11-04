# Persistencia, enlaces de organizador y privacidad

25 octubre 2026. Construcción GROK, intento 2/3; revisión independiente AGY, entrega 1/3 reanudada tras pausa de cuota. Código integrado en `4c7d9bc`. Los hashes de las 39 fuentes revisadas coincidieron antes de integrar.

AGY ejecutó tipos, compilación y 227 pruebas en 22 archivos del espacio de trabajo. Ese total incluye la reparación de voz aún separada del commit de persistencia. Las seis pruebas nuevas de persistencia validan hash y entrega única de clave, migración de eventos anteriores, revocación del código privado, reinicio limitado a demos, retención y conciliación de captura tardía, y límites de desbloqueo. El lint completo señala una línea de voz; los archivos de este cambio quedaron limpios. CI del commit integrado se registra por separado.

El recorrido local con Playwright creó un evento privado, guardó y retiró la clave de la URL, verificó acceso admin válido y rechazo sin clave/con clave incorrecta, abrió la invitación como invitado, rechazó un código erróneo y revocó el acceso al cambiarlo. Se ejecutó con servidor y esquema PostgreSQL aislados; ambos se cerraron al terminar. No fue una prueba humana ni de producción.

La revisión aprobó autorización del servidor, comparación de hashes en tiempo constante, rutas privadas, orden de bloqueos y conservación de referencias financieras. El contenido deja de estar disponible a las 72 horas del fin incluso antes de la siguiente ejecución del limpiador. Correo de recuperación, reembolsos automáticos y moderación pertenecen a entregas posteriores. La permanencia tras reiniciar el servicio publicado requiere todavía evidencia operativa.

Artefactos locales ignorados: `.local/persistence-review.md`, `.local/persist-verify.mjs` y `.local/persistence-review-resumed-result.json`. Uso de revisión: 335 993 tokens de entrada y 42 749 de salida. El puente informó 25,8 % agregado, correspondiente al grupo Claude/GPT; no al saldo Gemini empleado.

## Compatibilidad antes de publicar

GROK entregó el intento 3/3 y AGY aprobó su revisión 2/3. La migración 0005, todavía sin aplicar en producción, rellena el fin al insertar desde la imagen anterior cuando ese campo no existe: inicio + cuatro horas. Un fin explícito se conserva y los valores inválidos siguen rechazados; las actualizaciones no recalculan fechas. Las funciones quedan limitadas al esquema correcto y se conserva el guardia de registros financieros.

AGY reprodujo 14 pruebas PostgreSQL y ejecutó un arnés SQL independiente con diez comprobaciones, además del lint del nuevo test. Aprobó también el script operativo de despliegue: copia previa, solo servicio FiestaPay, archivo privado conservado y reversión de imagen sin restaurar la base financiera. No se ejecutó una reversión real en esa revisión. Informes ignorados: `.local/rollback-compat-report.md` y `.local/rollback-compat-review.md`.

## Verificación operativa del origen

`97048c12466fb812b551f926f91a962f99e42125` pasó [CI](https://github.com/jlmawyin/fiestapay/actions/runs/40215366820) y se activó en Contabo. El primer intento operativo paró antes del build al usar el archivo de entorno incorrecto para interpolar Compose. AGY3/3 aprobó la corrección a `.env`, conservando `.env.production` para la API; la comprobación de Compose pasó y el segundo intento publicó correctamente. No se restauró la base ni se modificó otro servicio.

Creación ficticia por HTTPS directo al VPS: 17:53:56UTC. Reinicio exclusivo de la API: inicio anterior17:27:53UTC y nuevo17:54:13UTC. Después: misma fiesta/id con cliente sin cookies, panel con clave válida200, clave incorrecta403, edición/cierre/borrado/panel sin clave403 y datos intactos; edición autorizada200. Limpieza17:55:37UTC: borrado con su clave200 y lectura410. SQL posterior: un movimiento financiero, 5000centavos, igual al anterior. No hubo órdenes, pagos, voz, chat ni correo nuevos.

Estas comprobaciones fijaron la conexión al origen con SNI y validación de certificado. **No acreditan acceso público por DNS**, que permanece bloqueado por la [delegación observada](domain-routing-20261025.md). Evidencias ignoradas: `.local/persist-prod-evidence.json`, `.local/persist-prod-restart.log`, `.local/deploy-97048c1-retry.log`. El archivo temporal con la clave se limpió al finalizar el arnés.
