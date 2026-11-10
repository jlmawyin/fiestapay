# Auditoría de Solo Lectura de FiestaPay para el Jurado del Hackathon de PayPal
**Fecha:** 8 de noviembre de 2026  
**Commit de Producción:** `2865332` (main) | **Imagen:** `1e1f261d`  
**Directorio auditado:** `<repo>`  
**Destino de entrega:** Jurado del Hackathon de PayPal (Cierre Devpost: 12 nov 2026, 15:00 ECT)  
**Modalidad:** Inspección de solo lectura sin alteración de código ni base de datos de producción.

---

## 1. Webhook de PayPal: Verificación de Firma, Idempotencia y Resiliencia

### 1.1 Recepción y Validación de Firma Criptográfica
- **Ruta y Endpoint:** `POST /api/paypal/webhook` registrado en [`apps/api/src/routes/payments.ts:105-225`](file:///apps/api/src/routes/payments.ts#L105-L225) bajo el prefijo `/api` (`app.ts:155, 162`).
- **Exención de Origen / CSRF:** En [`apps/api/src/app.ts:106`](file:///apps/api/src/app.ts#L106), las peticiones dirigidas a `WEBHOOK_PATH = '/api/paypal/webhook'` se eximen explícitamente de la validación del encabezado `Origin`/`Referer`, permitiendo el tráfico servidor a servidor de PayPal.
- **Preservación del Payload Exacto (`rawBody`):** En [`apps/api/src/app.ts:69-81`](file:///apps/api/src/app.ts#L69-L81), el parser `application/json` guarda el cuerpo crudo como cadena UTF-8 en `req.rawBody` antes del parseo JSON. PayPal firma los bytes exactos recibidos; re-serializar el JSON invalidaría la firma.
- **Extracción y Límites de Encabezados:** En [`apps/api/src/routes/payments.ts:29-35, 117-124`](file:///apps/api/src/routes/payments.ts#L29-L35):
  - `paypal-transmission-id` (máximo 200 caracteres)
  - `paypal-transmission-time` (máximo 200 caracteres)
  - `paypal-transmission-sig` (máximo 500 caracteres; necesario para firmas RSA-2048 en Base64 de 344 caracteres)
  - `paypal-cert-url` (máximo 500 caracteres)
  - `paypal-auth-algo` (máximo 200 caracteres)
- **Validación del Certificado:** En [`apps/api/src/paypal/client.ts:224-230`](file:///apps/api/src/paypal/client.ts#L224-L230), `certUrl` debe ser una URL válida, protocolo `https:` y el host debe coincidir estrictamente con el patrón `/(^|\.)paypal\.com$/`, impidiendo ataques de certificados foráneos o SSRF.
- **Verificación contra la API Oficial de PayPal:** En [`apps/api/src/paypal/client.ts:234-250`](file:///apps/api/src/paypal/client.ts#L234-L250), se invoca `POST /v1/notifications/verify-webhook-signature` enviando:
  ```json
  {
    "auth_algo": "...",
    "cert_url": "https://api.sandbox.paypal.com/...",
    "transmission_id": "...",
    "transmission_sig": "...",
    "transmission_time": "...",
    "webhook_id": "<PAYPAL_WEBHOOK_ID>",
    "webhook_event": <req.rawBody>
  }
  ```
  La firma se considera válida exclusivamente si `result.verification_status === 'SUCCESS'`.
- **Comportamiento ante Firma Inválida:** En [`apps/api/src/routes/payments.ts:125-128`](file:///apps/api/src/routes/payments.ts#L125-L128), si `verified === false`, se emite un log de advertencia (`req.log.warn('webhook con firma invalida')`) y se responde de inmediato con **HTTP 400** `{ "error": "Firma de webhook invalida" }`. No se procesa la carga ni se altera el estado de la base de datos.

---

### 1.2 Idempotencia en Capas y Manejo de Reintentos

FiestaPay implementa una arquitectura de cuatro capas para garantizar que ningún pago o reembolso se registre dos veces:

1. **Capa 1: Deduplicación Rápida (`webhook_events`):**
   - Tabla: `webhook_events (id text PRIMARY KEY, event_type text, received_at timestamptz)` en [`apps/api/src/db/migrations/0001_init.sql:117-121`](file:///apps/api/src/db/migrations/0001_init.sql#L117-L121).
   - En [`apps/api/src/routes/payments.ts:135-136`](file:///apps/api/src/routes/payments.ts#L135-L136):
     ```sql
     SELECT id FROM webhook_events WHERE id = $1
     ```
     Si el `webhookId` ya fue procesado, responde inmediatamente `{ ok: true, duplicate: true }` con HTTP 200.
   - **Registro al Final:** La inserción en `webhook_events` ocurre únicamente *después* de que el evento se aplicó exitosamente o se descartó de forma permanente ([`routes/payments.ts:219-222`](file:///apps/api/src/routes/payments.ts#L219-L222)):
     ```sql
     INSERT INTO webhook_events (id, event_type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING
     ```
2. **Capa 2: Manejo de Reintentos de PayPal (HTTP 503 + Retry-After):**
   - Si una captura o reembolso llega antes de que la orden local se haya confirmado o antes de que PayPal publique la captura (`outcome.kind === 'retry'`), el endpoint responde **HTTP 503** con `Retry-After: 60` ([`routes/payments.ts:208-215`](file:///apps/api/src/routes/payments.ts#L208-L215)).
   - **Decisión de Diseño Crítica:** Al retornar 503, la fila **NO** se escribe en `webhook_events`. Esto fuerza a PayPal a redespachar la notificación según su calendario exponencial de reintentos, evitando la pérdida de pagos o reembolsos en tránsito.
3. **Capa 3: Libro Mayor Inmutable (`payment_ledger`):**
   - Tabla: `payment_ledger` cuenta con restricción de unicidad:
     ```sql
     UNIQUE (kind, external_id)
     ```
     en [`apps/api/src/db/migrations/0001_init.sql:91-103`](file:///apps/api/src/db/migrations/0001_init.sql#L91-L103).
   - En [`apps/api/src/domain/payments.ts:106-113`](file:///apps/api/src/domain/payments.ts#L106-L113) (`convergeCapture`):
     ```sql
     INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id, created_at)
       VALUES ($1, $2, $3, $4, 'capture', $5, $6, $6, $7::timestamptz)
     ON CONFLICT (kind, external_id) DO NOTHING
     RETURNING id
     ```
     Si la captura ya había sido insertada (por ejemplo, mediante la llamada síncrona del navegador `/orders/:orderId/capture`), `inserted.rows.length === 0`, marcando la operación como duplicada inocua (`duplicate: true`) sin duplicar fondos.
4. **Capa 4: Bloqueo Serializado Transaccional y Reclamación Durable:**
   - La convergencia de pagos ([`apps/api/src/domain/payments.ts:88-97`](file:///apps/api/src/domain/payments.ts#L88-L97)) se ejecuta dentro de una transacción PostgreSQL con orden de bloqueo estricto:
     1. `lockEvent(client, order.event_id)` (`SELECT ... FOR UPDATE`)
     2. `lockGuest(client, order.guest_id)` (`SELECT ... FOR UPDATE`)
     3. `lockOrder(client, order.id)` (`SELECT ... FOR UPDATE`)
   - Este orden determinista elimina cualquier riesgo de *deadlock* entre el webhook y el cliente.
   - En [`apps/api/src/db/migrations/0003_payment_state.sql:34-36`](file:///apps/api/src/db/migrations/0003_payment_state.sql#L34-L36), el índice `orders_one_open_per_guest` (`WHERE status IN ('intent','created','approved','capturing')`) impide que un invitado abra una segunda obligación mientras una captura está en vuelo.
   - **Verificación Autoritativa:** FiestaPay jamás confía en los importes enviados en el cuerpo del webhook. En [`routes/payments.ts:148-155`](file:///apps/api/src/routes/payments.ts#L148-L155) y [`domain/payments.ts:77-81`](file:///apps/api/src/domain/payments.ts#L77-L81), el backend consulta directamente la API REST de PayPal (`paypal.getOrder(paypalOrderId)`) y valida que el comercio receptor (`payee.merchant_id`), el `custom_id`, la moneda y el monto coincidan con los de la orden en la base de datos ([`paypal/verify.ts:42-78`](file:///apps/api/src/paypal/verify.ts#L42-L78)).

---

### 1.3 Señalamiento de Huecos Reales Detectados

1. **Hueco 1: Extracción rígida de `relatedOrderId` en `PAYMENT.CAPTURE.COMPLETED`**
   - *Ubicación:* [`apps/api/src/routes/payments.ts:139, 174-175`](file:///apps/api/src/routes/payments.ts#L139)
   - *Detalle:* El código extrae el ID de la orden únicamente de:
     `body.resource?.supplementary_data?.related_ids?.order_id`.
     Si PayPal llegase a omitir `supplementary_data` en alguna entrega de webhook pero enviase `resource.custom_id` (el cual FiestaPay almacena con el `order.id` en [`paypal/client.ts:149`](file:///apps/api/src/paypal/client.ts#L149)), el webhook evalúa `paypalOrderId` como nulo y retorna `retry` (HTTP 503) indefinidamente en lugar de resolver la orden por su ID interno.
   - *Mitigación sugerida:* En `routes/payments.ts:139`, hacer fallback:
     ```ts
     const relatedOrderId = asString(body.resource?.supplementary_data?.related_ids?.order_id) 
       ?? asString(body.resource?.custom_id);
     ```

2. **Hueco 2: Órdenes retenidas en estado `capturing` tras `PAYMENT.CAPTURE.DECLINED`**
   - *Ubicación:* [`apps/api/src/routes/payments.ts:176-184`](file:///apps/api/src/routes/payments.ts#L176-L184) y [`apps/api/src/domain/orders.ts:420-430`](file:///apps/api/src/domain/orders.ts#L420-L430)
   - *Detalle:* Cuando PayPal rechaza una captura (`PAYMENT.CAPTURE.DECLINED`), el webhook registra una auditoría `payment_capture_declined` y finaliza con `done()`. Sin embargo, no actualiza `orders.status = 'failed'`. Debido al índice único `orders_one_open_per_guest`, el invitado queda bloqueado sin poder intentar pagar con otro medio o generar una nueva cotización hasta que el estado sea resuelto manualmente.
   - *Mitigación sugerida:* Permitir la transición segura a `'failed'` si la orden se encontraba en `'capturing'` y PayPal confirmó el declinado definitivo sin capturas previas.

---

## 2. Modelo de Conciliación «Quién le debe a quién»

### 2.1 Descripción del Modelo Real de FiestaPay
FiestaPay **no es una aplicación de división de gastos cruzados P2P** (como Splitwise o Tricount). No existen deudas multilaterales entre participantes (ej. "Juan le debe a Pedro y Pedro a María").

El modelo de FiestaPay responde a la siguiente arquitectura financiera:
- **Cuota fija por persona (`price_cents`):** Cada evento establece un precio unitario obligatorio almacenado en centavos enteros de USD ([`0001_init.sql:26`](file:///apps/api/src/db/migrations/0001_init.sql#L26)).
- **Un único receptor de fondos:** Todos los pagos van dirigidos exclusivamente a la cuenta PayPal Sandbox configurada para el evento (`payee_merchant_id` en [`orders.ts:154`](file:///apps/api/src/domain/orders.ts#L154)). Ningún participante transfiere fondos a otro.
- **Obligación por grupo de invitado:**
  - Cada invitado registra su asistencia (`yes`, `maybe`, `no`) y el número de acompañantes (`companions`).
  - Total de personas = `1 + companions` (si `status === 'yes'`).
  - Obligación total en centavos:
    $$\text{obligationCents} = \begin{cases} \text{price\_cents} \times (1 + \text{companions}) & \text{si } status = \text{'yes'} \\ 0 & \text{en otro caso} \end{cases}$$
    ([`apps/api/src/domain/read.ts:190-191`](file:///apps/api/src/domain/read.ts#L190-L191)).
- **Saldos individuales (`paidCents` y `dueCents`):**
  - `paidCents`: Suma neta de capturas confirmadas menos reembolsos aplicados al invitado en `payment_ledger`.
  - `dueCents`: $\max(0, \text{obligationCents} - \text{paidCents})$ ([`apps/api/src/domain/read.ts:252`](file:///apps/api/src/domain/read.ts#L252)).

### 2.2 Dónde se Calcula (SQL vs Cliente)
- **Cálculo en SQL (Servidor):**
  - **Saldo por invitado:** [`apps/api/src/domain/dashboard.ts:18-27`](file:///apps/api/src/domain/dashboard.ts#L18-L27) ejecuta un `LEFT JOIN` agrupado por invitado:
    ```sql
    SELECT g.id, g.event_id, g.session_id, g.name, g.status, g.companions, g.obligation_version,
           COALESCE(SUM(CASE WHEN l.kind = 'capture' THEN l.amount_cents ELSE -l.amount_cents END), 0) AS paid
      FROM guests g
      LEFT JOIN payment_ledger l ON l.guest_id = g.id
     WHERE g.event_id = $1
     GROUP BY g.id
     ORDER BY g.created_at ASC
    ```
  - **Neto pagado individual:** [`apps/api/src/domain/read.ts:181-188`](file:///apps/api/src/domain/read.ts#L181-L188) (`guestPaidCents`):
    ```sql
    SELECT COALESCE(SUM(CASE WHEN kind = 'capture' THEN amount_cents ELSE -amount_cents END), 0) AS paid
      FROM payment_ledger WHERE guest_id = $1
    ```
  - **Métricas globales del evento:** [`apps/api/src/domain/read.ts:130-178`](file:///apps/api/src/domain/read.ts#L130-L178) (`eventTotals`) calcula en una sola consulta SQL agregada:
    - `collected`: Total recaudado neto en `payment_ledger`.
    - `people`: Total de personas confirmadas ($\sum 1 + companions$ con `status = 'yes'`).
    - `paid_people`: Número de asistentes cubiertos por pagos completos.
    - `pending` / `needs_review`: Obligaciones pendientes de reembolso en `funding_refund_tasks`.
- **Cálculo en el Cliente:**
  - En el frontend ([`apps/web/src/components/dashboard/GuestGrid.tsx:126-140`](file:///apps/web/src/components/dashboard/GuestGrid.tsx#L126-L140)), AG Grid se limita a presentar pasivamente los campos `paidCents` y `dueCents` calculados y entregados por la API.
  - El frontend **no realiza ningún cálculo financiero, suma ni agregación de saldos**.
- **¿Aplica minimizar transferencias cruzadas?**
  **NO aplica.** Dado que no existen deudas entre comensales ni fondo común descentralizado, no existe un grafo de deudas que simplificar. Cualquier propuesta de algoritmo de transferencias cruzadas (tipo ciclo de pagos o reducción de aristas) es ajena a la arquitectura de FiestaPay.
- **¿Debería alguna agregación del cliente pasar a SQL?**
  Todas las agregaciones financieras ya residen al 100% en SQL. El único cómputo en cliente es cosmético: `const parties = guests.filter((g) => !g.removedAt).length` en [`apps/web/src/views/OrganizerDashboardView.tsx:321`](file:///apps/web/src/views/OrganizerDashboardView.tsx#L321) para mostrar la cantidad de grupos no removidos.

---

## 3. Seguridad de Secretos y Resiliencia en Errores

### 3.1 Auditoría de Secretos y Variables de Entorno
Se ejecutó un barrido exhaustivo mediante expresiones regulares sobre todos los archivos versionados reportados por `git ls-files` buscando patrones de claves reales:
- Patrones evaluados: `sk-[a-zA-Z0-9]{20,}`, `Bearer\s+[a-zA-Z0-9_\-\.]{25,}`, `PAYPAL_CLIENT_SECRET\s*=\s*[^\s]+`, `OPENAI_API_KEY\s*=\s*[^\s]+`, `ASSEMBLYAI_API_KEY\s*=\s*[^\s]+`, contraseñas SMTP.
- **Resultado:** **0 coincidencias de credenciales activas o filtradas.**
- **Archivos `.env`:** El repositorio únicamente versiona `.env.example` con marcadores vacíos o valores genéricos locales ([`.env.example:6-15`](file:///apps/api/src/.env.example#L6-L15)).
- **Frontend y Paquetes (`apps/web/**`, `packages/**`):**
  - No importan `process.env` ni `import.meta.env` con claves secretas.
  - La única referencia a `process.env` es `process.env.TZ` en un test de zona horaria ([`apps/web/src/__tests__/funding-timezone.test.tsx:9`](file:///apps/web/src/__tests__/funding-timezone.test.tsx#L9)).
- **Exposición Pública Normalizada:**
  - El endpoint `GET /api/capabilities` ([`apps/api/src/routes/core.ts:60-68`](file:///apps/api/src/routes/core.ts#L60-L68)) expone públicamente `paypalClientId: config.paypal?.clientId ?? null`. Esto es el comportamiento estándar y requerido para inicializar el SDK de JavaScript de PayPal en el navegador del comprador.
  - El endpoint `GET /api/demo/buyer` ([`apps/api/src/routes/core.ts:74-85`](file:///apps/api/src/routes/core.ts#L74-L85)) devuelve credenciales de un comprador ficticio Personal Sandbox únicamente cuando `isSandboxPayPalBaseUrl(config.paypal.baseUrl)` es verdadero. `PAYPAL_CLIENT_SECRET` nunca se expone.

---

### 3.2 Manejo de Errores y Timeouts Existentes
1. **Manejador Global (`apps/api/src/app.ts:119-130`):**
   - Todos los errores no controlados con código $\ge 500$ registran el error internamente y devuelven al cliente:
     `{ "error": "Error interno del servidor" }` con HTTP 500, sin filtrar nombres de clases, credenciales ni volcados de pila.
2. **Timeouts en Servicios Externos:**
   - **PayPal:** `timeoutMs: 12000` (12 segundos) definido en [`apps/api/src/config.ts:151`](file:///apps/api/src/config.ts#L151). Se aplica mediante `AbortSignal.timeout(this.config.timeoutMs)` en [`paypal/client.ts:63`](file:///apps/api/src/paypal/client.ts#L63).
   - **OpenAI:** `timeoutMs: 20000` (20 segundos) en [`apps/api/src/config.ts:247`](file:///apps/api/src/config.ts#L247) vía `AbortSignal.timeout(config.timeoutMs)` en [`ai/openai.ts:294`](file:///apps/api/src/ai/openai.ts#L294). Si expira, genera `HttpError(503, 'El asistente no respondio a tiempo; usa los formularios de la pagina')`.
   - **Respaldo a Reglas en Sugerencias:** En [`apps/api/src/ai/suggest-presentation.ts:131-143`](file:///apps/api/src/ai/suggest-presentation.ts#L131-L143), si OpenAI falla o agota el tiempo, la función captura el error silenciosamente y retorna `rulesSuggestion(input)` (`source: 'rules'`), garantizando que la creación de eventos nunca se detenga.
   - **Interfaz de Chat:** [`apps/web/src/components/chat/PublicChatAssistant.tsx:40-44, 348`](file:///apps/web/src/components/chat/PublicChatAssistant.tsx#L40-L44) captura el HTTP 503 y muestra un mensaje amigable con botón de reintento (`submitQuestion(failedQuestion, true)`).

---

### 3.3 Propuesta de Ajuste Mínimo para Latencia/Caídas durante la Demo
Sin rehacer lo que ya funciona, se proponen tres ajustes mínimos:
1. **Reducción de `OPENAI_TIMEOUT_MS` para la Demo:**
   - Cambiar en el entorno de demo/producción `OPENAI_TIMEOUT_MS=8000` (8 segundos en lugar de 20 segundos). En una evaluación de 3 minutos por los jueces, esperar 20 segundos por una respuesta fallida congela la experiencia.
   - En [`apps/api/src/ai/suggest-presentation.ts:127`](file:///apps/api/src/ai/suggest-presentation.ts#L127), agregar un timeout específico de 4 segundos (`AbortSignal.timeout(4000)`). Si la IA no responde en 4s, se entrega de inmediato la sugerencia heurística por reglas (`rulesSuggestion`), que tarda < 1 ms.
2. **Hook de Medición de Latencia en Fastify:**
   - Agregar en [`apps/api/src/app.ts`](file:///apps/api/src/app.ts) un hook ligero `onResponse`:
     ```ts
     app.addHook('onResponse', async (req, reply) => {
       const durationMs = reply.elapsedTime;
       if (durationMs > 3000) {
         req.log.warn({ url: req.url, durationMs }, 'solicitud lenta detectada');
       }
     });
     ```
3. **Interruptor de Circuito Ligero en Memoria para IA:**
   - Un contador simple en memoria en `apps/api/src/ai/openai.ts`: si ocurren 3 fallos consecutivos de OpenAI (5xx o timeout), entrar en un período de enfriamiento de 45 segundos donde las rutas de chat retornen 503 de inmediato o activen el formulario sin congelar peticiones entrantes.

---

## 4. Métricas de IA y Log Técnico para el Jurado

### 4.1 Estado Actual de Almacenamiento
- **`ai_requests` ([`0004_ai_budget.sql`](file:///apps/api/src/db/migrations/0004_ai_budget.sql), [`0012_public_chat_budget.sql`](file:///apps/api/src/db/migrations/0012_public_chat_budget.sql)):**
  Solo almacena `(id bigserial, session_id uuid, event_id uuid NULL, created_at timestamptz)`. Su única función es limitar la cuota a 200 peticiones globales/día y 60 por sesión ([`ai/budget.ts:12-18`](file:///apps/api/src/ai/budget.ts#L12-L18)).
- **`voice_leases` ([`0002_voice.sql`](file:///apps/api/src/db/migrations/0002_voice.sql), [`0011_voice_lifecycle.sql`](file:///apps/api/src/db/migrations/0011_voice_lifecycle.sql)):**
  Rastrea reservas de tiempo de voz `(reserved_seconds, expires_at, audience, activity_at, released_at, release_reason)`.
- **`chat_messages` ([`0001_init.sql:124-132`](file:///apps/api/src/db/migrations/0001_init.sql#L124-L132)):**
  Almacena el historial conversacional (`role`, `parts jsonb`).
- **Lo que NO se almacena hoy:**
  - Latencia de la llamada al modelo en milisegundos.
  - Nombre del modelo (`gpt-6-luna`).
  - Tokens de entrada (`prompt_tokens`) y salida (`completion_tokens`) reportados en `usage`.
  - Resultado (`ok`, `fallback`, `timeout`, `error`).
  - Ruta de API que originó la solicitud.

---

### 4.2 Propuesta Concreta de Telemetría (Requiere Migración)
**¿Requiere migración de base de datos?** **SÍ.**  
Se propone crear la migración `apps/api/src/db/migrations/0013_ai_telemetry.sql`:

```sql
-- 0013_ai_telemetry.sql: Registro técnico de métricas de IA sin PII ni contenido de usuario
CREATE TABLE ai_metrics (
  id           bigserial PRIMARY KEY,
  event_id     uuid REFERENCES events(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES sessions(id),
  route        text NOT NULL CHECK (route IN ('guest_chat', 'organizer_chat', 'suggest_presentation', 'public_chat', 'voice_turn')),
  model        text NOT NULL,
  latency_ms   integer NOT NULL CHECK (latency_ms >= 0),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  outcome      text NOT NULL CHECK (outcome IN ('ok', 'fallback', 'timeout', 'error')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_metrics_event_idx ON ai_metrics (event_id, created_at DESC);
CREATE INDEX ai_metrics_day_idx ON ai_metrics (created_at DESC);
```

**Puntos Clave de Privacidad y Rendimiento:**
- **Zero Content / Zero PII:** No guarda textos de usuario, mensajes del modelo, nombres ni teléfonos. Cumple estrictamente con las directrices de privacidad del hackathon.
- **Captura de `usage`:** En [`apps/api/src/ai/openai.ts:258-265`](file:///apps/api/src/ai/openai.ts#L258-L265), extraer el objeto `usage: { prompt_tokens, completion_tokens }` devuelto por la API de OpenAI Responses e insertarlo asíncronamente en `ai_metrics`.

### 4.3 Endpoint y Vista de Log Técnico
- **Endpoint:** `GET /api/events/:slug/ai-metrics`
  - Autorización: Requiere `assertAdminKey(event, presentedKey)`.
  - Respuesta JSON:
    ```json
    {
      "summary": {
        "totalRequests": 48,
        "avgLatencyMs": 1150,
        "p95LatencyMs": 2300,
        "totalInputTokens": 18450,
        "totalOutputTokens": 4920,
        "outcomes": { "ok": 46, "fallback": 2, "timeout": 0, "error": 0 }
      },
      "recentLogs": [
        {
          "timestamp": "2026-11-08T13:40:00Z",
          "route": "organizer_chat",
          "model": "gpt-6-luna",
          "latencyMs": 980,
          "inputTokens": 420,
          "outputTokens": 85,
          "outcome": "ok"
        }
      ]
    }
    ```
- **Vista en el Frontend:** Una tarjeta o pestaña «Observabilidad IA» en `OrganizerDashboardView` con tarjetas de KPI (Latencia Media, Tokens, % Éxito), demostrando a los jueces nivel de ingeniería de producción.

---

## 5. Experiencia de Demo Viva para los Jueces

### 5.1 Qué ven hoy los jueces en `/demo`
- En [`apps/web/src/views/JudgePreviewView.tsx:45-56`](file:///apps/web/src/views/JudgePreviewView.tsx#L45-L56), se despliega una cuadrícula AG Grid con un fixture estático en memoria de 10 filas fijas (`SAMPLE_GUESTS`: Ana Ficticia, Bruno Ejemplo, Carla Muestra, etc.).
- Si el juez hace clic en «Crear demo privada», el backend invoca `createDemoEvent` ([`apps/api/src/domain/events.ts:238-246`](file:///apps/api/src/domain/events.ts#L238-L246)), generando un evento con `is_demo = true` en la base de datos.
- **Limitación actual:** Dicho evento se crea **completamente vacío** ($0 recaudados, 0 confirmados, sin invitados). Para ver datos en el panel, el juez debe unirse manualmente como invitado y completar un ciclo de pago Sandbox.

---

### 5.2 Propuesta de Fiestas Simuladas Pre-sembradas
Se proponen 3 fiestas simuladas representativas:
1. **«Asado del Domingo» (Plantilla `comida`, Tema `asado`):**
   - Cuota: $20.00 | Meta: $160.00 | Mínimo: $80.00
   - Estado: 6 invitados (4 pagados, 1 con pago parcial por acompañante, 1 pendiente).
2. **«Cumpleaños de Sofía» (Plantilla `casa`, Tema `cumpleanos`):**
   - Cuota: $15.00 | Meta: $150.00 | Mínimo: $60.00
   - Estado: 5 invitados (3 pagados, 2 confirmados sin pago).
3. **«Escapada a la Playa» (Plantilla `viaje`, Tema `playa`):**
   - Cuota: $50.00 | Meta: $300.00 | Mínimo: $200.00
   - Estado: 4 invitados (2 pagados, 2 tal vez).

---

### 5.3 Comparativa: Estático en Frontend vs Semilla en BD (`is_demo = true`)
- **Opción A: Estático en Frontend (sin BD):**
  - *Ventajas:* Inmune a errores de BD; cero escritura.
  - *Desventajas:* Es puramente cosmético. Si el juez hace clic en «Abrir Asistente IA» para preguntar "¿Quién me debe todavía?" o intenta interactuar con el panel, fallará o no tendrá contexto real en el servidor.
- **Opción B: Semilla en BD con `is_demo = true` (Recomendada):**
  - *Ventajas:*
    - Al ingresar a `/demo`, o al presionar «Explorar fiesta de prueba», la API genera el evento y siembra 4 a 6 invitados en `guests` con entradas en `payment_ledger` (con `external_id = 'demo_seed_...'`).
    - El juez abre el panel y ve de inmediato métricas reales, el progreso hacia el mínimo, y puede interactuar con el Asistente de IA (que consulta la BD con sus herramientas autorizadas).
  - *Seguridad en Producción:*
    - Cada evento demo está aislado al `organizer_session_id` de la cookie del juez.
    - La columna `is_demo = true` ya existe en la tabla `events` ([`0001_init.sql`](file:///apps/api/src/db/migrations/0001_init.sql)).
    - El mecanismo [`resetDemo`](file:///apps/api/src/domain/events.ts#L253-L272) ya archiva exclusivamente los eventos marcados con `is_demo = true` de esa sesión, sin tocar eventos reales.
    - Las entradas en `payment_ledger` no tocan cuentas bancarias ni dinero real de PayPal.

**Recomendación:** Implementar la **Opción B (Semilla en BD)**, manteniendo el fixture estático actual de 10 filas únicamente como preview instantáneo de carga cero.

---

## 6. Inventario de Iconos y Plan de Rediseño de Portadas

### 6.1 Inventario Actual de Emojis y SVGs

#### A. Emojis y Caracteres Unicode Utilizados como Iconos
| Emoji / Carácter | Archivo y Línea de Ejemplo | Uso Actual | Reemplazo con `lucide-react` |
| :--- | :--- | :--- | :--- |
| `🌐` | [`apps/web/src/i18n/LanguageSelector.tsx:20`](file:///apps/web/src/i18n/LanguageSelector.tsx#L20) | Selector de idioma (ES/EN) | `<Globe size={18} />` |
| `🎉` | [`apps/web/src/views/LandingView.tsx:210`](file:///apps/web/src/views/LandingView.tsx#L210) | Título y bienvenida en landing | `<PartyPopper size={24} />` |
| `✓` | [`apps/web/src/views/PublicInviteView.tsx:563`](file:///apps/web/src/views/PublicInviteView.tsx#L563) | Lista de qué incluye / Confirmaciones | `<Check size={16} />` |
| `✨` | [`apps/web/src/views/CreateEventView.tsx`](file:///apps/web/src/views/CreateEventView.tsx) | Botón «Sugerir con IA» | `<Sparkles size={16} />` |
| `🔍` | [`apps/web/src/components/invite/PayPalSection.tsx`](file:///apps/web/src/components/invite/PayPalSection.tsx) | Botón «Verificar Estado» | `<Search size={16} />` |
| `📲` | [`apps/web/src/views/OrganizerDashboardView.tsx`](file:///apps/web/src/views/OrganizerDashboardView.tsx) | Botón de código QR | `<QrCode size={16} />` |
| `🧾` | [`apps/web/src/components/chat/ChatAssistant.tsx`](file:///apps/web/src/components/chat/ChatAssistant.tsx) | Tarjeta de propuesta de cotización | `<Receipt size={18} />` |
| `📋` | [`apps/web/src/components/chat/ChatAssistant.tsx`](file:///apps/web/src/components/chat/ChatAssistant.tsx) | Tarjeta de propuesta de asistencia | `<ClipboardList size={18} />` |
| `🔒` | Modales y recuperación | Indicador de evento privado / clave | `<Lock size={16} />` |
| `💬` | Orbe y botones de chat | Asistente conversacional | `<MessageSquare size={18} />` |

#### B. Inventario de Portadas SVG
Existen 5 componentes SVG en [`apps/web/src/components/illustrations/`](file:///apps/web/src/components/illustrations/):
1. `ComidaCover.tsx`: Ilustración con paellera amarilla, pan, botella de vino y humo trazados con círculos y elipses planas.
2. `CasaCover.tsx`: Ilustración de sala con sofá, ventana y lámpara geométrica plana.
3. `ViajeCover.tsx`: Ilustración de maleta, montañas y sol geométrico.
4. `EventoCover.tsx`: Ilustración con copas brindando, confeti y guirnaldas.
5. `GatheringTable.tsx`: SVG de mesa compartida usado en la landing.

*Diagnóstico:* Las portadas actuales utilizan primitivas geométricas básicas sin profundidad, texturas ni jerarquía tipográfica, proyectando una estética de "dibujo escolar" que desmerece la robustez técnica del backend.

---

### 6.2 Plan de Iconos: Adopción de `lucide-react`
- **Justificación:** La librería `lucide-react` es el estándar moderno en aplicaciones FinTech (Next.js, shadcn/ui). Ocupa < 15 KB con tree-shaking, garantiza renderizado idéntico en Windows/macOS/iOS/Android y elimina la inconsistencia visual de los emojis del sistema operativo.
- **Instalación e Integración (Post-aprobación):**
  - Dependencia autorizada explícitamente por el pedido de Jorge.
  - Creación de un catálogo unificado de iconos en `apps/web/src/components/common/Icon.tsx` para evitar importaciones dispersas y mantener consistencia de trazo (`strokeWidth={2}`).

---

### 6.3 Opciones para Portadas Atractivas

#### Opción (a): Rediseño SVG Moderno por Tema (Abstracto / Mesh Gradients / FinTech Style)
- **Concepto:** Portadas vectoriales abstractas basadas en degradados sutiles (mesh gradients), cuadrículas isométricas translúcidas, ondas fluidas y acentos geométricos refinados en la paleta de FiestaPay (Terracota, Turquesa, Amarillo Dorado y Azul Noche).
- **Costo:** $0 USD.
- **Licencia:** 100% propia / Código abierto del proyecto.
- **Ventajas:** Carga inmediata (0 bytes de red externa), resolución infinita en pantallas Retina/4K, soporte nativo de variables CSS (`accent`, `theme`) y cero dependencia de hosting externo.

#### Opción (b): Fotografías Curadas con Licencia Libre (Unsplash / Pexels / CC0)
- **Concepto:** Fotos de alta resolución de reuniones reales (un asado gourmet al aire libre, amigos brindando en una terraza, cena íntima en casa).
- **Costo:** $0 USD (Unsplash / Pexels license para uso comercial sin atribución obligatoria).
- **Ventajas:** Transmite calidez humana inmediata.
- **Desventajas:** Peso adicional en el bundle (~150 KB por WebP) y posibles recortes poco estéticos en pantallas móviles verticales.

#### Opción (c): Ilustraciones 3D/Editorial Generadas una sola vez con IA
- **Concepto:** Generar offline 4 a 8 portadas con estilo *3D isometric clay / modern editorial papercraft* mediante Midjourney v6, DALL-E 3 o Flux 1.1 Pro. Las imágenes se comprimen a WebP (< 80 KB cada una) y se sirven como recursos estáticos en `apps/web/public/covers/`.
- **Costo:** < $0.50 USD en API de OpenAI (DALL-E 3 cuesta ~$0.040 por imagen estándar de 1024x1024), o $0 si se utiliza una suscripción existente de Midjourney/ChatGPT Plus.
- **Licencia:** Comercial completa según los términos vigentes de OpenAI y Midjourney.
- **Ventajas:** Estilo visual único, premium y adaptado exactamente a la temática de FiestaPay. Cero latencia en tiempo de ejecución porque son archivos estáticos.

---

### 6.4 Recomendación Priorizada para la Entrega del 12 de Noviembre

1. **Prioridad 1 (Inmediata y Segura):** Implementar **`lucide-react`** para erradicar todos los emojis de botones y encabezados, combinada con la **Opción (a)** (rediseño SVG abstracto moderno con degradados y acentos por tema).
   - *Razón:* No requiere aprobaciones de gasto, no depende de activos binarios externos, garantiza carga instantánea para los jueces y moderniza la interfaz en 24 horas.
2. **Prioridad 2 (Mejora Visual Opcional si Jorge lo autoriza):** Generar offline las 4 portadas maestras en WebP mediante **Opción (c)** (IA DALL-E 3/Midjourney) y colocarlas en `apps/web/public/covers/`, manteniendo los SVGs como fallback si una imagen no carga.

---

## 7. Matriz de Recomendaciones y Plan de Acción

| Área | Acción Priorizada | Impacto Técnico | Complejidad | Requiere Migración |
| :--- | :--- | :--- | :---: | :---: |
| **Webhooks** | Agregar fallback a `custom_id` en `PAYMENT.CAPTURE.COMPLETED` y resolver desbloqueo en `DECLINED`. | Alto (Resiliencia de pagos) | Baja | No |
| **Secretos** | Mantener configuración actual (verificada limpia). Reducir `OPENAI_TIMEOUT_MS` a 8s. | Alto (Experiencia de demo) | Mínima (Config) | No |
| **Métricas IA** | Crear tabla `ai_metrics` y endpoint `GET /api/events/:slug/ai-metrics` con log técnico agregado. | Muy Alto (Diferenciador ante jueces) | Media | **SÍ (`0013`)** |
| **Demo Viva** | Sembrar 2–3 fiestas simuladas en BD con `is_demo = true` aisladas por sesión al invocar `/demo`. | Muy Alto (Impacto visual inicial) | Media | No |
| **Iconos** | Sustituir emojis por `lucide-react` en componentes clave (`Header`, `Create`, `Dashboard`, `Chat`). | Alto (Aspecto profesional) | Baja | No |
| **Portadas** | Reemplazar SVGs planos actuales por diseños abstractos con degradados modernos (Opción a). | Medio (FinTech branding) | Baja | No |

---
*Informe generado para el equipo de dirección y jurado de PayPal.*  
*Fin de la auditoría de solo lectura.*
