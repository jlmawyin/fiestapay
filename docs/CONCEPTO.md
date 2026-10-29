# FiestaPay — Documento de concepto

> **Encargo vigente, 28 octubre:** [solicitud consolidada](ENCARGO_2026-10-28.md). Cierre funcional 31oct; corte interno de envío5nov. Prioridad: regreso de PayPal y panel, textos/campos por tipo y claridad, asistentes invitados/organizador con permisos separados, y temáticas. Las nuevas pantallas se encuentran en construcción y revisión; el producto público todavía es9a40f26. [Estado y evidencia](ESTADO.md). Una captura acredita recepción en el Business sandbox único; confirmar el evento no retiene ni libera fondos y no ejecuta Payouts.

> **Actualización 25 octubre:** [PLAN_DIARIO.md](PLAN_DIARIO.md) prevalece sobre el historial: entrega máxima 31 octubre, persistencia, dos enlaces con clave de organizador, recuperación por correo, cierre/reembolso sandbox, moderación y audio. Solo OpenAI gpt-6-luna en la aplicación. Las etiquetas P0–P6 nuevas sustituyen las prioridades antiguas; fondo abierto, anticipos, aportes físicos y descuentos siguen fuera. No se da una función por operativa sin evidencia en ESTADO.md.

> Entrada para **PayPal AI Hackathon** (Devpost) · https://paypalaihackathon.devpost.com/
> Autor: Jorge Mawyín (dev solo, Guayaquil, Ecuador)
> URL objetivo: `https://fiestapay.somospanas.com`
> Documento inicial: 13oct2026; revisado28oct. **Entrega funcional máxima31oct y corte interno de envío5nov**; las fechas oficiales históricas no amplían estos compromisos.
> Alcance: [RECOMENDACIONES.md](RECOMENDACIONES.md). Sin Google; un receptor sandbox; cuatro plantillas de cuota fija/pago único con mínimo conjunto. Voz AssemblyAI y texto OpenAI gpt-6-luna/low. Fondo abierto, anticipos, ayuda social, aportes físicos y descuentos quedan fuera de esta entrega. Las secciones de expansión posteriores son ideas sin horas comprometidas; no describen funciones operativas.
> Convención: `[PLACEHOLDER]` = dato por completar · `[verificar]` = confirmar en docs oficiales antes de implementar.

---

## 0. Requisitos oficiales clave (checklist rápido)

Fuente: https://paypalaihackathon.devpost.com/rules y la página principal (revisadas el 13 oct 2026).

- [ ] Usar **PayPal Developer Platform (sandbox gratis)** + una herramienta/modelo de IA, con PayPal **central** al proyecto.
- [ ] **Descripción de texto** de features y funcionalidad.
- [ ] **Demo funcional**: URL hosteada **o** instrucciones completas de instalación en el repo. Mockups/prototipos estáticos NO cuentan.
- [ ] **Lista de herramientas de IA** usadas y cómo se usaron.
- [ ] **Repo público** (GitHub) con todo el código, assets e instrucciones, y **licencia open source visible en el "About"** → MIT.
- [ ] **Video < 3 min** en YouTube (público), mostrando el proyecto funcionando en el dispositivo objetivo; sin música/marcas de terceros sin permiso.
- [ ] **Idioma**: los materiales deben estar en inglés **o** incluir traducción al inglés (video, descripción, instrucciones de prueba). → Video con subtítulos en inglés + README/descripción en inglés. La app puede seguir en español.
- [ ] Credenciales de prueba (cuentas sandbox de comprador) en las instrucciones si hacen falta. **Nunca** el client secret.
- [ ] La demo debe estar disponible gratis para los jueces **hasta el fin del periodo de evaluación (15 dic 2026)**.
- Proyectos existentes permitidos si se actualizan significativamente durante el periodo (FiestaPay es nuevo; reutiliza piezas de Sparring → declararlo).
- Evaluación: etapa 1 pass/fail (encaja en el tema y usa las APIs); etapa 2 con 5 criterios de igual peso. Las reglas permiten evaluación con "análisis automatizado por IA" → README y descripción muy claros.
- Premios: 1.º $12k, 2.º $8k, 3.º $5k; menciones de $5k (Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce); premios de sponsors (AG Grid, APIMatic, Bryntum, Channel3, Render…). **Se puede ganar como máximo 1 premio principal o 1 mención + 1 premio de sponsor.**

---

## 1. Pitch

**Una línea:** FiestaPay es el anfitrión con IA de tu fiesta: responde por voz a tus panas, confirma asistencia y cobra la cuota, la vaca y los gastos con PayPal.

**Tres líneas:**
1. Organizar una fiesta entre amigos es fácil; perseguir confirmaciones y cobrar la cuota por WhatsApp no lo es.
2. FiestaPay le da a cada evento un anfitrión de voz en español latino que responde dudas, toma RSVPs y genera pagos PayPal con confirmación humana.
3. El organizador ve quién viene, quién pagó, las cuotas pendientes y cuánto falta para confirmar el evento, y el agente le deja listos los recordatorios para que él los envíe con un toque.

---

## 2. Problema

- En Ecuador y LatAm, los eventos entre amigos (cumpleaños, baby showers, asados, despedidas, paseos) se organizan en grupos de WhatsApp: la info se pierde entre mensajes y todos preguntan lo mismo ("¿a qué hora?", "¿hay parqueo?", "¿qué llevo?").
- Cobrar es incómodo: cuotas, "vaca" para el regalo y la repartición de gastos después de la fiesta dependen de capturas de transferencias y de que alguien lleve la cuenta en una hoja.
- Al organizador le da vergüenza cobrar; los recordatorios son manuales y quedan deudas pendientes.
- Herramientas existentes separan las piezas (invitaciones / encuestas / apps de dividir gastos / pagos) y ninguna conversa por voz en español latino.

