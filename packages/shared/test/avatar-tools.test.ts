/**
 * Contratos cerrados de tools y sesión de la avatar Napster (NAP-F2).
 * Depende de Ajv y de los esquemas de `packages/shared`; sin red.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_DRAFT_STEPS, AVATAR_TOOLS, AVATAR_TOOL_NAMES, AVATAR_TOOLS_BY_VISITOR } from '../src/avatar-tools.js';
import { AVATAR_TAG_IDS } from '../src/avatar-tags.js';
import { avatarSessionRequestSchema, avatarSessionResponseSchema } from '../src/avatar-session.js';
import { ROOT_UI_TARGETS } from '../src/ui-guide.js';

describe('AVATAR_TOOLS (NAP-F2)', () => {
  const ajv = new Ajv2020({ strict: false });

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

  it('NAP-S3: suggest_avatars es implícita, usa tags cerrados y solo la ve el creador', () => {
    const tool = AVATAR_TOOLS.suggest_avatars;
    const tag = tool.parameters.properties.tag as { enum: string[] };
    expect(tool.parameters.required).toEqual(['tag']);
    expect(tag.enum).toEqual([...AVATAR_TAG_IDS]);
    expect(AVATAR_TOOLS_BY_VISITOR.creator).toContain('suggest_avatars');
    expect(AVATAR_TOOLS_BY_VISITOR.public).not.toContain('suggest_avatars');
    expect(AVATAR_TOOLS_BY_VISITOR.guest).not.toContain('suggest_avatars');
  });

  it('NAP-S1: fill_event_draft acepta step opcional del enum cerrado de secciones', () => {
    const step = AVATAR_TOOLS.fill_event_draft.parameters.properties.step as { enum: string[] };
    expect(step.enum).toEqual([...AVATAR_DRAFT_STEPS]);
    expect(step.enum).toEqual(['template', 'date', 'startTime', 'location', 'headcount', 'perPersonCents']);
    expect(AVATAR_TOOLS.fill_event_draft.parameters.required).toEqual(['title', 'startsAt']);
    const valido = {
      type: 'object',
      properties: AVATAR_TOOLS.fill_event_draft.parameters.properties,
      required: ['title', 'startsAt'],
      additionalProperties: false,
    };
    const validate = ajv.compile(valido);
    expect(validate({ title: 'Cena', startsAt: '2026-12-01T19:00', step: 'headcount' })).toBe(true);
    expect(validate({ title: 'Cena', startsAt: '2026-12-01T19:00', step: 'otra' })).toBe(false);
    expect(validate({ title: 'Cena', startsAt: '2026-12-01T19:00' })).toBe(true);
  });
});

describe('catálogo de avatares (NAP-S1)', () => {
  it('valida contra esquemas/avatares.schema.json y tiene una sola default', () => {
    const raiz = join(import.meta.dirname, '..', '..', '..');
    const catalogo = JSON.parse(readFileSync(join(raiz, 'contenido', 'avatares.json'), 'utf8')) as {
      avatars: Array<{ id: string; default: boolean; tags: string[] }>;
    };
    const schema = JSON.parse(readFileSync(join(raiz, 'esquemas', 'avatares.schema.json'), 'utf8')) as object;
    const ajv = new Ajv2020({ strict: false, validateSchema: false });
    const validate = ajv.compile(schema);
    expect(validate(catalogo)).toBe(true);
    expect(catalogo.avatars).toHaveLength(26);
    expect(catalogo.avatars.filter((entrada) => entrada.default)).toHaveLength(1);
    expect(catalogo.avatars.map((entrada) => entrada.id)).toContain('elena');
    for (const entrada of catalogo.avatars) {
      expect(entrada.tags.length).toBeGreaterThanOrEqual(1);
      expect(entrada.tags.length).toBeLessThanOrEqual(3);
      expect(entrada.tags.every((tag) => AVATAR_TAG_IDS.includes(tag))).toBe(true);
    }
    const dosDefaults = {
      avatars: [...catalogo.avatars, { ...catalogo.avatars[0], id: 'otra-default' }],
    };
    expect(validate(dosDefaults)).toBe(false);
    const tagInvalido = structuredClone(catalogo);
    tagInvalido.avatars[0]!.tags = ['otro'];
    expect(validate(tagInvalido)).toBe(false);
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
      avatar: { id: 'elena', firstName: 'Elena', previewUrl: 'https://example.test/elena.jpg' },
    });
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(parsed.success ? parsed.data : {})).not.toContain('connectionId');
    expect(avatarSessionResponseSchema.safeParse({
      token: 'tok_123',
      handle: '00000000-0000-4000-8000-000000000000',
      visitor: 'guest',
      lang: 'es',
      agent: 'custom',
      avatar: { id: 'event', firstName: 'Ana', previewUrl: null },
    }).success).toBe(true);
  });

  it('NAP-S1: avatarId usa el formato del slug', () => {
    expect(avatarSessionRequestSchema.safeParse({ lang: 'es', avatarId: 'elena' }).success).toBe(true);
    expect(avatarSessionRequestSchema.safeParse({ lang: 'es', avatarId: 'Elena' }).success).toBe(false);
    expect(avatarSessionRequestSchema.safeParse({ lang: 'es', avatarId: 'con espacios' }).success).toBe(false);
  });
});
