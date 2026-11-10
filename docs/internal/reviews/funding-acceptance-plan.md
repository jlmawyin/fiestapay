# P2: plan de aceptación financiera

Plan previo a la entrega; **no acredita implementación ni reembolso real**. Constructor GROK, revisión independiente AGY, integración y proveedores reales solo Codex. Fuente de diseño en `.local/funding-design.md`; las correcciones del encargo de construcción prevalecen sobre sus propuestas.

## Contratos que deben verificarse

- Las filas existentes mantienen plazo nulo y quedan exentas de devolución automática. Editar su título no activa la función. La captura sandbox de USD50 ya acreditada permanece intacta.
- En fiestas nuevas con mínimo, el plazo predeterminado es el inicio; el organizador puede establecer uno anterior. Cambiar mínimo/plazo después de crear una orden no modifica la promesa de cobro.
- El servidor decide el cierre bajo bloqueo de evento y con reloj leído después de adquirirlo. Capturas y reembolsos tardíos no cambian retroactivamente esa decisión. Un evento fallido no puede confirmarse desde el cliente ni porque después llegue otro cobro.
- Toda captura completada se verifica y registra, incluso tardía o sobre una fiesta borrada; cuando corresponde, se encola su devolución. Borrar datos públicos no elimina obligaciones financieras.
- Petición de reembolso y su identificador se persisten antes de HTTP. Su cuerpo es inmutable para ese identificador. Timeout, PENDING, error422 o captura marcada REFUNDED sin comprobante suficiente no equivalen a devolución completada.
- El cliente paga su cuota exacta; el organizador absorbe la comisión. La cotización muestra estimación y fuente antes de crear la orden. El mínimo sigue usando recaudación antes de comisiones, menos devoluciones verificadas.

## Pruebas automatizadas locales

Usar PostgreSQL real desechable y PayPal falso con barreras de concurrencia. Bases separadas para constructor y revisor. Cubrir mínimo4999/5000, límite temporal exacto y espera de bloqueo, barrido retrasado/reinicio, dos workers, respuesta perdida después de devolución remota, PENDING→COMPLETED, notificaciones duplicadas/desordenadas, devolución parcial manual y colisión de importes, captura tardía, borrado antes del plazo y después, migración legada, autorización y cambios de condiciones. El ledger nunca devuelve más de lo capturado ni cuenta solicitud aceptada como dinero devuelto.

No llamar proveedores ni usar credenciales en agentes. Aprobar tipos, lint, pruebas con DB y build antes de entregar. La revisión debe comprobar también condiciones humanas y límites de rollback: una migración aditiva no garantiza que una API anterior entienda el nuevo régimen financiero.

## Prueba externa posterior, solo sandbox

1. Tras revisión/CI y despliegue aislado, crear una fiesta desechable con cuotaUSD1, capacidad2, mínimo/metaUSD2 y plazo de unos ocho minutos, anterior al inicio. No acortar el plazo después de cobrar ni introducir rutas de reloj manipulable.
2. Un comprador ficticio pagaUSD1. Verificar captura; la fiesta queda por debajo de su mínimo. Es una operación nueva para probar devolución, sin repetir ni reembolsar la captura dorada deUSD50.
3. Esperar el vencimiento normal y la tarea programada. La interfaz debe mostrar fallo del mínimo y estado real del reembolso; la petición pendiente no se presenta como devolución terminada.
4. Verificar el recurso de devolución en PayPal, sus referencias/importe/moneda y estadoCOMPLETED. Ledger: una captura100centavos y una devolución100, recaudado0. Reintento de tarea y webhook no duplican filas ni dinero.
5. Comprobar que nuevas órdenes quedan bloqueadas, que el estado no cambia por cobros tardíos y que el ejemplo previoUSD50 sigue intacto. Carreras/crashes se prueban con el adaptador falso; no inyectar fallos en otras aplicaciones delVPS.

La disponibilidad, hora, versiones, identificadores públicos de operación y resultados se registrarán después de ejecutarlos. No afirmar esta prueba por haber aprobado una simulación local.

## Fuentes de tarifas

La [tarifa oficial de comercio para Ecuador](https://www.paypal.com/ec/business/paypal-business-fees), actualizada el28septiembre2026, publica para el caso nacional estándar5,40% más comisión fijaUSD0,30. Se usa como **estimación para el sandboxEC/USD**, no como tarifa universal ni como promesa de liquidación. El caso50USD produce una estimación3USD, coherente con la captura previa; esa observación por sí sola no define una tarifa general. La comisión definitiva procede dePayPal.

Documentación primaria: [iniciar devolución](https://developer.paypal.com/api/payments/v2/captures-refund), [idempotencia de peticiones](https://developer.paypal.com/api/rest/requests/) y [estados de devolución](https://developer.paypal.com/api/payments/v2/definitions/refund/).
