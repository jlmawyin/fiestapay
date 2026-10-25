# Plan vigente — FiestaPay · entrega máxima 31 octubre 2026

## Repriorización autorizada el 25 octubre

La petición nueva de Jorge sustituye el alcance y los hitos incompatibles del calendario histórico que se conserva abajo. **Entrega funcional máxima: sábado 31 octubre**, preferiblemente antes para pulir. Jorge fija el 5 noviembre como corte de trabajo/envío. Las [reglas públicas consultadas el 25 octubre](https://paypalaihackathon.devpost.com/rules) todavía indican 12 noviembre, 15:00 ECT; esto no amplía nuestro plazo interno.

Las etiquetas P0–P6 de esta etapa son prioridades nuevas; «P2 cero horas» del plan histórico se refería al fondo abierto/anticipos, que siguen fuera. Ahora P2 significa integridad financiera, fecha límite y reembolsos. No confundir ambas listas.

| Fecha | Bloque verificable | Pruebas y dependencia | Presupuesto humano |
|---|---|---|---:|
| 25 oct | P0 + P1: persistencia, fin del evento, enlaces público/organizador y autorización por clave | Reinicio sin pérdida, navegador distinto, API pública sin edición, clave incorrecta 403; CI con PostgreSQL | 5 h |
| 26 oct | P1: privacidad y recuperación por correo; rotación de clave y borrado programado | Código privado sin rutas alternativas; recuperación caduca y se consume una sola vez; SMTP Banahosting con cuenta/variables cargadas por Jorge | 5 h |
| 27 oct | P2: cierre de recaudación y reembolso automático en sandbox | Carrera captura/cierre, reintento sin duplicados, reembolso completado verificado, importes/estados visibles | 5 h |
| 28 oct | P3/P4: bloqueo/moderación, identidad, formulario y reglas del servidor | IP limitada, texto script literal, capacidad/meta válidas, nombres visibles solo a organizador | 5 h |
| 29 oct | P5/P6: OpenAI únicamente, cola de audio, estados de carga | Timeout sin impedir crear, audio listo y secuencial, secretos ausentes del JS, prueba en celular | 5 h |
| 30 oct | Integración final y demo de 90 s, guía de jueces | Recorrido completo con pago real de prueba, dos navegadores, reinicio/restauración, revisión independiente | 5 h |
| 31 oct | Margen de corrección y entrega identificada | Solo bloqueantes y regresión; lista explícita de criterios acreditados y pendientes | 5 h |

**35 horas humanas disponibles; no son una estimación garantizada del trabajo nuevo.** Recuperación, reembolsos automáticos y audio móvil concentran el riesgo. Los agentes ejecutan paquetes acotados; Codex integra. No prometemos compensar desviaciones con jornadas humanas más largas. El 31 queda para corrección, sin funciones nuevas. El recorrido de 90 segundos es una meta de presentación, no una garantía de duración de PayPal o de la red.

Orden técnico: (1) cerrar evidencia del pago/OpenAI ya construido, (2) persistencia y autorización, (3) ciclo de vida y recuperación, (4) devolución y cierre financiero, (5) moderación/formulario/audio, (6) aceptación y presentación. Se puede investigar en paralelo, máximo dos frentes de construcción. GROK construye; AGY verifica independientemente; Claude interviene solo en recuperación conforme a `dirigir-agentes`. Tres entregas evaluadas por problema como máximo, contadores persistentes.

Puntos de diseño: asistencia («va») y pago («pagó» solo tras captura) separados; DB conserva referencias financieras mínimas aunque la fiesta y su contenido dejen de estar disponibles; clave de administración de 32 bytes, hash en DB y comparación constante; toda autorización del servidor; el enlace público jamás permite editar. No usar nombres reales de jueces obligatoriamente: la prueba usa identidades ficticias; el producto permite nombre del asistente/pagador.

Dependencias por resolver: cuenta SMTP Banahosting y cinco variables privadas del servicio en VPS, cargadas por Jorge; primer destinatario autorizado y confirmación de entrada/spam; prueba humana de micrófono móvil; decidir si «payout» significa recepción en el Business único o una transferencia adicional, que requiere integración/acceso aparte. No se requieren cambios de MX/DNS. Las comisiones exactas no se inventan; mostrar política y estimación identificada, contrastada con datos del receptor. Pagos siempre sandbox.

Excepción de cuota autorizada por Jorge: durante esta ejecución se ignora el umbral preventivo semanal de Codex. Se mantienen los límites efectivos del servicio, el umbral de cinco horas y las compuertas de los puentes. Codex no consume el reseteo del usuario.

## Calendario histórico (sustituido en lo incompatible)

14 octubre–11 noviembre 2026. Zona horaria America/Guayaquil. Cinco horas útiles diarias, incluidos fines de semana; revisión e integración incluidas. Construcción/pruebas P1 100h + entrega P1 35h + contingencia 10h =145h. P2 y extras:0h comprometidas.

## Alcance e hitos

P1: cuatro plantillas de cuota fija/pago único, portadas fijas, RSVP separado, cupo por personas, Recaudado (capturas menos devoluciones, antes de comisiones), meta/mínimo y confirmación humana, PayPal sandbox, voz/chat, acceso de jueces sin Google/PII, panel, wa.me y reinicio aislado. No subidas, comisiones/neto detallados, anticipos, fondo abierto, Payouts ni live en P1. Dinero calculado por servidor en centavos. La IA no autoriza pagos.

Voz real de prueba16oct; primer pago17oct; P1aceptado2nov; buffers3–4nov; freeze5nov; video8nov; envío11nov antes15:00ECT; cierre12nov15:00ECT. Mantener demo hasta15dic (operación posterior fuera de145h).

## Calendario

| Día | Prioridad | Horas | Rama/PR propuesto | Entregable verificable |
|---|---|---:|---|---|
| 14 oct | P1 | 5 | `chore/bootstrap` | Repo MIT, CI, documentos, sandbox y Gemini; convocatoria de probadores. |
| 15 oct | P1 | 5 | `infra/contabo` | Servicios/DB aislados, vhost exclusivo, HTTPS/WS y regresión de sitios existentes. |
| 16 oct | P1 | 5 | `spike/voice` | Voz real reutilizando Sparring, herramienta de lectura, tres intentos, latencia y sesiones básicas. |
| 17 oct | P1 | 5 | `feat/paypal-orders` | Primera orden aprobada y capturada: 2×25=50 USD. |
| 18 oct | P1 | 5 | `feat/payment-reconciliation` | Webhook firmado, conciliación e idempotencia. |
| 19 oct | P1 | 5 | `feat/payment-quotes` | Cotizaciones, reintentos y acompañantes sin doble cobro. |
| 20 oct | P1 | 5 | `feat/rsvp-capacity` | RSVP separado; cupo atómico por personas. |
| 21 oct | P1 | 5 | `feat/event-templates` | Cuatro plantillas, inclusiones y agenda sobre un motor. |
| 22 oct | P1 | 5 | `feat/demo-sessions-covers` | Portadas fijas 1h, sesiones 3h y recuperación de voz 1h. |
| 23 oct | P1 | 5 | `feat/funding-minimum` | Recaudado/meta/mínimo 3h; voz y herramientas compartidas 2h. |
| 24 oct | P1 | 5 | `feat/organizer-dashboard` | AG Grid consulta, pendiente visible y wa.me humano. |
| 25 oct | P1 | 5 | `feat/chat-agent` | OpenAI gpt-6-luna (cambio solicitado 24 oct), herramientas, cotización y confirmación antes de orden. |
| 26 oct | P1 | 5 | `feat/voice-agent` | Voz conectada al flujo completo y checkout real sandbox. |
| 27 oct | P1 | 5 | `fix/voice-recovery` | Interrupciones, denegación micrófono y fallback sin duplicados. |
| 28 oct | P1 | 5 | `feat/demo-reset-audit` | Reinicio aislado, límites, auditoría y webhook antiguo. |
| 29 oct | P1 | 5 | `feat/mobile-demo` | Móvil, accesibilidad, PWA básica y entrada de jueces. |
| 30 oct | P1 | 5 | `ops/recovery` | Copia/restauración aislada, persistencia y recuperación. |
| 31 oct | P1 | 5 | `test/judge-rehearsal` | 3–5 humanos confirmados, sesiones concurrentes y ensayo. |
| 1 nov | P1 | 5 | `fix/p1-rehearsal` | Resolver bloqueantes y regresión. |
| 2 nov | P1 | 5 | `release/p1` | Aceptación P1, CI y revisiones; versión identificada. |
| 3 nov | Reserva P1 | 5 | `fix/<incidente>` | Contingencia pura: ningún feature ni QA rutinario asignado. |
| 4 nov | Reserva P1 | 5 | `fix/<incidente>` | Contingencia pura: libre si no hay incidencia. |
| 5 nov | P1 | 5 | `release/freeze` | Freeze de funciones, reversión y guion con evidencia. |
| 6 nov | P1 | 5 | `docs/judges-en` | README/instrucciones EN, compradores sandbox, licencia y declaración IA. |
| 7 nov | P1 | 5 | `docs/demo-video` | Grabación real en móvil y corte ~170 s con subtítulos EN. |
| 8 nov | P1 | 5 | `docs/video-release` | YouTube público <3 min, probado sin iniciar sesión. |
| 9 nov | P1 | 5 | `docs/devpost` | Descripción EN, capturas, enlaces y herramientas IA. |
| 10 nov | P1 | 5 | `release/submission-check` | Ensayo final de juez y checklist. |
| 11 nov | P1 | 5 | `docs/submission-record` | Envío antes de 15:00 ECT y evidencia de recepción. |

Dependencias críticas: credenciales PayPal/Gemini y saldoAssemblyAI acreditados antes16oct; HTTPS aislado antescheckout; ninguna captura se marca pagada por APPROVED. La integración de voz comparte los handlers de web/chat. Las fechas son hitos, no evidencia de tareas cumplidas; consultar ESTADO.md.

## Equipo y revisión

Codex dirige e integra. Claude API, AGY Gemini interfaz y contexto; revisión cruzada. AGY Opus High solo dinero/concurrencia; Grok4.7xhigh adversarial. Dos frentes de construcción, propiedad de archivos explícita, sin revertir trabajo ajeno. CI e informe independiente en PR. Tres entregas evaluadas máximo por problema; luego evidencia e hipótesis nueva.

## Contabo

Vhost exclusivo fiestapay.somospanas.com; no alterar DNS apex ni otros upstreams. Respaldar config, nginx -t, regresión de sitios, reversión del cambio propio. DB y volúmenes dedicados, no acceso público a PostgreSQL.

## Probadores y video

Jorge convoca a sus contactos: tres confirmados y dos suplentes antes16oct para ensayo31oct. Codex prepara guion y registra resultados, agentes no sustituyen humanos.

> Estoy preparando FiestaPay para un hackathon de PayPal. ¿Puedes dedicar unos20minutos el31deoctubre a probarla desde tu celular? Usaremos cuentas de prueba, sin dinero real ni tu Google. Necesito ver si puedes organizar un almuerzo, confirmar asistencia y pagar sin que yo te guíe. Dime qué horario te viene bien.

Video grabado7nov sobre versión postfreeze: solo funciones y capturas verificadas. No revelar datos reales ni secretos. README, descripción e instrucciones EN; video subtítulos EN.

## Protección del margen

3y4nov no tienen funciones ni QA rutinario. Cada jornada perdida consume una reserva; más de10h de desvío exige reestimación, no más horas implícitas. Fondo abierto solo si P1aceptado30oct y ocho horas realmente liberadas, probado/integrado antes2nov, sin tocar reservas ni presentación. Portadas reemplazables, comisiones/neto, anticipos, ayuda social y gastos posteriores quedan en backlog P2.
