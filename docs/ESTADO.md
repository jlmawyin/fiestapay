# Estado de implementación

Actualizado el 25 octubre 2026 (America/Guayaquil). El calendario no equivale a progreso real; **aceptación completa pendiente**. No marcar una prueba externa por tests con proveedores simulados.

## Pausa vigente por cuota

25oct20:55:20%5h disponible, stopdelhelper. GROK intento1/3PAUSADO, sin cambiosAPI/shared/test ni informe deentrega; procesos propios detenidos, incluidos el detached identificado porcwd. No evaluar esta pausa como fallo. Reanudar23:38ECTdehoy porautomatización nativa fiestapay-reanudar-cuota-25-oct, después delmínimo04:37:45Z; requiere PC/app disponibles. [Checkpoint completo](CHECKPOINT_2026-10-25.md). No hubo producto/proveedores durante cierre administrativo. Producción/correo aprobadossiguenoperativos.

## Construcción actual: P2 financiero, todavía sin entregar

Worktree activo `C:/Users/Jorge/.codex/worktrees/funding-refunds/fiestapay`, rama `codex/funding-refunds`, base731df71. La copia primaria y sus cambios de voz/.gitignore/24 permanecen intactos. GROK FP-FUNDING-BACKEND-20261025 intento1/3PAUSADO, sesión19431terminada porcuota,80turns/2700s asignados, EOF, solo API/shared/tests; sin secretos, deploy ni proveedores reales. AGY diseño1/3 entregado244872tokens totales,404s; informe de propuestas, no aprobación. Codex impuso correcciones:422 no equivale a reembolso, fondos/tombstone conservados, reloj traslock y decisión previa a dinero tardío, sin activación retroactiva de legados. Bases locales constructor/revisor creadas, npmci terminado. Pendiente entrega, revisión financiera independiente y UI.

## Etapa vigente: entrega31octubre

**Estado vigente, 25oct después de19:37ECT:** recuperación real por SMTP completada conJorge en aplicación2d7c542. Primer correo de verificación y segundo de recuperación aceptados porBanahosting y confirmados en bandeja de entrada. Contacto verificado, clave antigua403 en petición directa y panel nuevo200 en logsAPI/captura deJorge. [Evidencia](reviews/smtp-live-20261025.md). Reutilización manual confirmada con rechazo400; expiración/concurrencia conservan aprobación PostgreSQL previa, no nueva espera real.

Cinco variablesSMTPsoloVPS.env.production,0600; formato/presencia verificados sin valores ni advertencias. Recreación únicamenteAPI, imagen igual y demás contenedores/arranques intactos. DNSclienteAPI usa overrideversionado deploy/compose.smtp-runtime.yml para evitar caché deparking heredada. ResoluciónSMTPcorrecta, hostnameDBresuelve, healthtrue/emailtrue. No cambios de registros del dominio/MX, resolutorglobal, proxy uotrasapps. [Guíaoperativa](EMAIL_SETUP.md) incluye los dos archivosCompose para recreaciones posteriores.

Cuatroarchivosdebundle ylogsAPI comparados enmemoria con valores privados configurados:0coincidencias; URLslogsinadminkey. NoSMTPsecreto entregado aagentes/local/Git. No nuevos pagos,webhook,chat,voz nireset. Fiesta ficticia de correo disponible para la demo; antiguo adminKey local ya invalidado.

AGY/GROKprevios aprobaron móduloSMTP de fuente2d7c542: evidenciareutilizada, no nuevas revisiones. Helperopcional descartado sininstalar. Diagnóstico posterior con EOF completó archivosREADY enGROK3/3 yAGY2/3; ejecución mínima restaurada, usar entrada cerrada en nuevos encargos. No requiere recuperaciónClaude de este bloqueo. VozWIP y.gitignore/archivo24 preservados. Siguiente etapa:P2finanzas; AGY diseña el paquete ypruebas en FP-FUNDING-DESIGN-20261025 intento1/3, solo informe, sesión23803; plazo31octfuncional/corte5nov.

## Historial operativo anterior

**Estado operativo posterior, 25 oct:** `97048c1` desplegado a las17:27UTC y saludable; copia y rollback conservados, migración0005 aplicada sin restaurar la DB. La primera activación había parado por usar el archivo de interpolación incorrecto; se corrigió y AGY3/3 aprobó el ayudante antes del segundo intento exitoso. Credenciales de Compose en `.env`; credenciales de la API en `.env.production`.

**Bloqueo externo de dominio:** DNS públicos/VPS resuelven162.4.84.247 y NS ParkLogic; el VPS198.7.114.73 devuelve200 con HTTPS/certificado correcto. Registro declara vencimiento2027, último cambio09:02UTC. No cambios DNS/MX por Codex; Jorge debe revisar la delegación. Primer seed público falló antes de HTTP y SQL confirmó cero fixtures, ledger1 intacto. [Evidencia](reviews/domain-routing-20261025.md).

