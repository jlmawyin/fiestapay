# FiestaPay: alcance y plan para el hackathon

> **Implementación aprobada:** [PLAN_DIARIO.md](PLAN_DIARIO.md) prevalece sobre el backlog: P1 hasta 2 nov, voz real de prueba el 16 oct, portadas fijas y una cifra «Recaudado» antes de comisiones. P2 no tiene horas comprometidas; sus secciones describen evolución futura.

> Decisiones de Jorge Mawyín consolidadas el 13 oct 2026.
> Entrega prevista: 11 nov. Cierre oficial: 12 nov 2026, 15:00 ECT.
> Referencia del alcance vigente: sustituye propuestas anteriores incompatibles. Es un plan; no acredita una demo ya construida.

## 1. Demo centrada en PayPal, voz y chat

La demo organiza encuentros y cobra cuotas con PayPal sandbox, asistida por voz y chat. Los aportes físicos, listas de cosas para llevar y descuentos por entregas quedan exclusivamente para la versión independiente. No aparecen en el recorrido del hackathon.

**P1:** Comida completa y las otras tres plantillas sobre cuota fija y pago único, con imágenes, asistencia, voz/chat, meta y mínimo configurables, panel y recordatorios humanos. **P2, en este orden:** gasto total/fondo abierto, anticipo más saldo con política de inasistencia, ayuda social con entrega sandbox verificable; después, vaca/regalo opcional y reparto de gastos adicionales. La vaca es voluntaria y separada de la cuota; fondo abierto no crea deuda individual.

### Plantillas: cuatro, con una base común

| Plantilla | Configuración propia | Cobro inicial P1 |
|---|---|---|
| Comida | Momento: desayuno, almuerzo o cena; precio por persona y qué incluye. Buffet es una opción de Comida, no otra plantilla | Cuota fija por persona |
| Fiesta en casa | Comida y limpieza incluidas en la cuota | Cuota fija por persona |
| Viaje conjunto | Destino, salida/regreso, transporte y hospedaje incluidos | Cuota fija por persona, pago único; anticipo más saldo en P2 |
| Evento | Evento formal, concierto o charla grupal; cupo máximo y agenda opcionales; horarios, expositores y actividades editables | Entrada fija por persona |

- Base común: nombre, fechas/horarios, ubicación, inclusiones, precio por persona en USD, acompañantes, imagen y FAQ. Las plantillas configuran el mismo motor; no son implementaciones separadas.
- En cuota fija, titular y acompañantes pagan la tarifa completa, sin exenciones, descuentos ni tarifas infantiles. El servidor calcula precio en centavos por número de personas.
- RSVP y pago son independientes. El panel muestra literalmente «Confirmado, sin pagar», además de «Confirmado, pagado»; en P2 admite «Anticipo pagado, saldo pendiente».
- Antes de crear una orden, el agente repite la cuenta del servidor: «2 personas por $25, total $50. ¿Confirmo?». La tarjeta presenta los mismos datos y el pagador aprueba en PayPal.
- El organizador puede preparar un recordatorio por `wa.me` desde «Confirmado, sin pagar» y lo envía personalmente. No se requiere el teléfono real del juez: puede abrir WhatsApp para elegir destinatario.
- En Evento, el cupo cuenta personas, incluidos acompañantes. Un RSVP confirmado consume cupo aunque no esté pagado; confirmar o aumentar personas reserva el grupo completo en una sola operación atómica, o rechaza el cambio completo. No caduca el cupo silenciosamente por impago; cancelar RSVP libera plazas sin reembolsar automáticamente.
- El agente responde sobre menú, viaje, horarios, agenda, actividades y expositores únicamente con la información del organizador. Agregar una actividad es editar la agenda; no crea una entrada o cobro adicional.
- No cambiar modo ni tarifa una vez iniciadas las órdenes. Los pagos de la demo van al receptor sandbox común; no acreditan reserva o pago a restaurantes, agencias, hoteles o recintos externos.

### Portadas fijas (P1)

Cuatro ilustraciones originales locales, una por plantilla, con texto alternativo y procedencia documentada. Sin fotos personales, subidas, reemplazo ni almacenamiento de archivos por sesión. Las portadas reemplazables quedan en P2. Las horas liberadas se destinan a validar voz y recuperación.

### Meta y mínimo para confirmar el evento

El organizador puede activar una meta y un mínimo de recaudación en cualquiera de las cuatro plantillas. Son dos ajustes independientes del anticipo individual:

