/**
 * Configuración idempotente del agente Napster de Somos Panas (NAP-F2 / NAP-F4s).
 * Depende de `avatar-tools.ts`, `contenido/avatar.json`, `contenido/preguntas.json` y del
 * conocimiento servido en `apps/web/public/conocimiento/`. Crea/actualiza functions, dos
 * colecciones FAQ (es/en), una base de conocimiento opcional, los agentes es/en y el canal
 * webrtc `deferred`. Con `--dry-run` no hace red ni escribe ids. Nunca imprime la clave.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AVATAR_TOOLS, AVATAR_TOOL_NAMES } from '../../packages/shared/dist/avatar-tools.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUTA_IDS = join(RAIZ, '.local', 'napster', 'ids.json');
const RUTA_AVATARES = join(RAIZ, 'contenido', 'avatares.json');
const NOMBRE_FAQ_BASE = 'somospanas-faq';
const NOMBRE_CONOCIMIENTO = 'somospanas-conocimiento';
const ARCHIVOS_CONOCIMIENTO = ['somospanas.es.md', 'somospanas.en.md'];
const NOMBRE_AGENTE_BASE = { es: 'somospanas-es', en: 'somospanas-en' };
const LIMITE_AGENTES = 100;
const MARGEN_AGENTES = 95;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i];
    if (!actual.startsWith('--')) continue;
    const [clave, valor] = actual.slice(2).split('=');
    if (valor !== undefined) args[clave] = valor;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[clave] = argv[i + 1];
      i += 1;
    } else args[clave] = true;
  }
  return args;
}

function lista(json) {
  if (Array.isArray(json)) return json;
  for (const clave of ['items', 'data', 'results', 'functions', 'faqs', 'agents', 'knowledgeBases', 'voices']) {
    if (Array.isArray(json?.[clave])) return json[clave];
  }
  if (Array.isArray(json?.data?.items)) return json.data.items;
  return [];
}

function idDe(item) {
  return typeof item?.id === 'string' ? item.id : null;
}

function nombreDe(item) {
  return typeof item?.name === 'string' ? item.name : typeof item?.data?.name === 'string' ? item.data.name : '';
}

/** NAP-S1: la API puede envolver el agente en `data`; se lee igual en GET y en la lista. */
function datosDe(item) {
  return item && typeof item.data === 'object' && item.data !== null ? { ...item, ...item.data } : item ?? {};
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** NAP-S1: sustituye el nombre base de la asistente, sin tocar la marca Somos Panas. */
function sustituirNombre(texto, nombreAnterior, nombreNuevo) {
  if (typeof texto !== 'string' || !nombreNuevo) return texto;
  let salida = texto.replaceAll('{avatar}', nombreNuevo);
  if (nombreAnterior && nombreAnterior !== nombreNuevo) {
    salida = salida.replace(new RegExp(`\\b${escaparRegex(nombreAnterior)}\\b`, 'gi'), nombreNuevo);
  }
  return salida;
}

function nombreDeAgenteAvatar(id, lang) {
  return `somospanas-avatar-${id}-${lang}`;
}

async function crearCliente({ apiKey, baseUrl, fetchImpl }) {
  const base = baseUrl.replace(/\/+$/, '');
  const pedir = async (path, init = {}) => {
    const respuesta = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const texto = await respuesta.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      // Respuesta sin JSON: el status ya decidió el error.
    }
    if (!respuesta.ok) throw new Error(`Napster ${init.method ?? 'GET'} ${path} -> HTTP ${respuesta.status}`);
    return json;
  };
  return {
    get: (path) => pedir(path),
    post: (path, body) => pedir(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => pedir(path, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (path, body) => pedir(path, { method: 'PATCH', body: JSON.stringify(body) }),
  };
}

function cuerpoFuncion(tool) {
  return {
    data: {
      name: tool.name,
      description: `${tool.description_es}\n${tool.description_en}`,
      parameters: tool.parameters,
    },
    flow: 'implicit',
    prompt: `${tool.description_es}\n${tool.description_en}`,
  };
}

async function sincronizarFunciones(cliente, decir, existentes) {
  const ids = [];
  for (const name of AVATAR_TOOL_NAMES) {
    const tool = AVATAR_TOOLS[name];
    const actual = existentes.find((item) => nombreDe(item) === name);
    if (actual && idDe(actual)) {
      await cliente.put(`/public/functions/${idDe(actual)}`, cuerpoFuncion(tool));
      decir(`función actualizada: ${name} (${idDe(actual)})`);
      ids.push(idDe(actual));
    } else {
      const creada = await cliente.post('/public/functions', cuerpoFuncion(tool));
      const id = idDe(creada);
      if (!id) throw new Error(`Napster no devolvió id para la función ${name}`);
      decir(`función creada: ${name} (${id})`);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * NAP-F4s: el JSON es bilingüe por par; Napster limita a una colección por agente, así que
 * se crean dos colecciones (es/en) con las preguntas y respuestas del idioma correspondiente.
 */
async function sincronizarFaq(cliente, decir, existentes, lang, preguntas) {
  const nombre = `${NOMBRE_FAQ_BASE}-${lang}`;
  const actual = existentes.find((item) => nombreDe(item) === nombre);
  if (actual && idDe(actual)) {
    decir(`FAQ reutilizada: ${nombre} (${idDe(actual)})`);
    return idDe(actual);
  }
  const faqs = preguntas.slice(0, 50).map((item) => ({
    question: item.pregunta[lang],
    answer: item.respuesta[lang],
  }));
  const creada = await cliente.post('/public/faqs', { name: nombre, faqs });
  const id = idDe(creada);
  if (!id) throw new Error(`Napster no devolvió id para la colección FAQ ${lang}`);
  decir(`FAQ creada: ${nombre} (${id}, ${faqs.length} pares)`);
  return id;
}

/**
 * Crea o reutiliza la base de conocimiento por nombre. Si ya existe se reutiliza sin volver a
 * subir archivos (idempotencia); si es nueva, sube los dos markdown servidos públicamente.
 */
async function sincronizarConocimiento(cliente, decir, existentes, urlBase) {
  if (!urlBase) return null;
  const actual = existentes.find((item) => nombreDe(item) === NOMBRE_CONOCIMIENTO);
  if (actual && idDe(actual)) {
    decir(`conocimiento reutilizado: ${NOMBRE_CONOCIMIENTO} (${idDe(actual)})`);
    return idDe(actual);
  }
  const base = urlBase.replace(/\/+$/, '');
  const creada = await cliente.post('/public/knowledge-bases', {
    name: NOMBRE_CONOCIMIENTO,
    provider: 'azureOpenAI',
  });
  const id = idDe(creada);
  if (!id) throw new Error('Napster no devolvió id para la base de conocimiento');
  for (const archivo of ARCHIVOS_CONOCIMIENTO) {
    await cliente.post(`/public/knowledge-bases/${id}/files`, { url: `${base}/${archivo}` });
    decir(`conocimiento subido: ${base}/${archivo}`);
  }
  decir(`conocimiento creado: ${NOMBRE_CONOCIMIENTO} (${id})`);
  return id;
}

async function sincronizarAgente(cliente, decir, existentes, datos) {
  const actual = existentes.find((item) => nombreDe(item) === datos.name);
  if (actual && idDe(actual)) {
    await cliente.patch(`/public/agents/${idDe(actual)}`, datos.body);
    decir(`agente actualizado: ${datos.name} (${idDe(actual)})`);
    return idDe(actual);
  }
  const creado = await cliente.post('/public/agents', datos.body);
  const id = idDe(creado);
  if (!id) throw new Error(`Napster no devolvió id para el agente ${datos.name}`);
  decir(`agente creado: ${datos.name} (${id})`);
  return id;
}

/**
 * NAP-S1: cuerpo de un agente de catálogo copiando el base del mismo idioma.
 * Copia companion/voz/idioma/instrucciones/funciones/FAQ/conocimiento y cambia el nombre
 * de la asistente en las instrucciones. No crea ni escribe nada.
 */
function cuerpoAgenteDesdeBase(base, entrada, lang, nombreBase) {
  const info = datosDe(base);
  const providerSettings = { ...(info.providerSettings ?? {}) };
  if (typeof providerSettings.instructions === 'string') {
    providerSettings.instructions = sustituirNombre(providerSettings.instructions, nombreBase, entrada.firstName);
  }
  const body = {
    companionId: entrada.companionId,
    name: nombreDeAgenteAvatar(entrada.id, lang),
    voiceId: entrada.voice,
    language: lang,
    providerSettings,
    functions: info.functions ?? [],
    faqCollections: info.faqCollections ?? [],
  };
  for (const key of ['knowledgeBaseId', 'disableIdleTimeout', 'useWebSearch', 'mode', 'tags']) {
    if (info[key] !== undefined && info[key] !== null) body[key] = info[key];
  }
  return body;
}

/** NAP-S1: solo actualiza si cambiaron la companion, la voz, el idioma o el nombre asistente. */
function agenteDesactualizado(actual, body) {
  const info = datosDe(actual);
  if (info.companionId !== body.companionId) return true;
  if (info.voiceId !== body.voiceId) return true;
  if (info.language !== body.language) return true;
  if (typeof info.name === 'string' && info.name !== body.name) return true;
  return info.providerSettings?.instructions !== body.providerSettings?.instructions;
}

/**
 * NAP-S1: sincroniza los agentes de las entradas no default del catálogo.
 * Entrada: cliente HTTP, catálogo parseado, ruta para escribirlo, entorno y `dryRun`.
 * Salida: catálogo actualizado (en memoria si `--dry-run`) y contadores.
 */
async function sincronizarCatalogo(cliente, catalogo, { catalogPath, env, decir, dryRun }) {
  const defensa = catalogo.avatars.find((entrada) => entrada.default);
  if (!defensa) throw new Error('contenido/avatares.json no tiene avatar default');
  const nombreBase = defensa.firstName;
  const entradas = catalogo.avatars.filter((entrada) => !entrada.default);
  const existentes = lista(await cliente.get('/public/agents'));

  // NAP-S1: contar antes de crear. 35 eventos×2 + 2 base + 7 catálogo×2 = 86 < 100.
  const nuevas = entradas.reduce((total, entrada) => {
    const faltan = ['es', 'en'].filter(
      (lang) => !existentes.some((item) => nombreDe(item) === nombreDeAgenteAvatar(entrada.id, lang)),
    ).length;
    return total + faltan;
  }, 0);
  if (existentes.length + nuevas > MARGEN_AGENTES) {
    throw new Error(
      `Napster tendría ${existentes.length + nuevas} agentes y superaría el margen de ${MARGEN_AGENTES} (límite ${LIMITE_AGENTES})`,
    );
  }

  const baseIds = {};
  for (const lang of ['es', 'en']) {
    const clave = lang === 'es' ? 'NAPSTER_AGENT_ID_ES' : 'NAPSTER_AGENT_ID_EN';
    const delEntorno = typeof env[clave] === 'string' ? env[clave].trim() : '';
    const delCatalogo = idDe(existentes.find((item) => nombreDe(item) === NOMBRE_AGENTE_BASE[lang]));
    const id = delEntorno || delCatalogo;
    if (!id) throw new Error(`falta el agente base ${NOMBRE_AGENTE_BASE[lang]} (env ${clave} o nombre en Napster)`);
    baseIds[lang] = id;
  }

  const bases = {};
  for (const lang of ['es', 'en']) bases[lang] = await cliente.get(`/public/agents/${baseIds[lang]}`);

  let creados = 0;
  let actualizados = 0;
  let cambio = false;
  for (const entrada of entradas) {
    for (const lang of ['es', 'en']) {
      const body = cuerpoAgenteDesdeBase(bases[lang], entrada, lang, nombreBase);
      const existente = existentes.find((item) => nombreDe(item) === body.name);
      let id;
      if (existente && idDe(existente)) {
        id = idDe(existente);
        const actual = await cliente.get(`/public/agents/${id}`);
        if (agenteDesactualizado(actual, body)) {
          if (!dryRun) {
            await cliente.patch(`/public/agents/${id}`, body);
            await cliente.put(`/public/agents/${id}/channels/webrtc`, { videoPolicy: 'deferred' });
          }
          actualizados += 1;
          decir(`agente ${dryRun ? 'a actualizar' : 'actualizado'}: ${body.name} (${id})`);
        } else {
          decir(`agente reutilizado: ${body.name} (${id})`);
        }
      } else {
        if (dryRun) {
          id = '<pendiente>';
        } else {
          const creado = await cliente.post('/public/agents', body);
          id = idDe(creado);
          if (!id) throw new Error(`Napster no devolvió id para el agente ${body.name}`);
          await cliente.put(`/public/agents/${id}/channels/webrtc`, { videoPolicy: 'deferred' });
          existentes.push(creado);
        }
        creados += 1;
        decir(`agente ${dryRun ? 'a crear' : 'creado'}: ${body.name}${id === '<pendiente>' ? '' : ` (${id})`}`);
      }
      const campo = lang === 'es' ? 'agentIdEs' : 'agentIdEn';
      if (entrada[campo] !== id) {
        entrada[campo] = id;
        cambio = true;
      }
    }
  }

  if (cambio && !dryRun) await writeFile(catalogPath, `${JSON.stringify(catalogo, null, 2)}\n`, 'utf8');
  return { creados, actualizados, cambio };
}

/** NAP-S1: `--list-voices` solo informa; si la API no expone voces, lo dice y no falla. */
async function listarVoces(cliente, decir) {
  try {
    const json = await cliente.get('/public/voices');
    const voces = lista(json);
    if (voces.length === 0) {
      decir('Napster no expone un catálogo de voces en /public/voices.');
      return [];
    }
    for (const voz of voces) {
      decir(`${idDe(voz) ?? '?'} — ${nombreDe(voz) || JSON.stringify(voz)}`);
    }
    return voces;
  } catch (error) {
    decir(`Napster no expone /public/voices: ${error instanceof Error ? error.message : 'sin detalle'}`);
    return [];
  }
}

/**
 * Ejecuta la configuración. `fetchImpl` y `salida` son inyectables para la prueba sin red.
 * Devuelve { dryRun, ids } y no imprime la clave en ningún camino.
 */
export async function runSetup({
  argv = [],
  env = process.env,
  fetchImpl = fetch,
  salida = console.log,
  catalogPath = RUTA_AVATARES,
} = {}) {
  const args = parseArgs(argv);
  const dryRun = Boolean(args['dry-run']);
  const companionId = typeof args.companion === 'string' ? args.companion : '';
  const voiceId = typeof args.voice === 'string' ? args.voice : '';
  const knowledgeBaseUrl = typeof args['knowledge-base-url'] === 'string' ? args['knowledge-base-url'] : '';
  const apiKey = (env.NAPSTER_API_KEY ?? '').trim();
  const baseUrl = (env.NAPSTER_API_BASE ?? 'https://napster-api.napster.com').trim();

  if (args['list-voices']) {
    if (dryRun) {
      salida('napster:setup --list-voices --dry-run (sin red)');
      salida('consulta prevista: GET /public/voices');
      return { dryRun: true, ids: null, voces: null };
    }
    if (!apiKey) throw new Error('napster:setup requiere NAPSTER_API_KEY en el entorno (no se imprime)');
    const cliente = await crearCliente({ apiKey, baseUrl, fetchImpl });
    const voces = await listarVoces(cliente, salida);
    return { dryRun: false, ids: null, voces };
  }

  if (args.catalog) {
    const catalogo = JSON.parse(await readFile(catalogPath, 'utf8'));
    const entradas = catalogo.avatars.filter((entrada) => !entrada.default);
    if (dryRun) {
      salida('napster:setup --catalog --dry-run (sin red, sin escribir ids)');
      salida(`entradas no default: ${entradas.length}`);
      for (const entrada of entradas) {
        salida(`${nombreDeAgenteAvatar(entrada.id, 'es')}, ${nombreDeAgenteAvatar(entrada.id, 'en')}`);
      }
      salida('base: NAPSTER_AGENT_ID_ES/EN o somospanas-es/en');
      salida('canal: PUT /public/agents/{id}/channels/webrtc { videoPolicy: "deferred" }');
      return { dryRun: true, ids: null, catalogo: null };
    }
    if (!apiKey) throw new Error('napster:setup requiere NAPSTER_API_KEY en el entorno (no se imprime)');
    const cliente = await crearCliente({ apiKey, baseUrl, fetchImpl });
    const resultado = await sincronizarCatalogo(cliente, catalogo, {
      catalogPath,
      env,
      decir: salida,
      dryRun: false,
    });
    salida(`catálogo: ${resultado.creados} creados, ${resultado.actualizados} actualizados`);
    return { dryRun: false, ids: null, catalogo: resultado };
  }

  if (dryRun) {
    salida('napster:setup --dry-run (sin red, sin escribir ids)');
    salida(`base: ${baseUrl}`);
    salida(`companion: ${companionId || '<pendiente>'}`);
    salida(`voice: ${voiceId || '<pendiente>'}`);
    salida(`funciones: ${AVATAR_TOOL_NAMES.join(', ')}`);
    salida(`FAQ es: ${NOMBRE_FAQ_BASE}-es (máx. 50 pares)`);
    salida(`FAQ en: ${NOMBRE_FAQ_BASE}-en (máx. 50 pares)`);
    if (knowledgeBaseUrl) {
      const base = knowledgeBaseUrl.replace(/\/+$/, '');
      salida(`conocimiento: ${NOMBRE_CONOCIMIENTO}`);
      for (const archivo of ARCHIVOS_CONOCIMIENTO) salida(`  ${base}/${archivo}`);
    } else {
      salida('conocimiento: no configurado (sin --knowledge-base-url)');
    }
    salida('agentes: somospanas-es (es), somospanas-en (en)');
    salida('canal: PUT /public/agents/{id}/channels/webrtc { videoPolicy: "deferred" }');
    return { dryRun: true, ids: null };
  }

  if (!companionId || !voiceId) throw new Error('napster:setup requiere --companion <id> y --voice <voz>');
  if (!apiKey) throw new Error('napster:setup requiere NAPSTER_API_KEY en el entorno (no se imprime)');

  const avatar = JSON.parse(await readFile(join(RAIZ, 'contenido', 'avatar.json'), 'utf8'));
  const avatares = JSON.parse(await readFile(catalogPath, 'utf8'));
  const defensa = avatares.avatars.find((entrada) => entrada.default);
  if (!defensa) throw new Error('contenido/avatares.json no tiene avatar default');
  const preguntas = JSON.parse(await readFile(join(RAIZ, 'contenido', 'preguntas.json'), 'utf8')).preguntas ?? [];
  const cliente = await crearCliente({ apiKey, baseUrl, fetchImpl });

  const funcionesExistentes = lista(await cliente.get('/public/functions'));
  const funciones = await sincronizarFunciones(cliente, salida, funcionesExistentes);
  const faqsExistentes = lista(await cliente.get('/public/faqs'));
  const faqs = {
    es: await sincronizarFaq(cliente, salida, faqsExistentes, 'es', preguntas),
    en: await sincronizarFaq(cliente, salida, faqsExistentes, 'en', preguntas),
  };
  const conocimiento = knowledgeBaseUrl
    ? await sincronizarConocimiento(
        cliente,
        salida,
        lista(await cliente.get('/public/knowledge-bases')),
        knowledgeBaseUrl,
      )
    : null;
  const agentesExistentes = lista(await cliente.get('/public/agents'));

  const agentes = {};
  for (const lang of ['es', 'en']) {
    const nombre = `somospanas-${lang}`;
    const body = {
      companionId,
      name: nombre,
      voiceId,
      language: lang,
      providerSettings: {
        instructions: sustituirNombre(avatar[lang].instructions, '', defensa.firstName),
        temperature: 0.3,
      },
      functions: funciones,
      faqCollections: [faqs[lang]],
      ...(conocimiento ? { knowledgeBaseId: conocimiento } : {}),
    };
    const id = await sincronizarAgente(cliente, salida, agentesExistentes, { name: nombre, body });
    await cliente.put(`/public/agents/${id}/channels/webrtc`, { videoPolicy: 'deferred' });
    decirCanal(salida, id);
    agentes[lang] = id;
  }

  const ids = { funciones, faqs, conocimiento, agentes };
  await mkdir(dirname(RUTA_IDS), { recursive: true });
  await writeFile(RUTA_IDS, `${JSON.stringify(ids, null, 2)}\n`, 'utf8');
  salida(`NAPSTER_AGENT_ID_ES=${agentes.es}`);
  salida(`NAPSTER_AGENT_ID_EN=${agentes.en}`);
  salida(`ids guardados en ${RUTA_IDS}`);
  return { dryRun: false, ids };
}

function decirCanal(salida, id) {
  salida(`canal webrtc deferred: ${id}`);
}

const esCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCli) {
  try {
    await runSetup({ argv: process.argv.slice(2) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'napster:setup falló');
    process.exitCode = 1;
  }
}
