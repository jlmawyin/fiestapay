/**
 * Prueba visual de la portada NAP-U2: 390×844 y 1440×960 en día y noche, con
 * contraste AA medido en navegador. Sirve la web compilada desde el API con
 * Postgres real (DATABASE_URL) y Chromium propio de Playwright.
 * Depende de: @playwright/test, express (API), pg, vitest.
 */
import { execFileSync, execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import pg from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';

const RAIZ = join(import.meta.dirname, '..', '..');
const PUERTO = Number(process.env.PORTAL_VISUAL_PORT ?? 3099);
const ORIGEN = `http://somospanas.com:${PUERTO}`;
const ARTIFACTS = '/opt/cursor/artifacts';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('portal-visual.test requiere DATABASE_URL (Postgres 16 como CI)');
}

const VIEWPORTS = [
  { etiqueta: 'movil-390x844', width: 390, height: 844 },
  { etiqueta: 'escritorio-1440x960', width: 1440, height: 960 },
] as const;

const TEMAS = [
  { tema: 'dia', fondo: 'rgb(250, 247, 241)', tinta: 'rgb(18, 38, 58)' },
  { tema: 'noche', fondo: 'rgb(10, 25, 48)', tinta: 'rgb(248, 244, 235)' },
] as const;

/** Garantiza apps/web/dist antes de servir; en CI fresco la construye. */
function ensureBuild(): void {
  const dist = join(RAIZ, 'apps', 'web', 'dist', 'index.html');
  if (!existsSync(dist)) {
    execFileSync('npm', ['run', 'build', '-w', '@fiestapay/web'], { cwd: RAIZ, stdio: 'inherit' });
  }
  if (!existsSync(dist)) throw new Error('apps/web/dist/index.html no existe tras el build');
}

/**
 * NAP-U2: deja un evento público listado para la sección de eventos, con el
 * esquema actual (tenants + tenant_settings + events). Idempotente.
 */
