# Prueba de voz desde móvil — hito 16 octubre

**Estado: pendiente de ejecución humana.** El WebSocket automático con audio y herramienta de lectura ya está verificado; no sustituye esta prueba. Usar la demo pública, un alias ficticio y PayPal sandbox. No introducir datos personales ni tarjetas reales.

## Preparación

1. Anotar revisión desplegada, móvil, sistema, navegador y tipo de conexión. Abrir una demo nueva de Comida y entrar con un alias ficticio.
2. Confirmar asistencia de titular y un acompañante mediante el formulario. Comprobar dos asistentes y cuota total USD 50.
3. Abrir **Hablar**, leer el aviso de procesamiento de audio y aceptar únicamente si se desea participar. Permitir el micrófono desde el navegador.
4. Tomar el saldo/créditos de AssemblyAI antes y después desde su panel privado, sin guardar claves o capturas con datos de cuenta en Git. Reservar 120 segundos en el servidor no significa haber consumido 120 segundos facturados.

## Tres intentos consecutivos

Cada intento es una conversación nueva, con un máximo de dos minutos. La reserva de voz caduca hasta 60 segundos después de ese máximo; esperar su vencimiento antes de iniciar otra desde la misma sesión. No reiniciar cookies para saltar límites.

| Intento | Acción hablada | Resultado que debe observarse | Resultado real |
|---|---|---|---|
| 1 | «¿Qué incluye el almuerzo y a qué hora empieza?» | Respuesta audible con inclusiones y horario del evento; herramienta de lectura completada, sin inventar datos | Pendiente |
| 2 | «Voy con una persona, ¿cuánto pagamos?» | Herramienta del servidor devuelve dos personas por USD 25, total USD 50; pide revisar/confirmar en pantalla, no crea una orden por voz | Pendiente |
| 3 | Interrumpir una respuesta y preguntar «¿Ya está pagado?» | Deja de reproducir la respuesta interrumpida y consulta el estado; informa pendiente si no hay captura verificada | Pendiente |

En cada intento medir: tiempo desde pulsar iniciar hasta el saludo; tiempo desde terminar de hablar hasta oír la respuesta; reconexiones/errores; duración real. No inventar latencias a partir del número de fragmentos de audio. Guardar solo notas y evidencia autorizada, sin grabar a personas sin su consentimiento.

## Recuperación y pago

- Denegar micrófono en una sesión separada: debe explicar el problema y permitir seguir por chat/formulario.
- Cortar la conexión y cerrar el panel: no debe continuar el micrófono, reproducir respuestas antiguas ni aplicar una acción tardía. Reconectar y consultar el estado antes de reintentar.
- Confirmar la cotización desde la interfaz y abrir checkout. La aprobación corresponde a un comprador Personal sandbox. Verificar la captura en el servidor antes de declarar el pago completo.
- Una nueva petición de voz puede ser rechazada temporalmente por la reserva anterior; no confundir este límite con un fallo del micrófono.

## Registro

Fecha y revisión: pendiente. Dispositivo/navegador: pendiente. Tres intentos: pendientes. Latencias y créditos: pendientes. Captura sandbox: pendiente. Responsable de prueba humana: pendiente.

Registrar resultados en ESTADO.md. Si falla, conservar el error concreto y la hipótesis antes de otro ciclo; máximo tres entregas evaluadas por problema. La grabación del hackathon solo mostrará comportamientos verificados.
