# FiestaPay — cierre de la revalidación, 29 octubre 2026

**12 de14 puntos aceptados;2 parcialmente verificados, pendientes de voz.** No se declara aceptación completa ni freeze. [FiestaPay](https://fiestapay.somospanas.com/) mantiene fuente `8e13ae61b06e5463c3438a70736b09da3146a50c`, imagen `5d411c2403399ba21d5a0f8bfbf092ce6e1cf5b83db19ae98e146af1a045b0f7` y esquema0009–0010. SSH de solo lectura confirmó esa fuente/imagen en ejecución al cerrar. [CI40810663990](https://github.com/jlmawyin/fiestapay/actions/runs/40810663990) corresponde a esa fuente.

La ronda original del28oct se conserva como historia:10puntos aceptados y4hallazgos. La recuperación autorizada corrigió WhatsApp, guía IA y contraste. DSH3/3 y AGY3/3 terminaron aprobados con426pruebas,0omisiones, lint/tipos/build y26comprobaciones independientes. Se reutiliza esa evidencia, sin presentarla como nuevas pruebas. La excepción humana permitió que Codex operara el navegador y no autorizó nuevas modificaciones de aplicación durante esta revalidación.

## Matriz de14puntos

H=historia aceptada del28oct, preservada en historico/; R=evidencia de la versión corregida, en revalidacion/. Las capturas muestran las interfaces observadas; los JSON guardan las respuestas completas. No todas las capturas contienen el último mensaje del chat.

| Nº | Estado | Resultado y procedencia |
|---|---|---|
|01|Aceptado, H|Cuatro plantillas, campos y textos por tipo. Se conserva la prueba anterior; no se crearon fiestas nuevas para repetirla.|
|02|Aceptado, H+R|Revisión antes de publicar y organizador/fecha/precio. El evento de prueba sigue sin confirmar tras los pagos y consultas: confirmed=false.|
|03|Aceptado, H|Panel accesible al organizador; invitado y clave incorrecta403. Se conservan pruebas de API y navegación; no se publican claves ni QR privados.|
|04|Aceptado, H+R|Inicio/fin visibles. La invitación actual muestra3nov13:00–17:00ECT; el borrador externo conserva ambos.|
|05|Aceptado con límite externo, R|La vista previa real de WhatsApp muestra Horario/Lugar/Cuota legibles, sin U+FFFD en el texto generado, con enlace público. No se envió mensaje. Emojis suplementarios introducidos por el usuario y cliente WhatsApp nativo siguen pendientes. R04 y whatsapp-result.json.|
|06|Aceptado, H|Invitado nuevo sin RSVP preseleccionado y acción por tipo. No se vuelve a crear identidad para repetirlo.|
|07|Aceptado, H+R|Invitado sin desglose de comisiones/neto ni panel financiero. La sesión Nora conserva pagado75USD, tres personas y diferencia0; R07 y final-readonly-state.json.|
|08|Aceptado, H|Botón amarillo: captura sandbox50USD verificada por servidor,4028ms desde aprobación y una fila de captura. No se repitió el pago.|
|09|Aceptado con alternativa, H|Pestaña externa: aviso+Verificar concilia50USD en2363ms. El regreso automático por foco no quedó acreditado en navegador sin interfaz visible. No se repitió el pago.|
|10|Aceptado, H|De2a3personas se captura solo la diferencia25USD; saldo0. Se conserva el registro financiero original.|
|11|Aceptado, H+R|125USD, cinco personas pagadas, tres capturas históricas. GET posterior conserva12500centavos, mínimo5000, meta10000, confirmed=false y closed=false.|
|12|Parcial, R|Texto del invitado: privacidad y Protección al Comprador elegible/condicionada, y explicación de devolución por mínimo respondidas completamente por UI/HTTP200. Una pregunta de privacidad/protección por voz tiene respuesta final correcta guardada en JSON. La pregunta de mínimo/devolución por voz no se ejecutó; R05 muestra el panel ya cerrado y no acredita esa respuesta por sí sola.|
|13|Parcial, R|Texto del organizador: cuándo confirmar, efecto sin mover dinero y mínimo respondidos completamente por UI/HTTP200. En voz se inyectaron dos preguntas una vez, pero el recolector no probó correlación de respuesta final: pudo tomar reply.done previo a una continuación de herramienta. Una observación aún muestra el saludo mientras procesa la pregunta. R06 muestra transcripción abreviada y respuesta sobre mínimo ya alcanzado; no prueba explicación completa del supuesto. No se aprueba ni se atribuye un defecto de producto solo a esta evidencia incompleta.|
|14|Aceptado, R+local|Rótulos corregidos:16temáticas locales con contraste mínimo5,297:1 y8capturas independientes reutilizadas por hashes. En Comida/Huerto publicada se midió rgb(74,93,115) sobre rgb(228,237,212):5,593:1,12px/600. R07 y live-contrast.json. No se afirma haber vuelto a medir las16en producción.|

## Dinero y estado

Los pagos históricos de la campaña son50+50+25=125USD ficticios. No hubo nuevos pagos, reembolsos, confirmaciones del evento, envíos SMTP ni mensajes de WhatsApp durante la recuperación/revalidación. CAPTURE acredita al Business sandbox; confirmar la reunión no retiene/libera fondos ni ejecuta Payouts. Protección al Comprador depende de elegibilidad y términos de PayPal.

GET de solo lectura al cierre: cinco personas confirmadas/pagadas, mínimo alcanzado, evento sin confirmar, inscripciones abiertas. Reembolsos registrados/pendientes/en revisión:0. La prueba no ejecuta el caso real de devolución automática por mínimo ni acredita nuevos reembolsos.

El respaldo de publicación se copió fuera del VPS y del worktree, con ACL limitada a Jorge/SYSTEM:185864bytes y SHA256 `317f26f6abaf4deec6478554cbcd2b4313360616916470073dbbedced617901b`. Solo se copió el respaldo existente; no se creó otro ni se restauró una base antigua. El dump y los perfiles privados no se incluyen en este paquete.

## Consumo y límites de la voz

Campaña original cerrada:3capturas/125USD,24turnos de texto,7reservas exitosas/840s; una solicitud adicional429 sin reserva se detuvo. La ampliación humana separada ya está cerrada: **4/4turnos de texto,2/2reservas de120s,0pagos**. Cero capacidad restante para llamadas de esta ronda. Las cuatro solicitudes de texto se enviaron desde la UI y devolvieron200; el número de inferencias/tokens internos de OpenAI no está expuesto.

La entrada de voz fue Microsoft Zira en-US leyendo español en un MediaStream instrumentado. WebSocket/servicio/respuestas son reales; no hubo micrófono físico. Una reserva del invitado cubrió una pregunta; la última del organizador inyectó las dos previstas. Ambas acabaron con cero pistas de micrófono vivas. Audio observado en AudioContext running y fuentes finalizadas; esto no prueba percepción humana, habla española nativa ni ausencia de cortes en teléfono.

El operador del organizador lanzó el trabajo asíncrono y luego produjo un error de referencia al guardar su promesa; se inspeccionaron contadores/estado y se siguió el mismo trabajo sin relanzar ni crear otra reserva. Se conservan sus capturas/flags iniciales y una evaluación posterior **inconclusa**. completed=true del recolector no significa aceptación: puede corresponder a un evento intermedio. No se cambió el producto ni se amplió el presupuesto para obtener un resultado verde.

## Paquete y pendiente

ZIP: `output/playwright/fiestapay-revalidacion-20261029.zip`, con evidencia histórica claramente separada,7capturas nuevas inspeccionadas, respuestas, mediciones y manifiesto SHA256. Secretos, .env, cookies, perfiles, HAR, respaldos y credenciales quedan fuera.

Falta verificar por voz, con correlación final fiable, la consulta de mínimo del invitado y las dos del organizador; comprobar español y audio en teléfono físico; recibir pruebas humanas de3–5personas que Jorge convoca; validar el cliente WhatsApp real; preparar ensayo/video90s e instrucciones de jueces/Devpost. No se afirma prueba humana, video ni envío. No hay otro reintento automático: el presupuesto externo de esta ronda se agotó y los contadores históricos de construcción permanecen cerrados.
