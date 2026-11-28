# Catálogo de bloques de la portada raíz

Cada bloque es un componente de interfaz que SP-6 y etapas posteriores montan leyendo `contenido/` y `contenido/paginas.json`. El orden de secciones lo define `paginas.json`, no este archivo.

## BarraNavegacion

**Propósito:** Barra superior con marca, enlaces de ancla y botón principal «Crear espacio».

**Datos:** `contenido/portada.json` → clave `barra` (`marca`, `enlaces[]`, `botonCrearEspacio`).

**Ejemplo:**

```json
{
  "marca": { "es": "somos panas", "en": "somos panas" },
  "enlaces": [{ "id": "tutorial", "es": "Tutorial guiado", "en": "Guided tutorial" }],
  "botonCrearEspacio": { "es": "Crear espacio", "en": "Create space" }
}
```

## HeroPortada

**Propósito:** Titular principal, texto de valor, botones de tutorial y creación, enlaces de cuenta.

**Datos:** `contenido/portada.json` → clave `hero`.

**Ejemplo:** título bilingüe «Un espacio para cada grupo de panas» / «A space for every group of friends», más `ojo`, `texto`, botones y `notaSubdominio`.

## FotoAmbiente

**Propósito:** Ilustración o foto de ambiente con pie legal de muestra.

**Datos:** `contenido/portada.json` → `fotoAmbiente.pie`.

**Ejemplo:** `{ "pie": { "es": "Las fotos de la portada son de muestra.", "en": "..." } }`.

## CompositorSubdominio

**Propósito:** Campo para elegir el slug del subdominio y botón de crear espacio.

**Datos:** `contenido/portada.json` → `compositorSubdominio` (`prefijo`, `campoPlaceholder`, `sufijo`, `boton`).

**Ejemplo:** prefijo `https://`, placeholder `tu-grupo`, sufijo `.somospanas.com`.

## ComoFunciona

**Propósito:** Cuatro pasos numerados del tutorial en la portada (mismo contenido que el tutorial guiado).

**Datos:** `contenido/tutorial.json` → `pasos[]` (`numero`, `titulo`, `texto` en ES/EN).

**Ejemplo:** paso `01` «Crea tu espacio» con texto explicativo bilingüe.

## EventosPublicos

**Propósito:** Aviso de privacidad, tarjetas de ejemplo con badges y hueco para filas reales del API.

**Datos:** `contenido/portada.json` → `eventosPublicos` (`aviso`, `ejemplos[]`).

**Ejemplo:** tarjeta «Los jueves en la terraza» con badges «Ejemplo» y «Evento público».

## DonacionesRecaudaciones

**Propósito:** Recaudaciones de ejemplo con barras ficticias y leyenda para datos reales.

**Datos:** `contenido/portada.json` → `donaciones`.

**Ejemplo:** «Olla común después del partido» con leyenda «Barra de ejemplo · sin cifra real».

## PiePortada

**Propósito:** Pie con marca, frase de fotos de muestra y enlaces repetidos de la barra.

**Datos:** `contenido/portada.json` → `pie` y `barra.enlaces`.

**Ejemplo:** `fraseFotos` bilingüe igual que en `fotoAmbiente.pie`.

## PreguntasFrecuentes (opcional en portada)

**Propósito:** Listado de preguntas y respuestas editables.

**Datos:** `contenido/preguntas.json` → `preguntas[]` (`id`, `pregunta`, `respuesta`).

**Ejemplo:** entrada `que-es-un-espacio` con texto ES/EN.

## FormularioTipoEvento (sitios de grupo)

**Propósito:** Opciones de tipo al crear un evento en un sitio.

**Datos:** `contenido/tipos-evento.json` validado con `esquemas/evento.schema.json`.

**Ejemplo:** tipo `reunion` con `plantilla` `evento` y `preguntasSugeridas`.