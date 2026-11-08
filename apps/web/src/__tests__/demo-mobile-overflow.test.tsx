import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JudgePreviewView } from '../views/JudgePreviewView';
import { OrganizerDashboardView } from '../views/OrganizerDashboardView';
import { GuestGrid } from '../components/dashboard/GuestGrid';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { api } from '../api/client';
import type { Dashboard } from '../types';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('FP-BIL-A1-M: /demo and the organizer panel at 375px', () => {
  it('keeps main.app-container shrinkable so a wide grid cannot widen the page', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '..', 'index.css'), 'utf8');
    const block = /\.app-container\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(block, '.app-container rule').toContain('min-width: 0');
    expect(block, '.app-container rule').toContain('width: 100%');
  });

  it('scrolls the /demo sample grid inside its own wrapper', () => {
    const { container } = render(
      <JudgePreviewView onCreateDemo={vi.fn(async () => undefined)} onBack={vi.fn()} />,
    );
    const grid = container.querySelector('.judge-preview-grid');
    expect(grid).not.toBeNull();
    const wrapper = grid!.parentElement!;
    expect(wrapper.style.overflowX).toBe('auto');
    expect(wrapper.style.minWidth).toBe('0');
    expect((container.firstElementChild as HTMLElement).style.minWidth).toBe('0');
  });

  it('scrolls the organizer guest grid inside its own box with default English empty text', async () => {
    localStorage.setItem('fp_locale', 'en');
    const { container } = render(
      <I18nProvider>
        <GuestGrid guests={[]} eventTitle="Sunday dinner" inviteUrl="https://example.com/e/sunday-dinner" />
      </I18nProvider>,
    );
    const root = container.querySelector('.ag-theme-fiestapay') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.overflowX).toBe('auto');
    await waitFor(() => {
      expect(screen.getByText('No Rows To Show')).toBeInTheDocument();
    });
  });

  it('scrolls the dashboard guest section inside its own box', async () => {
    const dashboard: Dashboard = {
      event: {
        id: 'evt-mobile',
        slug: 'sunday-dinner',
        title: 'Sunday dinner',
        template: 'comida',
        meal: 'almuerzo',
        description: '',
        startsAt: '2026-10-31T18:00:00Z',
        endsAt: '2026-10-31T22:00:00Z',
        location: 'Hall',
        includes: [],
        agenda: [],
        priceCents: 2500,
        capacity: 10,
        goalCents: null,
        minimumCents: null,
        confirmed: false,
        collectedCents: 0,
        confirmedPeople: 0,
        minimumReached: false,
        createdAt: '2026-10-24T09:00:00Z',
      },
      guests: [],
      audit: [],
    };
    vi.spyOn(api, 'getDashboard').mockResolvedValue(dashboard);
    vi.spyOn(api, 'getModerationGuests').mockResolvedValue({ guests: [] });
    vi.spyOn(api, 'getModerationConversations').mockResolvedValue({ conversations: [] });
    render(
      <OrganizerDashboardView slug="sunday-dinner" capabilities={null} onNavigateInvite={vi.fn()} onNavigateHome={vi.fn()} onShowToast={vi.fn()} />,
    );
    const section = await screen.findByRole('region', { name: 'Lista de invitados y pagos' });
    expect((section as HTMLElement).style.overflowX).toBe('auto');
  });
});
