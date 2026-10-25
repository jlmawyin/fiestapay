# Encargos y contadores vigentes

25 octubre 2026. Skill dirigir-agentes; contadores se conservan entre sesiones/responsables. No confundir ejecución iniciada con entrega aprobada.

| Encargo/defecto | Responsable | Intento/entrega | Estado |
|---|---|---:|---|
| OpenAI proveedor e interfaz | Claude/AGY inicial → GROK integración | 2/3 | Versión1bf3434, CI y aceptación externa aprobadas. Nueva eliminación definitiva del otro proveedor pertenece al alcance25oct. |
| Límite de firma webhook | GROK | 1/3 | Aprobado por AGY, CI y webhook real PayPal sin duplicar captura. |
| Revisión OpenAI/webhook | AGY | 1/3 | Aprobada,35tests específicos; alcance acotado. |
| FP-SCOPE-RESEARCH-20261025 | AGY | 1/3 | Investigación entregada; sin tests. Codex descartó propuestas fuera de alcance y afirmaciones no verificadas. |
| FP-PERSIST-ACCESS-20261025 | GROK | 3/3 entregada | Compatibilidad INSERT legado en 0005 y 8 tests nuevos. 14 pruebas PG (compatibilidad + acceso) y lint del test aprobados; 122 475 entrada / 75 779 salida. Saldo 83 % general / 89 % Build. Revisión AGY pendiente antes de desplegar. |
| FP-PERSIST-VERIFY-20261025 | AGY | 2/3 aprobada | Compatibilidad 0005, 14 pruebas PG y arnés independiente de 10 comprobaciones aprobados; script de despliegue revisado y sintaxis correcta. Sin ejecución de rollback real. Integración y CI de esta revisión pendientes. |
| FP-VOICE-QUEUE-20261025 | GROK | 3/3 informe cotejado | Hashes de los tres archivos coinciden con el informe final: 18 tests y tipos reportados. Revisión AGY de versión nueva en curso; sin nuevo intento de construcción. |
| FP-VOICE-VERIFY-20261025 | AGY | 2/3 entregada | 18 pruebas existentes y 4 de arnés UI aprobadas; tipos correctos. Queda lint playback.ts:121. Se pidió excepción puntual a Jorge para integrar esa línea; respuesta pendiente. Sin prueba móvil ni despliegue. 151 677 entrada / 25 070 salida. |
| FP-PROXY-REVIEW-20261025 | AGY | 2/3 aprobada | Informe final entregado; hashes de configuración y script coinciden. Aprobación acotada de proxy, sin nueva ejecución VPS ni aceptación de la aplicación. 82 648 tokens entrada / 9 200 salida. Entrega 1 había producido plan sin informe final. |
| FP-RECOVERY-20261025 | GROK | 1/3 reanudado con SMTP | Jorge cambió el transporte a Banahosting. Proceso anterior detenido y parciales preservados; no fue fallo ni nuevo intento. Sesión 5244, prompt recovery-smtp-task.txt. Nodemailer 10.2.1 instalado por Codex con tipos propios. Credenciales reales solo VPS; no envío hasta destinatario autorizado. Grok 83 % general / 89 % Build. |
| FP-DEPLOY-PERSIST-VERIFY-20261025 | AGY | 1/3 entregada | Script seed/check/cleanup y revisión sintáctica; no ejecutó peticiones. Codex puede verificar un evento ficticio sin pagos, antes/después del reinicio del API exclusivo. 79 306 entrada / 21 740 salida. |

Paquetes/prompts/reportes operativos en `.local/`, ignorados porGit. Codex controla integración, credenciales, despliegue y evidencias externas; agentes no acceden a secretos niVPS. No hay conectores MCP de los tres agentes en esta sesión: GROK/AGY usan sus puentes canónicos. Claude CLI autenticada el25oct, cuota desconocida, no se inició recuperación.

Base local desechable para verificación: contenedor `fiestapay-test-oct25`, PostgreSQL16, solo loopback127.0.0.1:55439; sin datos de producción. Configuración de pruebas en `.local/test-database.md`. No tocar contenedores de otros proyectos.

Jorge confirmó mantener la pausa al 20 % de cinco horas. La exención semanal anterior no se presume permanente: en este despertar se aplican ambas guardas. No se consume el reseteo del usuario.
