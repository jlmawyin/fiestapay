# Persistencia, enlaces de organizador y privacidad

25 octubre 2026. Construcción GROK, intento 2/3; revisión independiente AGY, entrega 1/3 reanudada tras pausa de cuota. Código integrado en `4c7d9bc`. Los hashes de las 39 fuentes revisadas coincidieron antes de integrar.

AGY ejecutó tipos, compilación y 227 pruebas en 22 archivos del espacio de trabajo. Ese total incluye la reparación de voz aún separada del commit de persistencia. Las seis pruebas nuevas de persistencia validan hash y entrega única de clave, migración de eventos anteriores, revocación del código privado, reinicio limitado a demos, retención y conciliación de captura tardía, y límites de desbloqueo. El lint completo señala una línea de voz; los archivos de este cambio quedaron limpios. CI del commit integrado se registra por separado.

El recorrido local con Playwright creó un evento privado, guardó y retiró la clave de la URL, verificó acceso admin válido y rechazo sin clave/con clave incorrecta, abrió la invitación como invitado, rechazó un código erróneo y revocó el acceso al cambiarlo. Se ejecutó con servidor y esquema PostgreSQL aislados; ambos se cerraron al terminar. No fue una prueba humana ni de producción.

La revisión aprobó autorización del servidor, comparación de hashes en tiempo constante, rutas privadas, orden de bloqueos y conservación de referencias financieras. El contenido deja de estar disponible a las 72 horas del fin incluso antes de la siguiente ejecución del limpiador. Correo de recuperación, reembolsos automáticos y moderación pertenecen a entregas posteriores. La permanencia tras reiniciar el servicio publicado requiere todavía evidencia operativa.

Artefactos locales ignorados: `.local/persistence-review.md`, `.local/persist-verify.mjs` y `.local/persistence-review-resumed-result.json`. Uso de revisión: 335 993 tokens de entrada y 42 749 de salida. El puente informó 25,8 % agregado, correspondiente al grupo Claude/GPT; no al saldo Gemini empleado.
