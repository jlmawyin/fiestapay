/**
 * Prueba del tutorial raíz: cuatro pasos bilingües (SP-1b).
 * Depende de: contenido/tutorial.json.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');
const tutorial = JSON.parse(readFileSync(join(RAIZ, 'contenido', 'tutorial.json'), 'utf8'));

describe('contenido/tutorial.json', () => {
  it('define exactamente cuatro pasos numerados', () => {
    expect(tutorial.pasos).toHaveLength(4);
    expect(tutorial.pasos.map((p: { numero: string }) => p.numero)).toEqual([
      '01',
      '02',
      '03',
      '04',
    ]);
  });

  it('nombra los pasos del plan Somos Panas en español', () => {
    const titulos = tutorial.pasos.map((p: { titulo: { es: string } }) => p.titulo.es);
    expect(titulos).toContain('Crea tu espacio');
    expect(titulos).toContain('Invita a tus panas');
    expect(titulos).toContain('Organicen y junten fondos');
    expect(titulos).toContain('Cuentas claras');
  });

  it('menciona voz o texto en el paso 03', () => {
    const paso3 = tutorial.pasos.find((p: { numero: string }) => p.numero === '03');
    expect(paso3.texto.es).toMatch(/voz|texto/i);
  });
});