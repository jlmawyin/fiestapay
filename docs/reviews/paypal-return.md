# Regreso desde PayPal — 16 octubre 2026

AGY Gemini (`gemini-3.8-flash-high`) identificó y construyó la recuperación de la orden cuando PayPal regresa en una pestaña sin `sessionStorage`. Codex integró las verificaciones y Claude Opus High revisó de forma independiente el cambio. Tres entregas evaluadas; alcance limitado al regreso, presentación de la captura y respuestas tardías de pago.

## Corrección

- El token de la URL y el almacenamiento identifican una orden candidata. La consulta autenticada al servidor determina su estado; el invitado debe pertenecer a la invitación actual.
- `paypal=approved` y `PayerID` no acreditan aprobación ni pago. Se limpian de la URL después de leer la referencia. Volver desde PayPal no dispara una captura automática.
- Solo `created`, `approved` y `capturing` reabren el componente de pago. Órdenes fallidas o sustituidas quedan cerradas; las pagadas se muestran únicamente según la respuesta verificada del servidor.
- El callback de captura devuelve un booleano: una respuesta distinta de `paid` no muestra éxito. La cancelación del navegador tampoco demuestra ausencia de cobro.
- Una respuesta de captura o conciliación que llega después de cambiar de invitación no actualiza el invitado ni muestra éxito en la nueva página.

## Revisión y pruebas

Claude señaló la reapertura visual de órdenes cerradas y las respuestas de pago tardías entre invitaciones. Codex añadió una lista explícita de estados y una versión de contexto por invitación. El servidor ya impedía iniciar capturas de órdenes sustituidas; el primer hallazgo no demuestra un cobro indebido.

Once regresiones en `paypal-return.test.tsx`: regreso sin almacenamiento, captura manual, respuesta no pagada, cancelación, URL manipulada, orden de otra invitación, pago ya verificado, dos estados cerrados y dos respuestas tardías. **42 pruebas frontend**, tipos, lint y build aprobados localmente. Esto no sustituye el checkout real sandbox.

Claude relee la tercera entrega y da por resueltos sus dos hallazgos. Su revisión final fue estática: no ejecutó pruebas, y los nuevos tests usan el botón de respaldo, no el callback del SDK real. Queda registrado para la aceptación de navegación: alta de invitado, RSVP y creación de orden todavía pueden responder tarde después de cambiar de invitación; no forman parte de estas dos correcciones y requieren una reproducción separada antes de ampliar el cambio.

El grafo disponible antes del cambio estaba desactualizado para estos archivos; al retomar la sesión su transporte estaba cerrado. Se verificó la fuente y el diff directamente. No es una auditoría exhaustiva del frontend.

## Verificación desplegada

`a9c61c6` desplegado en Contabo; API saludable. CI GitHub [38895742935](https://github.com/jlmawyin/fiestapay/actions/runs/38895742935): **143 pruebas / 14 archivos**, lint, tipos y build aprobados. Navegador en pestaña nueva sin orden almacenada: el retorno con bandera `approved` recupera el estado real `created`; no aparece aprobación ni captura, se limpian los parámetros y los valores siguen pagado/recaudado 0, saldo 5000. La orden todavía no fue aprobada por comprador; no acredita un pago externo.
