/**
 * Contratos cerrados de tools y sesión de la avatar Napster (NAP-F2).
 * Depende de Ajv y de los esquemas de `packages/shared`; sin red.
 */
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { AVATAR_TOOLS, AVATAR_TOOL_NAMES, AVATAR_TOOLS_BY_VISITOR } from '../src/avatar-tools.js';
import { avatarSessionRequestSchema, avatarSessionResponseSchema } from '../src/avatar-session.js';
import { ROOT_UI_TARGETS } from '../src/ui-guide.js';

describe('AVATAR_TOOLS (NAP-F2)', () => {
  const ajv = new Ajv({ strict: false });

  it('cada tool tiene JSON Schema válido y cerrado', () => {
    for (const name of AVATAR_TOOL_NAMES) {
      const tool = AVATAR_TOOLS[name];
      expect(tool.name).toBe(name);
      expect(tool.description_es.length).toBeGreaterThan(0);
      expect(tool.description_en.length).toBeGreaterThan(0);
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.additionalProperties).toBe(false);
      expect(() => ajv.compile(tool.parameters as object)).not.toThrow();
    }
  });

  it('las listas por visitante solo nombran tools existentes', () => {
    const existentes = new Set<string>(AVATAR_TOOL_NAMES);
    for (const tools of Object.values(AVATAR_TOOLS_BY_VISITOR)) {
      for (const name of tools) expect(existentes.has(name)).toBe(true);
    }
  });

  it('show_on_screen usa los ids de la portada raíz sin PayPal ni demo', () => {
    const target = AVATAR_TOOLS.show_on_screen.parameters.properties.target as { enum: string[] };
    for (const id of ROOT_UI_TARGETS) expect(target.enum).toContain(id);
    expect(ROOT_UI_TARGETS as readonly string[]).not.toContain('openPayPal');
    expect(ROOT_UI_TARGETS as readonly string[]).not.toContain('paymentDemo');
  });
});

describe('avatar-session (NAP-F2)', () => {
  it('acepta solo la petición cerrada del navegador', () => {
    expect(avatarSessionRequestSchema.safeParse({ lang: 'es' }).success).toBe(true);
    expect(avatarSessionRequestSchema.safeParse({ lang: 'es', intent: 'create' }).success).toBe(true);
    expect(avatarSessionRequestSchema.safeParse({ lang: 'en', eventSlug: 'fiesta-2026' }).success).toBe(true);
    expect(avatarSessionRequestSchema.safeParse({ lang: 'fr' }).success).toBe(false);
    expect(avatarSessionRequestSchema.safeParse({ lang: 'es', visitor: 'creator' }).success).toBe(false);
  });

  it('la respuesta al navegador no declara connectionId', () => {
    const parsed = avatarSessionResponseSchema.safeParse({
      token: 'tok_123',
      handle: '00000000-0000-4000-8000-000000000000',
      visitor: 'public',
      lang: 'es',
      agent: 'default',
    });
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.success ? parsed.data : {})).not.toContain('connectionId');
  });
});