---

## 3. Solución y usuarios

**FiestaPay** = PWA (instalable en el móvil) + agente anfitrión con IA (voz o chat) + pagos PayPal.

| Usuario | Necesita | FiestaPay le da |
|---|---|---|
| **Organizador** | Crear el evento rápido, saber quién viene, cobrar sin incomodidad | Wizard de evento (o dictado por voz), link para compartir, panel de RSVPs/pagos/pendientes, recordatorios pre-armados que el organizador envía él mismo |
| **Invitado** | Info clara, confirmar, pagar fácil | Abre el link, habla o escribe con "el anfitrión", confirma asistencia y paga con PayPal (tarjeta si el checkout la ofrece) sin instalar nada |

Principios: español latino primero, cero fricción para invitados (sin registro obligatorio), **ningún cobro sin confirmación explícita de una persona**.

---

## 4. Flujos principales

### 4.1 Crear evento (organizador)
1. «Probar como organizador» inicia una sesión demo aislada, sin Google ni correo personal. Puede usar una fiesta precargada o crear una propia; reiniciar solo afecta a su espacio.
2. Elegir una de cuatro plantillas: **Comida**, **Fiesta en casa**, **Viaje conjunto** o **Evento**. Todas comparten nombre, fechas/horarios, ubicación, inclusiones, cuota por persona en USD, acompañantes, portada y FAQ. En P1 usan cuota fija y pago único; titular y acompañantes pagan la tarifa completa. Sin aportes físicos ni descuentos.
3. Alternativa IA si queda tiempo: el organizador dicta los datos y el LLM rellena el formulario para revisión. Caso principal: almuerzo buffet de cumpleaños, USD 25 por persona (importe ficticio editable).
4. Configurar meta conjunta y mínimo opcionales; revisar las condiciones visibles. En P2 podrá activar anticipo y política de inasistencia para cuotas, o fondo abierto voluntario.
5. Se genera link público `fiestapay.somospanas.com/e/[slug]` + QR para compartir por WhatsApp.

#### Configuración por plantilla e imágenes (P1)

| Plantilla | Campos propios |
|---|---|
| Comida | Momento: desayuno, almuerzo o cena; precio por persona y qué incluye. Buffet es una modalidad dentro de Comida |
| Fiesta en casa | Cuota fija para comida y limpieza |
| Viaje conjunto | Destino, salida/regreso, transporte y hospedaje; pago único P1 y anticipo más saldo P2 |
| Evento | Entrada para evento formal, concierto o charla; cupo máximo y agenda opcionales, horarios y expositores; el organizador agrega actividades |

Cada plantilla tiene una ilustración original fija, incluida con el proyecto y con texto alternativo. No se permite subir o reemplazar imágenes en P1. No se necesitan fotos personales de jueces. Reemplazo por sesión queda para P2.

En Evento, titular y acompañantes cuentan para el cupo. Un confirmado sin pagar ocupa plaza. Confirmar o ampliar un RSVP reserva todas sus personas atómicamente o rechaza el cambio completo; cancelar libera cupo sin devolución automática. No caduca una plaza por impago de forma silenciosa. Las actividades forman parte de la agenda y no generan cobros adicionales.

#### Meta y mínimo de recaudación (P1); anticipo individual (P2)

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

### 4.2 Invitado pregunta por voz/chat
1. Abre el link → ve tarjeta del evento + botón "Hablar con el anfitrión" (y chat de texto como fallback).
2. Pregunta por menú, parqueo, transporte, horarios, agenda, actividades o expositores → el agente llama `get_event_info` y responde solo con datos del organizador. Si faltan, lo dice; no inventa horarios ni ponentes.

### 4.3 RSVP
1. "Sí voy, con mi pareja" → el agente usa el nombre ficticio y la sesión del invitado, confirma el resumen y llama `rsvp`. El contacto es opcional; no pedir correo o teléfono real al juez ni fusionar identidades por un contacto no verificado.
2. Estado: `si` / `no` / `tal_vez`, acompañantes y restricciones alimentarias. RSVP y pago son independientes: "Confirmado, sin pagar" sigue debiendo la cuota fija. En fondo abierto P2 se muestra "Confirmado, sin aporte", sin deuda obligatoria.
3. En cuota fija, titular y acompañantes pagan la tarifa completa. En gasto total P2 cuentan como personas individuales para el reparto; fondo abierto P2 no tiene cuota individual obligatoria. La asistencia declarada no equivale a pago ni acredita reservas externas.

### 4.4 Pagar cuota
1. Tras el RSVP, antes de crear una orden el agente repite el cálculo del servidor: **"2 personas por $25, total $50. ¿Confirmo?"**. El servidor calcula en centavos; sin descuentos ni exenciones. El resumen en pantalla coincide con la voz.
2. Usuario dice que sí → `create_payment_order` (Orders API) → la UI muestra **tarjeta de confirmación** con monto, concepto y botón PayPal.
3. El invitado aprueba con credenciales compradoras sandbox proporcionadas → backend captura y verifica → webhook firmado/consulta concilian el mismo pago idempotentemente. Solo entonces se confirma "¡Listo, quedó pagado!". APPROVED no basta.
4. Cancelar o fallar mantiene la cuota pendiente. En cuota fija de pago único, cambiar acompañantes exige recalcular en servidor sin alterar órdenes existentes ni cobrar dos veces; después de pagar, una baja deja cualquier importe a favor pendiente de conciliación humana, sin devolverlo ni aplicarlo automáticamente a otro cobro. Gasto total publicado y anticipo/saldo usan las reglas P2 siguientes. El receptor único es el organizador demo; el pago no acredita cobros de restaurantes, agencias o recintos.

