/**
 * Pruebas del `--dry-run` de `scripts/napster/setup.mjs` (NAP-F2 / NAP-F4s), sin red.
 * Depende del propio script y de los contratos de tools; no escribe `.local/napster/ids.json`.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSetup } from '../../../scripts/napster/setup.mjs';

function salidaCapturada() {
  const lineas: string[] = [];
  return { lineas, salida: (linea: string) => lineas.push(linea) };
}

describe('napster:setup --dry-run (NAP-F4s)', () => {
  it('imprime el plan con FAQ por idioma sin llamar a la red ni escribir ids', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('no debe haber red en --dry-run');
    });
    const { lineas, salida } = salidaCapturada();
    const resultado = await runSetup({
      argv: ['--dry-run', '--companion', 'comp_demo', '--voice', 'voz_demo'],
      env: { NAPSTER_API_KEY: 'no-se-imprime', NAPSTER_API_BASE: 'https://napster.test' },
      fetchImpl,
      salida,
    });

    expect(resultado.dryRun).toBe(true);
    expect(resultado.ids).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lineas.join('\n')).toContain('sin red');
    expect(lineas.join('\n')).toContain('comp_demo');
    expect(lineas.join('\n')).toContain('voz_demo');
    expect(lineas.join('\n')).toContain('FAQ es: somospanas-faq-es');
    expect(lineas.join('\n')).toContain('FAQ en: somospanas-faq-en');
    expect(lineas.join('\n')).toContain('conocimiento: no configurado');
    expect(lineas.join('\n')).toContain('somospanas-es');
    expect(lineas.join('\n')).not.toContain('no-se-imprime');
  });

  it('con --knowledge-base-url imprime los dos markdown sin red', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('no debe haber red en --dry-run');
    });
    const { lineas, salida } = salidaCapturada();
    await runSetup({
      argv: [
        '--dry-run',
        '--companion',
        'comp_demo',
        '--voice',
        'voz_demo',
        '--knowledge-base-url',
        'https://somospanas.com/conocimiento/',
      ],
      env: { NAPSTER_API_KEY: 'no-se-imprime', NAPSTER_API_BASE: 'https://napster.test' },
      fetchImpl,
      salida,
    });

    const texto = lineas.join('\n');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(texto).toContain('conocimiento: somospanas-conocimiento');
    expect(texto).toContain('https://somospanas.com/conocimiento/somospanas.es.md');
    expect(texto).toContain('https://somospanas.com/conocimiento/somospanas.en.md');
  });
});

interface AgenteFalso {
  id: string;
  name?: string;
  companionId?: string;
  voiceId?: string;
  language?: string;
  providerSettings?: { instructions?: string };
  functions?: string[];
  faqCollections?: string[];
}

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Napster falso en memoria: lista, GET, POST, PATCH y canal, sin red. */
function napsterFalso(initial: AgenteFalso[] = []) {
  const agents: AgenteFalso[] = [...initial];
  const bases: Record<string, AgenteFalso> = {
    'base-es': {
      id: 'base-es',
      name: 'somospanas-es',
      voiceId: 'voz-base-es',
      language: 'es',
      providerSettings: { instructions: 'Hola, soy Elena, tu guía en Somos Panas.' },
      functions: ['fill_event_draft'],
      faqCollections: ['faq-es'],
    },
    'base-en': {
      id: 'base-en',
      name: 'somospanas-en',
      voiceId: 'voz-base-en',
      language: 'en',
      providerSettings: { instructions: 'Hi, I am Elena, your Somos Panas guide.' },
      functions: ['fill_event_draft'],
      faqCollections: ['faq-en'],
    },
  };
  let secuencia = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    if (url.pathname === '/public/agents' && method === 'GET') return respuesta(200, { items: agents });
    if (url.pathname === '/public/agents' && method === 'POST') {
      const body = JSON.parse(String(init.body)) as AgenteFalso;
      const creado = { ...body, id: `agent-${++secuencia}` };
      agents.push(creado);
      return respuesta(200, { id: creado.id });
    }
    const match = /^\/public\/agents\/([^/]+)$/.exec(url.pathname);
    if (match && method === 'GET') {
      const id = decodeURIComponent(match[1]!);
      const agente = agents.find((item) => item.id === id) ?? bases[id];
      return agente ? respuesta(200, agente) : respuesta(404, {});
    }
    if (match && method === 'PATCH') {
      const id = decodeURIComponent(match[1]!);
      const body = JSON.parse(String(init.body)) as AgenteFalso;
      const index = agents.findIndex((item) => item.id === id);
      if (index >= 0) agents[index] = { ...agents[index], ...body, id };
      return respuesta(200, {});
    }
    if (/^\/public\/agents\/[^/]+\/channels\/webrtc$/.test(url.pathname) && method === 'PUT') {
      return respuesta(200, {});
    }
    throw new Error(`llamada inesperada: ${method} ${url.pathname}`);
  });
  return { fetchImpl, agents, bases };
}

