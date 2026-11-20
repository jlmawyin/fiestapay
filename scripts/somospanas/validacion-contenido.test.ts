/**
 * Demuestra mensajes de validación: campo, expectativa y archivo (SP-1b).
 * Depende de: scripts/lib/validar-contenido.mjs.
 */

import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatearErrorValidacion,
  validarConEsquema,
  validarTodoContenido,
} from '../lib/validar-contenido.mjs';

const RAIZ = join(import.meta.dirname, '..', '..');

describe('validación de contenido contra esquemas', () => {
  it('validarTodoContenido pasa con los JSON actuales', () => {
    const resultado = validarTodoContenido();
    expect(resultado.ok).toBe(true);
  });

  it('rechaza un hero sin idioma inglés con mensaje que nombra campo y archivo', () => {
    const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
    const dir = join(RAIZ, 'esquemas');
    for (const nombre of ['texto-bilingue.schema.json', 'portada.schema.json']) {
      const schema = JSON.parse(readFileSync(join(dir, nombre), 'utf8'));
      ajv.addSchema(schema, schema.$id ?? nombre);
    }

    const portada = JSON.parse(readFileSync(join(RAIZ, 'contenido', 'portada.json'), 'utf8'));
    const invalido = structuredClone(portada);
    delete invalido.hero.titulo.en;

    const resultado = validarConEsquema(ajv, 'portada.schema.json', invalido, 'portada.json');
    expect(resultado.ok).toBe(false);
    const texto = resultado.mensajes?.join('\n') ?? '';
    expect(texto).toContain('portada.json');
    expect(texto).toContain('campo');
    expect(texto).toMatch(/se esperaba/i);
  });

  it('formatearErrorValidacion incluye ruta de instancia', () => {
    const mensaje = formatearErrorValidacion(
      { instancePath: '/hero/titulo', message: 'must have required property \'en\'', keyword: 'required' },
      'portada.json',
    );
    expect(mensaje).toContain('hero.titulo');
    expect(mensaje).toContain('portada.json');
  });
});