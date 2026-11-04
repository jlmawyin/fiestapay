# Recaudado, meta y mínimo — 23 octubre 2026

## Brecha encontrada

El test de `apps/api/test/api.test.ts` titulado «49,99 no alcanza un mínimo de 50 y 50 sí» solo comprobaba 2500 y 5000 centavos. El cálculo actual del servidor utiliza enteros y el ledger de capturas menos devoluciones; no se identificó un cambio necesario en producción. Se sustituyó esa prueba por la frontera exacta, sin ampliar P1.

## Recorrido comprobado

AGY Claude Opus High, acotado a verificación financiera, construyó la prueba en un único archivo. Todas las operaciones financieras pasan por la API con `FakePayPal`; no se insertan movimientos directamente en el ledger.

| Estado | Resultado exigido |
|---|---|
| Sin capturas | Recaudado 0; confirmar devuelve 409. |
| Captura de dos personas × USD 25 | Recaudado 5000; mínimo alcanzado; evento todavía sin confirmar. |
| Devolución de un centavo | Recaudado 4999, saldo 1; mínimo no alcanzado; confirmar devuelve 409. |
| Repetición de devolución, con mismo y distinto ID de webhook | Un solo asiento de devolución; conserva 4999. |
| Cotización y orden por saldo de un centavo, luego APPROVED | Recaudado sigue en 4999; ninguna captura de esa orden; sigue bloqueada la confirmación. |
| Captura del centavo pendiente | Recaudado 5000; saldo 0; mínimo alcanzado, sin confirmación automática. |
| Confirmación explícita del organizador | Evento confirmado y auditoría registrada. La meta de 10000 no impide confirmar con el mínimo de 5000. |

En los estados del recorrido se comparan la invitación pública, el dashboard y `runTool('get_collection_progress')`. Devuelven los mismos centavos y estado del mínimo; la herramienta conserva la nota «antes de comisiones» y no propone acciones ni cotiza. Chat y voz llaman a este mismo handler según la fuente actual. Esto comprueba el handler, no una conversación externa ni la totalidad de ambas rutas.

Las vistas existentes muestran `Recaudado` con la nota «antes de comisiones», meta y mínimo del servidor. Alcanzar el mínimo es distinto de que el organizador confirme el evento; confirmar asistencia tampoco acredita pago.

## Revisión y ejecución

- Una entrega evaluada. `review_templates` revisó independientemente la fuente y el diff: sin bloqueantes concretos; no ejecutó pruebas ni afirmó aceptación externa.
- Lint y tipos de la API aprobados por el constructor; lint y comprobación de secretos repetidos por Codex, sin coincidencias.
- Primer intento por túnel SSH a la DB dedicada `fiestapay_test`: agotó 30 segundos, sin fallo de aserción registrado. Segundo intento con límite de ejecución local de 120 segundos: **1 prueba aprobada, 42 excluidas por filtro**, duración total 86,20 segundos. No se cambió el límite de CI ni la configuración de producción.
- Commit `659a26b`. [CI completa aprobada](https://github.com/jlmawyin/fiestapay/actions/runs/39929962747): **157 pruebas / 16 archivos**, PostgreSQL, lint, tipos y build, con el límite original de pruebas. El total no aumenta porque se sustituyó un caso existente.
- Solo cambia una prueba; no requiere despliegue. Runtime público conserva `6d203e2`.

## Gemini y límites de la evidencia

La consulta pública de agenda y recaudado volvió a devolver 503 por tiempo de espera. Diagnóstico separado desde el contenedor de FiestaPay: metadatos del modelo respondieron HTTP 200 en 436 ms; una única generación con herramientas, con límite diagnóstico de 45 segundos, recibió **HTTP 503 del proveedor** en 4306 ms. Esto confirma acceso al endpoint de metadatos, pero no disponibilidad de generación. No se aumentó el timeout de producción, no se compraron créditos y no se repitió el bucle.

Evidencia privada ignorada por Git: `.local/funding-test-20261023-tunnel.log`, `.local/funding-gemini-20261023.log`, `.local/gemini-network-20261023.log`, `.local/gemini-generation-diagnostic-20261023.log` y `.local/funding-ledger-20261023.log`.

Consulta agregada de producción: 3 órdenes `created`, 0 movimientos financieros y 0 webhooks registrados. Sin captura sandbox externa ni prueba humana de voz. El acceso a compradores guardados sigue sin cambios.

## Cobertura de la investigación

Tier 2, grafo `fiestapay`, generación 15 oct. Búsquedas de `eventTotals`, `toFiestaEvent`, `confirmEvent` y `runTool`, trazas de totales en ambos sentidos y de callers de la herramienta compartida, sin paginación pendiente. La cobertura señala metadatos cambiados en fuente y exclusión de los tests: se leyó fuente actual directamente, incluyendo los handlers, configuración y adaptador Gemini. No es una auditoría exhaustiva.
