# Cola de voz: revisión independiente

25 octubre 2026. GROK intento 3/3; AGY revisión 2/3. Los hashes de los tres archivos coinciden con el informe del constructor. El resultado funcional es favorable, con una corrección de lint pendiente en `playback.ts:121` que bloquea el control de calidad completo. Se solicitó a Jorge una excepción puntual para que Codex integre esa línea, porque los tres intentos de construcción están evaluados y la recuperación Claude no tiene puente conectado. No se ha aplicado esa excepción sin respuesta.

AGY reprodujo 18 pruebas de voz existentes y añadió un arnés local con cuatro comprobaciones: indicador de habla hasta terminar la cola, aviso único de desbordamiento, aviso de fallo al reproducir y cancelación completa al detener. Total: 22 pruebas aprobadas; tipos correctos. El arnés usa navegador simulado, AudioContext y WebSocket ficticios.

La reproducción mantiene el inicio completo y encola respuestas; un nuevo mensaje o detección de voz no corta lo que suena. La cola tiene un límite de 90 segundos, con aviso y salida a texto si no puede aceptar más audio. El micrófono, la cola y los callbacks se limpian al detener. Esto no acredita audio real en celular; sigue pendiente la prueba humana con Safari/Chrome móvil.

Artefactos ignorados: `.local/voice-review-2.md`, `.local/voice-repro.test.tsx`, `.local/voice-repro.config.ts`. Uso de revisión: 151 677 tokens de entrada y 25 070 de salida. No hubo llamadas al proveedor de voz ni gasto de sus créditos en esta revisión.
