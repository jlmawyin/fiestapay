# DeepSeek Harness — sustitución temporal de GROK, 28oct2026

Jorge pidió pausar GROKCLI, probar el puente antes de usarlo y sustituirlo temporalmente en dirigir-agentes. Los encargos anteriores de GROK ya habían terminado; no se inició ninguno nuevo ni se detuvo trabajo ajeno.

## Evidencia antes de integrar

- Puente existente D:/Jorge/Documents/deepseek-harness/default-workspace/dsh-codex-bridge; se leyeron CODEX-INSTRUCTIONS.md, README y manejadores/transporte. No se modificó su servidor.
- Smoke MCP por JSON por líneas y Content-Length: ambos exit0. Cuatro herramientas: dsh_status, dsh_delegate, dsh_result, dsh_cancel.
- dsh_status: ok=true, DeepSeekHarness0.2.1-rc.3, modoaccount, credencial administrada presente, perfil inicializado, cero jobs al empezar. Presencia no garantiza vigencia; la llamada real siguiente la comprobó. Sinleer valores de credenciales ni API-key fallback.
- NOOP real: PUENTE-OK, exit0,1turno,5.3s, ninguna herramienta.
- Misma sesión session-55c64f3f-12c2-4309-8483-96f660c1afa2: creación aislada quote.mjs mediante write/pwsh, exit0,2turnos,11.4s. Revisado el archivo completo; sin otros archivos, paquetes ni cambios de producto.
- Codex ejecutó13aserciones independientes: total5000, diferencia2500, sobrepago y10entradas inválidas/overflow.13/13correctas. El agente no recibió el archivo de aserciones.

La sesión de prueba terminó y el proceso MCP propio se cerró. No se le encargó corregir FiestaPay. El presupuesto de pagos/texto/voz de FiestaPay permanece cerrado.

## Esfuerzo y configuración

El account.patch.yml original pide max. Se probó una capa adicional que solicita deepseek-account/deepseek-flash/reasoningEffort:low. Tras las pruebas, se copió byte por byte a C:/Users/Jorge/.codex/skills/dirigir-agentes/assets/deepseek-loop-low.patch.yml y se registró como DSH_BRIDGE_EXTRA_PATCH, con authaccount y máximo2jobs. La app de DeepSeek y su archivo max original no cambiaron.

La modificación de config.toml se analizó como TOML y comparó antes/después: solo tres variables del servidor dsh cambiaron; resto idéntico. Se guardó copia privada del archivo anterior. No se expone ni versiona ese archivo. Las cuatro herramientas nativas aún no aparecen en ALL_TOOLS de este chat: registro y prueba stdio no equivalen a exposición nativa; se cargarán al reiniciar/recargar el cliente según su disponibilidad. No se reinició Codex durante el trabajo.

La [documentación oficial](https://api-docs.deepseek.com/guides/thinking_mode/) distingue low/high/max: low mantiene razonamiento; medium y xhigh se mapean a high. Tomamos low como inicio para ciclos acotados con pruebas; no se demostró que siempre supere high ni se hizo benchmark A/B. Para arquitectura o lógica delicada puede justificarsemás esfuerzo, configurado explícitamente; el esquema dsh_delegate no admite effort/model por llamada. La prueba valida el circuito con la configuración low solicitada, no una medición independiente de tokens de razonamiento internos.

## Reglas preservadas

DSH construye, AGY verifica y Claude diagnostica recuperaciones; Codex coordina. Máximo dos constructores; tres entregas por defecto y contadores persistentes. Cambiar GROK por DSH NO autoriza una cuarta entrega de B/C ni del arnés. Auth/billing/rate_limit detienen; cuotaCodex<=20%5h o<=5%semanal detiene también DSH. dsh_status no informa porcentaje ni saldo: no se inventan. No se compran créditos ni se cambian cuentas.

Habilidad y referenciaDeepSeek actualizadas; reglasglobales y del checkout enlazan el método. quick_validate.py: exit0, Skill is valid. AGY completó la revisión independiente FP-DSH-INTEGRATION-VERIFY-20261028 intento1/3: PASS en8escenarios de política ysincontradicciones. Confirmó el alcance limitado del circuito y la función pura sin imports ni efectos ocultos. Uso:83867entrada/17047salida/13165thinking/cache147100/100914total. Los informes históricos de GROK se conservan como historia.

Nota de límites: el CLI de AGY generó un plan en su directorio brain externo pese al encargo de salida JSON. No se abrió ni usó ese archivo; el resultado se evaluó desde la respuesta JSON registrada. No hubo cambios de producto y no se le proporcionaron secretos. La habilidad ya advierte que cwd/prompt no son aislamiento duro.
