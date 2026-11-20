/**
 * SP-6 — capturas Playwright de la portada C2 a 390×844 y 1440×960 con host de raíz simulado.
 * Depende de: build de la web, Playwright, `sessionStorage` override en `app-host.ts`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const PREVIEW_PORT = 4174;
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;

let browser: Browser | null = null;

function ensureBuild(): void {
  const build = spawnSync('npm', ['run', 'build', '-w', '@fiestapay/web'], {
    cwd: RAIZ,
    stdio: 'inherit',
  });
  expect(build.status).toBe(0);
}

beforeAll(async () => {
  ensureBuild();
  mkdirSync(ARTIFACTS, { recursive: true });
  const session = 'sp6-vite-preview';
  spawnSync('tmux', ['-f', '/exec-daemon/tmux.portal.conf', 'kill-session', '-t', session], { stdio: 'ignore' });
  spawnSync(
    'tmux',
    [
      '-f',
      '/exec-daemon/tmux.portal.conf',
      'new-session',
      '-d',
      '-s',
      session,
      '-c',
      join(RAIZ, 'apps', 'web'),
      '--',
      'npx',
      'vite',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(PREVIEW_PORT),
      '--strictPort',
    ],
    { stdio: 'ignore' },
  );
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    const probe = spawnSync('curl', ['-sf', PREVIEW_URL], { stdio: 'ignore' });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(ready).toBe(true);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe('portada C2 — revisión visual (SP-6)', () => {
  it.each([
    { etiqueta: 'mobile-390x844', width: 390, height: 844 },
    { etiqueta: 'desktop-1440x960', width: 1440, height: 960 },
  ] as const)('captura $etiqueta con tokens Somos Panas', async ({ etiqueta, width, height }) => {
    expect(browser).toBeTruthy();
    const context = await browser!.newContext({
      viewport: { width, height },
    });
    await context.addInitScript(() => {
      sessionStorage.setItem('fp_sp_host_override', 'somospanas-root');
    });
    const page = await context.newPage();
    try {
      await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
      expect(await page.getByTestId('portal-landing').isVisible()).toBe(true);
      expect(await page.getByTestId('portal-compositor').isVisible()).toBe(true);
      const rootStyles = await page.getByTestId('portal-landing').evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          backgroundColor: s.backgroundColor,
          fontFamily: s.fontFamily,
        };
      });
      expect(rootStyles.backgroundColor).toBe('rgb(247, 250, 252)');
      expect(rootStyles.color).toBe('rgb(18, 38, 58)');
      expect(rootStyles.fontFamily.toLowerCase()).toContain('manrope');

      const compositorBox = await page.getByTestId('portal-compositor').boundingBox();
      expect(compositorBox).toBeTruthy();
      expect(compositorBox!.width).toBeLessThanOrEqual(width);

      if (width < 500) {
        const bar = page.getByTestId('portal-bar');
        expect(await bar.isVisible()).toBe(true);
      }

      await page.screenshot({
        path: join(ARTIFACTS, `sp6-portada-${etiqueta}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
});