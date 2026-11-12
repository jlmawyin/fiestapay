# Mejoras de volumen y ruta de audio del agente de voz (11 de noviembre de 2026)

## Diagnóstico

1. **Margen dinámico nativo de Gemini Live (`gemini-3.8-live`):** El flujo PCM16 de 24 kHz generado por las voces `Kore` (español) y `Puck` (inglés) entrega sílabas conversacionales con picos típicos entre `-16 dBFS` y `-12 dBFS` (`0.15` a `0.25` en coma flotante). La cola de reproducción anterior (`PlaybackQueue`) copiaba esas muestras con ganancia unitaria (`1.0x`), sin normalización por fragmento ni compresión dinámica.
2. **Modo de comunicación en Android Chrome (`MODE_IN_COMMUNICATION`):** Al abrir `navigator.mediaDevices.getUserMedia` con `echoCancellation: true` y `noiseSuppression: true` en Android Chrome, el sistema operativo conmuta el canal de audio al modo de llamada telefónica (mostrando el icono de llamada en el control físico de volumen) y atenúa la salida de Web Audio (`AudioContext.destination`).

## Mejoras implementadas

1. **Procesamiento de sonoridad y ganancia en `PlaybackQueue` (`apps/web/src/voice/playback.ts`):**
   - **Normalización adaptativa por fragmento (AGC) + ganancia de presencia (`DEFAULT_PLAYBACK_GAIN = 2.2`):** `boostVoiceSamples` eleva automáticamente los fragmentos de voz con pico bajo hacia un objetivo de `0.88` (`AGC_TARGET_PEAK`) respetando el piso de silencio (`AGC_NOISE_FLOOR = 0.008`), con tope de seguridad de `3.6x`.
   - **Limitador suave (`softClipSample`):** Aplica compresión de rodilla suave por encima de `0.80` (`SOFT_CLIP_KNEE`) con techo duro en `0.98` (`SOFT_CLIP_CEILING`), evitando distorsión o recorte digital en sílabas fuertes.
   - **Cadena Web Audio (`DynamicsCompressorNode` → `GainNode` → `destination`):** Cuando el navegador expone `createDynamicsCompressor` y `createGain`, la cola conecta un compresor vocal (`threshold: -18 dB`, `knee: 12 dB`, `ratio: 3:1`, `attack: 3 ms`, `release: 160 ms`) seguido de un nodo de ganancia ajustable en vivo (`setGain`).
2. **Selector de volumen en vivo en el panel de voz (`apps/web/src/components/voice/VoiceInvitationAgent.tsx` y `apps/web/src/i18n/messages/voice.ts`):**
   - Selector bilingüe (`Volumen voz` / `Voice volume`) con tres niveles: **Normal (1x)** (`1.3`), **Alto (2x)** (`2.2`, predeterminado) y **Máx (3x)** (`3.2`).
   - El ajuste se aplica de inmediato a la sesión activa (`playbackRef.current?.setGain`) y se recuerda en `localStorage` (`fp_voice_gain`).
3. **Ruta multimedia en Android Chrome y aislamiento acústico anti-eco en todas las plataformas (`apps/web/src/components/voice/VoiceInvitationAgent.tsx`):**
   - En Android Chrome (`useAndroidMediaAudio`), el micrófono se solicita sin efectos de llamada (`echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`) para que el sistema mantenga la salida en el canal multimedia (`STREAM_MUSIC`) y responda al control de volumen multimedia.
   - En **todas las plataformas** (Android y escritorio), mientras el asistente reproduce audio (`replyAudioPending()`) y durante una cola acústica de `650 ms` (`SPEAKER_ECHO_TAIL_MS`, más la latencia de salida `outputLatency`/`baseLatency` reportada por `AudioContext`) al terminar cada respuesta, la captura del micrófono se bloquea, limpia el buffer pendiente del `AudioWorklet` (`postMessage('clear')`) y reinicia el remuestreador (`resampler.reset()`). Esto evita que la última palabra del altavoz potenciado (por ejemplo, `«...para continuar, di siguiente»`) sea captada por el micrófono y provoque que el agente se responda solo.
   - Se eliminó el helper experimental `apps/web/src/voice/android-speakerphone.ts` que reabría `getUserMedia` buscando un dispositivo `Speakerphone`.
4. **Encapsulado de instrucción de saludo inicial (`kickoff`) y disciplina de una sola voz (`apps/web/src/voice/gemini-live.ts`, `apps/api/src/ai/program-guide.ts`, `apps/api/src/routes/voice.ts`):**
   - **Causa corregida del diálogo a dos voces en el arranque:** Anteriormente, `sendKickoff(text)` enviaba el texto literal del saludo (`«¡Hola! Soy el agente de FiestaPay. Cuéntame tu fiesta en una frase y la armo... ¿Qué celebramos?»`) directamente como un turno con `role: 'user'`. Al recibir esa pregunta como si viniera del usuario, `gemini-3.8-live` interpretaba que debía actuar como usuario pidiendo una fiesta (con su voz femenina `Kore`) y luego responderse a sí mismo como agente con una segunda voz masculina.
   - `formatKickoffTurn(text)` envuelve el saludo en una instrucción explícita de inicio para que el modelo pronuncie únicamente esa frase exacta con su única voz de asistente y se detenga en silencio esperando a que la persona hable, prohibiendo responder a su propia pregunta, inventar fiestas, llamar herramientas en el saludo o alternar voces.
   - Además, se reforzó `channelStyle('voice')` en `program-guide.ts` y la regla `DEMO_TOUR` en `routes/voice.ts` para prohibir diálogos simulados entre dos voces, prohibir decir `«siguiente»` por cuenta propia y exigir esperar en silencio la respuesta de la persona en cada paso del recorrido guiado.

