# Estado de implementación

Actualizado el 24 octubre 2026 (America/Guayaquil). El calendario no equivale a progreso real; **P1 todavía no está aceptado**. No marcar una prueba externa por tests con proveedores simulados.

## Evidencia verificada

- Repo público MIT: https://github.com/jlmawyin/fiestapay. Rama `chore/bootstrap`; [PR #1 en borrador](https://github.com/jlmawyin/fiestapay/pull/1), [CI GitHub aprobada para `f0a5f3e`](https://github.com/jlmawyin/fiestapay/actions/runs/40081584759) (163 tests / 17 archivos); código de producción desplegado `f0a5f3e`.
- **Demo pública:** https://fiestapay.somospanas.com, HTTP 200, título FiestaPay y `/api/health` correcto. API y PostgreSQL dedicados en Contabo, sin puertos públicos del contenedor/DB. Vhost HTTPS exclusivo; certificado hasta 12 enero 2027 y timer `fiestapay-renew.timer` activo. `nginx -t` aprobado antes de recargar.
- Regresión tras activar el vhost: `somospanas.com` (WordPress), `ac.visitaremota.com` y `sparring.visitaremota.com` respondieron 200 con sus títulos originales. No se cambió su configuración.
- `npm run check` remoto con PostgreSQL de pruebas: **132 tests / 13 archivos**, lint, tipos y build aprobados. Incluye carreras de creación/captura, reembolsos, cupo, autorización, reset, confirmación ligada a cotización y cancelación asíncrona de voz. Revalidado también después del ajuste de correlación Gemini.
- Navegador contra el dominio público: crear demo, entrar con alias ficticio, confirmar un acompañante y obtener **2 × USD 25 = USD 50**. La orden exige confirmar la cotización.
- Credenciales privadas configuradas por Jorge. PayPal OAuth y registro de webhook verificados por API. ID local corregido para coincidir con la URL única registrada: `/api/paypal/webhook`. Eventos exactos: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`.
- Orden real PayPal **sandbox** por USD 50 creada. **Aprobación del comprador y captura real pendientes**; ninguna captura simulada se cuenta como pago externo. Receptor único Business sandbox.
- AssemblyAI: sesión WebSocket real desde el dominio público lista, 2551 fragmentos de audio recibidos y una herramienta de lectura ejecutada (14 oct 12:44 UTC). Esto **no acredita micrófono humano/móvil ni conversación hablada**.
- Gemini: prueba pública API y navegador con herramienta `prepare_quote` aprobada el 16 oct: dos asistentes × USD 25 = USD 50, tarjeta y confirmación sin crear una orden. Evidencia privada `.local/provider-smoke-20261016-chat.json`. Las consultas de agenda del 21 y 23 oct devolvieron **503**; no están aceptadas. El 23 oct se verificó acceso a metadatos del modelo (HTTP 200), pero una generación diagnóstica devolvió HTTP 503 del proveedor. Conservar fallback a formulario.
- Respaldo `fiestapay-20261014T123332Z.dump` restaurado en DB temporal: 4 eventos, 0 movimientos financieros. DB temporal eliminada, producción intacta. Copia fuera del VPS guardada en `.local/` (ignorada por Git).

## Agentes y revisión

- Claude construyó API/PostgreSQL/PayPal/Gemini. AGY Gemini construyó frontend/voz. Codex integró, desplegó y verificó.
- AGY Opus independiente detectó carreras financieras. Correcciones de Claude, integración Codex y tests específicos registrados en [revisión](reviews/bootstrap.md). Capturas inciertas mantienen su reserva incluso transcurrido el tiempo: no abrir otra obligación hasta conciliarlas.
- Revisión frontend independiente: confirmación ligada al ID de cotización, error RSVP propagado y cancelación de voz protegida contra callbacks tardíos; siete tests de regresión incluidos.
- 16 oct: AGY Gemini construyó recuperación del regreso PayPal sin almacenamiento de pestaña; Codex integró consulta autenticada y verificación de invitación/estado. Claude revisó independientemente; tres entregas evaluadas. Once nuevas regresiones, **42 tests frontend**, tipos/lint/build locales aprobados. [Revisión acotada](reviews/paypal-return.md) y [protocolo de evidencia financiera](reviews/sandbox-evidence.md).
- Grok 4.7 xhigh entregó revisión acotada de sesión/origen/voz/límites/reset: sin defecto concreto en los archivos suministrados. No fue auditoría completa; limitaciones en el informe. Tres intentos máximos, no seguir repitiendo.
- Claude y el revisor frontend alcanzaron límites de uso después de guardar cambios; no se inventaron informes de cierre. Codex validó la integración con la suite.

## Pendientes y siguiente paso

1. Versión `f0a5f3e` desplegada; API pública responde `ok:true` y referencia en `/opt/fiestapay/RELEASE_COMMIT`. Panel y enlaces de recordatorio comprobados en navegador público el 24 oct. Evidencia de navegador del 16 oct en `a9c61c6`: retorno en nueva pestaña con URL `paypal=approved` manipulada, pero orden recuperada como `created` según servidor, recaudado/pagado 0 y saldo 5000, sin captura automática ni aviso de aprobación. Parámetros retirados. Evidencia local `output/playwright/paypal-return-verified-20261016.png`. El ajuste móvil Chat/Hablar se conserva. PR en borrador hasta verificar integraciones externas.
2. La captura de Jorge acredita **dos compradores Personal y un receptor Business sandbox** creados. Falta localizar las credenciales de comprador guardadas: el `.env` legible en este checkout aún tiene fecha 13 oct y solo contiene la cuenta Business. Se pidió guardar/confirmar la ruta, sin solicitar secretos por chat. Completar aprobación y captura de USD 50 cuando esté disponible. Dos compradores no completan todavía el objetivo de 3–5.
3. Chat con herramienta y tarjeta verificado el 16 oct; consulta de agenda/expositor falló con 503 el 21 y 23 oct. Diagnóstico del 23: metadatos accesibles, generación indisponible. Recuperar esa prueba cuando el proveedor esté disponible, sin repetir llamadas sin una nueva hipótesis. Sigue pendiente completar el recorrido externo con comprador sandbox y acreditar la captura.
4. Hito 16 oct: micrófono real desde móvil, latencia/créditos y tres intentos consecutivos. [Protocolo preparado](VOICE_ACCEPTANCE.md), todavía sin resultados humanos. La prueba WebSocket automática no sustituye este hito.
5. Jorge convoca probadores; no hay confirmaciones recibidas. Ensayo humano, PWA, accesibilidad completa, rollback probado, freeze, video y Devpost siguen pendientes del calendario.

P2 tiene cero horas comprometidas. No ampliar alcance ni consumir los días 3–4 noviembre con mejoras. Demo y cuentas disponibles hasta 15 diciembre.

## Seguimiento 15 octubre

- Infraestructura del hito de hoy ya desplegada: API y DB saludables tras 23 horas; los cuatro dominios comprobados responden 200. No repetir despliegue ni pruebas financieras sin cambios.
- Un único reintento público Gemini devolvió timeout del proveedor; la cotización por formulario sigue siendo 5000 centavos. Sin nuevas credenciales de comprador ni resultado humano; bloqueos sin cambios.
- Preparado el protocolo de voz del 16 oct. No se consumieron créditos de voz en este seguimiento ni se creó otra orden PayPal.

## Seguimiento 17 octubre

- Comprobación local: `.env` sigue con 845 bytes y modificación del 13 oct, sin campos de compradores; `.env.buyers` todavía no existe. La ruta ya fue confirmada por Jorge y se ofreció guardar una copia privada. No repetir la misma petición mientras no haya cambios.
- Consulta agregada de la DB dedicada en Contabo: **3 órdenes `created`, 0 movimientos financieros y 0 webhooks registrados**. La ausencia de registros no demuestra que PayPal nunca intentó entregar una notificación. No se crearon órdenes ni se invocaron Gemini/AssemblyAI desde FiestaPay en este seguimiento.
- El hito de primer pago del 17 oct **no está cumplido**; el de micrófono humano del 16 oct también sigue pendiente. No consumir ni reasignar por anticipado los márgenes del 3–4 nov. Siguiente prueba externa: aprobación de comprador y captura verificada de USD 50, con consultas antes/después del reintento según el protocolo.
- Trabajo independiente sobre un defecto pendiente: AGY Gemini corrigió respuestas tardías de entrada/RSVP/creación de orden al navegar entre fiestas. Codex reprodujo seis fallos en la versión anterior y verificó ocho nuevas regresiones aprobadas: 50 tests frontend, tipos y lint. [Evidencia](reviews/invite-navigation.md).
- Claude no pudo iniciar la revisión del nuevo cambio por OAuth caducado. No se reiteró el intento ni se atribuyó una revisión inexistente. `review_navigation` revisó independientemente y comprobó 8/8 tests; Codex reforzó la aserción de propagación RSVP señalada por el revisor, con 8/8 de nuevo. La sesión Claude deberá renovarse antes de volver a delegar en esa CLI.
- Cierre técnico al inicio del 18 oct: `654eaaf` desplegado en el servicio aislado de FiestaPay, API pública correcta. CI completa: **151 tests / 15 archivos**, lint, tipos y build. Sin cambios en proxy, DNS ni otras aplicaciones del VPS. Las pruebas del nuevo cambio usan proveedores simulados; no acreditan captura, webhook externo ni voz humana.

## Seguimiento 18 octubre · 11:27 ECT

- Sin cambios en el acceso: `.env` mantiene 845 bytes y la modificación del 13 oct; `.env.buyers` no está presente. No hay nuevas credenciales legibles ni resultado humano de voz.
- Consulta agregada de solo lectura: permanecen 3 órdenes `created`, 0 movimientos financieros y 0 webhooks registrados. CI del último commit documental `ca5957d` aprobada. No se repitieron pruebas, despliegues, creación de órdenes ni llamadas a proveedores IA.
- El hito externo del 18 oct (webhook firmado correlacionado con una captura e idempotencia del pago real sandbox) continúa pendiente del checkout autorizado. El protocolo y las regresiones automáticas ya están preparados; no equivalen a esa aceptación externa. Siguiente paso sin cambios: disponer del comprador, capturar USD 50 y contrastar orden/captura/webhook/ledger antes y después del reintento.
- No se repite la solicitud de acceso ya comunicada ni la revisión que falló por OAuth. Sin bloqueos nuevos que requieran otra notificación.

## Seguimiento 19 octubre · 04:00 ECT

- Acceso y evidencia externa sin cambios: `.env` conserva 845 bytes/modificación del 13 oct, sin compradores legibles; `.env.buyers` ausente. Consulta agregada: 3 órdenes `created`, 0 movimientos financieros, 0 webhooks registrados. No reiterar las solicitudes de comprador, micrófono o renovación Claude ya comunicadas.
- Comprobación acotada del hito de cotizaciones/reintentos del 19 oct: la implementación y estas regresiones **ya forman parte de la CI aprobada de 151 tests**; no se volvieron a ejecutar ni se modificó código.

| Caso del hito | Evidencia existente inspeccionada |
|---|---|
| Cuota completa por persona, confirmación explícita, rechazo de cotización ajena/vencida o tras cambiar acompañantes | `apps/api/test/api.test.ts`, bloque «cotizaciones calculadas en el servidor»; validación actual `requireUsableQuote` |
| Creación tardía después de cambiar asistencia conserva referencia y no revive una orden reemplazada | `apps/api/test/payment-races.test.ts`, «no revive una orden reemplazada cuando PayPal responde tarde» |
| Reintentos y creaciones concurrentes usan una sola orden; captura incierta bloquea cambios y reutiliza request ID | `apps/api/test/payment-races.test.ts`, bloques «creacion de orden mientras la obligacion cambia» y «captura reclamada antes de la red» |
| Nueva cotización exige renovar la confirmación humana | `apps/web/src/__tests__/quote-confirmation.test.tsx` |
| Volver por cancelación no dispara captura ni prueba ausencia de cobro | `apps/web/src/__tests__/paypal-return.test.tsx`, casos de cancelación y estado pagado verificado |

- Alcance de esta comprobación: lectura de fuente actual y correspondencia con evidencia CI existente, **proveedor simulado**. Grafo Tier 2 generación 15 oct: cotizaciones con metadatos cambiados y tests excluidos, por lo que se leyó fuente directamente. No es una auditoría exhaustiva ni acredita PayPal externo.
- Siguiente paso externo sin cambios: completar comprador/aprobación/captura USD 50 y correlacionar webhook/ledger con reintento; la prueba humana de voz sigue pendiente. No se abrieron loops de agentes ni se consumieron proveedores IA para repetir trabajo aprobado. P2 y reservas intactos.

## Seguimiento 20 octubre

- Hito de asistencia/cupo: se contrastó `setRsvp` en `apps/api/src/domain/rsvp.ts` con las regresiones de `apps/api/test/api.test.ts` ya incluidas en la CI aprobada. El grupo incluye titular y acompañantes; si no cabe se rechaza entero. La prueba concurrente exige una respuesta 200 y otra 409, con dos personas confirmadas en un cupo de dos. También hay rechazo de asistencia sin sesión de invitado. No se volvió a ejecutar la suite ni se cambió código.
- En la interfaz, `apps/web/src/__tests__/rsvp-confirmation.test.tsx` comprueba que una propuesta del asistente rechazada por falta de cupo permanece sin confirmar y permite reintentar. `rsvp-concurrency.test.ts` comprueba el contrato HTTP con respuestas simuladas; **no prueba concurrencia real de PostgreSQL**. La evidencia de concurrencia corresponde al test de integración de la API indicado arriba.
- Verificación acotada Tier 2: búsqueda y trazas de `setRsvp`, cobertura del grafo generación 15 oct y lectura directa de fuente actual, porque el archivo tiene metadatos cambiados y los tests están excluidos del índice. Esta correspondencia con CI existente no constituye una nueva aceptación externa.
- Sin novedades de acceso ni pago: `.env` conserva 845 bytes y fecha del 13 oct, sin campos de comprador legibles; `.env.buyers` ausente. Consulta agregada de solo lectura en Contabo: 3 órdenes `created`, 0 movimientos financieros y 0 webhooks registrados. No se han repetido solicitudes de acceso, loops de revisión, despliegues ni llamadas a proveedores IA.
- Siguiente paso externo: comprador sandbox disponible → aprobación/captura de USD 50 → correlación y reintento según el protocolo. Micrófono humano pendiente. El siguiente hito del calendario es contrastar las cuatro plantillas sobre el flujo común; P2 y las reservas siguen intactos.

## Seguimiento 21 octubre · cierre registrado el 22

- AGY Gemini High corrigió la hora inicial local (en Ecuador mostraba 19:00 en lugar de 14:00), añadió expositores opcionales editables/visibles y alineó las inclusiones Casa/Viaje con limpieza/transporte. Una entrega evaluada, revisión independiente `review_templates`; Codex fijó la zona de CI para detectar el defecto de fecha. [Informe](reviews/event-templates.md).
- `6d203e2` desplegado solo en FiestaPay; contenedores saludables y API `ok:true`. CI: 155 pruebas/16 archivos, lint, tipos y build. No se tocaron DNS, proxy ni aplicaciones vecinas.
- Navegador público: cuatro creaciones mediante formulario, lectura posterior de persistencia y vista de invitación. RSVP y cotización por API autenticada de la misma sesión: dos asistentes, cuotas de USD 50/36/130/80 para Comida/Casa/Viaje/Evento; pagado y recaudado en cero. Comida permite los tres momentos; Casa se creó sin cupo ni agenda; Evento conservó y mostró la actividad añadida con expositor. Fecha elegida 31 oct 14:00 ECT guardada como 19:00 UTC. Evidencia privada `.local/templates-readback-20261021.log` y `output/playwright/template-*-20261021.png`.
- Vista de 390 px: formulario y nueva fila de expositor sin desbordamiento horizontal; no equivale a aceptación móvil humana ni auditoría completa de accesibilidad.
- Una consulta real de Gemini sobre la actividad guardada devolvió 503 del proveedor (`.local/templates-chat-20261021.log`); no se repitió ni se afirmó respuesta correcta. Las invitaciones/formularios permanecen utilizables. No se solicitó orden/captura: al terminar siguen 3 órdenes `created`, 0 movimientos y 0 webhooks. Acceso de comprador y micrófono humano sin cambios.

## Seguimiento 22 octubre

- Portadas: las cuatro son SVG locales con texto alternativo específico, procedencia/licencia documentadas en README. Se conserva la evidencia de creación/render del 21 oct, sin repetir el recorrido ni añadir subidas.
- Aislamiento por HTTPS real con dos clientes y cookies independientes: inicios concurrentes y listados propios, panel ajeno 403 aun después de unirse como invitado, cookies HttpOnly/Secure/SameSite=Lax, reinicio A sin modificar el panel B y cotización de invitación archivada 410. Evidencia privada `.local/session-isolation-20261022.log`. No son probadores humanos ni dos navegadores; no se tocaron sesiones preexistentes.
- AGY Gemini High añadió dos pruebas de recuperación de voz sin cambiar producción. Revisión independiente `review_templates`; Codex reforzó la comprobación visible del estado activo. Segunda entrega evaluada: seis pruebas de voz y lint aprobados, commit `10ef38b`. [Informe](reviews/demo-sessions-covers.md). Micrófono/socket/proveedor simulados; no consumo de créditos de audio.
- Cierre: CI completa de `10ef38b` aprobada, 157 pruebas/16 archivos, lint, tipos y build. Consulta agregada de solo lectura en Contabo: 3 órdenes `created`, 0 movimientos financieros, 0 webhooks registrados. Ninguna prueba de este día se presenta como captura externa.
- `.env` y el acceso a compradores siguen sin cambios; no se reiteran las solicitudes ya comunicadas. El último intento Gemini es el 503 del 21 oct; no se ha repetido hoy. P2 y los días 3–4 nov permanecen intactos.
- Siguiente entregable independiente: meta/mínimo y «Recaudado» del 23 oct. Los pendientes externos continúan: comprador/aprobación/captura, webhook correlacionado, consulta Gemini de agenda y micrófono humano. Código desplegado `6d203e2`; la entrega del 22 contiene únicamente pruebas y evidencia, sin nuevo despliegue.

## Seguimiento 23 octubre

- Se encontró una brecha concreta: la prueba llamada «49,99 no alcanza un mínimo de 50» solo comprobaba 25 y 50. AGY Claude Opus High la sustituyó por el recorrido exacto 0 → captura 5000 → devolución 1 → 4999 → captura del saldo 1 → 5000. Comprueba que APPROVED no suma, la devolución duplicada resta una sola vez y alcanzar el mínimo no confirma automáticamente el evento. La meta de 10000 no impide la confirmación humana con el mínimo de 5000.
- El caso compara invitación, dashboard y handler compartido por chat/voz, incluyendo centavos, mínimo y nota «antes de comisiones». No es una prueba de conversación externa. `review_templates` revisó independientemente el diff sin bloqueantes; una entrega evaluada. [Informe](reviews/funding-minimum.md).
- Ejecución real sobre PostgreSQL dedicado de pruebas: primer intento agotó 30 segundos por la ruta de túnel; segundo con límite local de 120 segundos pasó (86,20 segundos totales). El límite de CI no cambió. **CI completa de `659a26b` aprobada: 157 pruebas/16 archivos, lint, tipos y build.** No hay cambios de producción ni nuevo despliegue.
- Una consulta pública Gemini de agenda/recaudado devolvió 503 por espera. Diagnóstico acotado desde FiestaPay: metadatos del modelo HTTP 200 en 436 ms; una generación con herramientas recibió HTTP 503 del proveedor en 4306 ms, aun con límite diagnóstico de 45 segundos. No se alteró la configuración ni se compraron créditos; no seguir repitiendo el intento. No se abrió sesión de audio.
- Producción conserva 3 órdenes `created`, 0 movimientos financieros y 0 webhooks registrados. `.env` sigue sin compradores legibles; no se repiten solicitudes ya comunicadas. No hay nueva captura externa ni resultado humano de micrófono.
- Siguiente entregable independiente: panel de consulta AG Grid, estado «Confirmado, sin pagar» y recordatorio wa.me del 24 oct. Los pendientes externos anteriores continúan. P2 y contingencias del 3–4 nov intactos.

## Seguimiento 24 octubre

- Se completó el recordatorio individual del organizador. Solo invitados con asistencia confirmada y saldo pendiente tienen enlace wa.me, con alias, fiesta, importe del servidor y URL pública. «Confirmado, sin pagar» queda junto al nombre; pagos parciales siguen pendientes, mientras pagados/no/maybe no generan recordatorio. El organizador revisa y envía desde WhatsApp; no hay envío automático.
- AGY Gemini High construyó el cambio inicial, pero agotó su límite de 420 segundos sin informe final. Codex cerró la integración y los tests. `review_templates` detectó mezcla de datos/enlace al cambiar de fiesta y una prueba que no acreditaba los enlaces; se corrigieron cargas/confirmaciones tardías y seis regresiones. Tres entregas evaluadas, revisión independiente cerrada. [Informe](reviews/organizer-dashboard.md).
- AG Grid conserva consulta/orden/paginación. Comprobación de escritorio y 390 px con tabla real: estado y saldo legibles, recordatorio accesible deslizando, sin desbordamiento de página. Captura pública `.local/dashboard-public-20261024.log` y `output/playwright/dashboard-*-20261024.png`. Datos persistidos de la sesión ficticia: titular más acompañante, saldo 5000, pagado/recaudado 0. No se abrió ni envió WhatsApp.
- **CI `f0a5f3e` aprobada: 163 pruebas / 17 archivos, lint, tipos y build.** Desplegado solo el servicio API de FiestaPay; saludable, `/api/health` correcto y versión registrada. No se modificaron DB, proxy, DNS ni otras aplicaciones.
- Cupo AGY Gemini tras la tarea: 94 % semanal; ventana de cinco horas 100 % tras reinicio. El wrapper vencido no devolvió tokens exactos. `.gitignore` tenía un cambio previo del usuario y permanece sin incluir en estos commits.
- Consulta agregada de producción: 3 órdenes `created`, 0 movimientos y 0 webhooks. Comprador guardado y voz humana siguen pendientes; no se repiten peticiones. No se invocó Gemini ni AssemblyAI desde FiestaPay hoy: último diagnóstico de generación es el HTTP 503 del 23 oct.
- Observación para el pulido del 29 oct: al volver desde RSVP, la tarjeta inicial de la fiesta conservó temporalmente el conteo anterior; el panel consultó y mostró correctamente los dos asistentes. Revisar refresco del listado principal.
- Siguiente entregable: consolidar el recorrido de chat/herramientas del 25 oct y resolver disponibilidad de Gemini con una hipótesis nueva, sin repetir llamadas iguales. Captura externa, webhook correlacionado y micrófono humano siguen sin aceptación. P2 y reservas del 3–4 nov intactos.