#### Condición colaborativa (P2, disponible en cualquier plantilla)

Separar plantilla, forma de cobro, meta/mínimo y calendario de pago. Cuota fija es el modo predeterminado P1; gasto total y fondo abierto son alternativas P2. Elegir una forma principal por evento.

- **Cuota fija (P1):** precio por titular y acompañante, apropiado también para agencias o conciertos con gastos fijos por persona.
- **Gasto total (P2):** el servidor calcula total dividido entre personas confirmadas; el organizador pulsa «Revisar y publicar cuotas» antes de cobrar. No exige cerrar la lista de invitados. La demo usa un grupo estable y puntual; sin confirmados no hay división. Repartir centavos residuales por identificadores estables de persona, incluidos acompañantes, y sumar por invitación: USD 100 entre tres = 33,34 + 33,33 + 33,33. Guardar el cálculo publicado para reproducirlo. Nuevos RSVP respetan el cupo y no reescriben cuotas aceptadas; si afectan el reparto, exigir revisión del organizador antes de nuevas cotizaciones. Ninguna baja recalcula pagos ni genera cobros/devoluciones automáticos.
- **Fondo abierto (P2):** El organizador define propósito, meta conjunta y mínimo opcional; cada invitado elige cuánto aportar. El servidor valida importe, moneda y límites, sin multiplicar por acompañantes. No hay cuota, anticipo obligatorio, saldo exigible ni penalidad por no aportar. El panel muestra «Confirmado, sin aporte» y la meta real; un recordatorio invita de forma voluntaria. Reutilizar el motor de la vaca sin duplicar aportes; una vaca opcional en un evento de cuota fija conserva un concepto separado y no salda la entrada.

Ejemplo de bienvenida por voz: «¡Bienvenido! Queremos reunir $100 para nuestro encuentro. Llevamos $40 y faltan $60. ¿Cuánto te gustaría aportar con PayPal?». Los valores vienen del servidor; después de elegir se repite el importe y se pide confirmación antes de crear la orden. La voz explica el propósito y facilita aportar, acepta una negativa y no inventa urgencia o aportes ajenos. «La casa ya está puesta» puede figurar en la descripción, sin registrar aportes físicos ni descontarlos de cuotas.
- La IA nunca decide montos. Antes de cada orden lee la cotización del servidor y pide confirmación; el usuario aprueba además en PayPal. No cambiar modo ni condiciones de obligaciones ya aceptadas.

#### Anticipo más saldo e inasistencia (P2 confirmado)

Disponible en cualquier plantilla con cuota fija o gasto total publicado; incluye Viaje conjunto. El organizador elige pago único o anticipo más saldo, configura porcentaje o importe por persona y fecha de saldo. El anticipo debe ser positivo y menor que la cuota; si se cobra el 100%, es pago único. El servidor redondea en centavos con una regla estable, suma los anticipos por persona y calcula el saldo por diferencia, conservando exactamente la cuota completa.

Cada tramo crea una orden independiente con revisión del total, del importe de ese pago, del saldo y de la política aplicable; el usuario aprueba en PayPal. Solo después de verificar el anticipo se habilita la orden del saldo. No hay débito automático ni producto de crédito. El panel distingue «Anticipo pagado, saldo pendiente» de «Pagado». Cada captura cuenta una vez tanto para la cuota como para el progreso de recaudación.

Si se activó la política de inasistencia, mostrar antes del pago: «Tu anticipo de USD 12,50 se destina a financiar el evento y no se devuelve si no asistes». Guardar su aceptación y la versión de las condiciones. El organizador registra la inasistencia explícitamente: se conserva el anticipo ya capturado, sin cargo adicional; el saldo sin pagar queda «No exigible, anticipo conservado» y sale de recordatorios y cobros esperados. Si pagó más que el anticipo, la diferencia queda pendiente de conciliación humana; no se declara todo perdido. Cancelar todo el evento se trata como una incidencia distinta. Esta es una política informada de la demo, no una garantía sobre disputas o devoluciones de PayPal.

**Ejemplo acordado:** meta USD 100, mínimo 50%, cuatro personas con cuota USD 25 y anticipo 50%. Cuatro anticipos de USD 12,50 reúnen USD 50 y habilitan confirmar. Si dos personas completan su saldo y las otras dos no asisten, entran USD 25 adicionales: **recaudación bruta USD 75**, incluidos los USD 25 de anticipos conservados. Faltan USD 25 para la meta original; no hay excedente de USD 25. El organizador puede adaptar el presupuesto al neto disponible. Solo existe excedente si el costo final es menor; no se vuelve a repartir automáticamente el faltante entre quienes asistieron.

#### Medios de pago y voz

