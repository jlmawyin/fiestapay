# Encargos y contadores vigentes

25 octubre 2026. Skill dirigir-agentes; contadores se conservan entre sesiones/responsables. No confundir ejecución iniciada con entrega aprobada.

| Encargo/defecto | Responsable | Intento/entrega | Estado |
|---|---|---:|---|
| OpenAI proveedor e interfaz | Claude/AGY inicial → GROK integración | 2/3 | Versión1bf3434, CI y aceptación externa aprobadas. Nueva eliminación definitiva del otro proveedor pertenece al alcance25oct. |
| Límite de firma webhook | GROK | 1/3 | Aprobado por AGY, CI y webhook real PayPal sin duplicar captura. |
| Revisión OpenAI/webhook | AGY | 1/3 | Aprobada,35tests específicos; alcance acotado. |
| FP-SCOPE-RESEARCH-20261025 | AGY | 1/3 | Investigación entregada; sin tests. Codex descartó propuestas fuera de alcance y afirmaciones no verificadas. |
| FP-PERSIST-ACCESS-20261025 | GROK | 2/3 entregado, revisión pendiente | Entregó API/UI de persistencia/admin/privacidad. 224 tests/22 archivos, tipos y build aprobados; check completo bloqueado por lint de voz en paralelo. Sin prueba de navegador ni despliegue. Grok restante 88 % general / 92 % Build. |
| FP-PERSIST-VERIFY-20261025 | AGY | 1/3 pausado | Detenido por cuota Codex al 20 %, conserva intento. Sesión 14795 detenida; sin reporte final. Continuar revisión independiente, no reconstruir producto. |
| FP-VOICE-QUEUE-20261025 | GROK | 3/3 pausado con informe escrito | Proceso detenido por cuota; informe final quedó escrito antes de detener: 18 tests y tipos aprobados, cola/errores/estado corregidos. Resultado del puente vacío. Cotejar reporte y pasar a AGY 2/3 antes de reinvocar constructor; no cuarto intento. |
| FP-VOICE-VERIFY-20261025 | AGY | 1/3 entregado | Verificó independientemente 15 tests. Aprobación de código con limitaciones; Codex no acepta el criterio móvil completo por esas limitaciones. 109 462 tokens entrada / 31 160 salida; sin llamada real ni prueba móvil. |
| FP-PROXY-REVIEW-20261025 | AGY | 2/3 aprobada | Informe final entregado; hashes de configuración y script coinciden. Aprobación acotada de proxy, sin nueva ejecución VPS ni aceptación de la aplicación. 82 648 tokens entrada / 9 200 salida. Entrega 1 había producido plan sin informe final. |

Paquetes/prompts/reportes operativos en `.local/`, ignorados porGit. Codex controla integración, credenciales, despliegue y evidencias externas; agentes no acceden a secretos niVPS. No hay conectores MCP de los tres agentes en esta sesión: GROK/AGY usan sus puentes canónicos. Claude CLI autenticada el25oct, cuota desconocida, no se inició recuperación.

Base local desechable para verificación: contenedor `fiestapay-test-oct25`, PostgreSQL16, solo loopback127.0.0.1:55439; sin datos de producción. Configuración de pruebas en `.local/test-database.md`. No tocar contenedores de otros proyectos.

Jorge confirmó mantener la pausa al 20 % de cinco horas. La exención semanal anterior no se presume permanente: en este despertar se aplican ambas guardas. No se consume el reseteo del usuario.
