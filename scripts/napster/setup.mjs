/**
 * Configuración idempotente del agente Napster de Somos Panas (NAP-F2).
 * Depende de `avatar-tools.ts`, `contenido/avatar.json` y `contenido/preguntas.json`.
 * Crea/actualiza functions, una colección FAQ, los agentes es/en y el canal webrtc `deferred`.
 * Con `--dry-run` no hace red ni escribe ids. Nunca imprime la clave.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AVATAR_TOOLS, AVATAR_TOOL_NAMES } from '../../packages/shared/dist/avatar-tools.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUTA_IDS = join(RAIZ, '.local', 'napster', 'ids.json');
const NOMBRE_FAQ = 'somospanas-faq';

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
  for (const clave of ['items', 'data', 'results', 'functions', 'faqs', 'agents']) {
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

async function sincronizarFaq(cliente, decir, existentes) {
  const actual = existentes.find((item) => nombreDe(item) === NOMBRE_FAQ);
  if (actual && idDe(actual)) {
    decir(`FAQ reutilizada: ${NOMBRE_FAQ} (${idDe(actual)})`);
    return idDe(actual);
  }
  const contenido = JSON.parse(await readFile(join(RAIZ, 'contenido', 'preguntas.json'), 'utf8'));
  const faqs = (contenido.preguntas ?? []).slice(0, 50).map((item) => ({
    question: `${item.pregunta.es}\n${item.pregunta.en}`,
    answer: `${item.respuesta.es}\n${item.respuesta.en}`,
  }));
  const creada = await cliente.post('/public/faqs', { name: NOMBRE_FAQ, faqs });
  const id = idDe(creada);
  if (!id) throw new Error('Napster no devolvió id para la colección FAQ');
  decir(`FAQ creada: ${NOMBRE_FAQ} (${id}, ${faqs.length} pares)`);
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
 * Ejecuta la configuración. `fetchImpl` y `salida` son inyectables para la prueba sin red.
 * Devuelve { dryRun, ids } y no imprime la clave en ningún camino.
 */
export async function runSetup({ argv = [], env = process.env, fetchImpl = fetch, salida = console.log } = {}) {
  const args = parseArgs(argv);
  const dryRun = Boolean(args['dry-run']);
  const companionId = typeof args.companion === 'string' ? args.companion : '';
  const voiceId = typeof args.voice === 'string' ? args.voice : '';
  const apiKey = (env.NAPSTER_API_KEY ?? '').trim();
  const baseUrl = (env.NAPSTER_API_BASE ?? 'https://napster-api.napster.com').trim();

  if (dryRun) {
    salida('napster:setup --dry-run (sin red, sin escribir ids)');
    salida(`base: ${baseUrl}`);
    salida(`companion: ${companionId || '<pendiente>'}`);
    salida(`voice: ${voiceId || '<pendiente>'}`);
    salida(`funciones: ${AVATAR_TOOL_NAMES.join(', ')}`);
    salida(`FAQ: ${NOMBRE_FAQ} (máx. 50 pares desde contenido/preguntas.json)`);
    salida('agentes: somospanas-es (es), somospanas-en (en)');
    salida('canal: PUT /public/agents/{id}/channels/webrtc { videoPolicy: "deferred" }');
    return { dryRun: true, ids: null };
  }

  if (!companionId || !voiceId) throw new Error('napster:setup requiere --companion <id> y --voice <voz>');
  if (!apiKey) throw new Error('napster:setup requiere NAPSTER_API_KEY en el entorno (no se imprime)');

  const avatar = JSON.parse(await readFile(join(RAIZ, 'contenido', 'avatar.json'), 'utf8'));
  const cliente = await crearCliente({ apiKey, baseUrl, fetchImpl });

  const funcionesExistentes = lista(await cliente.get('/public/functions'));
  const funciones = await sincronizarFunciones(cliente, salida, funcionesExistentes);
  const faqsExistentes = lista(await cliente.get('/public/faqs'));
  const faq = await sincronizarFaq(cliente, salida, faqsExistentes);
  const agentesExistentes = lista(await cliente.get('/public/agents'));

  const agentes = {};
  for (const lang of ['es', 'en']) {
    const nombre = `somospanas-${lang}`;
    const body = {
      companionId,
      name: nombre,
      voiceId,
      language: lang,
      providerSettings: { instructions: avatar[lang].instructions, temperature: 0.3 },
      functions: funciones,
      faqCollections: [faq],
    };
    const id = await sincronizarAgente(cliente, salida, agentesExistentes, { name: nombre, body });
    await cliente.put(`/public/agents/${id}/channels/webrtc`, { videoPolicy: 'deferred' });
    decirCanal(salida, id);
    agentes[lang] = id;
  }

  const ids = { funciones, faq, agentes };
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
