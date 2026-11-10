# FiestaPay — ronda real de navegador, 28 octubre 2026

**Resultado: 10 de 14 puntos aprobados; 4 requieren corrección.** No se declara aceptación completa ni versión congelada.

Producto publicado: `6b33b4fe3664fa5f00321933999691edd2b52456`, imagen `75d16a8f783956bfd3c3cf17d803e9a68774573cc861656e88320c02d3305705`, esquema 0009–0010. Codex operó el navegador por excepción explícita de Jorge; AGY Gemini revisó independientemente las respuestas guardadas. **No hubo cambios de aplicación, nuevos despliegues ni pagos live.**

Microsoft Edge real sin interfaz visible: escritorio 1440×1100 y vista móvil emulada 390×844. Esto no representa un celular físico. Se crearon cuatro invitaciones por tipo y una Comida adicional para el pago, con datos ficticios. Las anteriores y las de los probadores se conservaron.

## Matriz de los 14 puntos

Los nombres numerados corresponden al ZIP local `fiestapay-qa-20261028.zip`. Las marcas se refieren a la evidencia observada, no a que un archivo o un test local exista.

| Nº | Resultado | Prueba y resultado observado | Captura / evidencia |
|---|---|---|---|
| 01 | ✅ | Comida, En Casa, Viaje y Evento se publican. Solo Comida muestra su selector; textos de entrada correctos por tipo. Evento conserva actividad y expositor. | 01a–01d, 04 por tipo; fixtures-public.json |
| 02 | ✅ | Resumen antes de publicar, organizador, fechas y precio visibles. Las fechas sugeridas se identifican antes de confirmar. El panel conserva el estado pendiente del organizador; pagar no lo cambia. | 02, 02b, 03, 11b |
| 03 | ✅ | «Ir al panel» abre /e/slug/admin. API de panel e historial: clave válida 200; invitado y clave errónea 403. PUT válido sin clave o con clave errónea: 403. | 03; evidence.json |
| 04 | ✅ | Inicio y fin visibles en las cuatro invitaciones y en el panel; ambos están en el borrador. | 04 por tipo, 11b/11c, 05 |
| 05 | ❌ | El enlace conserva Unicode correcto y ambas horas, pero la vista previa real de WhatsApp convierte los tres emojis en «�», en escritorio y móvil emulado. No se envió ningún mensaje. | 05-whatsapp-borrador-mobile.png; 05-whatsapp-borrador.txt |
| 06 | ✅ | Invitado nuevo sin respuesta seleccionada; «Tal vez» no está marcado. «Unirme a comer / en casa / al viaje / al evento» según el tipo. | 06-07; cuatro vistas 04; registro de controles |
| 07 | ✅ | Invitado sin tabla de comisiones, neto ni reembolsos. Se ve «Pago pendiente» antes de capturar y «Pagado» después. | 06-07, 08c, 09c, 10b |
| 08 | ✅ | Botón amarillo: USD50 capturados y verificados automáticamente, respuesta del servidor en 4028ms desde aprobación. | 08a–08c; ledger |
| 09 | ✅ | Otra pestaña: conciliación explícita disponible, «Verificando captura con el servidor…» y captura verificada en 2363ms. Un registro de captura. **Automatismo al volver no acreditado en headless**; se aprobó la alternativa de aviso + Verificar. | 09, 09a–09c; ledger |
| 10 | ✅ | Nora pasa de 2 a 3 personas: total75, abonado50, saldo25. Se captura solo25; saldo final0. | 10a/10b; ledger |
| 11 | ✅ | Panel: USD125, dos invitados y cinco personas pagadas, sin pendiente. Tres órdenes y exactamente una fila de captura por orden. | 11b/11c; 08-10-payment-ledger.json |
| 12 | ❌ | Texto invitado: 11/12 respuestas correctas; falta explicar Protección al Comprador cuando se pregunta junto con credenciales. En voz se repite la omisión y falta explicar devolución por mínimo. Un turno caducó sin respuesta final. | 12h, 12g; 12-13-chat-responses.json y voice-responses.json |
| 13 | ❌ | Texto organizador: 11/12; explica qué cambia al confirmar pero no cuándo puede hacerlo. Voz repite la omisión y rechaza una consulta válida sobre mínimo. Últimas dos consultas de voz no ejecutadas tras429 por reserva aún vigente. | 13h, 13f, 13g; respuestas y revisión AGY |
| 14 | ❌ | 16 selecciones de tema y cuatro vistas previas funcionan y persisten. Sin embargo, rótulos de12px tienen contraste2,61–2,72:1, inferior a4,5:1, en las cuatro variantes publicadas. | 14 por tipo; 14-contrast.json |

## Pagos de esta campaña

Todo es USD ficticio en PayPal sandbox. El pago acredita al Business único; no hay retención, liberación posterior ni Payouts.

| Recorrido | Orden PayPal | Captura | Centavos | Filas de captura |
|---|---|---|---:|---:|
| Amarillo | 6WX03765GY104952A | 3VL85236CE745973D | 5000 | 1 |
| Pestaña externa | 0M3892971X5696405 | 8B726614E36326832 | 5000 | 1 |
| Diferencia | 0RF21260236962122 | 4PB12920F5996540D | 2500 | 1 |

Consulta de solo lectura al PostgreSQL del VPS: tres filas, suma12500, cero devoluciones en estas órdenes. Repetir la captura de la primera orden con origen válido devolvió paid/5000 y no agregó otra fila. Una petición sin Origin se rechazó403; no fue un fallo de idempotencia. La fixture inicial abandonada antes de crear orden conserva cero órdenes.

