/**
 * Contrato cerrado de tools de la avatar Napster (NAP-F2).
 * Depende de `ui-guide.ts` para los ids de pantalla. El modelo solo nombra tools e ids de estas listas;
 * la web valida antes de actuar y nunca acepta URLs ni selectores generados por el modelo.
 */
import { ROOT_UI_TARGETS, UI_TARGET_IDS } from './ui-guide.js';

export const AVATAR_TOOL_NAMES = [
  'list_open_events',
  'open_event',
  'start_new_space',
  'show_on_screen',
  'fill_event_draft',
  'draft_reminder',
  'show_event_details',
  'open_avatar_settings',
] as const;

export type AvatarToolName = (typeof AVATAR_TOOL_NAMES)[number];

export interface AvatarToolParameters {
  type: 'object';
  properties: Record<string, unknown>;
  required?: readonly string[];
  additionalProperties: false;
}

export interface AvatarToolDefinition {
  name: AvatarToolName;
  description_es: string;
  description_en: string;
  parameters: AvatarToolParameters;
}

/**
 * Ids que `show_on_screen` puede nombrar: portada raíz (SP-10) más los controles cerrados ya
 * existentes. La lista raíz no incluye PayPal ni /demo.
 */
export const AVATAR_SHOW_ON_SCREEN_TARGETS = [...ROOT_UI_TARGETS, ...UI_TARGET_IDS] as const;
export type AvatarShowOnScreenTarget = (typeof AVATAR_SHOW_ON_SCREEN_TARGETS)[number];

const sinParametros: AvatarToolParameters = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};

/**
 * NAP-S1: secciones cerradas del borrador de evento que la web puede resaltar.
 * Mapeo a los campos reales de `apps/web/src/lib/draft-proposal.ts` y del CreateWizard:
 * - template        → tipo de reunión (`template`; chips del paso 1).
 * - date            → fecha (`date`; `#wizard-date` o `#wizard-depart-date`).
 * - startTime       → hora (`startTime`; `#wizard-time`).
 * - location        → lugar (`location`; `#event-location`).
 * - headcount       → cuántos van (`headcount`; `#event-capacity`).
 * - perPersonCents  → cuota por persona (`perPersonCents`; `#event-price`, priceDollars).
 */
export const AVATAR_DRAFT_STEPS = [
  'template',
  'date',
  'startTime',
  'location',
  'headcount',
  'perPersonCents',
] as const;
export type AvatarDraftStep = (typeof AVATAR_DRAFT_STEPS)[number];

export const AVATAR_TOOLS = {
  list_open_events: {
    name: 'list_open_events',
    description_es: 'Lista los eventos públicos abiertos que la persona puede ver en la portada.',
    description_en: 'Lists the open public events the person can see on the homepage.',
    parameters: sinParametros,
  },
  open_event: {
    name: 'open_event',
    description_es:
      'Abre un evento de la última lista mostrada. Solo acepta la posición 1 a 5; no inventa enlaces.',
    description_en:
      'Opens an event from the last list shown. Only accepts position 1 to 5; it never invents links.',
    parameters: {
      type: 'object',
      properties: {
        ref: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: 'Posición del evento en la última lista (1 a 5).',
        },
      },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  start_new_space: {
    name: 'start_new_space',
    description_es:
      'Prepara el alta de un espacio nuevo y lleva a la persona al formulario; no publica ni confirma nada.',
    description_en:
      'Prepares a new space and takes the person to the form; it never publishes or confirms anything.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', pattern: '^[a-z0-9-]{3,40}$', description: 'Slug sugerido, si la persona lo dio.' },
        name: { type: 'string', minLength: 1, maxLength: 80, description: 'Nombre visible del espacio.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  show_on_screen: {
    name: 'show_on_screen',
    description_es:
      'Resalta un elemento permitido de la página para que la persona lo vea y lo pulse. Nunca pulsa, paga, publica ni confirma.',
    description_en:
      'Highlights an allowed element so the person can see and press it. It never presses, pays, publishes or confirms.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: [...AVATAR_SHOW_ON_SCREEN_TARGETS],
          description: 'Id cerrado del elemento a resaltar.',
        },
        caption: {
          type: 'string',
          maxLength: 60,
          description: 'Frase corta junto al resaltado, en el idioma de la conversación.',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
  },
  fill_event_draft: {
    name: 'fill_event_draft',
    description_es:
      'Rellena el borrador del formulario de evento para que la persona lo revise y lo publique.',
    description_en:
      'Fills the event form draft so the person can review it and publish it.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 120, description: 'Título del evento.' },
        startsAt: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'Inicio local en formato YYYY-MM-DDTHH:mm.',
        },
        place: { type: 'string', maxLength: 160, description: 'Lugar o enlace de encuentro.' },
        description: { type: 'string', maxLength: 500, description: 'Descripción breve del plan.' },
        /** NAP-S1: la web resalta esta sección del borrador mientras la avatar la rellena. */
        step: {
          type: 'string',
          enum: [...AVATAR_DRAFT_STEPS],
          description: 'Sección del borrador que se está rellenando; la web la resalta.',
        },
      },
      required: ['title', 'startsAt'],
      additionalProperties: false,
    },
  },
  draft_reminder: {
    name: 'draft_reminder',
    description_es:
      'Redacta un recordatorio para que el organizador lo copie o lo abra en WhatsApp. No lo envía.',
    description_en:
      'Drafts a reminder for the organizer to copy or open in WhatsApp. It never sends it.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 500, description: 'Texto del recordatorio.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  show_event_details: {
    name: 'show_event_details',
    description_es: 'Muestra los detalles del evento actual de la persona invitada.',
    description_en: 'Shows the details of the current event for the guest.',
    parameters: sinParametros,
  },
  open_avatar_settings: {
    name: 'open_avatar_settings',
    description_es:
      'Abre los ajustes del sitio para que el administrador revise la avatar; no cambia nada por su cuenta.',
    description_en:
      'Opens the site settings so the admin can review the avatar; it changes nothing on its own.',
    parameters: sinParametros,
  },
} as const satisfies Record<AvatarToolName, AvatarToolDefinition>;

export const AVATAR_TOOLS_BY_VISITOR = {
  public: ['list_open_events', 'open_event', 'start_new_space', 'show_on_screen'],
  creator: [
    'start_new_space',
    'fill_event_draft',
    'draft_reminder',
    'show_on_screen',
    'open_avatar_settings',
    'list_open_events',
  ],
  guest: ['show_event_details', 'show_on_screen', 'list_open_events'],
} as const satisfies Record<'public' | 'creator' | 'guest', readonly AvatarToolName[]>;

/** Declaraciones listas para registrar una sola vez en Napster (todas implícitas). */
export function avatarFunctionDeclarations(): AvatarToolDefinition[] {
  return AVATAR_TOOL_NAMES.map((name) => AVATAR_TOOLS[name]);
}
