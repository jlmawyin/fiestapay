# OpenAI como único proveedor — 27 octubre 2026

GROK entregó el paquete `FP-OPENAI-ONLY-20261027`, intento1/3. AGY aprobó la fuente de manera independiente en `FP-OPENAI-VERIFY-20261027`, intento1/3. Codex cotejó los35hashes y los tamaños del archivo de evidencia generado por máquina: sin diferencias.

La aplicación elimina el adaptador anterior, sus variables de configuración, capacidades, etiquetas y componentes. OpenAI Responses es el único proveedor; el modelo configurado y predeterminado es `gpt-6-luna`, con razonamiento `low`. Se conserva la variable operativa `OPENAI_MODEL`, modificable únicamente por quien administra el servicio; no existe selector de modelo para invitados. Otro valor de `LLM_PROVIDER` se rechaza sin mostrar su contenido.

Se mantienen herramientas del servidor, cálculo en centavos, confirmación humana, límites de consumo, moderación y separación entre asistencia y pago. La falta de clave o un error del proveedor informa503 y deja disponibles los formularios. No se incorporan herramientas para que el modelo cree o capture pagos.

El historial conserva roles y filas antiguas. Solo su texto visible se convierte al formato de OpenAI; firmas ajenas, pensamientos y respuestas de herramientas sin llamada correspondiente quedan fuera. El historial propio conserva el emparejamiento `call_id` y los elementos de razonamiento necesarios con `store:false`. No hubo migración ni borrado de conversaciones.

## Verificación

- Constructor: lint, tipos y compilación correctos; **332 pruebas en32archivos** con PostgreSQL local.
- AGY: **201 pruebas de API y131 de interfaz**, además de **14 casos independientes** para configuración, historial, importes, herramientas, permisos y aislamiento; sin skips declarados. Las332 se repitieron como regresión, no son664casos únicos.
- **Dos recorridos Edge contra Fastify y PostgreSQL locales**, con OpenAI simulado: chat configurado y chat desactivado con formulario disponible. Se bloquearon solicitudes a terceros.
- Búsqueda acotada: cero referencias al proveedor retirado en código productivo, scripts activos, ejemplo de entorno y recursos de navegador compilados. Las pruebas negativas y los créditos históricos de agentes conservan menciones intencionales.
- Comparación de fuente: sin cambios en migraciones, lógica financiera, allowlist de claves de administración, formulario ni algoritmo de cola de audio.

No hubo llamadas nuevas a OpenAI, PayPal, SMTP o AssemblyAI. La aceptación externa previa se conserva. Los ensayos con proveedores simulados no prueban audio físico ni un nuevo pago. La prueba de celular y el recorrido completo de90segundos siguen pendientes.

Los artefactos privados de revisión permanecen en `.local`. Este informe acredita la fuente local; la versión desplegada y CI se registran por separado en [ESTADO.md](../ESTADO.md).

## Publicación verificada

Release `9a40f2657377118294e7ee5f5fbb1aca56b566e1`, [PR5](https://github.com/jlmawyin/fiestapay/pull/5), [CI40579135674](https://github.com/jlmawyin/fiestapay/actions/runs/40579135674) verde. Imagen `sha256:ab51b94bb0d34fd0f0af80d5862ed73e7cdd53487a46c7d8d1244177d94494af` activada el27oct15:38, esquema0008.

Se recreó solo la API, se eliminaron exactamente los dos archivos fuente retirados y se comprobaron salud, HTTPS, recursos públicos y capabilitiesOpenAI. Se conservaron24fiestas/23legadas y ambas referencias financieras; secretos encontrados en bundle/logs0, demás contenedores idénticos. El entorno no contiene variables del proveedor retirado. No se repitieron llamadas de prueba a proveedores, pagos ni correos.
