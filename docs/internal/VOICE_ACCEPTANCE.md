# Prueba de voz desde móvil — aceptación pendiente

**Estado al 27 de octubre: pendiente de ejecución humana.** La cola integrada tiene 18 pruebas de reproducción/sesión y cuatro comprobaciones de interfaz con audio simulado, aprobadas independientemente. El WebSocket automático con audio y herramienta de lectura tiene evidencia previa; ninguna de esas pruebas sustituye escuchar el resultado en un celular. Usar la demo pública y un alias ficticio. No hace falta repetir la captura PayPal ya acreditada para aceptar la reproducción de audio. Véase la [revisión de integración](reviews/voice-integration-20261026.md).

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
| 3 | Mientras suena una respuesta, preguntar «¿Ya está pagado?» | El audio en curso termina completo y el siguiente espera en cola, sin superponerse; el estado consultado sigue pendiente si no hay captura verificada | Pendiente |

En cada intento medir: tiempo desde pulsar iniciar hasta el saludo; tiempo desde terminar de hablar hasta oír la respuesta; reconexiones/errores; duración real. No inventar latencias a partir del número de fragmentos de audio. Guardar solo notas y evidencia autorizada, sin grabar a personas sin su consentimiento.

## Recuperación y pago

- Denegar micrófono en una sesión separada: debe explicar el problema y permitir seguir por chat/formulario.
- Pulsar **Detener** durante la reproducción: debe detener el audio y el micrófono, vaciar la cola y descartar respuestas tardías. Es distinto de recibir otro mensaje, que debe esperar su turno sin cortar el audio.
- Cortar la conexión y cerrar el panel: no debe continuar el micrófono, reproducir respuestas antiguas ni aplicar una acción tardía. Reconectar y consultar el estado antes de reintentar.
- Comprobar que la cotización exige confirmación en pantalla y que consultar el pago informa el estado del servidor. La captura de USD50 y su conciliación ya tienen [evidencia separada](reviews/sandbox-evidence.md); este protocolo de audio no exige un nuevo cobro.
- Una nueva petición de voz puede ser rechazada temporalmente por la reserva anterior; no confundir este límite con un fallo del micrófono.

## Registro

Fecha y revisión: pendiente. Dispositivo/navegador: pendiente. Tres intentos: pendientes. Latencias y créditos: pendientes. Captura sandbox: evidencia previa conservada, sin nueva operación en esta prueba. Responsable de prueba humana: Jorge; resultado pendiente.

Registrar resultados en ESTADO.md. Si falla, conservar el error concreto y la hipótesis antes de otro ciclo; máximo tres entregas evaluadas por problema. La grabación del hackathon solo mostrará comportamientos verificados.
