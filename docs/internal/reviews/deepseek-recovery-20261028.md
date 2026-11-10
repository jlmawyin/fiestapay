# Primera entrega real de DeepSeek — 28 octubre 2026

Esta entrada conserva la primera revisión. La [fuente final fue aprobada](recovery-source-final-20261028.md) tras tres entregas; la conexión MCP nativa ya está disponible. La publicación y sus pruebas se registran por separado.

El MCP existente completó una entrega de FiestaPay por stdio. Las herramientas nativas DSH todavía no aparecen en este chat. La [prueba inicial del puente](deepseek-bridge-20261028.md) sigue válida: conexión JSON/LSP, respuesta real, continuidad, escritura y 13 aserciones independientes. `low` se solicita mediante la capa de configuración comprobada; no se midieron tokens internos ni se comparó contra `high`.

Jorge autorizó expresamente recuperar F05/F12/F13/F14 con DSH y revisión AGY, conservando los contadores históricos agotados. DSH entregó el intento 1/3 de esta recuperación. Diez archivos de fuente/pruebas coinciden con los hashes declarados. No hubo commits, publicación ni llamadas reales de FiestaPay.

El constructor informó que Vitest y la compilación web se bloquearon con `spawn EPERM`, y que su solicitud de escalada fue denegada. No se forzaron permisos desde Codex ni se inició una segunda entrega. Esto limita la ejecución de pruebas en ese entorno; no invalida la conexión MCP ni demuestra que la aplicación no compile.

AGY verificó independientemente bajo sus permisos ordinarios, sin reparar producto. Resultado: **CHANGES_REQUIRED**, intento 1/3.

| Comprobación independiente | Resultado |
|---|---|
| Lint, tipos y compilación completa | Aprobados |
| Suite focalizada | 22 pruebas aprobadas |
| Suite completa con PostgreSQL local | 424 aprobadas, 1 fallida |
| Casos adversariales adicionales | 17 aprobados; 3 hallazgos |
| Contraste renderizado en Edge | 16 temáticas, mínimo 5,297:1 |
| Capturas de fixtures locales | 8, escritorio y móvil emulado |

Los tres hallazgos son concretos:

1. La prueba nueva en `role-assistants.test.ts:659` espera una llamada al modelo, pero la respuesta determinista intercepta el mensaje. Accede a un elemento inexistente y falla.
2. La herramienta de lectura del invitado no entrega fecha límite, estado de financiamiento ni reembolsos. El nuevo texto de voz necesita esos datos para responder con fundamento.
3. La guía asocia inscripciones cerradas con falta de confirmación, pero el dominio y el panel permiten confirmar cuando se cumplen las condiciones de financiamiento. La suposición inicial del encargo de Codex debe corregirse.

Las etiquetas Horario/Lugar/Cuota conservan el texto generado de WhatsApp sin alterar Unicode válido del usuario. La vista previa externa puede seguir sustituyendo emojis suplementarios del usuario: no es una aceptación universal de WhatsApp ni una prueba en su aplicación nativa.

Fuente pública `6b33b4f`, esquema 9–10 y matriz publicada 10/14 permanecen intactos. La ampliación autorizada de cuatro turnos de texto y dos reservas de voz de 120 segundos sigue sin usarse; cero pagos adicionales. La fuente candidata no está aprobada ni publicada.

AGY empleó 540136 tokens de entrada, 59218 de salida, 24890 de razonamiento y 6840725 de caché leída; total comunicado 599354 sin sumar de nuevo la caché. Cuota Gemini posterior: 96% de cinco horas y 61,4% semanal. El 4,8% agregado pertenece a Claude/GPT, detenido; no a Gemini. DSH no expone consumo ni saldo, por lo que no se inventan.

Siguiente: aclarar el bloqueo de ejecución DSH sin forzar permisos; continuar la misma recuperación y sesión solo cuando corresponda, corregir los tres hallazgos y obtener revisión independiente antes de publicar. La habilidad `dirigir-agentes` exige detener ante errores de permisos. No se creó una continuación por cuota ni se reiniciaron contadores.
