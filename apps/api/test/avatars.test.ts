/**
 * Catálogo público de avatares Napster (NAP-S1), sin red.
 * Depende de `buildApp` y del JSON versionado; comprueba privacidad y hosts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Pool } from '../src/db/pool.js';
import { testConfig } from './harness.js';

interface CatalogoPrueba {
  avatars: Array<{
    id: string;
    default: boolean;
    agentIdEs: string | null;
    agentIdEn: string | null;
  }>;
}

const catalogo = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', '..', 'contenido', 'avatares.json'), 'utf8'),
) as CatalogoPrueba;


function poolParaSitio(): Pool {
  return {
    query: async (sql: string) => {
      if (sql.includes('SELECT id FROM tenants WHERE slug')) return { rows: [{ id: 'tenant-a' }] };
      return { rows: [] };
    },
  } as unknown as Pool;
}

async function app(pool: Pool = { query: async () => ({ rows: [] }) } as unknown as Pool) {
  return buildApp({
    pool,
    config: testConfig({ NAPSTER_ENABLED: 'true', NAPSTER_API_KEY: 'k', NAPSTER_AGENT_ID_ES: 'es', NAPSTER_AGENT_ID_EN: 'en' }),
    logger: false,
  });
}

describe('GET /api/avatars (NAP-S1)', () => {
  it('en raíz y legado devuelve solo entradas listas, sin agentIds ni datos internos', async () => {
    const servidor = await app();
    for (const host of ['somospanas.com', 'fiestapay.somospanas.com']) {
      const response = await servidor.inject({ method: 'GET', url: '/api/avatars', headers: { host } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('public, max-age=60');
      const body = response.json<{ avatars: Array<Record<string, unknown>> }>();
      expect(body.avatars.length).toBeGreaterThan(0);
      const listas = catalogo.avatars
        .filter((entrada) => entrada.default || (entrada.agentIdEs && entrada.agentIdEn))
        .map((entrada) => entrada.id);
      expect(body.avatars.map((entrada) => entrada.id).sort()).toEqual(listas.sort());
      for (const entrada of body.avatars) {
        expect(Object.keys(entrada).sort()).toEqual([
          'default',
          'displayName',
          'firstName',
          'gender',
          'id',
          'loopUrl',
          'previewUrl',
          'tags',
        ]);
      }
      expect(response.body).not.toContain('agentId');
      expect(response.body).not.toContain('companionId');
      expect(response.body).not.toContain('voice');
    }
    await servidor.close();
  });

  it('también responde en el subdominio de un sitio de grupo', async () => {
    const servidor = await app(poolParaSitio());
    const response = await servidor.inject({
      method: 'GET',
      url: '/api/avatars',
      headers: { host: 'grupo-a.somospanas.com' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ avatars: unknown[] }>().avatars.length).toBeGreaterThan(0);
    await servidor.close();
  });
});
