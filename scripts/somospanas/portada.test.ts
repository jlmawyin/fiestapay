/**
 * Pruebas de contenido de portada y orden de secciones (SP-1b).
 * Depende de: contenido/portada.json, contenido/paginas.json, vitest.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');
const portada = JSON.parse(readFileSync(join(RAIZ, 'contenido', 'portada.json'), 'utf8'));
const paginas = JSON.parse(readFileSync(join(RAIZ, 'contenido', 'paginas.json'), 'utf8'));

describe('contenido/portada.json (portada C2)', () => {
  it('incluye el título del hero en español e inglés', () => {
    expect(portada.hero.titulo.es).toBe('Un espacio para cada grupo de panas');
    expect(portada.hero.titulo.en).toContain('space');
  });

  it('incluye el ojo SOMOSPANAS.COM', () => {
    expect(portada.hero.ojo.es).toBe('SOMOSPANAS.COM');
  });

  it('describe reuniones, fondos y eventos públicos en el texto del hero', () => {
    expect(portada.hero.texto.es).toMatch(/reuniones/i);
    expect(portada.hero.texto.es).toMatch(/fondos/i);
    expect(portada.hero.texto.es).toMatch(/públicos/i);
  });

  it('trae dos eventos de ejemplo de la variante C2', () => {
    const titulos = portada.eventosPublicos.ejemplos.map(
      (e: { titulo: { es: string } }) => e.titulo.es,
    );
    expect(titulos).toContain('Los jueves en la terraza');
    expect(titulos).toContain('Noche de panas en casa');
  });
});

describe('contenido/paginas.json (orden de secciones)', () => {
  it('empieza por barra y hero y termina en pie', () => {
    const ids = paginas.portadaRaiz.secciones.map((s: { id: string }) => s.id);
    expect(ids[0]).toBe('barra');
    expect(ids[1]).toBe('hero');
    expect(ids.at(-1)).toBe('pie');
  });

  it('incluye las ocho secciones de la portada C2', () => {
    const ids = paginas.portadaRaiz.secciones.map((s: { id: string }) => s.id);
    expect(ids).toEqual([
      'barra',
      'hero',
      'foto-ambiente',
      'compositor',
      'como-funciona',
      'eventos-publicos',
      'donaciones',
      'pie',
    ]);
  });
});