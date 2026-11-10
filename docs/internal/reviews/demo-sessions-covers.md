# Portadas, sesiones y recuperación de voz — 22 octubre 2026

## Portadas

Las cuatro variantes de `TemplateCover` utilizan SVG locales con `role="img"` y texto alternativo específico. README documenta las ilustraciones como originales del proyecto bajo MIT. La creación y visualización de las cuatro variantes se comprobó el 21 oct; no se repite ese recorrido ni se añaden controles de subida.

## Aislamiento real por HTTPS

Codex ejecutó una prueba contra la API pública con dos clientes y cookies independientes, sin exponer sus valores ni usar datos personales. Es una prueba automática de la API, no un ensayo de dos personas ni de dos navegadores.

- Inicio de demo concurrente: dos espacios distintos, listados de fiestas separados.
- Cookies con HttpOnly, Secure y SameSite=Lax.
- Una sesión puede unirse como invitada a la otra, sin adquirir su permiso de organizador; ambos intentos de panel ajeno devuelven 403.
- Reiniciar A crea una generación distinta. El panel B conserva exactamente su estado anterior.
- La invitación A archivada devuelve 410 al solicitar nueva cotización.
- No se crearon órdenes ni se llamó a Gemini/AssemblyAI/PayPal.

Evidencia privada: `.local/session-isolation-20261022.log`. Son sesiones creadas exclusivamente para esta prueba; no se reiniciaron demos existentes de Jorge.

## Recuperación de voz

Las cuatro regresiones anteriores de cancelación/interrupción ya pasaron en la CI de 155 pruebas. AGY Gemini High añadió dos regresiones nuevas: permiso de micrófono denegado y fallo al obtener el token, ambos seguidos de un reintento. La primera exige cero tokens/sockets antes del reintento; la segunda comprueba que la pista anterior se detiene y se obtiene una pista nueva.

El revisor independiente `review_templates` señaló que comprobar el socket simulado y el botón Detener no acreditaba salir de `connecting`. Codex reforzó ambos casos: la interfaz debe mostrar «Escuchando tu voz...» y dejar de mostrar «Conectando con AssemblyAI...». Segunda entrega evaluada, **6/6 pruebas y lint aprobados**. Commit de pruebas `10ef38b`; no cambia el código de producción, que continúa desplegado en `6d203e2`.

Son micrófono/socket/proveedor simulados, sin créditos ni conversación humana. No sustituyen permiso real, latencia ni los tres intentos móviles pendientes.

[CI completa de `10ef38b`](https://github.com/jlmawyin/fiestapay/actions/runs/39753465356) aprobada: **157 pruebas / 16 archivos**, lint, tipos y build. No requiere un nuevo despliegue.

## Alcance de la revisión

Grafo Tier 2, generación 15 oct: `readSession` localizado y trazado en ambos sentidos. Archivos con metadatos cambiados y tests excluidos requirieron lectura directa. En ComidaCover/EventoCover se leyeron además los rangos parcialmente indexados 68/80. No se presenta como auditoría exhaustiva ni aceptación externa de pagos o voz.