const ENTORNO = {
  NAPSTER_API_KEY: 'no-se-imprime',
  NAPSTER_API_BASE: 'https://napster.test',
  NAPSTER_AGENT_ID_ES: 'base-es',
  NAPSTER_AGENT_ID_EN: 'base-en',
};

const dirsTemporales: string[] = [];

afterEach(async () => {
  while (dirsTemporales.length > 0) {
    await rm(dirsTemporales.pop()!, { recursive: true, force: true });
  }
});

/** Copia el catálogo real a un temporal y agrega una avatar no default con agentes null. */
async function catalogoTemporal(entradaExtra = true): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'napster-s1-'));
  dirsTemporales.push(dir);
  const ruta = join(dir, 'avatares.json');
  const real = JSON.parse(
    await readFile(join(import.meta.dirname, '..', '..', '..', 'contenido', 'avatares.json'), 'utf8'),
  ) as { avatars: Array<Record<string, unknown>> };
  const defensa = real.avatars.find((entrada) => entrada.default === true);
  if (!defensa) throw new Error('catálogo sin default');
  real.avatars = [defensa];
  if (entradaExtra) {
    real.avatars.push({
      id: 'lucia',
      firstName: 'Lucia',
      displayName: 'Lucia',
      gender: 'female',
      companionId: 'companion-lucia',
      previewUrl: 'https://example.test/lucia.jpg',
      loopUrl: null,
      voice: 'voz-lucia',
      tags: ['fiesta'],
      agentIdEs: null,
      agentIdEn: null,
      default: false,
    });
  }
  await writeFile(ruta, `${JSON.stringify(real, null, 2)}\n`, 'utf8');
  return ruta;
}

