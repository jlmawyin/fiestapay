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
