import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEMES, contrastRatio } from '@fiestapay/shared';
import { api } from '../api/client';
import { PublicInviteView } from '../views/PublicInviteView';
import type { FiestaEvent } from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const INK_MUTED = '#4A5D73';

function eventFor(theme: (typeof THEMES)[number]): FiestaEvent {
  return {
    id: `evt-${theme.key}`,
    slug: `contraste-${theme.key}`,
    title: `Contraste ${theme.label}`,
    template: theme.template,
    meal: 'cena',
    description: 'Prueba de contraste de los rótulos concretos.',
    startsAt: '2026-12-15T19:00:00.000Z',
    endsAt: '2026-12-16T15:00:00.000Z',
    location: 'Salón principal',
    includes: [],
    agenda: [],
    priceCents: 2500,
    capacity: 8,
    goalCents: null,
    minimumCents: null,
    confirmed: false,
    collectedCents: 0,
    confirmedPeople: 0,
    minimumReached: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    fundingStatus: 'inactive',
    organizerName: 'Ana',
    theme: theme.key,
  };
}

describe('detail-label contrast on actual themed invitations', () => {
  it('renders every small detail label with the accessible ink-muted token on all 16 tints', async () => {
    const labels = ['INICIO Y FIN', 'LUGAR', 'ASISTENCIA'];
    let current = eventFor(THEMES[0]!);
    vi.spyOn(api, 'getEventBySlug').mockImplementation(async () => ({ event: current, guest: null }));

    for (const theme of THEMES) {
      current = eventFor(theme);
      const { container, unmount } = render(
        <PublicInviteView
          slug={`contraste-${theme.key}`}
          capabilities={null}
          onShowToast={vi.fn()}
          onNavigateHome={vi.fn()}
        />,
      );

      await screen.findByRole('heading', { name: `Contraste ${theme.label}` });
      const scope = container.querySelector<HTMLElement>('.theme-scope');
      expect(scope?.style.getPropertyValue('--theme-tint'), theme.key).toBe(theme.tint);
      const renderedLabels = theme.template === 'comida' ? [...labels, 'TIPO DE COMIDA'] : labels;

      for (const label of renderedLabels) {
        const element = screen.getByText(label);
        expect(element.closest('.invite-facts'), `${theme.key} ${label}`).not.toBeNull();
        expect(element.style.color, `${theme.key} ${label}`).toBe('var(--color-ink-muted)');
        expect(element.style.fontSize, `${theme.key} ${label}`).toBe('0.75rem');
        expect(element.style.fontWeight, `${theme.key} ${label}`).toBe('600');
        expect(contrastRatio(INK_MUTED, theme.tint), `${theme.key} ${label}`).toBeGreaterThanOrEqual(4.5);
      }

      unmount();
    }
  });
});