SMTP local entregado1/3: 253 pruebas, tipos/build correctos; AGY1/3 en curso, sesión54215. No credenciales SMTP en el archivo de servicio ni destinatario autorizado, no envío real. Arnés directo al origen en preparación AGY2/3, sesión99684; sus resultados deben etiquetarse como prueba del origen, sin afirmar DNS público resuelto. Voz22tests sin integrar por lint/autorización pendiente.

**Decisión SMTP vigente, 25 oct:** se usa Banahosting/cPanel. Constructor de recuperación reorientado, mismo intento 1/3, sesión 5244; cuatro procesos anteriores propios detenidos sin tocar el constructor de compatibilidad. Nodemailer 10.2.1 instalado, tipos incluidos; sin llamada SMTP real. Cinco variables solo en el servicio VPS y destinatario autorizado pendientes. EMAIL_SETUP y decisión escrita de WhatsApp actualizados; no cambios MX/DNS.

**25 oct 11:40:** AGY aprobó persistencia/API/privacidad y navegador local; PR #2 creado y adjuntado, CI `d0bfd00` correcta. Compatibilidad con la versión anterior en migración 0005 se completa antes de publicar. P1 correo en construcción sin credenciales ni envío. Voz: 22 pruebas independientes y tipos correctos, queda lint de una línea y autorización puntual pendiente. Aún no hay nuevo despliegue.

**Reanudado 25 oct 11:14:** helper permitió continuar con 99 % cinco horas / 69 % semanal. AGY persistencia conserva intento 1/3; AGY audio entrega 2/3 revisa fuentes cuyo hash coincide con el informe GROK 3/3. Sin nueva construcción ni pruebas externas repetidas. La pausa al 20 % sigue vigente.

**Último estado, 25 oct 06:57: PAUSA al 20 % de cinco horas**, como confirmó Jorge; 71 % semanal. Procesos propios detenidos, parciales guardados. Helper fija mínimo 16:13:26 UTC; misma continuación actualizada a 11:14 Guayaquil. Persistencia entregada, AGY revisión 1/3 pausada; audio intento 3 dejó informe de 18 tests, pendiente cotejo y revisión AGY 2/3. Nada nuevo desplegado. [Checkpoint actualizado](CHECKPOINT_2026-10-25.md).

Entrega local posterior, 25 oct 06:49: persistencia/admin intento 2/3 entregado (224 tests/22 archivos, tipos y build; lint completo pendiente por voz). AGY verifica permisos/dinero/retención y navegador, intento 1/3, sesión 14795. Voz: revisión independiente reprodujo 15 tests, pero Codex requirió corregir pérdida silenciosa de audio y estado de escucha antes del fin; GROK intento 3/3, sesión 48610. Proxy obtuvo aprobación independiente acotada en entrega 2/3. Aplicación nueva aún no aceptada ni desplegada.

**Reanudado el 25 octubre, 06:20 Guayaquil:** el helper permitió continuar con 97 % disponible en cinco horas al despertar; último control 77 % en cinco horas / 80 % semanal. Jorge respondió expresamente «Mantener la pausa al llegar al 20 %». GROK retoma los mismos intentos 2/3 de persistencia/admin y audio; AGY debe completar su informe de proxy en la entrega 2/3. Cambios parciales todavía sin aceptación ni despliegue. [Checkpoint](CHECKPOINT_2026-10-25.md). No se consumió reseteo por herramientas.

La petición nueva sustituye el calendario/alcance anterior incompatible. Ver [PLAN_DIARIO.md](PLAN_DIARIO.md) y [PROGRESO.md](../PROGRESO.md). Solo OpenAI en producto; eliminación residual pendiente del siguiente paquete P5. Recuperación por SMTP Banahosting; Jorge crea la cuenta y carga variables únicamente en VPS. Se preservan MX/DNS y correo existente. La excepción semanal anterior no se presume vigente en este despertar: se aplican ambas guardas preventivas y los límites reales.