describe('napster:setup --catalog (NAP-S1)', () => {
  it('crea dos agentes por entrada no default, con su companion, voz y nombre', async () => {
    const catalogPath = await catalogoTemporal();
    const { fetchImpl, agents } = napsterFalso();
    const { lineas, salida } = salidaCapturada();
    const resultado = await runSetup({
      argv: ['--catalog'],
      env: ENTORNO,
      fetchImpl,
      salida,
      catalogPath,
    });

    expect(resultado.catalogo?.creados).toBe(2);
    const lucia = agents.filter((item) => item.name?.startsWith('somospanas-avatar-lucia-'));
    expect(lucia).toHaveLength(2);
    expect(lucia.map((item) => item.name).sort()).toEqual([
      'somospanas-avatar-lucia-en',
      'somospanas-avatar-lucia-es',
    ]);
    for (const agente of lucia) {
      expect(agente.companionId).toBe('companion-lucia');
      expect(agente.voiceId).toBe('voz-lucia');
      expect(agente.providerSettings?.instructions).toContain('Lucia');
      expect(agente.providerSettings?.instructions).not.toContain('Elena');
    }
    const guardado = JSON.parse(await readFile(catalogPath, 'utf8')) as {
      avatars: Array<{ id: string; agentIdEs: string | null; agentIdEn: string | null }>;
    };
    const entrada = guardado.avatars.find((item) => item.id === 'lucia');
    expect(entrada?.agentIdEs).toMatch(/^agent-/);
    expect(entrada?.agentIdEn).toMatch(/^agent-/);
    expect(entrada?.agentIdEs).not.toBe(entrada?.agentIdEn);
    expect(lineas.join('\n')).not.toContain('no-se-imprime');
  });

  it('es idempotente: una segunda pasada busca por nombre y no vuelve a crear', async () => {
    const catalogPath = await catalogoTemporal();
    const { fetchImpl, agents } = napsterFalso();
    const primera = await runSetup({ argv: ['--catalog'], env: ENTORNO, fetchImpl, salida: () => undefined, catalogPath });
    expect(primera.catalogo?.creados).toBe(2);
    const postsPrimera = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST').length;

    const segunda = await runSetup({ argv: ['--catalog'], env: ENTORNO, fetchImpl, salida: () => undefined, catalogPath });
    const postsSegunda = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST').length;
    expect(segunda.catalogo?.creados).toBe(0);
    expect(postsSegunda).toBe(postsPrimera);
    const nombres = agents.map((item) => item.name).filter((name) => name?.startsWith('somospanas-avatar-lucia-'));
    expect(nombres).toHaveLength(2);
    expect(new Set(nombres).size).toBe(2);
  });

  it('aborta antes de crear si el total superaría el margen de 95 agentes', async () => {
    const catalogPath = await catalogoTemporal();
    const llenos = Array.from({ length: 95 }, (_, i) => ({ id: `existente-${i}`, name: `existente-${i}` }));
    const { fetchImpl } = napsterFalso(llenos);
    await expect(
      runSetup({ argv: ['--catalog'], env: ENTORNO, fetchImpl, salida: () => undefined, catalogPath }),
    ).rejects.toThrow(/95/);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    const guardado = JSON.parse(await readFile(catalogPath, 'utf8')) as {
      avatars: Array<{ id: string; agentIdEs: string | null }>;
    };
    expect(guardado.avatars.find((item) => item.id === 'lucia')?.agentIdEs).toBeNull();
  });
});

// NAP-S5: Napster falso con las formas reales de FAQ paginada y archivos paginados.
interface ParFaq {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
}

interface ArchivoKb {
  id: string;
  status: string;
  originalName: string;
  summary: string;
  createdAt: string;
}

async function rutaIdsTemporal(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'napster-s5-'));
  dirsTemporales.push(dir);
  return join(dir, 'ids.json');
}

