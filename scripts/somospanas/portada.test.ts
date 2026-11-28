/**
 * Pruebas de contenido de portada y orden de secciones (NAP-U2).
 * Depende de: contenido/portada.json, contenido/paginas.json, vitest.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');
const portada = JSON.parse(readFileSync(join(RAIZ, 'contenido', 'portada.json'), 'utf8'));
const paginas = JSON.parse(readFileSync(join(RAIZ, 'contenido', 'paginas.json'), 'utf8'));

describe('contenido/portada.json (portada NAP-U2)', () => {
  it('incluye el lema en español e inglés', () => {
    expect(portada.hero.titulo.es).toBe('Organiza como panas: un agente te guía de principio a fin');
    expect(portada.hero.titulo.en).toBe('Plan it like friends do, like a pana');
  });

  it('incluye el botón dorado en el idioma detectado', () => {
    expect(portada.hero.botonConversar.es).toBe('Conversa como pana');
    expect(portada.hero.botonConversar.en).toBe('Talk like a pana');
  });

  it('incluye el enlace de idioma cruzado y la nota pana en inglés', () => {
    expect(portada.hero.enlaceIdioma.es).toBe('Prefer English?');
    expect(portada.hero.enlaceIdioma.en).toBe('¿Prefieres español?');
    expect(portada.hero.notaPana.en).toBe('pana = friend in Ecuador');
  });

  it('incluye el saludo de la avatar en el idioma activo', () => {
    expect(portada.hero.saludo.es).toBe('¡Hola! Soy tu guía de Somos Panas.');
    expect(portada.hero.saludo.en).toBe("Hi! I'm your Somos Panas guide.");
  });

  it('trae los tres pasos Conversa, Revisa, Comparte', () => {
    const titulosEs = portada.hero.pasos.map((p: { titulo: { es: string } }) => p.titulo.es);
    const titulosEn = portada.hero.pasos.map((p: { titulo: { en: string } }) => p.titulo.en);
    expect(titulosEs).toEqual(['Conversa', 'Revisa', 'Comparte']);
    expect(titulosEn).toEqual(['Talk', 'Review', 'Share']);
  });

  it('trae la muestra con dirección de ejemplo', () => {
    expect(portada.hero.muestra.url.es).toContain('cumpledemaria.somospanas.com');
  });

  it('conserva ejemplos para el esquema (aunque ya no se pinten)', () => {
    expect(portada.eventosPublicos.ejemplos.length).toBeGreaterThanOrEqual(1);
    expect(portada.donaciones.ejemplos.length).toBeGreaterThanOrEqual(1);
  });
});

describe('contenido/paginas.json (orden de secciones)', () => {
  it('empieza por barra y hero y termina en pie', () => {
    const ids = paginas.portadaRaiz.secciones.map((s: { id: string }) => s.id);
    expect(ids[0]).toBe('barra');
    expect(ids[1]).toBe('hero');
    expect(ids.at(-1)).toBe('pie');
  });

  it('incluye las secciones de la portada NAP-U2 en orden', () => {
    const ids = paginas.portadaRaiz.secciones.map((s: { id: string }) => s.id);
    expect(ids).toEqual(['barra', 'hero', 'pasos', 'ejemplo', 'eventos-publicos', 'pie']);
  });
});
