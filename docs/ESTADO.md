# Estado de implementación

Actualizado el 14 octubre 2026. El calendario no equivale a progreso real; **P1 todavía no está aceptado**. No marcar una prueba externa por tests con proveedores simulados.

## Evidencia verificada

- Repo público MIT: https://github.com/jlmawyin/fiestapay. Rama `chore/bootstrap`; PR/CI de GitHub pendientes de publicación al cierre de esta integración.
- **Demo pública:** https://fiestapay.somospanas.com, HTTP 200, título FiestaPay y `/api/health` correcto. API y PostgreSQL dedicados en Contabo, sin puertos públicos del contenedor/DB. Vhost HTTPS exclusivo; certificado hasta 12 enero 2027 y timer `fiestapay-renew.timer` activo. `nginx -t` aprobado antes de recargar.
- Regresión tras activar el vhost: `somospanas.com` (WordPress), `ac.visitaremota.com` y `sparring.visitaremota.com` respondieron 200 con sus títulos originales. No se cambió su configuración.
- `npm run check` remoto con PostgreSQL de pruebas: **132 tests / 13 archivos**, lint, tipos y build aprobados. Incluye carreras de creación/captura, reembolsos, cupo, autorización, reset, confirmación ligada a cotización y cancelación asíncrona de voz. Revalidado también después del ajuste de correlación Gemini.
- Navegador contra el dominio público: crear demo, entrar con alias ficticio, confirmar un acompañante y obtener **2 × USD 25 = USD 50**. La orden exige confirmar la cotización.
- Credenciales privadas configuradas por Jorge. PayPal OAuth y registro de webhook verificados por API. ID local corregido para coincidir con la URL única registrada: `/api/paypal/webhook`. Eventos exactos: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`.
- Orden real PayPal **sandbox** por USD 50 creada. **Aprobación del comprador y captura real pendientes**; ninguna captura simulada se cuenta como pago externo. Receptor único Business sandbox.
- AssemblyAI: sesión WebSocket real lista, 1843 fragmentos de audio recibidos y una herramienta de lectura ejecutada. Esto **no acredita micrófono humano/móvil ni conversación hablada**.
- Gemini: autenticación/listado HTTP 200 y una generación mínima HTTP 200 observada. La conversación pública con herramientas sigue devolviendo 503. Diagnóstico mínimo con/sin herramientas devolvió `UNAVAILABLE`, alta demanda del modelo `gemini-3.8-flash`. No conversación funcional verificada; formulario disponible. No comprar créditos ni insistir con reintentos ciegos.
- Respaldo `fiestapay-20261014T123332Z.dump` restaurado en DB temporal: 4 eventos, 0 movimientos financieros. DB temporal eliminada, producción intacta. Copia fuera del VPS guardada en `.local/` (ignorada por Git).

## Agentes y revisión

- Claude construyó API/PostgreSQL/PayPal/Gemini. AGY Gemini construyó frontend/voz. Codex integró, desplegó y verificó.
- AGY Opus independiente detectó carreras financieras. Correcciones de Claude, integración Codex y tests específicos registrados en [revisión](reviews/bootstrap.md). Capturas inciertas mantienen su reserva incluso transcurrido el tiempo: no abrir otra obligación hasta conciliarlas.
- Revisión frontend independiente: confirmación ligada al ID de cotización, error RSVP propagado y cancelación de voz protegida contra callbacks tardíos; siete tests de regresión incluidos.
- Grok 4.7 xhigh entregó revisión acotada de sesión/origen/voz/límites/reset: sin defecto concreto en los archivos suministrados. No fue auditoría completa; limitaciones en el informe. Tres intentos máximos, no seguir repitiendo.
- Claude y el revisor frontend alcanzaron límites de uso después de guardar cambios; no se inventaron informes de cierre. Codex validó la integración con la suite.

## Pendientes y siguiente paso

1. Cerrar esta integración: CI/PR en GitHub, versión identificada y evidencia de reinicio/persistencia.
2. Jorge indica ruta privada de comprador Personal sandbox o aprueba el checkout. Preparar 3–5 compradores ficticios y completar el primer pago; todavía no hay credenciales de compradores confirmadas.
3. Cuando Gemini recupere disponibilidad, verificar herramientas y cotización de principio a fin. Se preservan firmas del modelo y se correlaciona el ID de cada respuesta de herramienta.
4. Hito 16 oct: micrófono real desde móvil, latencia/créditos y tres intentos consecutivos. La prueba WebSocket automática no sustituye este hito.
5. Jorge convoca probadores; no hay confirmaciones recibidas. Ensayo humano, PWA, accesibilidad completa, rollback probado, freeze, video y Devpost siguen pendientes del calendario.

P2 tiene cero horas comprometidas. No ampliar alcance ni consumir los días 3–4 noviembre con mejoras. Demo y cuentas disponibles hasta 15 diciembre.

