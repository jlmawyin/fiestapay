/**
 * Prueba del catálogo de tipos de evento y esquema evento (formulario).
 * Depende de: contenido/tipos-evento.json, esquemas/evento.schema.json, validar-contenido.mjs.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');

/**
 * Devuelve la función de validación Ajv para un ítem de tipo de evento (D-2).
 * @returns {import('ajv').ValidateFunction | undefined} Validador compilado de `evento.schema.json`.
 */
function validadorEvento() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  const texto = JSON.parse(
    readFileSync(join(RAIZ, 'esquemas', 'texto-bilingue.schema.json'), 'utf8'),
  );
  const evento = JSON.parse(readFileSync(join(RAIZ, 'esquemas', 'evento.schema.json'), 'utf8'));
  ajv.addSchema(texto, texto.$id);
  ajv.addSchema(evento, evento.$id);
  return ajv.getSchema('evento.schema.json');
}

const tipos = JSON.parse(readFileSync(join(RAIZ, 'contenido', 'tipos-evento.json'), 'utf8'));

describe('contenido/tipos-evento.json (formulario)', () => {
  it('cada tipo cumple esquemas/evento.schema.json', () => {
    const validate = validadorEvento();
    expect(validate).toBeTruthy();
    for (const tipo of tipos.tipos) {
      const ok = validate!(tipo);
      expect(ok, JSON.stringify(validate!.errors)).toBe(true);
    }
  });

  it('usa solo plantillas admitidas por el dominio actual', () => {
    const permitidas = new Set(['comida', 'casa', 'viaje', 'evento']);
    for (const tipo of tipos.tipos) {
      expect(permitidas.has(tipo.plantilla)).toBe(true);
    }
  });
});