## Verificación

- Pruebas unitarias en `apps/web/src/__tests__/voice.test.ts` (ganancia, AGC, limitador suave sin superar `0.98` y actualización en vivo con `setGain`), `apps/web/src/__tests__/voice-session.test.tsx` (solicitud de micrófono sin procesamiento en Android Chrome y con procesamiento fuera de Android) y `apps/web/src/__tests__/voice-gemini.test.tsx` (`formatKickoffTurn`, selector de volumen y bloqueo del eco del altavoz durante la reproducción y la cola de `650 ms` antes de volver a escuchar).
- `npm run check` completo en verde: ESLint, TypeScript (`@fiestapay/shared`, `@fiestapay/api`, `@fiestapay/web`), pruebas unitarias y build de producción.

## 5. Prellenado 100 % completo en el asistente con IA (`apps/api/src/ai/draft-event.ts`, `apps/web/src/components/events/CreateWizard.tsx`)

- **Servidor (`completeDraftProposal` + `instructionFor` en `apps/api/src/ai/draft-event.ts`):**
  - El prompt del asistente instruye a Gemini (`gemini-3.5-flash`) a proponer valores completos y coherentes para todos los campos (`template`, `title`, `meal`, `date`, `startTime`, `durationMinutes`, `location`, `includes`, `headcount`, `budgetCents`) cuando la frase del organizador omite alguno.
  - Además, `completeDraftProposal` garantiza en llamadas reales que ningún campo quede vacío: completa fecha sugerida (próximo sábado futuro en `America/Guayaquil`), horario acorde al tipo de comida/encuentro, duración, lugar descriptivo según la ocasión, de 3 a 4 elementos incluidos en la cuota, cupo estimado, cuota por persona y presupuesto total, marcándolos en `suggested`.
- **Cliente (`applyDraftProposal` y `enrichWizardExtrasForProposal` en `CreateWizard.tsx` y `apps/web/src/lib/invitation-blueprints.ts`):**
  - Al aplicar un borrador completo de IA o una invitación de referencia, el asistente rellena automáticamente `organizerName` (`Comité Organizador` / `Anfitrión del Evento`), `description` (texto cálido y específico según la ocasión), `agenda` (para eventos con 3 hitos horarios) y `theme` (acorde al diseño visual inferido), de modo que el Paso 6 (`Revisar y publicar`) nunca deje filas en `«Sin nombre público»`, `«Aún no hay descripción para invitados»`, `«Aún sin definir»` ni `«Aún no hay nada incluido»`.

## 6. Base de invitaciones de referencia y tarjetas de invitación conmemorativas (`apps/web/src/lib/invitation-blueprints.ts`, `apps/web/src/components/invite/SignatureInvitationCard.tsx`, `apps/web/src/views/PublicInviteView.tsx`)

- **Base de 4 invitaciones de referencia listas con un clic en `/create` (`INVITATION_REFERENCES`):**
  1. **🎓 Reencuentro de Promoción (Álbum):** Inspirada en reencuentros de promoción (estilo azul marino y dorado con marcos Polaroid de recuerdos, almuerzo buffet, brindis de honor y recuerdo conmemorativo).
  2. **✨ Cena de Compañeros (Gala Esmeralda):** Inspirada en reuniones anuales de compañeros y asociaciones (fondo verde bosque esmeralda, doble filete dorado, emblema superior y grilla 2×2 en líneas finas doradas).
  3. **📜 Amigos de Toda la Vida (Pergamino):** Edición clásica sobre papel pergamino cálido con tinta sepia, sello conmemorativo y divisores ornamentales con rombo `◆`.
  4. **🔥 Parrillada y Cumpleaños (Festiva):** Diseño moderno y cálido para cumpleaños, parrilladas y reuniones de amigos.
- **Tarjeta de invitación en vivo (`<SignatureInvitationCard />`):**
  - Se muestra en vivo en el Paso 5 (`Presentación y portada`), en el Paso 6 (`Revisar y publicar`) y en la vista pública del invitado (`PublicInviteView.tsx`), alimentada dinámicamente con todo lo que el usuario ha planificado (`title`, `organizerName`, `description`, `location`, `startsAt`, `endsAt`, `priceCents`, `capacity`, `includes`, `meal`, `agenda`, `deadlineLocal`) y con selector interactivo entre los 4 estilos (`Álbum del reencuentro`, `Gala Esmeralda`, `Pergamino Clásico`, `Celebración Festiva`) persistido en `event.theme` sin migraciones SQL.