El checkout ofrece los medios elegibles, incluida tarjeta cuando PayPal la habilite para esa integración y comprador; la demo principal usa cuentas compradoras sandbox. No pedir datos de tarjeta por voz/chat ni tarjetas reales a jueces. [Integración de checkout](https://developer.paypal.com/checkout/integrate).

Pagar con tarjeta no garantiza poder diferir. Pay Later depende del país, comercio, integración y aprobación del comprador; no se promete para Ecuador ni para cada aporte. Si resulta elegible, usar los mensajes y componentes oficiales de PayPal, sin generar publicidad propia de financiación por voz. El anticipo más saldo de FiestaPay es un calendario de dos pagos aprobados por la persona, distinto de Pay Later. [Condiciones de Pay Later](https://developer.paypal.com/pay-later/overview).

#### Ayuda social: variante de Evento (P2)

«Ayuda social» es una variante de **Evento** con fondo abierto: propósito, meta, mínimo opcional y beneficiario ficticio visible. Conservamos cuatro plantillas. El panel distingue recaudado, comisiones, disponible, entrega pendiente y entrega verificada; no promete que la meta bruta completa llegue al beneficiario después de comisiones.

Plan P2: cobrar en la Business sandbox común y probar una entrega a una cuenta Personal sandbox de beneficiario preconfigurada. PayPal documenta este recorrido de prueba; falta verificar permisos y funcionamiento con nuestra app. No requiere conectar comerciantes independientes; una salida live tendría su propia activación. [Configuración de Payouts sandbox](https://developer.paypal.com/payouts/use-payouts/set-up).

El organizador revisa beneficiario, importe y comisiones y pulsa confirmar en el panel; el agente solo puede preparar la propuesta. El servidor limita el envío al saldo neto de esa campaña, descontando gastos, entregas y reservas para transferencias en curso; no usa como límite el saldo global de la Business. Reservar importe y comisión de forma atómica, con identificadores idempotentes; un reintento no crea otra entrega. Comisiones desconocidas o saldo sin conciliar impiden enviar hasta resolverlo.

Mostrar «Entrega verificada» solo tras comprobar el ítem de Payouts en `SUCCESS` y su destinatario, moneda e importe. `PENDING` y `UNCLAIMED` mantienen reservado el saldo; liberarlo solo al conciliar cancelación/devolución. Ni crear el lote ni un estado general del lote acreditan por sí solos la entrega. Si no funciona con nuestra app, mantener «Entrega pendiente» con la limitación visible; no simular éxito. [API de Payouts](https://developer.paypal.com/api/payouts).

### 4.5 Vaca / regalo compartido (P2)
1. El organizador define meta (p. ej. $120 para un parlante) y monto sugerido.
2. El agente: "Estamos juntando para el regalo de Ana, vamos $60 de $120. ¿Te sumas con $10?" → mismo flujo de orden + confirmación.
3. Barra de progreso en la página del evento y en el panel.

### 4.6 Dividir gastos después de la fiesta (P2)
1. El organizador registra gastos monetarios adicionales y quién los adelantó (texto/voz → LLM estructura → revisión humana). Excluir todo lo ya cubierto por la cuota del evento; no hay aportes físicos ni equivalencias en esta demo.
2. `split_expenses` calcula saldos (cálculo **determinista en código**, no en el LLM) entre asistentes confirmados. Este reparto posterior de gastos adicionales es distinto del modo gasto total previo; no duplicar importes ya incluidos en cuotas.
3. Todos los cobros van a la Business sandbox del organizador demo → órdenes para cada deudor. Reembolsos a otros pagadores manuales y auditables; automatizar estos reembolsos con Payouts sigue siendo extra. La entrega al beneficiario de ayuda social tiene su propio alcance P2.

### 4.7 Recordatorios
1. Panel muestra pendientes y el estado literal **«Confirmado, sin pagar»**, separado de asistencia. En P2 distingue anticipo pagado/saldo pendiente y, para fondo abierto, «Confirmado, sin aporte» sin tratarlo como deudor.
2. El agente propone: "3 personas no han pagado la cuota. ¿Te preparo el recordatorio?" → `prepare_reminder` deja el mensaje cargado (texto + link de pago) → el organizador lo envía él mismo con un toque: enlace `wa.me/<número>?text=...` (WhatsApp) o `mailto:` / compartir nativo (Web Share API). **El agente nunca envía mensajes directamente** (no usamos la API de WhatsApp Business: requiere aprobación de Meta, plantillas y costo).
3. Si no hay teléfono guardado, abrir `wa.me/?text=...` para que la persona elija destinatario; el juez no necesita proporcionar su número real. Fondo abierto prepara una invitación voluntaria, no una reclamación de deuda.
4. Opcional: PayPal Invoicing con recordatorios nativos (`send_invoice_reminder`) `[verificar sandbox]`.

---

## 5. El agente

### 5.1 Persona
- Nombre: **"El Pana"** `[PLACEHOLDER — o reutilizar la voz 'lola' de Sparring como "Lola, la anfitriona"]`.
- Tono: cálido, alegre, breve, español latino neutro con toques ecuatorianos moderados ("¡De una!", "pana") sin caricatura.
- Reglas: solo responde con datos del evento (tool calls); nunca inventa horarios, montos ni direcciones; frases cortas para voz; confirma en voz alta montos y nombres antes de actuar.
- En recaudación, da la bienvenida, explica propósito y progreso real e invita a aportar con PayPal, aceptando una negativa. La financiación se presenta únicamente mediante componentes oficiales elegibles; no promete diferidos ni convierte aportes voluntarios en deudas.

### 5.2 Tools del agente

| Tool | Qué hace | Quién puede invocar | ¿Requiere confirmación humana? |
|---|---|---|---|
| `get_event_info(event_id, topic?)` | Devuelve datos del evento (horarios, lugar, menú, viaje, agenda, actividades, expositores, parqueo, FAQ, meta/mínimo, progreso público y beneficiario ficticio) | Invitado / organizador | No (solo lectura) |
| `rsvp(event_id, guest, status, companions, notes)` | Crea/actualiza RSVP | Invitado | Sí, confirmación verbal del resumen |
| `get_payment_quote(event_id, guest_id, concept, selected_amount?, tranche?)` | Calcula/valida la cotización vigente en servidor; el importe elegido solo se admite para aportes voluntarios | Invitado | Lectura; se revisa el resumen antes de crear orden |
| `create_payment_order(event_id, guest_id, quote_id)` | Usa una cotización vigente del servidor (concepto, importe, versión y tramo si aplica), crea la orden PayPal y devuelve `order_id` | Invitado | **Sí, siempre**: el monto lo fija el servidor según reglas del evento; el invitado aprueba en la tarjeta UI + en PayPal |
| `check_payment_status(order_id \| guest_id)` | Consulta estado (DB + `GET /v2/checkout/orders/{id}`) | Invitado / organizador | No |
| `get_dashboard_summary(event_id)` | Resumen RSVPs/pagos/pendientes, recaudado antes de comisiones y mínimo; desglose y entregas en P2 | Organizador | No |
| `add_expense(event_id, payer, amount, description)` | Registra gasto | Organizador | Sí (revisión de la lista) |
| `split_expenses(event_id)` | Calcula quién debe a quién (código determinista) | Organizador | Sí antes de generar cobros |
| `prepare_reminder(event_id, guest_ids, channel, message)` | Prepara el recordatorio con link de pago y lo deja cargado; **no envía** | Organizador | El envío lo hace siempre el organizador (toque en `wa.me` / compartir) |

En ayuda social P2, el agente puede preparar una propuesta de entrega al beneficiario preconfigurado. La ejecución usa una acción explícita del organizador en el panel y autorización del servidor; no se expone como transferencia autónoma del LLM.

### 5.3 Reglas de seguridad / confirmación
1. **Nunca se cobra sin acción humana**: el agente solo *crea* la orden; el dinero solo se mueve cuando el pagador aprueba en la UI de PayPal y el backend captura una orden aprobada.
2. Montos calculados/validados en servidor: cuota fija por persona; gasto total según cálculo revisado y publicado; aporte abierto elegido por invitado y validado; anticipo/saldo según tramo; gasto adicional según `split_expenses`. La IA usa cotizaciones y nunca es autoridad sobre importes.
3. Tools de organizador solo con sesión de organizador (autorización por rol en el backend, no en el prompt).
4. Idempotencia: una orden pendiente por invitado, concepto, versión de obligación y tramo cuando aplica; reintentos devuelven la misma. Una captura solo se aplica una vez, aunque llegue por callback y webhook.
5. Registro de auditoría de cada tool call (visible en el panel: "El agente creó orden X a las 20:14").
6. Defensa básica contra prompt injection: los textos de invitados nunca se tratan como instrucciones para tools de organizador.

---

## 6. Integración PayPal (sandbox)

Todo en **sandbox** (`https://api-m.sandbox.paypal.com`) con cuentas de prueba creadas en el Developer Dashboard. Moneda: **USD** (moneda oficial de Ecuador — ventaja natural).

| Necesidad | Producto PayPal | Docs | Uso en FiestaPay |
|---|---|---|---|
| Autenticación | OAuth 2.0 client credentials | https://developer.paypal.com/api/rest/authentication/ | Token server-side; secret solo en `.env` del servidor |
| Cobro de cuota / vaca / deuda | **Orders API v2** (`create`, `capture`, `get`) | https://developer.paypal.com/docs/api/orders/v2/ | Núcleo del MVP |
| Botón de pago en la PWA | **JavaScript SDK / PayPal Buttons** (Standard Checkout) | https://developer.paypal.com/sdk/js/ · https://developer.paypal.com/docs/checkout/ | `createOrder` → backend; `onApprove` → backend captura |
| Confirmación asíncrona | **Webhooks** (`CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`) + verificación de firma | https://developer.paypal.com/api/rest/webhooks/ | Actualizar estado aunque el invitado cierre la app |
| Tool calling para el agente | **PayPal Agent Toolkit** (TypeScript/Python; `create_order`, `get_order`, `create_invoice`, `send_invoice_reminder`…) y **MCP server** | https://developer.paypal.com/ai-tools/agent-tools · https://github.com/paypal/agent-toolkit · https://paypal.gitbook.com/agent-toolkit-and-mcp-server | Envolver/reutilizar en las tools propias; refuerza "Agentic Commerce" y "Best PayPal + AI" |
| Recordatorios formales (extra) | **Invoicing API v2** | https://developer.paypal.com/docs/api/invoicing/v2/ | Factura por deuda post-fiesta con recordatorio nativo `[verificar emails en sandbox]` |
| Entrega de ayuda social (P2); reembolsar a otros pagadores (extra) | **Payouts API** | https://developer.paypal.com/api/payouts · https://developer.paypal.com/payouts/use-payouts/set-up | Business sandbox → beneficiario Personal sandbox, aprobación humana y estado por ítem; `[verificar permisos y prueba con nuestra app]` |
| Pagar directo a otra cuenta (extra) | `purchase_units[].payee` en Orders | https://developer.paypal.com/docs/api/orders/v2/ | Que el deudor pague directo al acreedor `[verificar condiciones/permisos]` |
| Devoluciones (extra) | Refund de captura (Payments v2 / `create_refund` del toolkit) | https://developer.paypal.com/docs/api/payments/v2/ | Si se cancela el evento |

Decisión MVP: **una app REST y una cuenta Business sandbox receptora**, con 3–5 compradores Personal sandbox. Sesiones de organizador aisladas, franja permanente de pagos de prueba y sin credenciales personales de jueces. La Business real de Jorge no se usa en la demo. Conectar receptores independientes requiere aprobación para producción según [PayPal](https://developer.paypal.com/platforms/get-started); queda fuera de esta entrega.

Ventaja del usuario: ya integró PayPal en mayorpoder.org y visitaremota.com — reutilizar patrones de botón/captura.

---

## 7. Arquitectura y stack propuestos

```
[PWA (invitado/organizador)] --HTTPS--> [Backend API (Node/TS)]
   |  voz (WebSocket)                      |-- LLM (tool calling) --> tools FiestaPay
   v                                       |-- PayPal REST (Orders, Webhooks, Agent Toolkit)
[AssemblyAI Voice Agent API]               |-- DB (Postgres)
  (reutiliza Sparring, voz 'lola')         |-- Links wa.me / Web Share (recordatorios que envía el organizador)
```

| Capa | Propuesta | Notas |
|---|---|---|
| Frontend | PWA: Vite + React + Service Worker + manifest | Instalable; mobile-first |
| Backend | Node.js + TypeScript + Fastify | PayPal Agent Toolkit tiene soporte TS |
| DB | PostgreSQL privado en el VPS Contabo (Ubuntu) | Tablas: events, guests, rsvps, payments, expenses, reminders, audit_log |
| Voz | **AssemblyAI Voice Agent API**, reutilizando el cliente de Sparring, voz `lola`, español latino | Créditos restantes por verificar (USD 149 era una cifra histórica); reutilizar handlers de Sparring y limitar duración/consumo |
| LLM de texto | OpenAI Responses, gpt-6-luna, esfuerzo low | Backend únicamente. Clave privada del servicio VPS. El motor de voz AssemblyAI no declara un modelo LLM interno en la configuración actual; no atribuirle el modelo del chat |
| Panel | AG Grid Community | RSVPs, pagos, pendientes, vaca y auditoría; sin funciones Enterprise |
| Recordatorios | Links `wa.me/?text=` + Web Share API + `mailto:` (sin API de WhatsApp ni proveedor de email para recordatorios) | El organizador pulsa enviar |
| Hosting | **VPS propio en Contabo (Ubuntu)**: Docker, Node + PostgreSQL privados y proxy Nginx existente; HTTPS validado para este dominio, dominio `fiestapay.somospanas.com` | Costo extra $0; mantener en línea hasta el 15 dic 2026 |
| DNS | Registro A `fiestapay` → IP del VPS en el DNS de somospanas.com | HTTPS obligatorio (micrófono + PayPal) |

Fallback de voz: chat de texto OpenAI. Si falla también el proveedor de texto, formularios y PayPal siguen operativos. La IA queda fuera de crear/publicar y de la autorización financiera. Asistentes y canales deben respetar permisos del servidor.

Contabo aloja el servicio aislado de FiestaPay y PostgreSQL privado. La ruta pública HTTPS ya sirve FiestaPay; no confundir la inspección histórica del13oct con el estado actual. Mantener proxy y aplicaciones ajenos intactos. Backups/restauración y versión activa se documentan en ESTADO.md.

OpenAI-only está publicado en9a40f26 y conserva evidencia previa de texto/herramientas. No reintroducir el adaptador ni las variables del proveedor retirado. La nueva ronda de asistentes requiere pruebas propias con contador de llamadas, sin compras, recargas ni reseteos.

---

## 8. Prioridades P1 y P2

**P1: núcleo obligatorio antes del freeze del 5 nov**

- Acceso demo sin Google y reinicio aislado por sesión; datos ficticios y compradores sandbox.
- **Comida completa**, con desayuno/almuerzo/cena como opciones. Demo principal: almuerzo a USD 25 por persona, dos asistentes, USD 50.
- **Fiesta en casa, Viaje conjunto y Evento** como configuración sobre el mismo motor de cuota fija y pago único. portadas de referencia fijas en las cuatro plantillas.
- Agenda, expositores y actividades editables; cupo opcional en Evento con control de concurrencia.
- Meta conjunta y mínimo configurables en cualquier plantilla; progreso con capturas verificadas menos devoluciones, con nota «antes de comisiones», confirmación del evento por el organizador.
- Titular y acompañantes pagan tarifa completa. Asistencia y pago separados; «Confirmado, sin pagar» visible y recordatorio por wa.me preparado para envío humano.
- Voz AssemblyAI y texto OpenAI con herramientas autorizadas por rol; cuenta repetida antes de crear orden, cálculo del servidor y aprobación humana. El nuevo asistente de organizador guía y consulta; no confirma, cancela ni reembolsa.
- PayPal Buttons + Orders v2 + captura/webhook/conciliación; panel AG Grid, auditoría y pruebas de idempotencia/aislamiento.
- Contabo/Cloudflare, repo público MIT e instrucciones en inglés.

**P2: después de estabilizar P1**

- Condición colaborativa en cualquier plantilla: gasto total con cuotas revisadas/publicadas y fondo abierto voluntario con meta; no imponer cierre de invitados antes de recaudar.
- Anticipo y saldo en cualquier plantilla con cuota fija o gasto total publicado, incluido Viaje. Porcentaje/importe y política de inasistencia configurables; dos aprobaciones humanas y ningún doble cobro.
- Ayuda social como variante de Evento: meta, beneficiario ficticio y entrega vía Payouts sandbox solo tras validar permisos y el recorrido completo; estados de recaudación y entrega separados.
- Después: vaca/regalo opcional y gastos adicionales con reparto determinista, separados de la obligación principal.
- Probar centavos, cero confirmados, cuotas aceptadas inmutables, aportes sin deuda, mínimo y anticipos sin duplicados, inasistencia y transferencias pendientes. Caso USD 100/50%: cuatro anticipos y dos saldos suman USD 75. No mostrar como operativa una opción P2 incompleta ni comprometer P1 por añadirla. Pruebas detalladas en RECOMENDACIONES.md.

**Extras después de P1/P2:** dictado de creación, material imprimible/ficha A4, idioma adicional, Invoicing, Payouts para otros pagadores y gestión de devoluciones; no introducir una integración sin validar sus condiciones.

**Fuera de esta entrega:** aportes físicos/listas de cosas para llevar, descuentos/equivalencias, Google, conexión de PayPal propio por organizador, live y app nativa. No cambiar los compromisos de sandbox y privacidad de los jueces.

---



## 9. Cronograma aprobado

Ver [PLAN_DIARIO.md](PLAN_DIARIO.md) y el encargo28oct: resultados humanos hasta29oct20:00, cierre funcional31oct, después correcciones y presentación hasta el corte5nov. El calendario14oct–11nov conservado allí es histórico. Las cinco horas diarias son presupuesto humano; no autorizan consumo ilimitado de agentes.

---

## 10. Flujo de trabajo: agentes locales + revisión en GitHub

**Método:** construcción y verificación independientes; Codex integra y publica el diff y la evidencia en PRs de GitHub con CI. Un informe local no acredita publicación ni una prueba externa.

Codex coordina e integra, GROK construye y AGY Gemini verifica de forma independiente. Claude aporta diagnóstico de recuperación y segunda opinión de solo lectura cuando su conexión y cuota lo permiten. Seguir dirigir-agentes: dos constructores como máximo, tres entregas evaluadas por problema y contadores persistentes. No cambiar modelo, agente ni identificador para eludir una pausa. Gemini en AGY es herramienta de desarrollo, separada de los proveedores de la aplicación.

### 10.1 Estructura del repo (propuesta)
```
fiestapay/
├── LICENSE                 # MIT (visible en About)
├── README.md               # EN: qué es, demo URL, cómo correr, cuentas sandbox de prueba, herramientas IA
├── README.es.md
├── .env.example            # nombres de variables, SIN valores
├── .gitignore              # .env, *.pem, node_modules, dist
├── apps/
│   ├── web/                # PWA
│   └── api/                # backend, tools del agente, PayPal, webhooks
├── packages/
│   └── agent/              # prompts, definiciones de tools, persona
├── docs/
│   ├── CONCEPTO.md
│   ├── architecture.md
│   └── ai-tools.md         # herramientas IA usadas (para Devpost)
└── .github/
    ├── workflows/ci.yml
    └── pull_request_template.md
```

### 10.2 Flujo de ramas y PRs
- `main` protegida: sin push directo; merge solo vía PR con CI verde.
- Ramas por feature: `feat/orders-capture`, `feat/voice-agent`, `fix/webhook-signature`…
- Agentes locales trabajan en su rama → commits pequeños con mensajes convencionales (`feat:`, `fix:`, `docs:`) → push → abren PR con plantilla.
- Revisión en GitHub (tú + revisor online independiente de los agentes constructores) → comentarios → correcciones → **squash**.
- Tags de hitos: `v0.1-h1`, `v0.2-h2`, `v0.3-mvp`, `v1.0-submission`.

### 10.3 Checklist de revisión (pull_request_template.md)
**Seguridad**
- [ ] Ningún secreto en el diff (PayPal client secret, AssemblyAI key, LLM key, DB URL, webhook ID).
- [ ] Variables nuevas añadidas a `.env.example` (solo nombre), nunca a `.env` versionado.
- [ ] Llamadas a PayPal solo desde el servidor; el frontend solo recibe `client_id` público y `order_id`.
- [ ] Montos calculados/validados en servidor; tools sensibles requieren confirmación.
- [ ] Webhooks verifican firma.
- [ ] Sin datos personales reales en fixtures/seeds.

**Calidad**
- [ ] CI verde (lint, typecheck, tests, build).
- [ ] Pruebas de cuota completa por acompañante, cupo concurrente y cotización antes de orden. Mínimo conjunto basado en capturas verificadas. P2: centavos de gasto total, cuotas publicadas inmutables, fondo abierto sin deuda, anticipo/inasistencia sin duplicados y entrega por campaña conciliada.
- [ ] Cuatro portadas fijas con texto alternativo y procedencia, sin subida de archivos.
- [ ] Tests para lógica de dinero (`split_expenses`, idempotencia por obligación/versión/tramo y captura).
- [ ] Probado manualmente en sandbox (adjuntar captura/GIF si es UI).
- [ ] Docs/README actualizados si cambia la forma de correr el proyecto.

### 10.4 CI básico (`.github/workflows/ci.yml`)
- `install` → `lint` → `typecheck` → `test` → `build` en cada PR y push a `main`.
- **Escaneo de secretos** (gitleaks o GitHub secret scanning/push protection activado).
- Dependabot para dependencias.
- Deploy al VPS desde `main` (GitHub Actions por SSH o `git pull` + pm2/systemd; opcional).

### 10.5 Secretos (siempre locales)
- `.env` solo en la máquina local y en las variables de entorno del hosting.
- Credenciales sandbox (client id/secret) en `.env`; en el README solo se publican las **cuentas de comprador de prueba** necesarias para que los jueces paguen en sandbox.
- Si un secreto se filtra: rotarlo en el Developer Dashboard de inmediato (borrar del historial no basta).

### 10.6 Por qué ayuda con los jueces
- El historial de commits/PRs fechados desde el 13 oct muestra trabajo real dentro del periodo ("genuine effort", "working, non-trivial").
- PRs con descripciones y revisiones = narrativa técnica que se puede enlazar en la descripción de Devpost.
- Transparencia sobre uso de IA en el desarrollo → documentarlo en `docs/ai-tools.md`.

---

## 11. Cobertura de criterios y premios especiales

| Criterio (igual peso) | Cómo lo cubre FiestaPay |
|---|---|
| **Technological Implementation** | Orders v2 + JS SDK + webhooks + Agent Toolkit; agente de voz con tool calling real; validación server-side, idempotencia, tests de lógica de dinero |
| **Design** | Producto completo de punta a punta (organizador e invitado), PWA instalable, UX conversacional + tarjetas de confirmación claras |
| **Potential Impact** | Problema real y específico (eventos entre amigos en LatAm, cobros por WhatsApp); probado con panas reales `[PLACEHOLDER: testimonios/nº de pruebas]` |
| **Innovation/Idea** | Anfitrión de voz en español latino que además cobra; une invitación + RSVP + vaca + split en una conversación |
| **Presentation** | Video < 3 min con historia clara (problema → demo → impacto), subtítulos EN, README excelente |

**Menciones objetivo** (solo se gana una + un sponsor):
- **Best Use of Agentic Commerce** (principal): el agente crea órdenes, consulta estado y propone cobros y prepara recordatorios vía tool calls, con humano en el loop antes de mover dinero.
- **Best Use of PayPal + AI** (alternativa): PayPal es el corazón del flujo; IA es la interfaz.
- También compatibles: Most Impactful, Best Demo Delivery.
- **Sponsor objetivo:** AG Grid Community en el panel. Usar Contabo no exige concursar por Render ni impide optar a otro sponsor.

---

## 12. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Alcance demasiado grande para dev solo | Freeze el 5 nov; MVP definido; extras en orden estricto |
| Latencia/errores de voz | Chat de texto como fallback de todos los flujos; respuestas cortas |
| Créditos AssemblyAI restantes se agotan (saldo por verificar) | Límite de minutos por sesión, rate limit por evento, desactivar voz pública tras el periodo si es necesario; texto siempre disponible |
| LLM alucina montos o datos | Montos solo del servidor; respuestas basadas en `get_event_info`; tests de prompts |
| Prompt injection de invitados | Autorización por rol en backend; tools de organizador inaccesibles desde sesión de invitado |
| Filtración de secretos | `.env` + gitleaks + push protection + revisión en PR; rotación inmediata |
| Webhooks de sandbox lentos/no llegan | Fallback: `GET /v2/checkout/orders/{id}` al volver de PayPal y en `check_payment_status` |
| Limitaciones sandbox (Payouts, Invoicing emails) | P1 solo con Orders; probar Payouts antes de ofrecer entrega P2 y mostrar pendiente si falla. Invoicing sigue como extra |
| Confundir mínimo con dinero neto o reserva externa | Mostrar «Recaudado» antes de comisiones en P1; desglose en P2 y confirmación humana. Anticipos conservados ya están incluidos en lo recaudado |
| Prometer financiación no disponible | Tarjeta según checkout; Pay Later solo elegible y con mensajes oficiales, sin promesas generadas por voz |
| Jueces no pueden probar | URL hosteada + cuentas sandbox de comprador en README + instrucciones locales completas; mantener online hasta 15 dic |
| Requisito de inglés | README/descripción en inglés, subtítulos EN en el video |
| Música/marcas en el video | Música libre de derechos o sin música; no mostrar marcas de terceros salvo PayPal en uso normal |

---

## 13. Guion de demo (objetivo 170 s, siempre < 3 min)

| Tiempo | Escena | Contenido |
|---|---|---|
| 0:00–0:15 | Problema | Organizar un almuerzo de grupo y perseguir cuotas/confirmaciones por WhatsApp. |
| 0:15–0:35 | Organizador | Entrar sin Google; elegir Comida → almuerzo, portada de referencia, USD 25 por persona, meta USD 100/mínimo 50%, inclusiones y QR. |
| 0:35–1:15 | Voz + PayPal | "¿Qué incluye?" → respuesta; "voy con mi pareja" → "2 personas por $25, total $50. ¿Confirmo?"; checkout sandbox con comprador de prueba. |
| 1:15–1:35 | Resultado | Captura verificada, panel AG Grid y consulta por voz del estado. Mostrar diferencia entre asistencia y pago y «Mínimo alcanzado» tras los USD 50 capturados. |
| 1:35–2:00 | Otros flujos monetarios | Mostrar «Confirmado, sin pagar» y wa.me; mostrar un ejemplo de colaboración/anticipo o ayuda social con entrega verificada únicamente si está implementado y probado. |
| 2:00–2:30 | Evidencia técnica | Tools reales, servidor calcula, webhook/conciliación e idempotencia. Mostrar solo lo que funciona en la versión grabada. |
| 2:30–2:50 | Cierre | Impacto, URL y repo; conexión de cuentas propias/aportes físicos identificados como evolución futura. |

Notas: grabar en móvil real (dispositivo objetivo), subtítulos en inglés, sin música con copyright, ensayar con datos de demo precargados `[PLACEHOLDER: nombres/montos de demo]`.

---

## Pendientes / placeholders
- `[PLACEHOLDER]` Nombre final de la persona del agente.
- OpenAI-only publicado9a40f26; conservar sus pruebas y configuración privada. Nueva política y rol organizador requieren aceptación propia. PostgreSQL en Contabo y acceso demo sin correo ya operativos; estado preciso en ESTADO.md.
- `[verificar]` Cómo expone tool calls el AssemblyAI Voice Agent API (reutilizar implementación de Sparring).
- `[verificar]` Permisos de Payouts en nuestra app, beneficiario Personal sandbox preconfigurado, saldo por campaña, comisiones y prueba completa hasta SUCCESS por ítem. No usar datos reales. Invoicing (emails/recordatorios) sigue como extra por verificar.
- Versión independiente: aportes físicos, Google y PayPal propio por organizador; no condicionan la entrega del hackathon.
