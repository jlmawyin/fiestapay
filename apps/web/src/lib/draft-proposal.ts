import type { DraftEventProposal } from '@fiestapay/shared';

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
