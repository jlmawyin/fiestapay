/**
 * SP-6 — capturas Playwright con API real sirviendo `apps/web/dist` y Host somospanas.com.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { migrate } from '../../apps/api/src/db/migrate.js';
import { createPool, type Pool } from '../../apps/api/src/db/pool.js';
import type { EmailAdapter, EmailSendResult, OutboundEmail } from '../../apps/api/src/email/types.js';
import { announceSkipWithoutDatabase, DATABASE_URL, testConfig } from '../../apps/api/test/harness.js';
import { FakePayPal } from '../../apps/api/test/fake-paypal.js';
import type { FastifyInstance } from 'fastify';

const RAIZ = join(import.meta.dirname, '..', '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const API_PORT = 3099;
const ROOT_URL = `http://somospanas.com:${API_PORT}/`;

announceSkipWithoutDatabase('portal-visual.test');
if (!DATABASE_URL) {
  throw new Error('portal-visual.test requiere DATABASE_URL (Postgres 16 como CI)');
}

let browser: Browser | null = null;
let pool: Pool;
let app: FastifyInstance;
const schema = `fp_visual_${Date.now().toString(36)}`;

class FakeEmail implements EmailAdapter {
  async send(_message: OutboundEmail): Promise<EmailSendResult> {
    return { status: 'accepted' };
  }
}

function ensureBuild(): void {
  const build = spawnSync('npm', ['run', 'build', '-w', '@fiestapay/web'], {
    cwd: RAIZ,
    stdio: 'inherit',
  });
  expect(build.status).toBe(0);
}

/** Resuelve somospanas.com sin tocar /etc/hosts (entornos CI sin root). */
const CHROMIUM_HOST_RULES = 'MAP somospanas.com 127.0.0.1';

beforeAll(async () => {
  ensureBuild();
  mkdirSync(ARTIFACTS, { recursive: true });
  pool = createPool({ connectionString: DATABASE_URL!, schema });
  await migrate(pool, { schema });
  app = await buildApp({
    pool,
    config: testConfig({
      SERVE_WEB: '1',
      WEB_DIST_DIR: join(RAIZ, 'apps', 'web', 'dist'),
      PUBLIC_ORIGIN: 'https://somospanas.com',
      ALLOWED_ORIGINS: 'https://somospanas.com',
    }),
    email: new FakeEmail(),
    paypal: new FakePayPal(),
  });
  await app.listen({ port: API_PORT, host: '127.0.0.1' });
  browser = await chromium.launch({ args: [`--host-resolver-rules=${CHROMIUM_HOST_RULES}`] });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await browser?.close();
});

describe('portada C2 — revisión visual con API (SP-6)', () => {
  it.each([
    { etiqueta: 'mobile-390x844', width: 390, height: 844 },
    { etiqueta: 'desktop-1440x960', width: 1440, height: 960 },
  ] as const)('captura $etiqueta con tokens Somos Panas', async ({ etiqueta, width, height }) => {
    expect(browser).toBeTruthy();
    const context = await browser!.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    try {
      // page.request no honra Host arbitrario ni las reglas DNS de Chromium; usamos inject.
      const apiProbe = await app.inject({
        method: 'GET',
        url: '/api/portal/events',
        headers: { host: 'somospanas.com' },
      });
      expect(apiProbe.statusCode).toBe(200);

      await page.goto(ROOT_URL, { waitUntil: 'networkidle', timeout: 60_000 });
      expect(await page.getByTestId('portal-landing').isVisible()).toBe(true);
      expect(await page.getByTestId('portal-compositor').isVisible()).toBe(true);
      expect(await page.getByTestId('portal-language-selector').isVisible()).toBe(true);

      const rootStyles = await page.getByTestId('portal-landing').evaluate((el) => {
        const s = getComputedStyle(el);
        return { backgroundColor: s.backgroundColor, color: s.color, fontFamily: s.fontFamily };
      });
      expect(rootStyles.backgroundColor).toBe('rgb(247, 250, 252)');
      expect(rootStyles.color).toBe('rgb(18, 38, 58)');
      expect(rootStyles.fontFamily.toLowerCase()).toContain('manrope');

      const compositorBox = await page.getByTestId('portal-compositor').boundingBox();
      expect(compositorBox).toBeTruthy();
      expect(compositorBox!.width).toBeLessThanOrEqual(width);

      await page.screenshot({
        path: join(ARTIFACTS, `sp6-portada-${etiqueta}.png`),
        fullPage: true,
      });
      writeFileSync(
        join(ARTIFACTS, `sp6-portada-${etiqueta}.meta.json`),
        JSON.stringify({ width, height, url: ROOT_URL }, null, 2),
      );
    } finally {
      await context.close();
    }
  });
});