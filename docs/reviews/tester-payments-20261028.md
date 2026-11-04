# Regreso de PayPal y navegación de administración — 28 octubre

Estado: aprobado **dentro del alcance de componentes**, todavía sin aceptación externa ni despliegue de esta ronda. Rama `codex/tester-fixes-20261028`.

GROK construyó `FP-TESTER-PAYMENTS-20261028`, intento 1/3. AGY verificó independientemente en `FP-TESTER-PAYMENTS-VERIFY-20261028`, intento 1/3, ejecución 71609 terminada con código 0. Los siete hashes calculados de los archivos congelados coincidieron con la entrega del constructor.

## Comportamiento revisado

- Al regresar de «Abrir PayPal», consultar la orden existente, mostrar progreso y conciliar solo según la respuesta del servidor. Reintentos limitados, pausa al ocultar la pestaña y verificación manual disponible.
- Conservar el flujo automático del botón amarillo. Un clic manual, un callback del SDK y un regreso simultáneos comparten una sola operación.
- No mostrar éxito si la captura devuelve falso o falla. Ignorar respuestas de una orden anterior o de un componente desmontado. Un parámetro de URL o un evento de foco por sí solos no acreditan pago.
- «Ir al panel» abre administración con la clave almacenada. Si no hay clave, mostrar invitación pública; con una clave incorrecta, conservar el rechazo 403 sin intentar generar otra.

## Evidencia

| Comprobación | Resultado |
|---|---|
| Cinco suites del constructor | 41 casos aprobados: 19 nuevos y 22 de regresión |
| Arnés adversarial independiente de AGY | 16 casos aprobados |
| Conjunto de seis suites | 57 aprobados, 0 fallidos, 0 omitidos |
| ESLint y tipos web | Código de salida 0 |
| Integridad de los siete archivos | 0 diferencias |

El arnés independiente cubrió concurrencia entre SDK/foco/verificación manual, estados terminales, captura falsa o fallida, cambio de orden, desmontaje, presupuesto de espera y autorización de navegación. No modificó producto. Usó proveedores simulados y alias al código fuente compartido para evitar depender de artefactos compilados mientras presentación seguía en construcción.

## Límites

La ruta inicial de una URL de retorno puede requerir la verificación manual con indicación y progreso; no se fuerza una captura por un retorno cancelado. El análisis de componentes no acredita autorización real del servidor ni una captura real de PayPal. Quedan integración con presentación/asistentes, compilación y regresión global, navegador de escritorio/móvil y las nuevas operaciones sandbox autorizadas. La aplicación pública conserva `9a40f26`.

Artefactos locales ignorados: informe `tester-payments-review-report-20261028.md`, JSON de hashes y arnés `tester-payments-review-adversarial.test.tsx`, dentro de `.local/`. Uso de AGY: 213747 tokens de entrada, 28198 de salida, 13268 de razonamiento y 2786313 de caché. El campo agregado de cuota del puente no identifica el bucket de Gemini; no usarlo para autorizar consultas nuevas.
