# Plan de mejoras de FiestaPay para la revisión del jurado

Base revisada: `5b664f6`. El trabajo parte de las observaciones del informe del 10 de noviembre y de los flujos que ya usa el producto.

| Prioridad | Entrega | Cómo comprobarla |
| --- | --- | --- |
| 1 | Portada bilingüe con una entrada para una idea, una entrevista breve y el formulario manual. La demo conserva sus acciones para probar el borrador y el pago. | Desde la portada, abrir cada camino con el idioma elegido. Probar la entrevista saltando una respuesta y revisar el resultado. La demo permite seguir el recorrido sin cuenta de FiestaPay. |
| 2 | Un resumen editable para los borradores de la entrevista, la frase y el chat. Los valores sugeridos se distinguen y los datos pendientes llevan a la sección correspondiente. | Con un borrador completo, confirmar cupo, fecha, lugar, cuota e ítems desde el resumen. Con uno incompleto, comprobar la validación antes de publicar. Repetir la creación manual. |
| 3 | Cuotas explícitas conservadas en centavos y respuestas de pago con importes en el idioma seleccionado. | Para diez personas a USD 15 cada una, probar tanto Gemini simulado como el respaldo por reglas. En inglés, una cotización de USD 50 se muestra como `$50.00`. |
| 4 | Actividad de PayPal en AG Grid del organizador, con capturas y devoluciones verificadas y las notificaciones conciliadas que se puedan atribuir al evento. | Probar una captura simulada, una devolución histórica y una notificación repetida. Confirmar que otra invitación o una clave incorrecta no acceden a la evidencia. La vista del invitado confirma el importe después de verificar el pago. |

Los webhooks históricos se registraron sin una referencia al evento. La actividad nueva requiere una correlación comprobada. La evidencia de pagos procede del libro de capturas y devoluciones del servidor.

La creación de órdenes sigue el paso de confirmación del invitado. Una demo acelerada de reembolso se evalúa aparte, con una ventana y una captura de Sandbox que permitan verificar el resultado. El cambio de marca y las predicciones de premios quedan fuera del trabajo de producto. Cualquier archivo de otra demo de producción requiere autorización para su URL exacta.

Verificación de la entrega: pruebas con PostgreSQL y proveedores simulados, recorrido en navegador con anchos móvil y escritorio, revisión independiente y CI. Para desplegar se aplican las condiciones de `AGENTS.md` y el kit de operador.