| Ajuste | Ejemplo | Efecto |
|---|---|---|
| Meta conjunta | USD 100 | Objetivo de recaudación del evento |
| Mínimo para confirmar | 50% de la meta = USD 50; también puede introducir un importe | Al alcanzarlo, el panel habilita «Confirmar evento» al organizador |
| Anticipo individual (P2) | 50% de una cuota de USD 25 = USD 12,50 por persona | Primer pago a cuenta de su cuota; el resto se paga con otra aprobación |
| Política de inasistencia (P2) | Conservar el anticipo pagado | Debe estar activada y aceptada antes del pago; se destina a financiar el evento |

El servidor valida meta positiva y mínimo mayor que cero y no superior a la meta; un porcentaje se convierte a centavos redondeando hacia arriba. La demo asume participantes puntuales en sus plazos de pago. El mínimo se calcula sobre capturas verificadas menos reembolsos, **antes de comisiones**, y se etiqueta como recaudación bruta. En P1 el panel presenta únicamente «Recaudado», con nota «antes de comisiones»; el desglose de comisiones y neto queda en P2. No contar órdenes creadas/aprobadas, saldos pendientes ni promesas de aporte. Una captura no se duplica al cruzar el umbral.

Estados separados: «Recaudando» → «Mínimo alcanzado» → «Evento confirmado» por el organizador. Asistencia y pago de cada invitado conservan sus propios estados. El dinero se captura con cada pago; el umbral no lo retiene ni lo libera, no garantiza fondos netos ni realiza una reserva externa. El organizador decide confirmar el evento; «Recaudado» no se presenta como saldo neto disponible. Si un reembolso reduce lo recaudado, actualizar el progreso y avisar al organizador, sin cancelar automáticamente el evento.

P1 incorpora meta, mínimo y progreso con pago único. El anticipo, saldo y política de inasistencia siguen en P2, como ya se acordó. Cambiar la meta o el presupuesto deja historial y nunca modifica una cuota, un anticipo o una condición ya aceptados.

### Forma de cobro y condición colaborativa

Una forma principal de cobro por evento, independiente de la plantilla. Cuota fija es el valor predeterminado P1; activar las opciones colaborativas P2 permite elegir gasto total o fondo abierto. Cambiar de plantilla no cambia silenciosamente las condiciones del cobro.

| Modo | Quién introduce el valor | Regla del servidor |
|---|---|---|
| Cuota fija (P1) | Organizador: precio por persona | Precio por titular y cada acompañante; apropiado para restaurante, agencia o concierto con precio fijo |
| Gasto total (P2) | Organizador: importe total | Propone cuotas entre personas confirmadas, incluidos acompañantes; el organizador revisa y publica antes de cobrar |
| Fondo abierto (P2) | Cada invitado: cuánto quiere aportar | Valida el importe elegido y crea ese aporte; no lo divide ni multiplica por acompañantes, y no genera deuda obligatoria |

**Gasto total:** el servidor propone el reparto entre confirmados y el organizador pulsa «Revisar y publicar cuotas». No exigimos cerrar la lista de invitados para empezar a recaudar. La demo usa un grupo estable y puntual; sin confirmados no hay división. Repartir centavos residuales por identificadores estables de persona y sumar por invitación: USD 100 entre tres personas = 33,34 + 33,33 + 33,33. Guardar las personas y cuotas de cada cálculo publicado para reproducirlo. Nuevos RSVP siguen sujetos al cupo y no cambian cuotas aceptadas: un cambio que afecte el reparto requiere revisión del organizador antes de nuevas cotizaciones. Ninguna baja recalcula automáticamente lo ya pagado ni genera cobros/devoluciones.

**Fondo abierto:** El organizador define propósito, meta conjunta y mínimo opcional; cada invitado elige cuánto aportar. El servidor valida importe, moneda y límites, sin multiplicar por acompañantes. No hay cuota, anticipo obligatorio, saldo exigible ni penalidad por no aportar. El panel muestra «Confirmado, sin aporte» y la meta real; un recordatorio invita de forma voluntaria. Reutilizar el motor de la vaca sin duplicar aportes; una vaca opcional en un evento de cuota fija conserva un concepto separado y no salda la entrada.

Ejemplo de bienvenida por voz: «¡Bienvenido! Queremos reunir $100 para nuestro encuentro. Llevamos $40 y faltan $60. ¿Cuánto te gustaría aportar con PayPal?». Los valores vienen del servidor; después de elegir se repite el importe y se pide confirmación antes de crear la orden. La voz explica el propósito y facilita aportar, acepta una negativa y no inventa urgencia o aportes ajenos. «La casa ya está puesta» puede figurar en la descripción, sin registrar aportes físicos ni descontarlos de cuotas.

