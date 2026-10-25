# Encargos y contadores vigentes

25 octubre 2026. Skill dirigir-agentes; contadores se conservan entre sesiones/responsables. No confundir ejecución iniciada con entrega aprobada.

| Encargo/defecto | Responsable | Intento/entrega | Estado |
|---|---|---:|---|
| OpenAI proveedor e interfaz | Claude/AGY inicial → GROK integración | 2/3 | Versión1bf3434, CI y aceptación externa aprobadas. Nueva eliminación definitiva del otro proveedor pertenece al alcance25oct. |
| Límite de firma webhook | GROK | 1/3 | Aprobado por AGY, CI y webhook real PayPal sin duplicar captura. |
| Revisión OpenAI/webhook | AGY | 1/3 | Aprobada,35tests específicos; alcance acotado. |
| FP-SCOPE-RESEARCH-20261025 | AGY | 1/3 | Investigación entregada; sin tests. Codex descartó propuestas fuera de alcance y afirmaciones no verificadas. |
| FP-PERSIST-ACCESS-20261025 | GROK | 2/3 pausado | Intento1 agotó2400s con migración/dominio parciales; conservados. Intento2 detenido por cuota Codex, no consume un intento adicional. Completar administración/persistencia/privacidad/UI y pruebas PostgreSQL al retomar. Eliminación residual Gemini diferida a P5. |
| FP-VOICE-QUEUE-20261025 | GROK | 2/3 pausado | Primer intento agotó1200s sin cambios. Segundo detenido por cuota Codex; sigue siendo2/3. Retomar playback/arranque y pruebas. Proxy resuelto en integración Codex. |

Paquetes/prompts/reportes operativos en `.local/`, ignorados porGit. Codex controla integración, credenciales, despliegue y evidencias externas; agentes no acceden a secretos niVPS. No hay conectores MCP de los tres agentes en esta sesión: GROK/AGY usan sus puentes canónicos. Claude CLI autenticada el25oct, cuota desconocida, no se inició recuperación.

Base local desechable para verificación: contenedor `fiestapay-test-oct25`, PostgreSQL16, solo loopback127.0.0.1:55439; sin datos de producción. Configuración de pruebas en `.local/test-database.md`. No tocar contenedores de otros proyectos.

La exención semanal preventiva dada por Jorge aplica a esta ejecución de Codex. Límites reales y guardia de cinco horas siguen aplicando. No se consume el reseteo del usuario.