Tras ambas inyecciones de texto y las pruebas de voz: confirmado=false, cerrado=false, cuota2500, recaudado12500, tres pagos; Nora7500/saldo0 y Leo5000/saldo0. No se confirmaron propuestas de asistencia ni acciones financieras desde la IA.

## Cómo reproducir los fallos y qué se esperaba

**F05 — WhatsApp, P1.** Desde un panel, abrir Compartir en WhatsApp, sin enviar. Se esperaban calendario, ubicación y dinero legibles. El parámetro text decodificado conserva 📅 📍 💵, pero el DOM real del sitio de WhatsApp contiene U+FFFD y no esos emojis. La causa en la vista previa externa no está confirmada; no recomendar doble codificación sin probar el cliente real. Captura05 y texto guardado separan entrada correcta de resultado visible incorrecto. El envío en la aplicación real queda pendiente.

**F12 — Protección y devolución, P1.** Preguntar al invitado «¿Quién ve mi tarjeta y contraseña al pagar? ¿Qué protección tengo?». Explica credenciales, pero omite Protección al Comprador sujeta a elegibilidad y condiciones de PayPal. Ocurre en texto y voz. En voz «¿Qué ocurre con mi pago si no alcanzamos el mínimo?» solo responde que el evento no se realizará; debía explicar la devolución automática según el plazo configurado. Capturas12h/12g y respuestas completas guardadas; no nuevas preguntas para repetir la evidencia.

**F13 — Confirmación y consulta válida, P1.** Preguntar al organizador «¿Cuándo puedo confirmar la realización y qué cambia al hacerlo?». Omite el requisito de mínimo y la facultad del organizador, aunque explica que confirmar no mueve dinero. Por voz «¿Qué pasa si no alcanzamos el mínimo a tiempo?» se transcribió como «mínimo de tiempo» y fue rechazada como ajena al evento. La variación de ASR se documenta; falta una respuesta robusta a esta consulta sobre el evento. Capturas13h/13f. No se clasifica como pérdida de fondos: el motor de pago no cambió.

**F14 — Contraste, P1.** Abrir las invitaciones publicadas y medir «INICIO Y FIN»: texto rgb(126,144,163),12px, peso600. Contra los fondos realmente renderizados se midió Comida/Huerto2,711; Casa/Jardín2,719; Viaje/Ciudad2,656; Evento/Noche2,608. Debía ser≥4,5. Las pruebas previas de pares del catálogo no acreditan estos rótulos concretos. Capturas14 y valores JSON.

## Alcance de las conversaciones y límites

- 24 solicitudes reales a endpoints de texto; todas respondieron200. AGY aprobó22 y rechazó2 por respuestas incompletas. Mediana y máximo se guardan en el resumen JSON. No se conoce el número exacto de llamadas a OpenAI: algunas respuestas podrían ser políticas del servidor y no hay marcador por turno. AGY retiró su inferencia inicial de17 llamadas.
- Voz: 22 preguntas intentadas; revisión AGY:17 respuestas correctas,4 incompletas/incorrectas y1 turno sin respuesta final por agotarse120s. Dos preguntas del organizador quedaron sin ejecutar.
- Siete reservas exitosas de120s:840s reservados, **no tiempo facturado medido**. La octava petición devolvió429 «Ya tienes una sesión de voz reservada». Se detuvo sin reintentar ni cambiar de sesión para eludirla. Es una guarda de concurrencia, no evidencia de indisponibilidad de AssemblyAI.
- Entrada sintética local Microsoft Zira en-US leyendo español, por un MediaStream instrumentado; WebSocket, servicio, herramientas y respuestas reales. Algunas transcripciones son parciales o fonéticas. Los aciertos se refieren a respuestas observadas, no a una tasa fiable de reconocimiento del español.
- Detener dejó cero pistas de micrófono vivas y cero fuentes pendientes en los casos observados. La primera sesión también caducó a120s. No se activó el micrófono físico; no se acredita audio de celular, ruido, auriculares, ausencia perceptual de cortes ni inicio completo en hardware.
- La emulación headless no acreditó el foco/regreso automático de PayPal. Se verificó la alternativa de botón explícito con progreso. No se repiten las capturas para resolver esta limitación.

## Paquete y siguiente paso

ZIP local: output/playwright/fiestapay-qa-20261028.zip, con capturas numeradas, esta matriz, respuestas, mediciones, referencias y manifiesto SHA-256. Los enlaces/QR de administración se enmascararon; sin contraseñas, cookies, perfiles, trazas o tokens del proveedor.

No se cambió código para conseguir resultados verdes. Fuente416pruebas +11adversariales, lint/tipos/build y CI ya aceptados antes de esta ronda; se reutiliza esa evidencia, sin presentarla como ejecución nueva.

Corregir F05/F12/F13/F14 antes de congelar. Los paquetes de construcción B/C agotaron3entregas; Claude MCP no está expuesto. La excepción vigente autorizó solamente QA de Codex. La siguiente corrección requiere recuperación conforme a dirigir-agentes o una excepción humana acotada, con nueva revisión AGY. Los presupuestos externos están cerrados:3capturas/125USD y24texto usados; ocho reservas solicitadas, siete otorgadas. No renovar topes al despertar.

Continúan pendientes los celulares de3–5personas hasta29oct20:00, completar los casos de voz pendientes bajo autorización nueva, validar el cliente WhatsApp real sin enviar, ensayo/video90s, paquete de jueces en inglés y Devpost. La prueba actual no acredita video, envío ni aceptación final.
