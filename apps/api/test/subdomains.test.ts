/**
 * Direcciones de reunión, host-info, OG y redirect del legado (NAP-S2), sin red.
 * Depende de `buildApp`, `resolveHost` y las funciones puras de subdominios.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Pool } from '../src/db/pool.js';
import {
  baseSubdomainFromTitle,
  chooseEventSubdomain,
  eventPublicUrl,
  suffixedSubdomain,
} from '../src/domain/subdomains.js';
import { testConfig } from './harness.js';

const dirs: string[] = [];
const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
  while (dirs.length > 0) await rm(dirs.pop()!, { recursive: true, force: true });
});

function db(rowsPorConsulta: (sql: string, params: unknown[]) => unknown[] = () => []): Pool {
  return {
    query: async (sql: string, params: unknown[] = []) => ({ rows: rowsPorConsulta(sql, params) }),
  } as unknown as Pool;
}

async function appWith(pool: Pool, overrides: Record<string, string | undefined> = {}) {
  const app = await buildApp({ pool, config: testConfig(overrides), logger: false });
  apps.push(app);
  return app;
}

async function crearWebDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fp-naps2-'));
  dirs.push(dir);
  await writeFile(join(dir, 'index.html'), '<!doctype html><html><head><title>Viejo</title></head><body>SPA</body></html>');
  return dir;
}

describe('subdominios de reunión (NAP-S2)', () => {
  it('quita acentos y emojis, recorta a 40 y cae en reunion si queda corto', () => {
    expect(baseSubdomainFromTitle('¡Cumple de María! 🎉')).toBe('cumpledemaria');
    expect(baseSubdomainFromTitle('  á  ')).toBe('reunion');
    expect(baseSubdomainFromTitle('a'.repeat(60))).toHaveLength(40);
  });

  it('agrega sufijo sin pasar de 40 caracteres', () => {
    expect(suffixedSubdomain('cumple', 2)).toBe('cumple2');
    const largo = suffixedSubdomain('a'.repeat(40), 12);
    expect(largo.length).toBeLessThanOrEqual(40);
    expect(largo.endsWith('12')).toBe(true);
  });

  it('arma la URL con el dominio del servidor', () => {
    expect(eventPublicUrl('cumpledemaria')).toBe('https://cumpledemaria.somospanas.com');
    expect(eventPublicUrl(null)).toBeNull();
  });

  it('NAP-S2: 0017 puede insertar _reuniones sin un CHECK de tenants.slug que lo rechace', () => {
    const raiz = join(import.meta.dirname, '..', '..', '..');
    const tenants = readFileSync(join(raiz, 'apps', 'api', 'src', 'db', 'migrations', '0013_tenants.sql'), 'utf8');
    expect(tenants).not.toMatch(/slug[^\n]*CHECK|CHECK[^\n]*slug/i);
    const migration = readFileSync(
      join(raiz, 'apps', 'api', 'src', 'db', 'migrations', '0017_event_subdomains.sql'),
      'utf8',
    );
    expect(migration).toContain("'_reuniones'");
  });

  it('salta reservados, sitios y eventos ocupados', async () => {
    const fake = db((sql, params) => {
      if (sql.includes('FROM tenants') && params[0] === 'cumple') return [{ ok: 1 }];
      if (sql.includes('FROM events') && params[0] === 'cumple2') return [{ ok: 1 }];
      return [];
    });
    expect(await chooseEventSubdomain(fake, 'www')).toBe('www2');
    expect(await chooseEventSubdomain(fake, 'Cumple')).toBe('cumple3');
    expect(await chooseEventSubdomain(fake, 'otra', 'www')).toBe('www2');
  });
});

describe('host-info (NAP-S2)', () => {
  const pedir = async (app: FastifyInstance, host: string) => {
    const res = await app.inject({ method: 'GET', url: '/api/host-info', headers: { host } });
    return { status: res.statusCode, body: res.json<Record<string, unknown>>() };
  };

  it('responde root, legacy, free y reserved', async () => {
    const app = await appWith(db());
    expect(await pedir(app, 'somospanas.com')).toEqual({ status: 200, body: { kind: 'root' } });
    expect(await pedir(app, 'fiestapay.somospanas.com')).toEqual({ status: 200, body: { kind: 'legacy' } });
    expect(await pedir(app, 'cumple.somospanas.com')).toEqual({
      status: 200,
      body: { kind: 'free', label: 'cumple' },
    });
    expect(await pedir(app, 'api.somospanas.com')).toEqual({
      status: 200,
      body: { kind: 'reserved', label: 'api' },
    });
  });

  it('distingue sitio y evento por lo que existe en la base', async () => {
    const app = await appWith(
      db((sql, params) => {
        if (sql.includes('FROM tenants') && params[0] === 'grupo') return [{ id: 't1' }];
        if (sql.includes('FROM events') && params[0] === 'cumple') {
          return [{ slug: 'cumple-slug', title: 'Cumple', description: 'Fiesta', access_code_hash: null }];
        }
        return [];
      }),
    );
    expect(await pedir(app, 'grupo.somospanas.com')).toEqual({
      status: 200,
      body: { kind: 'site', slug: 'grupo' },
    });
    expect(await pedir(app, 'cumple.somospanas.com')).toEqual({
      status: 200,
      body: { kind: 'event', slug: 'cumple-slug', subdomain: 'cumple' },
    });
  });

  it('un host libre solo expone host-info y sirve la SPA', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fp-naps2-'));
    dirs.push(dir);
    await writeFile(join(dir, 'index.html'), '<!doctype html><html><head></head><body>SPA libre</body></html>');
    const app = await appWith(db(), { SERVE_WEB: '1', WEB_DIST_DIR: dir });
    expect((await app.inject({ method: 'GET', url: '/api/events', headers: { host: 'libre.somospanas.com' } })).statusCode).toBe(404);
    const spa = await app.inject({ method: 'GET', url: '/', headers: { host: 'libre.somospanas.com' } });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('SPA libre');
  });
});

describe('Open Graph y redirect (NAP-S2)', () => {
  it('escapa el título del evento y no lo inyecta como HTML', async () => {
    const dir = await crearWebDir();
    const app = await appWith(
      db((sql, params) => {
        if (sql.includes('FROM tenants')) return [];
        if (sql.includes('FROM events') && params[0] === 'cumple') {
          return [
            {
              slug: 'cumple-slug',
              title: '<script>alert(1)</script>',
              description: 'Fiesta <b>privada</b>',
              access_code_hash: null,
            },
          ];
        }
        return [];
      }),
      { SERVE_WEB: '1', WEB_DIST_DIR: dir },
    );
    const res = await app.inject({ method: 'GET', url: '/', headers: { host: 'cumple.somospanas.com' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.body).not.toContain('<script>alert(1)</script>');
    expect(res.body).toContain('og:url');
    expect(res.body).toContain('https://cumple.somospanas.com/');
    expect(res.body).toContain('/og-image.png');
  });

  it('oculta datos de un evento con código de acceso', async () => {
    const dir = await crearWebDir();
    const app = await appWith(
      db((sql, params) => {
        if (sql.includes('FROM tenants')) return [];
        if (sql.includes('FROM events') && params[0] === 'secreto') {
          return [{ slug: 's', title: 'Secreto', description: 'No', access_code_hash: Buffer.from('x') }];
        }
        return [];
      }),
      { SERVE_WEB: '1', WEB_DIST_DIR: dir },
    );
    const res = await app.inject({ method: 'GET', url: '/', headers: { host: 'secreto.somospanas.com' } });
    expect(res.body).not.toContain('Secreto');
  });

  it('con la bandera on redirige /e/<slug> a la dirección propia y no toca API ni media', async () => {
    const app = await appWith(
      db((sql, params) => {
        if (sql.includes('FROM events') && params[0] === 'cumple-slug') return [{ subdomain: 'cumple' }];
        return [];
      }),
      { LEGACY_HOST_REDIRECT: 'true' },
    );
    const page = await app.inject({ method: 'GET', url: '/e/cumple-slug?x=1', headers: { host: 'fiestapay.somospanas.com' } });
    expect(page.statusCode).toBe(301);
    expect(page.headers.location).toBe('https://cumple.somospanas.com/?x=1');

    const api = await app.inject({ method: 'GET', url: '/api/events', headers: { host: 'fiestapay.somospanas.com' } });
    expect(api.statusCode).not.toBe(301);
    const media = await app.inject({ method: 'GET', url: '/media/avatar/token', headers: { host: 'fiestapay.somospanas.com' } });
    expect(media.statusCode).not.toBe(301);
  });

  it('con la bandera off no redirige', async () => {
    const dir = await crearWebDir();
    const app = await appWith(db(), { LEGACY_HOST_REDIRECT: 'false', SERVE_WEB: '1', WEB_DIST_DIR: dir });
    const page = await app.inject({ method: 'GET', url: '/e/cumple-slug', headers: { host: 'fiestapay.somospanas.com' } });
    expect(page.statusCode).toBe(200);
  });
});
