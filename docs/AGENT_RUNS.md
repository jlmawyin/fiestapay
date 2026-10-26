# Encargos y contadores vigentes

25 octubre 2026. Skill dirigir-agentes; contadores se conservan entre sesiones/responsables. No confundir ejecución iniciada con entrega aprobada.

| Encargo/defecto | Responsable | Intento/entrega | Estado |
|---|---|---:|---|
| FP-SMTP-PASSWORD-SETUP-20261025 | GROK | 2/3 timeout, sin archivos | Intento1 agotó900s; intento2 acotado300s también ASK_TIMEOUT, sin archivos ni cuota posterior. Status funciona86%Build/80%general, pero ejecución no acreditada en esta etapa. No se lanza intento3 sin diagnóstico/hipótesis nueva. Ningún cargador se subió al VPS. |
| FP-SMTP-PASSWORD-VERIFY-20261025 | AGY | 1/3 timeout, sin informe | AGY_TIMEOUT300s; no entregó informe ni pruebas. Status responde, ejecución útil no acreditada. Gemini94.7%semanal/100%5h antes de ask; consumo posterior desconocido. No se aprueba cargador ni se inventa validación independiente. Procedimiento estándar del editor documentado con referencia oficial de Compose. |
| OpenAI proveedor e interfaz | Claude/AGY inicial → GROK integración | 2/3 | Versión1bf3434, CI y aceptación externa aprobadas. Nueva eliminación definitiva del otro proveedor pertenece al alcance25oct. |
| Límite de firma webhook | GROK | 1/3 | Aprobado por AGY, CI y webhook real PayPal sin duplicar captura. |
| Revisión OpenAI/webhook | AGY | 1/3 | Aprobada,35tests específicos; alcance acotado. |
| FP-SCOPE-RESEARCH-20261025 | AGY | 1/3 | Investigación entregada; sin tests. Codex descartó propuestas fuera de alcance y afirmaciones no verificadas. |
| FP-PERSIST-ACCESS-20261025 | GROK | 3/3 aprobada e integrada | Compatibilidad INSERT legado, 8 tests nuevos y 6 de acceso aprobados. Commit97048c1, CI y despliegue correctos. API mantuvo fiesta al reiniciar y rechazó edición pública403; ledger1/5000 intacto. Sin prueba de ruta DNS pública, bloqueada externamente. |
| FP-PERSIST-VERIFY-20261025 | AGY | 3/3 aprobada | Última revisión corrigió el archivo de interpolación a Compose.env, preservando API.env.production. Configuración válida y segundo despliegue exitoso. SQL/retención/finanzas y sintaxis aprobados; sin forzar rollback real en producción. |
| FP-VOICE-QUEUE-20261025 | GROK | 3/3 informe cotejado | Hashes de los tres archivos coinciden con el informe final: 18 tests y tipos reportados. Revisión AGY de versión nueva en curso; sin nuevo intento de construcción. |
| FP-VOICE-VERIFY-20261025 | AGY | 2/3 entregada | 18 pruebas existentes y 4 de arnés UI aprobadas; tipos correctos. Queda lint playback.ts:121. Se pidió excepción puntual a Jorge para integrar esa línea; respuesta pendiente. Sin prueba móvil ni despliegue. 151 677 entrada / 25 070 salida. |
| FP-PROXY-REVIEW-20261025 | AGY | 2/3 aprobada | Informe final entregado; hashes de configuración y script coinciden. Aprobación acotada de proxy, sin nueva ejecución VPS ni aceptación de la aplicación. 82 648 tokens entrada / 9 200 salida. Entrega 1 había producido plan sin informe final. |
| FP-RECOVERY-20261025 | GROK | 2/3 aprobada y desplegada | Código2d7c542, CI40221509308 y APIhealthy,0006 aplicada. Envíos deshabilitados hasta configuración; ledger1/5000,tokens0. Real aceptación bloqueada por dominio/configuración/destinatario, sin DNS/MX/correo modificado. Grok81% general/87%Build. |
| FP-RECOVERY-VERIFY-20261025 | AGY | 2/3 aprobada | Base253 pruebas/26 archivos, 13 comprobaciones Chromium. Después10UItests,8comprobacioneshash y13regresión. SMTP real bloqueado por dominio/credenciales/destinatario. 337146entrada/39841salida y208584entrada/30877salida. |
| FP-DEPLOY-PERSIST-VERIFY-20261025 | AGY | 2/3 entregada y ejecutada | Añadió --origin fijo con TLS/SNI/certificado, sin modificar DNS. Codex ejecutó seed/reinicioAPI/check/cleanup, todos aprobados; no pagos ni correo. Artefacto privado limpió clave. No equivale a disponibilidad pública. |

Paquetes/prompts/reportes operativos en `.local/`, ignorados porGit. Codex controla integración, credenciales, despliegue y evidencias externas; agentes no acceden a secretos niVPS. No hay conectores MCP de los tres agentes en esta sesión: GROK/AGY usan sus puentes canónicos. Claude CLI autenticada el25oct, cuota desconocida, no se inició recuperación.

Los timeouts nuevos son un bloqueo de ejecución todavía sin causa probada: consultar cuota/modelos no acredita capacidad de construir o verificar. Conservar GROK2/3 yAGY1/3 al investigar ese mismo bloqueo; cambiar nombre de tarea o producto no reinicia esos contadores. No instalar ni aprobar el helper opcional inexistente. Las operaciones de configuración de secretos permanecen enCodex/Jorge, con el procedimiento estándar remoto documentado.

Base local desechable para verificación: contenedor `fiestapay-test-oct25`, PostgreSQL16, solo loopback127.0.0.1:55439; sin datos de producción. Configuración de pruebas en `.local/test-database.md`. No tocar contenedores de otros proyectos.

Jorge confirmó mantener la pausa al 20 % de cinco horas. La exención semanal anterior no se presume permanente: en este despertar se aplican ambas guardas. No se consume el reseteo del usuario.
