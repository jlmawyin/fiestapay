# Revisión de evidencia sandbox — 16 octubre 2026

Revisor: Claude (Opus, high), independiente de la prueba externa. Estas consultas todavía no acreditan una captura: deben ejecutarse después del checkout.

Leí AGENTS.md, docs/API.md, `routes/payments.ts`, `domain/orders.ts`, `domain/payments.ts`, `domain/dashboard.ts`, `paypal/verify.ts`, `db/migrations/0001_init.sql` (y 0002/0003, necesarios porque 0001 no contiene `capturing`). Solo lectura; no toqué nada.

## 1. Consultas (solo SELECT, parametrizadas)

**A. Captura única de 5000 y ausencia de doble contabilización** — `$1` = slug
```sql
SELECT o.id AS order_id, o.status, o.amount_cents,
       count(l.id) FILTER (WHERE l.kind='capture')            AS filas_captura,
       count(DISTINCT l.capture_id) FILTER (WHERE l.kind='capture') AS capturas_distintas,
       coalesce(sum(l.amount_cents) FILTER (WHERE l.kind='capture'),0) AS capturado_cents,
       coalesce(sum(l.amount_cents) FILTER (WHERE l.kind='refund'),0)  AS reembolsado_cents
  FROM orders o JOIN events e ON e.id=o.event_id
  LEFT JOIN payment_ledger l ON l.order_id=o.id
 WHERE e.slug=$1 GROUP BY o.id, o.status, o.amount_cents;
```
Esperado: **una** fila `status='paid'`, `amount_cents=5000`, `filas_captura=1`, `capturas_distintas=1`, `capturado_cents=5000`, `reembolsado_cents=0`. Reintentos no deben cambiar estos números (idempotencia viene de `UNIQUE (kind, external_id)`, 0001_init.sql:109).

**B. Dos asistentes y saldo 0** (replica `toGuestWithPrice`, read.ts:150-161)
```sql
SELECT g.id AS guest_id, g.status, g.companions, 1+g.companions AS personas,
       e.price_cents*(1+g.companions) AS obligacion_cents,
       coalesce(sum(CASE WHEN l.kind='capture' THEN l.amount_cents ELSE -l.amount_cents END),0) AS pagado_neto,
       greatest(0, e.price_cents*(1+g.companions)
         - coalesce(sum(CASE WHEN l.kind='capture' THEN l.amount_cents ELSE -l.amount_cents END),0)) AS saldo_cents
  FROM events e JOIN guests g ON g.event_id=e.id
  LEFT JOIN payment_ledger l ON l.guest_id=g.id
 WHERE e.slug=$1 AND g.status='yes'
 GROUP BY g.id, g.status, g.companions, e.price_cents;
```
Esperado: `personas=2`, `obligacion_cents=5000`, `pagado_neto=5000`, `saldo_cents=0`.

**C. Mínimo 5000 y recaudado** (replica `eventTotals`/`minimumReached`, read.ts:91-141)
```sql
SELECT e.minimum_cents, e.price_cents, e.confirmed, e.archived, e.generation,
  (SELECT coalesce(sum(CASE WHEN kind='capture' THEN amount_cents ELSE -amount_cents END),0)
     FROM payment_ledger WHERE event_id=e.id) AS recaudado_cents,
  (SELECT coalesce(sum(1+companions),0) FROM guests WHERE event_id=e.id AND status='yes') AS personas
 FROM events e WHERE e.slug=$1;
```
Esperado: `minimum_cents=5000`, `recaudado_cents=5000` (⇒ mínimo alcanzado), `archived=false`.

**D. Webhook procesado con tipo correcto**
```sql
SELECT event_type, count(*) AS n, min(received_at), max(received_at)
  FROM webhook_events
 WHERE received_at >= $1::timestamptz GROUP BY event_type ORDER BY 2 DESC;
```
Esperado: `PAYMENT.CAPTURE.COMPLETED` (y/o `CHECKOUT.ORDER.COMPLETED`), `n=1` por id.

**E. Auditoría del evento**
```sql
SELECT a.action, count(*) FROM audit_log a JOIN events e ON e.id=a.event_id
 WHERE e.slug=$1 AND a.action LIKE 'payment%' GROUP BY a.action;
```
Esperado: `payment_captured=1`; cero en `payment_captured_stale_order`, `payment_capture_unverified`, `payment_webhook_rejected`.

Ninguna consulta selecciona nombres, `session_id`, `token_hash`, cookies ni chat.

## 2. Advertencias al interpretar

- **`webhook_events` no tiene FK al pedido** (0001_init.sql:120-124): D solo prueba que una notificación de ese tipo fue aceptada, **no** que correspondía a esta orden. La correlación es temporal; no la presentes como vínculo probado.
- **Fila en `webhook_events` ≠ dinero contado.** Se escribe también cuando el resultado fue `done` sin aplicar (routes/payments.ts:194-200). La prueba del dinero es A, no D.
- **`CHECKOUT.ORDER.APPROVED` no es pago** (routes/payments.ts:142-147). No lo cites como captura.
- **503 de reintento no deja rastro en la tabla** (routes/payments.ts:186-193): ausencia de fila puede significar "pendiente de reentrega", no "no ocurrió".
- **`payment_captured` se audita solo si `applied=true`** (payments.ts:116-123); un reintento idempotente no añade fila. Un segundo `payment_captured` sí sería doble contabilización.
- **Neto vs bruto:** B/C restan reembolsos, mientras `verifyCapturedOrder` compara el importe bruto (verify.ts:75). Con un reembolso parcial, `recaudado_cents` baja y el saldo reaparece aunque la captura de 5000 siga siendo válida.
- **`filas_captura=1` no está garantizado por una restricción de BD** sobre `order_id`: la unicidad es por `capture_id`. Si A devolviera 2, es defecto real, no ruido.
- Ejecuta A–E **antes y después** del reintento y compara; una sola foto no prueba idempotencia.
