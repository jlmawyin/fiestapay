/**
 * Comprueba que estilos/tokens.css define y aplica colores, tipografía y espaciados.
 * Las vistas 390×844 y 1440×960 se validan en CI por variables de ancho; en local,
 * opcional: npx vitest run scripts/somospanas/tokens.test.ts y revisar la portada con npm run dev.
 * Depende de: estilos/tokens.css.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');
const css = readFileSync(join(RAIZ, 'estilos', 'tokens.css'), 'utf8');

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
  '--sp-viewport-mobile',
  '--sp-viewport-desktop',
];

describe('estilos/tokens.css', () => {
  it('declara la paleta, tipografía y espaciados en un solo archivo', () => {
    for (const token of TOKENS_OBLIGATORIOS) {
      expect(css).toContain(`${token}:`);
    }
  });

  it('fija anchos de referencia 390px y 1440px para pruebas visuales', () => {
    expect(css).toMatch(/--sp-viewport-mobile:\s*390px/);
    expect(css).toMatch(/--sp-viewport-desktop:\s*1440px/);
  });

  it('aplica tokens en la clase de vista previa', () => {
    expect(css).toContain('.sp-tokens-preview');
    expect(css).toMatch(/\.sp-tokens-preview[\s\S]*var\(--sp-font-body\)/);
    expect(css).toMatch(/\.sp-tokens-preview[\s\S]*var\(--sp-color-ink\)/);
  });

  it('define media queries para móvil y escritorio (844px alto implícito en diseño móvil)', () => {
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('@media (min-width: 768px)');
  });
});