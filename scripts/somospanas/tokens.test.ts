/**
 * Pruebas de estilos/tokens.css: presencia de tokens, viewports 390×844 y 1440×960,
 * y estilos computados con Playwright en la página estática de muestra.
 * Depende de: estilos/tokens.css, @playwright/test (chromium), vitest.
 * La revisión visual integrada de la portada C2 en navegador llega en SP-6.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');
const css = readFileSync(join(RAIZ, 'estilos', 'tokens.css'), 'utf8');
const MUESTRA_HTML = join(import.meta.dirname, 'fixtures', 'tokens-muestra.html');
const MUESTRA_URL = pathToFileURL(MUESTRA_HTML).href;

const TOKENS_OBLIGATORIOS = [
  '--sp-color-cloudwhite',
  '--sp-color-ink',
  '--sp-color-blue',
  '--sp-color-teal',
  '--sp-color-yellow',
  '--sp-color-coral',
  '--sp-font-display',
  '--sp-font-body',
  '--sp-space-md',
  '--sp-viewport-mobile-width',
  '--sp-viewport-mobile-height',
  '--sp-viewport-desktop-width',
  '--sp-viewport-desktop-height',
];

/** Valores canónicos declarados en tokens.css (hex/rgb esperados al aplicar). */
const ESPERADO = {
  cloudwhite: 'rgb(247, 250, 252)',
  ink: 'rgb(18, 38, 58)',
  blue: 'rgb(18, 95, 230)',
  paddingMd: '16px',
  paddingXl: '32px',
} as const;

let browser: Browser | null = null;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe('estilos/tokens.css (declaración)', () => {
  it('declara la paleta, tipografía, espaciados y viewports en un solo archivo', () => {
    for (const token of TOKENS_OBLIGATORIOS) {
      expect(css).toContain(`${token}:`);
    }
  });

  it('define ancho y alto de referencia 390×844 y 1440×960 como propiedades', () => {
    expect(css).toMatch(/--sp-viewport-mobile-width:\s*390px/);
    expect(css).toMatch(/--sp-viewport-mobile-height:\s*844px/);
    expect(css).toMatch(/--sp-viewport-desktop-width:\s*1440px/);
    expect(css).toMatch(/--sp-viewport-desktop-height:\s*960px/);
  });
});

describe('estilos/tokens.css (Playwright · estilos computados)', () => {
  it.each([
    { etiqueta: 'móvil', width: 390, height: 844, paddingEsperado: ESPERADO.paddingMd },
    { etiqueta: 'escritorio', width: 1440, height: 960, paddingEsperado: ESPERADO.paddingXl },
  ] as const)(
    'aplica fondo, tipografía y espaciado a $etiqueta ($width×$height)',
    async ({ width, height, paddingEsperado }) => {
      expect(browser).toBeTruthy();
      const page = await browser!.newPage();
      try {
        await page.setViewportSize({ width, height });
        await page.goto(MUESTRA_URL);
        const main = page.locator('[data-testid="tokens-muestra"]');
        expect(await main.isVisible()).toBe(true);

        const estilos = await main.evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            backgroundColor: s.backgroundColor,
            color: s.color,
            fontFamily: s.fontFamily,
            paddingTop: s.paddingTop,
          };
        });

        expect(estilos.backgroundColor).toBe(ESPERADO.cloudwhite);
        expect(estilos.color).toBe(ESPERADO.ink);
        expect(estilos.fontFamily.toLowerCase()).toContain('manrope');
        expect(estilos.paddingTop).toBe(paddingEsperado);

        const acento = await page.locator('.sp-accent').evaluate((el) => getComputedStyle(el).color);
        expect(acento).toBe(ESPERADO.blue);

        const titulo = await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily);
        expect(titulo.toLowerCase()).toContain('nunito');
      } finally {
        await page.close();
      }
    },
  );
});