async function preparePortalPublicEvent(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM events WHERE slug = 'asado-jardin'`);
    await client.query(`DELETE FROM tenants WHERE slug = 'vecinos-norte'`);
    const tenantId = randomUUID();
    await client.query(
      `INSERT INTO tenants (id, slug, kind, discoverable, payment_provider)
       VALUES ($1, 'vecinos-norte', 'group', false, 'none')`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO tenant_settings (
         tenant_id, display_name, tagline, about,
         color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral,
         modulo_reuniones, modulo_eventos, modulo_recaudacion, modulo_asistente
       ) VALUES ($1,'Vecinos del Norte','','',
         '#F7FAFC','#12263A','#4A5D73','#125FE6','#0B8075','#FFC85A','#E85D4A',
         true,true,true,true)`,
      [tenantId],
    );
    const sessionId = randomUUID();
    await client.query(`INSERT INTO sessions (id, token_hash) VALUES ($1, $2)`, [sessionId, randomBytes(32)]);
    await client.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
         visibility, admin_key_hash, access_code_hash
       ) VALUES (
         $1,'asado-jardin',$2,$3,0,'Asado en el jardín','casa','cena','Trae tu silla',
         now() + interval '2 days', now() + interval '3 days','Quito','[]','[]',2500,8,10000,5000,
         'public',$4,null
       )`,
      [randomUUID(), tenantId, sessionId, randomBytes(32)],
    );
  } finally {
    await client.end();
  }
}

/**
 * NAP-U2: petición al API con Host de raíz (fetch no deja fijar Host y el
 * DNS de somospanas.com no existe fuera de Chromium).
 */
function fetchRoot(path: string): Promise<{ status: number; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = httpGet(
      { host: '127.0.0.1', port: PUERTO, path, headers: { host: 'somospanas.com' }, timeout: 5000 },
      (res) => {
        res.resume();
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, contentType: String(res.headers['content-type'] ?? '') }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Arranca el API sirviendo la web compilada y espera a que responda. */
async function startApiServer(): Promise<ChildProcess> {
  const child = spawn('node', ['--import', 'tsx', 'apps/api/src/index.ts'], {
    cwd: RAIZ,
    env: {
      ...process.env,
      PORT: String(PUERTO),
      SERVE_WEB: '1',
      WEB_DIST_DIR: join(RAIZ, 'apps', 'web', 'dist'),
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 150; i += 1) {
    try {
      const res = await fetchRoot('/api/portal/events');
      if (res.status === 200) return child;
    } catch {
      // El servidor aún arranca; se reintenta.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('el API no respondió a tiempo');
}

/** Contrastes AA medidos sobre estilos computados reales de la portada. */
async function medirContrastes(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const luminancia = (rgb: string): number => {
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/) ?? ['0', '0', '0', '0'];
      const canal = (i: number): number => {
        const v = Number(m[i]) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * canal(1) + 0.7152 * canal(2) + 0.0722 * canal(3);
    };
    const razon = (fg: string, bg: string): number => {
      const [a, b] = [luminancia(fg), luminancia(bg)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    };
    const css = (sel: string, prop: 'color' | 'backgroundColor'): string => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`falta ${sel}`);
      return getComputedStyle(el)[prop];
    };
    const fondoPortada = css('[data-testid="portal-landing"]', 'backgroundColor');
    const pasoActivo = document.querySelector('.portal-step-active');
    const textoPaso = document.querySelector('.portal-step-active .portal-step-text');
    const fondoPaso = pasoActivo ? getComputedStyle(pasoActivo).backgroundColor : fondoPortada;
    return {
      tinta: razon(css('[data-testid="portal-landing"]', 'color'), fondoPortada),
      subtitulo: razon(css('.portal-hero-text', 'color'), fondoPortada),
      botonDorado: razon(
        css('[data-testid="portal-hero-create"]', 'color'),
        css('[data-testid="portal-hero-create"]', 'backgroundColor'),
      ),
      pasoActivo: razon(
        textoPaso ? getComputedStyle(textoPaso).color : css('[data-testid="portal-landing"]', 'color'),
        fondoPaso,
      ),
      pie: razon(css('.portal-footer-link', 'color'), fondoPortada),
    };
  });
}

describe('portada raíz — primera pantalla NAP-U2', () => {
  let api: ChildProcess | null = null;
  let browser: Browser | null = null;
  const meta: Record<string, { viewport: string; tema: string; contrastes: Record<string, number> }> = {};

  beforeAll(async () => {
    ensureBuild();
    execSync('npx playwright install chromium', { cwd: RAIZ, stdio: 'inherit', shell: true });
    api = await startApiServer();
    // El API migra al arrancar; los datos de prueba van después.
    await preparePortalPublicEvent();
    // NAP-U2: somospanas.com resuelve a local por bandera de Chromium.
    browser = await chromium.launch({
      args: ['--host-resolver-rules=MAP somospanas.com 127.0.0.1'],
    });
  }, 180_000);

  afterAll(async () => {
    await browser?.close().catch(() => undefined);
    api?.kill();
    api = null;
    // NAP-U2: el API migró public al arrancar; se devuelve prístino para que
    // las pruebas del API (que exigen public limpio) pasen después.
    try {
      const client = new pg.Client({ connectionString: DATABASE_URL });
      await client.connect();
      try {
        await client.query('DROP SCHEMA public CASCADE');
        await client.query('CREATE SCHEMA public');
      } finally {
        await client.end();
      }
    } catch {
      // Si la base ya estaba limpia no hay nada que devolver.
    }
    try {
      mkdirSync(ARTIFACTS, { recursive: true });
      writeFileSync(join(ARTIFACTS, 'u2-portada-meta.json'), JSON.stringify(meta, null, 2));
    } catch {
      // En local sin /opt el meta solo vive en el reporte.
    }
  });

  it('el API expone el listado sin credenciales y con cabeceras JSON', async () => {
    const probe = await fetchRoot('/api/portal/events');
    expect(probe.status).toBe(200);
    expect(probe.contentType).toMatch(/application\/json/);
  });

  for (const viewport of VIEWPORTS) {
    for (const { tema, fondo, tinta } of TEMAS) {
      it(`primera pantalla ${viewport.etiqueta} en ${tema}: dorado único, sin menús, AA`, async () => {
        expect(browser).toBeTruthy();
        const page = await browser!.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        try {
          // NAP-U2: sin red real; solo la portada bajo prueba responde.
          await page.route('**/*', (route) => {
            const url = new URL(route.request().url());
            if (url.hostname === 'somospanas.com') void route.continue();
            else void route.abort();
          });
          await page.addInitScript((temaFijado: string) => {
            try {
              window.localStorage.setItem('fp_tema', temaFijado);
              window.localStorage.setItem('fp_locale', 'es');
            } catch {
              // Sin almacenamiento la página usa sistema y español.
            }
          }, tema);
          // NAP-U2: carga más esperas explícitas (networkidle no se lleva con
          // el aborto de red externa).
          await page.goto(ORIGEN, { waitUntil: 'domcontentloaded' });
          const portada = page.getByTestId('portal-landing');
          await portada.waitFor({ state: 'visible' });
          await page.getByTestId('portal-avatar-greeting').waitFor({ state: 'visible' });
          await page.getByTestId('portal-listed-event-asado-jardin').waitFor({ state: 'visible' });

          // Tema aplicado desde la primera pintura.
          const estilos = await portada.evaluate((el) => {
            const s = getComputedStyle(el);
            return { backgroundColor: s.backgroundColor, color: s.color };
          });
          expect(estilos.backgroundColor).toBe(fondo);
          expect(estilos.color).toBe(tinta);
          expect(await page.evaluate(() => document.documentElement.getAttribute('data-tema'))).toBe(tema);

          // Un solo botón dorado, táctil, y la avatar con saludo.
          expect(await page.locator('.portal-btn-gold').count()).toBe(1);
          const dorado = page.getByTestId('portal-hero-create');
          await dorado.waitFor({ state: 'visible' });
          const cajaDorado = await dorado.boundingBox();
          expect(cajaDorado?.height ?? 0).toBeGreaterThanOrEqual(48);
          const temaBtn = page.getByTestId('theme-toggle');
          await temaBtn.waitFor({ state: 'visible' });
          const cajaTema = await temaBtn.boundingBox();
          expect(cajaTema?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(cajaTema?.height ?? 0).toBeGreaterThanOrEqual(44);
          await page.getByTestId('portal-avatar-greeting').waitFor({ state: 'visible' });

          // Sin menús ni tarjetas de tipo en la primera pantalla.
          expect(await page.locator('nav').count()).toBe(0);
          expect(await page.locator('[data-testid^="portal-bar-link-"]').count()).toBe(0);
          expect(await page.locator('[data-testid^="reference-invite-"]').count()).toBe(0);

          // Muestra con QR real y eventos con destino.
          const qr = page.getByTestId('portal-sample-qr').locator('svg');
          await qr.waitFor({ state: 'attached' });
          expect(await qr.locator('path,rect').count()).toBeGreaterThan(0);
          const evento = page.getByTestId('portal-listed-event-asado-jardin');
          await evento.waitFor({ state: 'visible' });
          expect(await evento.getByRole('link').getAttribute('href')).toContain('vecinos-norte.somospanas.com');

          // Sin desborde horizontal en el viewport pedido.
          const desborde = await page.evaluate(
            ([ancho]) => document.documentElement.scrollWidth <= ancho + 1,
            [viewport.width] as const,
          );
          expect(desborde).toBe(true);

          // Contraste AA en pares reales de la portada.
          const contrastes = await medirContrastes(page);
          for (const [par, razon] of Object.entries(contrastes)) {
            expect(razon, `${par}: ${razon.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
          }
          meta[`${viewport.etiqueta}-${tema}`] = {
            viewport: viewport.etiqueta,
            tema,
            contrastes,
          };

          try {
            mkdirSync(ARTIFACTS, { recursive: true });
            await page.screenshot({ path: join(ARTIFACTS, `u2-portada-${viewport.etiqueta}-${tema}.png`) });
          } catch {
            // En local sin /opt la captura solo vive en el reporte.
          }
        } finally {
          await page.close();
        }
      });
    }
  }
});