### Anticipo y saldo; política de inasistencia (P2)

Disponible en cualquier plantilla con cuota fija o gasto total publicado; incluye Viaje conjunto. El organizador elige pago único o anticipo más saldo, configura porcentaje o importe por persona y fecha de saldo. El anticipo debe ser positivo y menor que la cuota; si se cobra el 100%, es pago único. El servidor redondea en centavos con una regla estable, suma los anticipos por persona y calcula el saldo por diferencia, conservando exactamente la cuota completa.

Cada tramo crea una orden independiente con revisión del total, del importe de ese pago, del saldo y de la política aplicable; el usuario aprueba en PayPal. Solo después de verificar el anticipo se habilita la orden del saldo. No hay débito automático ni producto de crédito. El panel distingue «Anticipo pagado, saldo pendiente» de «Pagado». Cada captura cuenta una vez tanto para la cuota como para el progreso de recaudación.

Si se activó la política de inasistencia, mostrar antes del pago: «Tu anticipo de USD 12,50 se destina a financiar el evento y no se devuelve si no asistes». Guardar su aceptación y la versión de las condiciones. El organizador registra la inasistencia explícitamente: se conserva el anticipo ya capturado, sin cargo adicional; el saldo sin pagar queda «No exigible, anticipo conservado» y sale de recordatorios y cobros esperados. Si pagó más que el anticipo, la diferencia queda pendiente de conciliación humana; no se declara todo perdido. Cancelar todo el evento se trata como una incidencia distinta. Esta es una política informada de la demo, no una garantía sobre disputas o devoluciones de PayPal.

**Ejemplo acordado:** meta USD 100, mínimo 50%, cuatro personas con cuota USD 25 y anticipo 50%. Cuatro anticipos de USD 12,50 reúnen USD 50 y habilitan confirmar. Si dos personas completan su saldo y las otras dos no asisten, entran USD 25 adicionales: **recaudación bruta USD 75**, incluidos los USD 25 de anticipos conservados. Faltan USD 25 para la meta original; no hay excedente de USD 25. El organizador puede adaptar el presupuesto al neto disponible. Solo existe excedente si el costo final es menor; no se vuelve a repartir automáticamente el faltante entre quienes asistieron.

### Voz, tarjeta y pagos a plazos

