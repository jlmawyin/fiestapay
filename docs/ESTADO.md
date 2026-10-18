# Estado de implementación

Actualizado el 18 octubre 2026 (America/Guayaquil). El calendario no equivale a progreso real; **P1 todavía no está aceptado**. No marcar una prueba externa por tests con proveedores simulados.

## Evidencia verificada

- Repo público MIT: https://github.com/jlmawyin/fiestapay. Rama `chore/bootstrap`; [PR #1 en borrador](https://github.com/jlmawyin/fiestapay/pull/1), [CI GitHub aprobada para `654eaaf`](https://github.com/jlmawyin/fiestapay/actions/runs/39099031638) (151 tests / 15 archivos); código desplegado `654eaaf`.
- **Demo pública:** https://fiestapay.somospanas.com, HTTP 200, título FiestaPay y `/api/health` correcto. API y PostgreSQL dedicados en Contabo, sin puertos públicos del contenedor/DB. Vhost HTTPS exclusivo; certificado hasta 12 enero 2027 y timer `fiestapay-renew.timer` activo. `nginx -t` aprobado antes de recargar.
- Regresión tras activar el vhost: `somospanas.com` (WordPress), `ac.visitaremota.com` y `sparring.visitaremota.com` respondieron 200 con sus títulos originales. No se cambió su configuración.
- `npm run check` remoto con PostgreSQL de pruebas: **132 tests / 13 archivos**, lint, tipos y build aprobados. Incluye carreras de creación/captura, reembolsos, cupo, autorización, reset, confirmación ligada a cotización y cancelación asíncrona de voz. Revalidado también después del ajuste de correlación Gemini.
- Navegador contra el dominio público: crear demo, entrar con alias ficticio, confirmar un acompañante y obtener **2 × USD 25 = USD 50**. La orden exige confirmar la cotización.
- Credenciales privadas configuradas por Jorge. PayPal OAuth y registro de webhook verificados por API. ID local corregido para coincidir con la URL única registrada: `/api/paypal/webhook`. Eventos exactos: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`.
- Orden real PayPal **sandbox** por USD 50 creada. **Aprobación del comprador y captura real pendientes**; ninguna captura simulada se cuenta como pago externo. Receptor único Business sandbox.
- AssemblyAI: sesión WebSocket real desde el dominio público lista, 2551 fragmentos de audio recibidos y una herramienta de lectura ejecutada (14 oct 12:44 UTC). Esto **no acredita micrófono humano/móvil ni conversación hablada**.
- Gemini: recuperó disponibilidad el 16 oct. Prueba pública API y navegador con herramienta `prepare_quote`: dos asistentes × USD 25 = USD 50, tarjeta de cotización y solicitud de confirmación sin crear una orden. Evidencia privada `.local/provider-smoke-20261016-chat.json`. Los 503/timeout de días anteriores eran reales; conservar fallback a formulario.
- Respaldo `fiestapay-20261014T123332Z.dump` restaurado en DB temporal: 4 eventos, 0 movimientos financieros. DB temporal eliminada, producción intacta. Copia fuera del VPS guardada en `.local/` (ignorada por Git).

## Agentes y revisión

- Claude construyó API/PostgreSQL/PayPal/Gemini. AGY Gemini construyó frontend/voz. Codex integró, desplegó y verificó.
- AGY Opus independiente detectó carreras financieras. Correcciones de Claude, integración Codex y tests específicos registrados en [revisión](reviews/bootstrap.md). Capturas inciertas mantienen su reserva incluso transcurrido el tiempo: no abrir otra obligación hasta conciliarlas.
- Revisión frontend independiente: confirmación ligada al ID de cotización, error RSVP propagado y cancelación de voz protegida contra callbacks tardíos; siete tests de regresión incluidos.
- 16 oct: AGY Gemini construyó recuperación del regreso PayPal sin almacenamiento de pestaña; Codex integró consulta autenticada y verificación de invitación/estado. Claude revisó independientemente; tres entregas evaluadas. Once nuevas regresiones, **42 tests frontend**, tipos/lint/build locales aprobados. [Revisión acotada](reviews/paypal-return.md) y [protocolo de evidencia financiera](reviews/sandbox-evidence.md).
- Grok 4.7 xhigh entregó revisión acotada de sesión/origen/voz/límites/reset: sin defecto concreto en los archivos suministrados. No fue auditoría completa; limitaciones en el informe. Tres intentos máximos, no seguir repitiendo.
- Claude y el revisor frontend alcanzaron límites de uso después de guardar cambios; no se inventaron informes de cierre. Codex validó la integración con la suite.

## Pendientes y siguiente paso

1. Versión `654eaaf` desplegada; API pública responde `ok:true` y referencia en `/opt/fiestapay/RELEASE_COMMIT`. Evidencia de navegador del 16 oct en `a9c61c6`: retorno en nueva pestaña con URL `paypal=approved` manipulada, pero orden recuperada como `created` según servidor, recaudado/pagado 0 y saldo 5000, sin captura automática ni aviso de aprobación. Parámetros retirados. Evidencia local `output/playwright/paypal-return-verified-20261016.png`. El ajuste móvil Chat/Hablar se conserva. PR en borrador hasta verificar integraciones externas.
2. La captura de Jorge acredita **dos compradores Personal y un receptor Business sandbox** creados. Falta localizar las credenciales de comprador guardadas: el `.env` legible en este checkout aún tiene fecha 13 oct y solo contiene la cuenta Business. Se pidió guardar/confirmar la ruta, sin solicitar secretos por chat. Completar aprobación y captura de USD 50 cuando esté disponible. Dos compradores no completan todavía el objetivo de 3–5.
3. Chat con herramienta y tarjeta verificado el 16 oct. Sigue pendiente completar el recorrido externo con comprador sandbox y acreditar la captura.
4. Hito 16 oct: micrófono real desde móvil, latencia/créditos y tres intentos consecutivos. [Protocolo preparado](VOICE_ACCEPTANCE.md), todavía sin resultados humanos. La prueba WebSocket automática no sustituye este hito.
5. Jorge convoca probadores; no hay confirmaciones recibidas. Ensayo humano, PWA, accesibilidad completa, rollback probado, freeze, video y Devpost siguen pendientes del calendario.

P2 tiene cero horas comprometidas. No ampliar alcance ni consumir los días 3–4 noviembre con mejoras. Demo y cuentas disponibles hasta 15 diciembre.

## Seguimiento 15 octubre

- Infraestructura del hito de hoy ya desplegada: API y DB saludables tras 23 horas; los cuatro dominios comprobados responden 200. No repetir despliegue ni pruebas financieras sin cambios.
- Un único reintento público Gemini devolvió timeout del proveedor; la cotización por formulario sigue siendo 5000 centavos. Sin nuevas credenciales de comprador ni resultado humano; bloqueos sin cambios.
- Preparado el protocolo de voz del 16 oct. No se consumieron créditos de voz en este seguimiento ni se creó otra orden PayPal.

## Seguimiento 17 octubre

- Comprobación local: `.env` sigue con 845 bytes y modificación del 13 oct, sin campos de compradores; `.env.buyers` todavía no existe. La ruta ya fue confirmada por Jorge y se ofreció guardar una copia privada. No repetir la misma petición mientras no haya cambios.
- Consulta agregada de la DB dedicada en Contabo: **3 órdenes `created`, 0 movimientos financieros y 0 webhooks registrados**. La ausencia de registros no demuestra que PayPal nunca intentó entregar una notificación. No se crearon órdenes ni se invocaron Gemini/AssemblyAI desde FiestaPay en este seguimiento.
- El hito de primer pago del 17 oct **no está cumplido**; el de micrófono humano del 16 oct también sigue pendiente. No consumir ni reasignar por anticipado los márgenes del 3–4 nov. Siguiente prueba externa: aprobación de comprador y captura verificada de USD 50, con consultas antes/después del reintento según el protocolo.
- Trabajo independiente sobre un defecto pendiente: AGY Gemini corrigió respuestas tardías de entrada/RSVP/creación de orden al navegar entre fiestas. Codex reprodujo seis fallos en la versión anterior y verificó ocho nuevas regresiones aprobadas: 50 tests frontend, tipos y lint. [Evidencia](reviews/invite-navigation.md).
- Claude no pudo iniciar la revisión del nuevo cambio por OAuth caducado. No se reiteró el intento ni se atribuyó una revisión inexistente. `review_navigation` revisó independientemente y comprobó 8/8 tests; Codex reforzó la aserción de propagación RSVP señalada por el revisor, con 8/8 de nuevo. La sesión Claude deberá renovarse antes de volver a delegar en esa CLI.
- Cierre técnico al inicio del 18 oct: `654eaaf` desplegado en el servicio aislado de FiestaPay, API pública correcta. CI completa: **151 tests / 15 archivos**, lint, tipos y build. Sin cambios en proxy, DNS ni otras aplicaciones del VPS. Las pruebas del nuevo cambio usan proveedores simulados; no acreditan captura, webhook externo ni voz humana.
