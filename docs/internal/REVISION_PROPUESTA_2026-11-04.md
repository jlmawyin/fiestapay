# Propuesta para revisión de Jorge — 4 de noviembre de 2026

Estado: APROBADA expresamente por Jorge el4nov2026: «Apruebo, sigue con esos cambios usando dirigir-agentes. Conserva la recuperación del enlace y prioriza que el jurado vea AG Grid y llegue fácilmente a PayPal. Debe quedar listo ya». Se autorizan implementación, verificación independiente y publicación dentro de este alcance. La recuperación del enlace de organizador se conserva como está.

## Comprobado

- En una sesión nueva de escritorio, la portada no ofrece chat de texto y muestra Reiniciar Demo.
- Dos sesiones de navegador nuevas no muestran eventos propios. La lista del inicio se obtiene por sesión del creador, no es un catálogo global de fiestas.
- Dos visitantes nuevos consultaron el historial de una invitación existente: HTTP200 y cero mensajes en ambos casos. No se reprodujo la supuesta mezcla de visitantes.
- El código del historial filtra por evento y sesión. Es evidencia acotada, no un dictamen exhaustivo de privacidad.
- Los enlaces Panel de Control de la lista se muestran sin comprobar si el navegador conserva la clave. El servidor exige correctamente esa clave.
- El formateador repite la misma zona horaria al inicio y al final. El cliente HTTP carece de un plazo general para finalizar solicitudes atascadas; no se reprodujo aún una pantalla concreta permanentemente en Cargando.

## Cambios propuestos, todavía no aplicados

1. Portada orientada al jurado con Ver panel de ejemplo (AG Grid), Crear mi demo privada y el acceso a Recuperar mi enlace. La vista de ejemplo mostraría datos ficticios etiquetados y sería de solo lectura. Una demo funcional tendría su propia clave; el panel real conserva sus permisos.
2. Explicar el camino de pago: abrir invitación, unirse con nombre, confirmar personas, revisar el total y pagar en PayPal Sandbox. Un acceso Quiero pagar llevaría al primer paso pendiente.
3. Presentar el recorrido del jurado antes del historial personal. Las pruebas y fiestas existentes siguen accesibles desde Mis invitaciones. Reiniciar Demo pasa a opciones secundarias de demostración; no se eliminan ni cambian fechas, pagos o fiestas.
4. Chat de texto general en portada, separado de los chats de cada invitación y del organizador. Explicar el alcance de la conversación y verificar aislamiento con sesiones distintas.
5. Estados de carga con progreso, mensaje de error y recuperación; una sola indicación de zona horaria por intervalo, conservando las fechas y horas reales.

## Validación prevista tras aprobación

- Entrar con dos navegadores nuevos y comprobar acceso al ejemplo de AG Grid, recorrido visible a PayPal y separación de chats.
- Mantener403para el panel real sin clave; comprobar acceso con clave y recuperación existente.
- Comprobar errores de red y esperas controladas con dobles, sin nuevos cobros.
- Verificar horas del mismo día y entre días en Ecuador.
- Revisar independientemente con AGY antes de integrar/publicar.
- Definir cualquier llamada externa de prueba de esta nueva ronda antes de ejecutarla. Los presupuestos anteriores siguen cerrados.

No hay constructores activos ni intentos de reparación nuevos consumidos. Fuente publicada60593db y main89b08fe siguen sin cambios.