El checkout ofrece los medios elegibles, incluida tarjeta cuando PayPal la habilite para esa integración y comprador; la demo principal usa cuentas compradoras sandbox. No pedir datos de tarjeta por voz/chat ni tarjetas reales a jueces. [Integración de checkout](https://developer.paypal.com/checkout/integrate).

Pagar con tarjeta no garantiza poder diferir. Pay Later depende del país, comercio, integración y aprobación del comprador; no se promete para Ecuador ni para cada aporte. Si resulta elegible, usar los mensajes y componentes oficiales de PayPal, sin generar publicidad propia de financiación por voz. El anticipo más saldo de FiestaPay es un calendario de dos pagos aprobados por la persona, distinto de Pay Later. [Condiciones de Pay Later](https://developer.paypal.com/pay-later/overview).

### Ayuda social y entrega al beneficiario (P2)

«Ayuda social» es una variante de **Evento** con fondo abierto: propósito, meta, mínimo opcional y beneficiario ficticio visible. Conservamos cuatro plantillas. El panel distingue recaudado, comisiones, disponible, entrega pendiente y entrega verificada; no promete que la meta bruta completa llegue al beneficiario después de comisiones.

Plan P2: cobrar en la Business sandbox común y probar una entrega a una cuenta Personal sandbox de beneficiario preconfigurada. PayPal documenta este recorrido de prueba; falta verificar permisos y funcionamiento con nuestra app. No requiere conectar comerciantes independientes; una salida live tendría su propia activación. [Configuración de Payouts sandbox](https://developer.paypal.com/payouts/use-payouts/set-up).

El organizador revisa beneficiario, importe y comisiones y pulsa confirmar en el panel; el agente solo puede preparar la propuesta. El servidor limita el envío al saldo neto de esa campaña, descontando gastos, entregas y reservas para transferencias en curso; no usa como límite el saldo global de la Business. Reservar importe y comisión de forma atómica, con identificadores idempotentes; un reintento no crea otra entrega. Comisiones desconocidas o saldo sin conciliar impiden enviar hasta resolverlo.

Mostrar «Entrega verificada» solo tras comprobar el ítem de Payouts en `SUCCESS` y su destinatario, moneda e importe. `PENDING` y `UNCLAIMED` mantienen reservado el saldo; liberarlo solo al conciliar cancelación/devolución. Ni crear el lote ni un estado general del lote acreditan por sí solos la entrega. Si no funciona con nuestra app, mantener «Entrega pendiente» con la limitación visible; no simular éxito. [API de Payouts](https://developer.paypal.com/api/payouts).

### Recorrido principal

1. «Probar como organizador»: sesión propia, sin Google ni datos personales.
2. Elegir Comida → almuerzo, con portada de referencia fija. Abrir «Almuerzo buffet de cumpleaños» precargado o crear el evento. Ejemplo: USD 25 por persona.
3. Abrir invitación mediante enlace/QR como invitado. Sin registro obligatorio; nombre ficticio sugerido y contacto opcional.
4. Preguntar por voz/chat qué incluye, dónde queda y a qué hora empieza. Responder con datos del evento.
5. «Voy con mi pareja»: asistencia confirmada, pago pendiente. El agente pregunta antes de crear la orden: «2 personas por $25, total $50. ¿Confirmo?».
6. Aprobar la tarjeta de pago y pagar con el comprador sandbox proporcionado.
7. Después de verificar la captura, el panel muestra dos asistentes, USD 50 pagados y la referencia. Con meta USD 100 y mínimo 50%, aparece «Mínimo alcanzado»; el organizador revisa «Recaudado» antes de comisiones y confirma el evento. Cancelar el checkout conserva el saldo pendiente.
8. Consultar el estado por voz/chat y volver al panel. La presentación guía este mismo flujo funcional.

## 2. Un receptor sandbox y acceso para jueces

- Una aplicación REST y una cuenta Business sandbox reciben los pagos de todas las fiestas de prueba. No depende de aprobación como plataforma; sí de disponibilidad de PayPal sandbox.
- Preparar de tres a cinco cuentas Personal sandbox compradoras con saldo ficticio y credenciales de prueba. No usar la Business real de Jorge ni cuentas personales de jueces.
- Franja permanente «Demo · pagos de prueba». El servidor fija el receptor; navegador e IA no pueden cambiarlo.
- «Probar como organizador» crea un espacio aislado. La invitación funciona también en otro dispositivo. Permisos en servidor, sin administrador global compartido.
- «Reiniciar mi demo» crea una generación nueva solo para esa sesión, preservando referencias para conciliar órdenes antiguas. Webhooks tardíos no alteran la fiesta nueva. No borrar sesiones activas mediante cron ni prometer que se borra el historial de PayPal.
- Google y conexión de PayPal propio quedan para la versión independiente. No mostrar una conexión simulada como si funcionara.
- Secretos PayPal, IA y DB solo en archivos privados/variables del servidor. El client ID de PayPal es público y se entrega al SDK cuando corresponde.
- La Business real de Jorge se reserva para un piloto posterior. No sustituye la aprobación de una plataforma que conecte receptores independientes.

## 3. IA, presupuesto e infraestructura

### IA de la aplicación

- Voz: AssemblyAI, reutilizando Sparring y los créditos restantes. Verificar saldo y vencimiento; USD 149 era una referencia histórica, no un saldo comprobado hoy.
- Chat y herramientas de texto: Gemini API desde el backend con clave del proyecto. Fijar el modelo después de verificar acceso, límites y function calling. Los alias de AGY no acreditan disponibilidad en Gemini API.
- AssemblyAI Voice Agent API gestiona su cadena de voz. No asumir que acepta nuestra clave Gemini como LLM interno: comprobar compatibilidad antes de cambiar esa integración. Voz y chat comparten handlers y autorización del servidor.
- Google AI Pro publica USD 10 mensuales de créditos Cloud mediante sus beneficios de desarrollador. Comprobar activación, proyecto y elegibilidad; no significa API ilimitada ni saldo ya disponible.
- Si aplicar créditos requiere prepago nuevo, no comprarlo automáticamente. Usar Free Tier si el modelo/cupo lo permite; registrar la limitación si no sostiene la demo. No activar recargas ni nuevos gastos.
- La clave Gemini queda solo en servidor, nunca en Git, navegador, capturas o conversación. Su creación/configuración y primera prueba siguen pendientes.
- Límites por sesión, evento y presupuesto global. Registrar consumo sin guardar audio ni secretos. Ante fallo de audio, texto; si falla también el LLM, formularios operativos.

### Equipo y loops

Codex dirige e integra; Claude colabora. AGY Gemini `gemini-3.8-flash-high` atiende contexto amplio, módulos y revisión general; AGY Opus `claude-opus-5-5-high`, esfuerzo `high`, verifica dinero y concurrencia; Flash Low hace tareas breves. Grok 4.7 con `xhigh` realiza revisión adversarial. Son herramientas de desarrollo, separadas de las APIs de ejecución de la aplicación.

Máximo tres entregas evaluadas por problema. Si siguen fallando: registrar evidencia, consultar hasta tres fuentes primarias y formular una nueva hipótesis con prueba antes de otro ciclo. No repetir cambios a ciegas.

### Contabo y Cloudflare

- Vite/React, API Node/TypeScript con Fastify, PostgreSQL y archivos en el Contabo existente. Panel con AG Grid Community.
- Inspección del 13 oct: SSH operativo, Ubuntu 24.04.3 LTS, Docker/Nginx existentes; aproximadamente 3,3 GB de RAM disponibles y 373 GB de disco libres en ese momento.
- Proyecto Compose, DB/usuario, volúmenes y copias propios de FiestaPay; PostgreSQL privado y recursos acotados.
- El dominio responde vía Cloudflare, pero aún sirve otra aplicación y carece de vhost FiestaPay. Añadir ruta específica al proxy existente; verificar HTTPS, WebSocket, micrófono y políticas PayPal sin reemplazar configuración global.

## 4. Integridad y pruebas

El servidor calcula y valida importes en centavos, concepto y receptor. La IA propone; el pagador aprueba en PayPal y el backend captura. APPROVED no significa pagado. Captura, webhook firmado y consulta de conciliación convergen en una única aplicación idempotente, comprobando orden, captura, monto, moneda y receptor.

En cuota fija de pago único, cambiar acompañantes no modifica órdenes creadas: invalidar el intento anterior dentro de nuestro flujo antes de generar otro y conciliar cualquier captura concurrente. Después del pago, una baja muestra cualquier importe a favor como pendiente de conciliación humana, sin devolución ni aplicación automática a otros cobros; añadir personas genera solo la diferencia pendiente. No intentar cobrar de nuevo un importe ya capturado. En todos los modos hay como máximo una orden abierta por invitación, concepto, versión y tramo; crear y capturar comprueba de nuevo importe, moneda y vigencia de la cotización. Una captura solo se aplica una vez, independientemente de la vía de notificación.

Cuota, aportes voluntarios y gastos adicionales son conceptos separados. En P2, distinguir reparto previo de gasto total y reparto posterior de gastos adicionales: este último excluye lo ya cubierto por cuotas, registra quién adelantó cada gasto y deja reembolsos a otros pagadores como operaciones manuales auditables. Los modos colaborativos y los tramos conservan la misma validación e idempotencia que P1.

Pruebas mínimas:
1. Ventana privada: organizador demo e invitado completan el recorrido sin Google, correo propio ni dinero real.
2. Comida agrupa desayuno/almuerzo/cena; Casa, Viaje y Evento reutilizan cuota fija. Precio positivo; titular más dos acompañantes a USD 25 debe USD 75. Con dos asistentes se repite «2 personas por $25, total $50. ¿Confirmo?» antes de crear la orden.
3. Alterar monto, receptor, rol o evento desde cliente/LLM se rechaza; aislamiento entre sesiones.
4. Checkout aprobado sin captura, cancelado, fallido o interrumpido no figura pagado. Reintentar no duplica cobros.
5. Captura/webhook simultáneos o duplicados, firma inválida, importe incorrecto y conciliación tardía conservan un resultado correcto.
6. Dos jueces y reinicio de una sesión: no modificar datos ajenos; conservar trazabilidad de pagos anteriores.
7. Cambios de acompañantes antes/durante/después del pago, sin duplicar cobros ni devolver automáticamente. En gasto total los RSVP no reescriben cuotas aceptadas; nuevas cotizaciones requieren revisar el reparto afectado.
8. Voz: permiso denegado, interrupción, desconexión y tool result tardío, sin dobles operaciones y con salida por texto/formulario.
9. Gemini: autenticar y ejecutar una llamada breve y una herramienta de lectura con la clave del proyecto; comprobar consumo y manejar límites sin inventar confirmaciones.
10. «Confirmado, sin pagar» visible y recordatorio por wa.me con envío humano. P2: vaca/reparto sin mezclar obligaciones; fondo abierto muestra «sin aporte», no deuda.
11. Contabo: persistencia, restauración de copia de prueba, DB privada, HTTPS/voz/PayPal y servicios existentes operativos.
12. Cuatro portadas fijas, accesibles y con procedencia registrada; sin controles de subida o reemplazo.
13. Evento: agenda/actividades y respuestas sobre expositores se basan en datos guardados; dos RSVPs por la última plaza no exceden cupo y un grupo con acompañantes entra completo o no entra.
14. P2 gasto total: cero confirmados no permite cobrar, acompañantes cuentan, USD 100/3 suma exactamente USD 100; estimación sin publicar no permite órdenes. Publicar conserva el cálculo reproducible y admite RSVP sin recalcular pagos. Un cambio concurrente de personas exige nueva revisión antes de publicar.
15. P2 fondo abierto: meta USD 100, importe elegido por invitado y validado por servidor, sin multiplicar por acompañantes, deudas ni duplicación con vaca. Voz consulta progreso real, pide confirmación y acepta no aportar.
16. P2 anticipo: dos personas a USD 100, anticipo USD 30 por persona → primera orden USD 60 y saldo USD 140. Repetir callback/webhook no duplica el anticipo; no crear saldo antes de verificarlo. Saldo y anticipo nunca aparecen como dos pagos completos de USD 200.

17. Meta USD 100 y mínimo 50%: USD 49,99 no alcanza; USD 50 sí. Probar mínimo expresado en porcentaje e importe, validación de límites, redondeo a centavos hacia arriba del umbral y reembolso que baja el progreso. Duplicar webhook no duplica progreso ni confirma/reserva automáticamente. Mostrar solo «Recaudado» con nota «antes de comisiones».
18. P2 ejemplo de inasistencia: cuatro anticipos de USD 12,50 y dos saldos de USD 12,50 suman USD 75. Dos ausentes conservan anticipos que ya están incluidos; sus saldos quedan no exigibles, sin recordatorios ni cargo extra. Condiciones aceptadas antes de pagar e importes históricos inmutables.
19. P2 ayuda social: entrega al beneficiario de prueba con aprobación del organizador; no permitir usar fondos de otra campaña. Doble clic/reintento no duplica; PENDING/UNCLAIMED reservan saldo y no cuentan como entregados; solo ítem SUCCESS verificado cambia el estado. Fallo real conserva entrega pendiente y no inventa recibo.
20. Tarjeta/Pay Later: renderizar solo opciones elegibles; voz no promete diferir, no solicita tarjeta ni inventa términos financieros. El recorrido funciona con comprador sandbox aunque esas opciones no aparezcan.

## 5. Pasos y entrega

El calendario aprobado completo está en [PLAN_DIARIO.md](PLAN_DIARIO.md): 145 horas, 100 de construcción P1, 35 de entrega P1 y 10 de contingencia. P2 y extras: cero horas comprometidas. Pago sandbox el 17 oct, P1 el 2 nov, buffers 3–4 nov, freeze 5 nov, video 8 nov y envío 11 nov antes de 15:00 ECT.

Jorge convoca tres probadores y dos suplentes antes del 16 oct. El video muestra únicamente funciones verificadas tras el freeze. La prueba de voz del 16 oct usa Sparring, audio real y una herramienta de lectura. Estado y evidencia en [ESTADO.md](ESTADO.md).

## Fuentes verificadas el 13 oct 2026

- [Reglas del hackathon](https://paypalaihackathon.devpost.com/rules).
- [Cuentas sandbox](https://developer.paypal.com/sandbox-testing/accounts/).
- [Aprobación de plataformas PayPal](https://developer.paypal.com/platforms/get-started).
- [Beneficios de desarrollador de Google AI Pro](https://blog.google/innovation-and-ai/technology/developers-tools/gdp-premium-ai-pro-ultra/).
- [Facturación y prepago Gemini API](https://ai.google.dev/gemini-api/docs/billing).
- [Claves Gemini API](https://ai.google.dev/gemini-api/docs/api-key).
- [Checkout y medios de pago](https://developer.paypal.com/checkout/integrate).
- [Disponibilidad y mensajes de Pay Later](https://developer.paypal.com/pay-later/overview).
- [Configuración de Payouts sandbox](https://developer.paypal.com/payouts/use-payouts/set-up).
- [API de Payouts y estados](https://developer.paypal.com/api/payouts).
