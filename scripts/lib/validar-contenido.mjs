/**
 * Valida los JSON de contenido/ contra esquemas/*.schema.json con Ajv.
 * Depende de: ajv, ajv-formats, Node fs/path.
 * Exporta validarTodoContenido y formatearErrorValidacion para pruebas y CLI.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = join(__dirname, '..', '..');
const DIR_CONTENIDO = join(RAIZ_REPO, 'contenido');
const DIR_ESQUEMAS = join(RAIZ_REPO, 'esquemas');

/** Pares archivo de contenido → nombre de esquema (sin carpeta). */
const MAPA_CONTENIDO_ESQUEMA = {
  'portada.json': 'portada.schema.json',
  'tutorial.json': 'tutorial.schema.json',
  'tipos-evento.json': 'tipos-evento.schema.json',
  'paginas.json': 'paginas.schema.json',
  'preguntas.json': 'preguntas.schema.json',
};

/**
 * Carga todos los esquemas en una instancia Ajv con referencias resueltas.
 * @returns {import('ajv').default} Instancia lista para compilar.
 */
function crearValidador() {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateSchema: false,
  });
  addFormats(ajv);

  const nombres = readdirSync(DIR_ESQUEMAS).filter((f) => f.endsWith('.schema.json'));
  for (const nombre of nombres) {
    const raw = readFileSync(join(DIR_ESQUEMAS, nombre), 'utf8');
    const schema = JSON.parse(raw);
    ajv.addSchema(schema, schema.$id ?? nombre);
  }
  return ajv;
}

/**
 * Convierte un error Ajv en mensaje legible: campo, expectativa y archivo.
 * @param {import('ajv').ErrorObject} error - Error devuelto por Ajv.
 * @param {string} archivo - Ruta o nombre del JSON de contenido.
 * @returns {string} Mensaje en una línea para consola o aserción.
 */
export function formatearErrorValidacion(error, archivo) {
  const campo = error.instancePath?.replace(/^\//, '').replace(/\//g, '.') || '(raíz)';
  const esperado = error.message ?? 'valor inválido';
  const palabraClave = error.keyword ? ` [${error.keyword}]` : '';
  return `Archivo "${archivo}": campo "${campo}" — se esperaba ${esperado}${palabraClave}`;
}

/**
 * Valida un objeto contra el esquema indicado.
 * @param {import('ajv').default} ajv - Validador con esquemas cargados.
 * @param {string} nombreEsquema - $id o nombre del archivo de esquema.
 * @param {unknown} datos - Objeto parseado del JSON de contenido.
 * @param {string} nombreArchivo - Nombre del archivo (para mensajes).
 * @returns {{ ok: true } | { ok: false, mensajes: string[] }}
 */
export function validarConEsquema(ajv, nombreEsquema, datos, nombreArchivo) {
  const validate = ajv.getSchema(nombreEsquema);
  if (!validate) {
    return {
      ok: false,
      mensajes: [`Archivo "${nombreArchivo}": no existe el esquema "${nombreEsquema}"`],
    };
  }
  const valido = validate(datos);
  if (valido) {
    return { ok: true };
  }
  const mensajes = (validate.errors ?? []).map((e) => formatearErrorValidacion(e, nombreArchivo));
  return { ok: false, mensajes };
}

/**
 * Valida todos los JSON de contenido/ mapeados en MAPA_CONTENIDO_ESQUEMA.
 * @returns {{ ok: true } | { ok: false, mensajes: string[] }}
 */
export function validarTodoContenido() {
  const ajv = crearValidador();
  const mensajes = [];

  for (const [archivo, esquema] of Object.entries(MAPA_CONTENIDO_ESQUEMA)) {
    const ruta = join(DIR_CONTENIDO, archivo);
    let datos;
    try {
      datos = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch (err) {
      mensajes.push(`Archivo "${archivo}": JSON ilegible — ${err.message}`);
      continue;
    }
    const resultado = validarConEsquema(ajv, esquema, datos, archivo);
    if (!resultado.ok) {
      mensajes.push(...resultado.mensajes);
    }
  }

  if (mensajes.length > 0) {
    return { ok: false, mensajes };
  }
  return { ok: true };
}

/**
 * Punto de entrada CLI: imprime errores y sale con código 1 si falla.
 */
export function mainValidarContenido() {
  const resultado = validarTodoContenido();
  if (resultado.ok) {
    return 0;
  }
  for (const linea of resultado.mensajes) {
    console.error(linea);
  }
  return 1;
}