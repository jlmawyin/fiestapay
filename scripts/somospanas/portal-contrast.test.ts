/**
 * SP6-D-4 — pares de color de la portada C2 deben alcanzar contraste ≥ 4.5:1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '@fiestapay/shared';
import { describe, expect, it } from 'vitest';

const RAIZ = join(import.meta.dirname, '..', '..');
const css = readFileSync(join(RAIZ, 'estilos', 'tokens.css'), 'utf8');

function tokenHex(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match?.[1]) throw new Error(`token ${name} no encontrado en tokens.css`);
  return match[1];
}

const MIN = 4.5;

describe('portada C2 — contraste WCAG AA (SP6-D-4)', () => {
  it('texto muted, badges y avisos usan pares de tokens con contraste suficiente', () => {
    const cloudwhite = tokenHex('--sp-color-cloudwhite');
    const ink = tokenHex('--sp-color-ink');
    const inkMuted = tokenHex('--sp-color-ink-muted');
    const yellowTint = tokenHex('--sp-color-yellow-tint');
    const tealTint = tokenHex('--sp-color-teal-tint');
    const tealHover = tokenHex('--sp-color-teal-hover');
    const coralTint = tokenHex('--sp-color-coral-tint');

    const pairs: Array<{ label: string; fg: string; bg: string }> = [
      { label: 'portal-muted ink-muted sobre cloudwhite', fg: inkMuted, bg: cloudwhite },
      { label: 'badge ejemplo ink sobre yellow-tint', fg: ink, bg: yellowTint },
      { label: 'badge publico teal-hover sobre teal-tint', fg: tealHover, bg: tealTint },
      { label: 'aviso ink sobre coral-tint', fg: ink, bg: coralTint },
    ];

    for (const pair of pairs) {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(ratio, `${pair.label}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN);
    }
  });
});