function napsterCompleto({
  falloRelecturaFaq = false,
  falloRelecturaConocimiento = false,
  falloRespuesta = false,
  paresEsIniciales = 2,
  archivosAjenos = 0,
  tamanoPaginaMax = 100,
} = {}) {
  const baseTiempo = Date.parse('2026-10-01T00:00:00.000Z');
  const crearPar = (sufijo: string, question: string, answer: string, indice: number): ParFaq => ({
    id: sufijo,
    question,
    answer,
    createdAt: new Date(baseTiempo + indice * 1000).toISOString(),
  });
  const faqEs = Array.from({ length: paresEsIniciales }, (_, i) =>
    crearPar(`es-vieja-${i + 1}`, `¿Pregunta vieja ES ${i + 1}?`, `Respuesta vieja ES ${i + 1}.`, i),
  );
  const colecciones = [
    { id: 'faq-es', name: 'somospanas-faq-es', faqs: faqEs },
    {
      id: 'faq-en',
      name: 'somospanas-faq-en',
      faqs: [crearPar('en-vieja-1', 'Old EN question?', 'Old EN answer.', 500)],
    },
  ];
  const agentes = [
    {
      id: 'base-es',
      name: 'somospanas-es',
      companionId: 'comp-viejo',
      voiceId: 'voz-vieja',
      language: 'es',
      providerSettings: { instructions: 'Soy Elena.' },
      functions: [] as string[],
      faqCollections: ['faq-es'],
    },
    {
      id: 'base-en',
      name: 'somospanas-en',
      companionId: 'comp-viejo',
      voiceId: 'voz-vieja',
      language: 'en',
      providerSettings: { instructions: 'I am Elena.' },
      functions: [] as string[],
      faqCollections: ['faq-en'],
    },
  ];
  const basesConocimiento = [{ id: 'kb-1', name: 'somospanas-conocimiento' }];
  const crearArchivo = (id: string, originalName: string): ArchivoKb => ({
    id,
    status: 'ready',
    originalName,
    summary: '',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  const archivos: ArchivoKb[] = [
    crearArchivo('archivo-es', 'somospanas.es.md'),
    crearArchivo('archivo-en', 'somospanas.en.md'),
    crearArchivo('archivo-otro', 'notas-internas.md'),
    ...Array.from({ length: archivosAjenos }, (_, i) => crearArchivo(`archivo-ajeno-${i + 1}`, `ajeno-${i + 1}.md`)),
  ];
  const llamadas: Array<{ method: string; path: string; search: string; body?: unknown }> = [];
  let secuencia = 0;

  // NAP-S5: página real {items, filteredCount, totalCount, pageIndex, pageSize}.
  const paginar = (items: unknown[], url: URL) => {
    const solicitado = Number(url.searchParams.get('pageSize') ?? 10);
    const pageSize = Math.min(Number.isFinite(solicitado) && solicitado > 0 ? solicitado : 10, tamanoPaginaMax);
    const indiceCrudo = Number(url.searchParams.get('pageIndex') ?? 0);
    const pageIndex = Number.isInteger(indiceCrudo) && indiceCrudo >= 0 ? indiceCrudo : 0;
    const inicio = pageIndex * pageSize;
    return {
      items: items.slice(inicio, inicio + pageSize),
      filteredCount: items.length,
      totalCount: items.length,
      pageIndex,
      pageSize,
    };
  };

  const fetchImpl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    llamadas.push({ method, path: url.pathname, search: url.search, body });

    if (url.pathname === '/public/functions' && method === 'GET') return respuesta(200, { items: [] });
    if (url.pathname === '/public/functions' && method === 'POST') {
      return respuesta(200, { id: `fn-${++secuencia}` });
    }
    if (/^\/public\/functions\/[^/]+$/.test(url.pathname) && method === 'PUT') return respuesta(200, {});

    if (url.pathname === '/public/faqs' && method === 'GET') {
      return respuesta(
        200,
        { items: colecciones.map(({ id, name }) => ({ id, name })) },
      );
    }
    if (url.pathname === '/public/faqs' && method === 'POST') {
      const creada = { id: `faq-${++secuencia}`, name: String(body?.name), faqs: [] as ParFaq[] };
      for (const par of (body?.faqs as Array<{ question: string; answer: string }>) ?? []) {
        creada.faqs.push(crearPar(`par-${++secuencia}`, par.question, par.answer, 1000 + secuencia));
      }
      colecciones.push(creada);
      return respuesta(200, { id: creada.id });
    }
    const matchFaq = /^\/public\/faqs\/([^/]+)$/.exec(url.pathname);
    if (matchFaq && method === 'GET') {
      const coleccion = colecciones.find((item) => item.id === decodeURIComponent(matchFaq[1]!));
      if (!coleccion) return respuesta(404, {});
      // NAP-S5: el GET de la colección solo trae metadatos, no los pares.
      return respuesta(200, {
        id: coleccion.id,
        name: coleccion.name,
        created: '2026-10-01T00:00:00.000Z',
        itemsCount: coleccion.faqs.length,
      });
    }
    const matchItem = /^\/public\/faqs\/([^/]+)\/items(?:\/([^/]+))?$/.exec(url.pathname);
    if (matchItem) {
      const coleccion = colecciones.find((item) => item.id === decodeURIComponent(matchItem[1]!));
      if (!coleccion) return respuesta(404, {});
      if (method === 'GET') {
        // NAP-S5: Napster devuelve del más nuevo al más viejo y createdAt se repite.
        const visibles: ParFaq[] = [...coleccion.faqs]
          .reverse()
          .map((par) => ({ ...par, createdAt: '2026-10-01T00:00:00.000Z' }));
        if (falloRespuesta && visibles.length > 0) {
          visibles[0] = { ...visibles[0]!, answer: `${visibles[0]!.answer} (cambiada)` };
        }
        if (falloRelecturaFaq) visibles.push(crearPar('fantasma', '¿Sobrante?', 'No debe estar.', 9000));
        return respuesta(200, paginar(visibles, url));
      }
      if (method === 'POST') {
        coleccion.faqs.push(
          crearPar(`par-${++secuencia}`, String(body?.question), String(body?.answer), 1000 + secuencia),
        );
        return respuesta(200, {});
      }
      if (method === 'DELETE' && matchItem[2]) {
        const id = decodeURIComponent(matchItem[2]);
        coleccion.faqs = coleccion.faqs.filter((par) => par.id !== id);
        return respuesta(200, {});
      }
    }

    if (url.pathname === '/public/knowledge-bases' && method === 'GET') {
      return respuesta(200, { items: basesConocimiento });
    }
    if (url.pathname === '/public/knowledge-bases' && method === 'POST') {
      const creada = { id: `kb-${++secuencia}`, name: String(body?.name) };
      basesConocimiento.push(creada);
      return respuesta(200, { id: creada.id });
    }
    const matchArchivos = /^\/public\/knowledge-bases\/([^/]+)\/files(?:\/([^/]+))?$/.exec(url.pathname);
    if (matchArchivos) {
      if (method === 'GET') {
        let visibles = archivos;
        if (falloRelecturaConocimiento) {
          visibles = archivos.filter((archivo) => archivo.originalName !== 'somospanas.en.md');
        }
        return respuesta(200, paginar(visibles, url));
      }
      if (method === 'POST') {
        const originalName = String(body?.url ?? '').split('/').pop() ?? '';
        archivos.push(crearArchivo(`archivo-${++secuencia}`, originalName));
        return respuesta(200, {});
      }
      if (method === 'DELETE' && matchArchivos[2]) {
        const id = decodeURIComponent(matchArchivos[2]);
        const indice = archivos.findIndex((archivo) => archivo.id === id);
        if (indice >= 0) archivos.splice(indice, 1);
        return respuesta(200, {});
      }
    }

    if (url.pathname === '/public/agents' && method === 'GET') return respuesta(200, { items: agentes });
    const matchAgente = /^\/public\/agents\/([^/]+)$/.exec(url.pathname);
    if (matchAgente && method === 'PATCH') {
      const id = decodeURIComponent(matchAgente[1]!);
      const indice = agentes.findIndex((item) => item.id === id);
      if (indice >= 0) agentes[indice] = { ...agentes[indice], ...(body as object), id } as unknown as (typeof agentes)[number];
      return respuesta(200, {});
    }
    if (/^\/public\/agents\/[^/]+\/channels\/webrtc$/.test(url.pathname) && method === 'PUT') {
      return respuesta(200, {});
    }
    throw new Error(`llamada inesperada: ${method} ${url.pathname}`);
  });

  return { fetchImpl, colecciones, archivos, basesConocimiento, llamadas };
}

