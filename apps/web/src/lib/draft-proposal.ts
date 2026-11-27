import type { TemplateKind } from '@fiestapay/shared';

/**
 * NAP-F5: borrador de evento como forma de datos de la avatar (antes en
 * shared; F5a lo retiró con la IA del servidor). La tool `fill_event_draft`
 * lo arma, el puente de guía lo entrega y el wizard lo aplica sin publicar.
 */
export interface DraftEventProposal {
  template: TemplateKind;
  title: string;
  meal?: 'desayuno' | 'almuerzo' | 'cena';
  /** YYYY-MM-DD en America/Guayaquil, solo si se dijo o se implicó claro. */
  date?: string;
  /** HH:MM 24 h, America/Guayaquil. */
  startTime?: string;
  durationMinutes?: number;
  location?: string;
  /** Lo que cubre la cuota, máx 8 x 60 caracteres. */
  includes: string[];
  /** Personas con organizador si se dijo; 1..500. */
  headcount?: number;
  /** Presupuesto total en centavos USD enteros si se dijo. */
  budgetCents?: number;
  /** Parte explícita leída o calculada del presupuesto y el headcount. */
  perPersonCents?: number;
  /** Campos que rellenó la avatar, para marcarlos como sugeridos. */
  suggested: Array<'template' | 'title' | 'meal' | 'date' | 'startTime' | 'durationMinutes' | 'location' | 'includes' | 'headcount' | 'budgetCents'>;
  source: 'ai' | 'rules';
}

const TEMPLATES = ['comida', 'casa', 'viaje', 'evento'] as const;
const SOURCES = ['ai', 'rules'] as const;

/**
 * Runtime guard for a DraftEventProposal arriving from HTTP or a DOM event.
 * The server remains the source of truth; this only keeps malformed data out
 * of the create wizard. Required fields are checked and optional ones are
 * accepted only when of the expected primitive type.
 */
export function isDraftEventProposal(value: unknown): value is DraftEventProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proposal = value as Record<string, unknown>;
  if (!TEMPLATES.includes(proposal.template as (typeof TEMPLATES)[number])) return false;
  if (typeof proposal.title !== 'string' || proposal.title.trim().length === 0) return false;
  if (!Array.isArray(proposal.suggested)) return false;
  if (!SOURCES.includes(proposal.source as (typeof SOURCES)[number])) return false;
  if (!Array.isArray(proposal.includes)) return false;
  if (!proposal.includes.every((item) => typeof item === 'string')) return false;
  const optionalStrings = ['meal', 'date', 'startTime', 'location'] as const;
  for (const key of optionalStrings) {
    const current = proposal[key];
    if (current !== undefined && typeof current !== 'string') return false;
  }
  const optionalNumbers = ['durationMinutes', 'headcount', 'budgetCents', 'perPersonCents'] as const;
  for (const key of optionalNumbers) {
    const current = proposal[key];
    if (current !== undefined && (typeof current !== 'number' || !Number.isFinite(current))) return false;
  }
  return true;
}
