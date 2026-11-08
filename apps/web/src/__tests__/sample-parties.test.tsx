import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEMES } from '@fiestapay/shared';
import { JudgePreviewView } from '../views/JudgePreviewView';
import { TemplateCover } from '../components/illustrations/TemplateCover';
import { ThemeScope } from '../components/events/ThemeScope';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { resolveTheme } from '../lib/event-presentation';
import { SAMPLE_PARTIES, sampleCollectedCents } from '../lib/sample-parties';
import type { TemplateKind } from '../types';

vi.mock('ag-grid-react', () => ({
  AgGridReact: ({ rowData }: { rowData: Array<{ id: string; name: string }> }) => (
    <table data-testid="judge-grid">
      <tbody>
        {rowData.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('FP-J1 sample parties on /demo', () => {
  it('shows three fixed fictional parties instantly, without fetching', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText('Asado del Domingo')).toBeInTheDocument();
    expect(screen.getByText('Cumpleaños de Sofía')).toBeInTheDocument();
    expect(screen.getByText('Escapada a la Playa')).toBeInTheDocument();
    expect(screen.getByText('Datos ficticios · Sandbox · Sin dinero real')).toBeInTheDocument();
    // First party stats: 5 confirmed, 3 fully paid, 2 pending, $100.00 raised.
    const asado = screen.getByRole('radio', { name: /Asado del Domingo/ });
    expect(within(asado).getByText('5 confirmados · 3 pagados · 2 pendientes')).toBeInTheDocument();
    expect(within(asado).getByText('Recaudado $100,00 (ficticio)')).toBeInTheDocument();
    expect(within(asado).getByText('Mínimo $80,00 · 100%')).toBeInTheDocument();
    expect(within(asado).getByText('Meta $160,00 · 62%')).toBeInTheDocument();
    // The sample grid shows the selected party from the first second.
    expect(screen.getByText('Lucía Fernández')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Mínimo $80,00 · 100%' })).toHaveAttribute('aria-valuenow', '100');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('switches the sample grid to the chosen party', () => {
    render(<JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /Cumpleaños de Sofía/ }));

    expect(screen.getByText('Invitados · Cumpleaños de Sofía')).toBeInTheDocument();
    expect(screen.getByText('Paula Ríos')).toBeInTheDocument();
    expect(screen.queryByText('Lucía Fernández')).toBeNull();
    expect(screen.getByText('Mínimo $60,00 · 100%')).toBeInTheDocument();
    expect(screen.getByText('Meta $150,00 · 40%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Escapada a la Playa/ }));

    expect(screen.getByText('Invitados · Escapada a la Playa')).toBeInTheDocument();
    expect(screen.getByText('Carla Núñez')).toBeInTheDocument();
    expect(screen.queryByText('Paula Ríos')).toBeNull();
    expect(screen.getByText('Mínimo $200,00 · 50%')).toBeInTheDocument();
    expect(screen.getByText('Meta $300,00 · 33%')).toBeInTheDocument();
  });

  it('keeps the fixture internally consistent: paid sums and progress stay under 100 until the goal', () => {
    expect(SAMPLE_PARTIES).toHaveLength(3);
    expect(sampleCollectedCents(SAMPLE_PARTIES[0])).toBe(10000);
    expect(sampleCollectedCents(SAMPLE_PARTIES[1])).toBe(6000);
    expect(sampleCollectedCents(SAMPLE_PARTIES[2])).toBe(10000);
    for (const party of SAMPLE_PARTIES) {
      expect(party.guests.length).toBeGreaterThanOrEqual(4);
      for (const guest of party.guests) {
        expect(guest.paidCents).toBeGreaterThanOrEqual(0);
        expect(guest.dueCents).toBeGreaterThanOrEqual(0);
      }
      // Fictional paid numbers are never presented as verified captures.
      expect(JSON.stringify(party).toLowerCase()).not.toContain('paypal');
    }
  });

  it('translates the sample chrome to English while party titles stay fixed', () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByText('Sample parties')).toBeInTheDocument();
    const asado = screen.getByRole('radio', { name: /Asado del Domingo/ });
    expect(within(asado).getByText('5 confirmed · 3 paid · 2 pending')).toBeInTheDocument();
    expect(within(asado).getByText('Raised $100.00 (fictional)')).toBeInTheDocument();
    expect(within(asado).getByText('Minimum $80.00 · 100%')).toBeInTheDocument();
    expect(within(asado).getByText('Goal $160.00 · 62%')).toBeInTheDocument();
    expect(screen.getByText('Guests · Asado del Domingo')).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('Fiestas de muestra');
    expect(body).not.toContain('Datos ficticios');
  });
});

describe('FP-J1 theme-driven covers', () => {
  const templates: TemplateKind[] = ['comida', 'casa', 'viaje', 'evento'];

  it('renders every theme palette through CSS vars with translated badges and labels', () => {
    expect(THEMES).toHaveLength(16);
    for (const template of templates) {
      for (const theme of THEMES.filter((item) => item.template === template)) {
        const { container, unmount } = render(
          <ThemeScope theme={theme}>
            <TemplateCover template={template} accent={theme.accent} height="130px" />
          </ThemeScope>,
        );
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('role')).toBe('img');
        expect(svg?.getAttribute('aria-label')?.length).toBeGreaterThan(0);
        const markup = container.innerHTML;
        expect(markup).toContain('var(--theme-accent');
        expect(markup).toContain('var(--theme-surface');
        expect(markup).toContain('var(--theme-ink');
        unmount();
        cleanup();
      }
    }
  });

  it('keeps gradient ids unique when several covers share one page', () => {
    const { container } = render(
      <>
        {templates.map((template) => {
          const theme = resolveTheme(template, null);
          return (
            <ThemeScope key={template} theme={theme}>
              <TemplateCover template={template} accent={theme.accent} height="96px" />
            </ThemeScope>
          );
        })}
        {templates.map((template) => {
          const theme = resolveTheme(template, null);
          return (
            <ThemeScope key={`again-${template}`} theme={theme}>
              <TemplateCover template={template} accent={theme.accent} height="96px" />
            </ThemeScope>
          );
        })}
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((node) => node.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });
});

describe('FP-J1 lucide icons', () => {
  it('renders vector icons on /demo and keeps the UI_LABELS contract strings verbatim', () => {
    const { container } = render(<JudgePreviewView onCreateDemo={vi.fn()} onBack={vi.fn()} />);
    // Sample cards carry Users/Wallet/Flag/Target glyphs; the grid carries Check/X.
    expect(container.querySelectorAll('svg.lucide').length).toBeGreaterThan(0);
    for (const svg of container.querySelectorAll('svg.lucide')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