/** Lee las preguntas reales para comparar contra lo que el setup agrega. */
async function preguntasReales(): Promise<Array<{ pregunta: Record<string, string> }>> {
  const json = JSON.parse(
    await readFile(join(import.meta.dirname, '..', '..', '..', 'contenido', 'preguntas.json'), 'utf8'),
  ) as { preguntas: Array<{ pregunta: Record<string, string> }> };
  return json.preguntas.slice(0, 50);
}

const ARGS_BASE = [
  '--companion',
  'comp_demo',
  '--voice',
  'voz_demo',
  '--knowledge-base-url',
  'https://somospanas.com/conocimiento/',
];

describe('napster:setup --refresh-content (NAP-S5)', () => {
  it('borra los pares viejos, agrega los nuevos en orden y verifica el conteo', async () => {
    const { fetchImpl, colecciones, llamadas } = napsterCompleto();
    const { lineas, salida } = salidaCapturada();
    await runSetup({
      argv: [...ARGS_BASE, '--refresh-content'],
      env: ENTORNO,
      fetchImpl,
      salida,
      idsPath: await rutaIdsTemporal(),
    });

    const preguntas = await preguntasReales();
    for (const [indice, lang] of ['es', 'en'].entries()) {
      const coleccion = colecciones[indice]!;
      expect(coleccion.faqs.map((par) => par.question)).toEqual(preguntas.map((item) => item.pregunta[lang]));
      expect(coleccion.faqs.length).toBeLessThanOrEqual(50);
    }

    const primeraAgregacion = llamadas.findIndex(
      (llamada) => llamada.method === 'POST' && llamada.path === '/public/faqs/faq-es/items',
    );
    const borrados = llamadas
      .map((llamada, indice) => ({ ...llamada, indice }))
      .filter((llamada) => llamada.method === 'DELETE' && llamada.path.startsWith('/public/faqs/faq-es/items/'));
    expect(borrados).toHaveLength(2);
    expect(borrados.every((llamada) => llamada.indice < primeraAgregacion)).toBe(true);
    expect(lineas.join('\n')).toContain('2 pares borrados');
    expect(lineas.join('\n')).not.toContain('no-se-imprime');
  });

  it('borra solo los dos archivos propios, conserva el ajeno y los vuelve a agregar por URL', async () => {
    const { fetchImpl, archivos, llamadas } = napsterCompleto();
    await runSetup({
      argv: [...ARGS_BASE, '--refresh-content'],
      env: ENTORNO,
      fetchImpl,
      salida: () => undefined,
      idsPath: await rutaIdsTemporal(),
    });

    expect(archivos.map((archivo) => archivo.originalName).sort()).toEqual([
      'notas-internas.md',
      'somospanas.en.md',
      'somospanas.es.md',
    ]);
    const borrados = llamadas.filter(
      (llamada) => llamada.method === 'DELETE' && llamada.path.startsWith('/public/knowledge-bases/kb-1/files/'),
    );
    expect(borrados.map((llamada) => llamada.path).sort()).toEqual([
      '/public/knowledge-bases/kb-1/files/archivo-en',
      '/public/knowledge-bases/kb-1/files/archivo-es',
    ]);
    const altas = llamadas.filter(
      (llamada) => llamada.method === 'POST' && llamada.path === '/public/knowledge-bases/kb-1/files',
    );
    expect(altas.map((llamada) => (llamada.body as { url: string }).url)).toEqual([
      'https://somospanas.com/conocimiento/somospanas.es.md',
      'https://somospanas.com/conocimiento/somospanas.en.md',
    ]);
    expect(llamadas.some((llamada) => llamada.path.includes('archivo-otro') && llamada.method === 'DELETE')).toBe(false);
  });

  it('sin la bandera no hay DELETE ni POST de items o archivos', async () => {
    const { fetchImpl, llamadas, colecciones } = napsterCompleto();
    await runSetup({
      argv: ARGS_BASE,
      env: ENTORNO,
      fetchImpl,
      salida: () => undefined,
      idsPath: await rutaIdsTemporal(),
    });

    expect(llamadas.some((llamada) => llamada.method === 'DELETE')).toBe(false);
    expect(
      llamadas.filter(
        (llamada) =>
          llamada.method === 'POST' && (/\/items$/.test(llamada.path) || /\/files$/.test(llamada.path)),
      ),
    ).toHaveLength(0);
    // Los pares viejos siguen intactos: no se refrescó nada.
    expect(colecciones[0]!.faqs.map((par) => par.id)).toEqual(['es-vieja-1', 'es-vieja-2']);
  });

  it('falla si la relectura de FAQ no coincide', async () => {
    const { fetchImpl } = napsterCompleto({ falloRelecturaFaq: true });
    const { lineas, salida } = salidaCapturada();
    await expect(
      runSetup({
        argv: [...ARGS_BASE, '--refresh-content'],
        env: ENTORNO,
        fetchImpl,
        salida,
        idsPath: await rutaIdsTemporal(),
      }),
    ).rejects.toThrow(/FAQ es: la relectura no coincide/);
    expect(lineas.join('\n')).not.toContain('no-se-imprime');
  });

  it('falla si la relectura de conocimiento no coincide', async () => {
    const { fetchImpl } = napsterCompleto({ falloRelecturaConocimiento: true });
    await expect(
      runSetup({
        argv: [...ARGS_BASE, '--refresh-content'],
        env: ENTORNO,
        fetchImpl,
        salida: () => undefined,
        idsPath: await rutaIdsTemporal(),
      }),
    ).rejects.toThrow(/conocimiento: la relectura no coincide/);
  });

  it('--dry-run --refresh-content no llama a fetch y lista pares y archivos', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('no debe haber red en --dry-run');
    });
    const { lineas, salida } = salidaCapturada();
    const preguntas = await preguntasReales();
    await runSetup({
      argv: ['--dry-run', '--refresh-content', ...ARGS_BASE],
      env: ENTORNO,
      fetchImpl,
      salida,
    });

    const texto = lineas.join('\n');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(texto).toContain(`refrescar: borrar pares y agregar ${preguntas.length} en orden`);
    expect(texto).toContain(preguntas[0]!.pregunta.es!);
    expect(texto).toContain(preguntas[0]!.pregunta.en!);
    expect(texto).toContain('borrar solo estos dos archivos');
    expect(texto).toContain('https://somospanas.com/conocimiento/somospanas.es.md');
    expect(texto).not.toContain('no-se-imprime');
  });

  it('recorre dos páginas de pares y de archivos con la paginación real', async () => {
    const { fetchImpl, colecciones, archivos, llamadas } = napsterCompleto({
      paresEsIniciales: 25,
      archivosAjenos: 25,
      tamanoPaginaMax: 20,
    });
    await runSetup({
      argv: [...ARGS_BASE, '--refresh-content'],
      env: ENTORNO,
      fetchImpl,
      salida: () => undefined,
      idsPath: await rutaIdsTemporal(),
    });

    const preguntas = await preguntasReales();
    expect(colecciones[0]!.faqs.map((par) => par.question)).toEqual(preguntas.map((item) => item.pregunta.es));
    expect(archivos.filter((archivo) => archivo.originalName.startsWith('ajeno-'))).toHaveLength(25);

    const paginasPares = llamadas.filter(
      (llamada) => llamada.method === 'GET' && llamada.path === '/public/faqs/faq-es/items',
    );
    expect(paginasPares.every((llamada) => llamada.search.includes('pageSize=100'))).toBe(true);
    // Dos páginas al borrar (25 viejos) y dos al verificar (23 nuevos).
    expect(paginasPares).toHaveLength(4);
    expect(paginasPares.some((llamada) => llamada.search.includes('pageIndex=1'))).toBe(true);

    const paginasArchivos = llamadas.filter(
      (llamada) => llamada.method === 'GET' && llamada.path === '/public/knowledge-bases/kb-1/files',
    );
    // Dos páginas al borrar (28) y dos al verificar (27 con los ajenos conservados).
    expect(paginasArchivos).toHaveLength(4);
    expect(paginasArchivos.some((llamada) => llamada.search.includes('pageIndex=1'))).toBe(true);
  });

  it('falla si un par cambia la respuesta, con conteo y ejemplo sin textos completos', async () => {
    const { fetchImpl } = napsterCompleto({ falloRespuesta: true });
    const error: unknown = await runSetup({
      argv: [...ARGS_BASE, '--refresh-content'],
      env: ENTORNO,
      fetchImpl,
      salida: () => undefined,
      idsPath: await rutaIdsTemporal(),
    }).then(
      () => new Error('la verificación debía fallar'),
      (fallo: unknown) => fallo,
    );

    expect(error).toBeInstanceOf(Error);
    const mensaje = (error as Error).message;
    expect(mensaje).toMatch(/FAQ es: la relectura no coincide \(faltan 1 pares y sobran 1\)/);
    expect(mensaje).toMatch(/ejemplo: "[^"]{1,40}"/);
    expect(mensaje.length).toBeLessThan(250);
  });
});
