# ANEXO · El método: sitio editable por agentes

## Qué se busca
Que el sitio pueda cambiarse con pedidos en lenguaje normal ("cambia el horario", "agrega una sección de preguntas", "pon la foto nueva") y que un agente de IA haga el cambio de forma rápida, segura y comprobable, sin que una persona tenga que leer el código. somospanas.com es un ejemplo demostrable de este método. El código no solo debe funcionar: debe estar organizado para que cualquier agente nuevo entienda dónde tocar, toque lo mínimo y compruebe que no rompió nada.

## Principios
1. El agente edita datos, no código, siempre que se pueda. El 80 % de los cambios (textos, fotos, fechas, preguntas, tipos de evento, orden de secciones) se hace en `contenido/` y `datos/`.
2. Cada cosa tiene un solo lugar. Un texto vive en un archivo. Un color vive en un token de diseño.
3. El mapa manda. `AGENTS.md` dice dónde está cada cosa y cómo cambiarla.
4. Nada sale sin comprobarse. Toda edición termina con validación de datos y pruebas en verde.
5. Todo cambio queda explicado en `CHANGELOG.md`: qué, por qué y quién lo pidió.
6. Cambios pequeños y reversibles. Un pedido es un cambio.

## Qué debe facilitar el código
- Puntos de edición documentados en AGENTS.md: Texto de la portada → contenido/portada.json → prueba de portada; Pasos del tutorial → contenido/tutorial.json → prueba del tutorial; Tipos de evento → contenido/tipos-evento.json + esquemas/evento.schema.json → prueba del formulario; Colores y tipografía → estilos/tokens.css → prueba visual en 390x844 y 1440x960; Orden de secciones → contenido/paginas.json → prueba de portada.
- Catálogo de bloques en bloques/LEEME.md.
- Tokens de diseño en un solo archivo.
- Mensajes de validación claros (campo, esperado, archivo).
- Vista previa local con un comando.

## Niveles de cambio
1 Contenido (textos, fotos, fechas, preguntas; contenido/, datos/; validación + pruebas). 2 Estructura (nueva sección, tipo de evento, orden; contenido/ + bloque; pruebas + capturas antes/después). 3 Diseño (estilos/tokens.css; prueba visual móvil y escritorio). 4 Lógica y seguridad (subdominios, validación, límites, datos personales; código; revisión de Jorge y verificador independiente antes de publicar). Niveles 1-3 con autonomía; nivel 4 siempre se consulta.

## Flujo de una edición
1 Recibir el pedido. 2 Leer AGENTS.md y ubicar el punto de edición. 3 Cambio mínimo. 4 Validar y probar con un comando. 5 Vista previa y capturas antes/después si se ve. 6 Anotar en CHANGELOG.md. 7 Resumen corto; no publicar sin aprobación.

## Hacia dónde va (no construir en v1, solo dejar preparado)
- Cada dueño de evento pide mejoras por chat y un agente edita solo el archivo de su evento, con la misma validación.
- El asistente IA del sitio lee el mismo contenido/ que la web.

## Medida de éxito
Un agente que nunca vio el proyecto recibe "agrega el tipo de evento 'Cumpleaños' con una pregunta frecuente" y lo resuelve leyendo solo AGENTS.md y los archivos indicados, con pruebas en verde, entrada en CHANGELOG.md, en un solo intento.