- `1bf34344c34503ed84f63ab9626587fc2797d2c3` desplegado en el servicio exclusivo FiestaPay, saludable; imagen anterior conservada para reversión. [CI 209 pruebas/20 archivos](https://github.com/jlmawyin/fiestapay/actions/runs/40147830699). Revisión AGY API/webhook aprobada sobre fuentes y 35 pruebas específicas; no sustituye la evidencia externa.
- **Webhook externo verificado 25 oct 05:51 UTC:** reenvío PayPal aceptado HTTP202; `PAYMENT.CAPTURE.COMPLETED` registrado a las 05:51:01.032819 UTC. Evento PayPal `WH-3DR597333T5489832-9YV22745D26080450`, captura `33J98639UB477180H`, orden `45D94071LC923231F`. Después del webhook: una captura de 5000 centavos, 0 devuelto, saldo0, una auditoría `payment_captured`. No duplicó el cobro. Evidencia `.local/payment24-after-webhook.log`.
- Configuración OpenAI aplicada con clave ya suministrada por Jorge. Variables Gemini retiradas de `.env` local y `.env.production` sin mostrarlas. **Chat real OpenAI aprobado desde navegador público:** evento `comida-5fp2zhn8`, HTTP200, agenda y cotización 2×25=50 con confirmación. SQL: herramientas get_event_details/get_my_status/prepare_quote; cero órdenes y cero movimientos. Captura en `output/playwright/openai-chat-20261024.png`; nombre histórico, ejecución25oct. No se hizo una nueva llamada Gemini.
- GROK trabaja paquete persistencia/admin/ciclo de vida/formulario/OpenAI-only, entrega1/3; AGY investiga riesgos y correo en paralelo, sin editar producto. Persistencia actual usa PostgreSQL; autoridad/listado dependen del cookie. Diagnóstico de pérdida de filas todavía no demostrado.
- Actualización de esos encargos: persistencia intento1 agotó2400s con archivos parciales; intento2 acotado a administración/persistencia/privacidad/UI y pruebas en curso. Audio intento1 agotó1200s sin cambios; intento2 acotado en curso. Código nuevo aún no aceptado ni desplegado. [Contadores](AGENT_RUNS.md).
- Proxy exclusivo actualizado y validado: no-referrer, URLs secretas fuera de logs del vhost, restauración de IP solo desde redes Cloudflare. Prueba de cabecera falsa rechazada/ignorada según camino; sitios conservan respuestas previas. [Evidencia y límites](reviews/proxy-privacy-20261025.md).

El historial siguiente conserva fechas y resultados de etapas anteriores; sus pendientes de proveedor, webhook y calendario quedan sustituidos por este bloque cuando corresponda.

## Evidencia verificada

- Repo público MIT: https://github.com/jlmawyin/fiestapay. Rama `chore/bootstrap`; [PR #1 en borrador](https://github.com/jlmawyin/fiestapay/pull/1), [CI GitHub aprobada para `f0a5f3e`](https://github.com/jlmawyin/fiestapay/actions/runs/40081584759) (163 tests / 17 archivos); código de producción desplegado `f0a5f3e`.
- **Demo pública:** https://fiestapay.somospanas.com, HTTP 200, título FiestaPay y `/api/health` correcto. API y PostgreSQL dedicados en Contabo, sin puertos públicos del contenedor/DB. Vhost HTTPS exclusivo; certificado hasta 12 enero 2027 y timer `fiestapay-renew.timer` activo. `nginx -t` aprobado antes de recargar.
- Regresión tras activar el vhost: `somospanas.com` (WordPress), `ac.visitaremota.com` y `sparring.visitaremota.com` respondieron 200 con sus títulos originales. No se cambió su configuración.
- `npm run check` remoto con PostgreSQL de pruebas: **132 tests / 13 archivos**, lint, tipos y build aprobados. Incluye carreras de creación/captura, reembolsos, cupo, autorización, reset, confirmación ligada a cotización y cancelación asíncrona de voz. Revalidado también después del ajuste de correlación Gemini.
- Navegador contra el dominio público: crear demo, entrar con alias ficticio, confirmar un acompañante y obtener **2 × USD 25 = USD 50**. La orden exige confirmar la cotización.
- Credenciales privadas configuradas por Jorge. PayPal OAuth y registro de webhook verificados por API. ID local corregido para coincidir con la URL única registrada: `/api/paypal/webhook`. Eventos exactos: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`.
- **Pago externo sandbox USD 50 aprobado y capturado el 24 oct**, orden `45D94071LC923231F`: dos asistentes, saldo 0, una captura de 5000 centavos y reintento idempotente verificados en producción. Receptor único Business sandbox. Webhook externo aún sin evidencia; [protocolo y resultados](reviews/sandbox-evidence.md).
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
2. `.env.buyers` ya es legible en el checkout correcto: contiene PAYPAL_BUYER1/2_EMAIL y PAYPAL_BUYER1/2_PASSWORD. Comprador 1 utilizado con éxito en checkout de USD 50; comprador 2 presente, todavía no probado. No pedir otra vez ruta ni guardado.
3. Jorge ordenó detener los intentos Gemini y migrar el chat a OpenAI `gpt-6-luna`, Responses API, function calling y razonamiento bajo; conservar `LLM_PROVIDER=openai|gemini` y fallback a formulario. `OPENAI_API_KEY` está presente en `.env`. Integración y verificación en curso; no afirmar disponibilidad real hasta obtener evidencia.
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


## Actualización manual 24 octubre · pago y cambio de proveedor

- Se resolvió el bloqueo del comprador sin nueva solicitud: `.env.buyers` leído en `C:\Users\Jorge\OneDrive\hackathon\fiestapay`; solo se informan nombres de variables. El archivo está ignorado por Git.
- Pago sandbox USD 50 completado y contrastado con ledger y reintento, según [evidencia](reviews/sandbox-evidence.md). Esto sustituye los pendientes de captura de los seguimientos históricos; no acredita todavía webhook ni micrófono humano.
- Cambio de chat a OpenAI solicitado por Jorge. No repetir generación Gemini ni cambiar automáticamente a ese proveedor ante errores. Ver [PROGRESO.md](../PROGRESO.md) para esta entrega.
