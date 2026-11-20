/**
 * SP-5 — pantalla de ajustes del sitio (etiquetas desde contenido/sitio.json).
 */
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { SiteSettingsView } from '../views/SiteSettingsView';
import type { TenantSiteSettings } from '../lib/site-types';

const initial: TenantSiteSettings = {
  displayName: 'Grupo Alfa',
  tagline: 'Juntos',
  about: '',
  colores: {
    cloudwhite: '#F7FAFC',
    ink: '#12263A',
    inkMuted: '#4A5D73',
    blue: '#125FE6',
    teal: '#0B8075',
    yellow: '#FFC85A',
    coral: '#E85D4A',
  },
  modulos: { reuniones: true, eventos: true, recaudacion: true, asistente: true },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('pantalla de ajustes del sitio', () => {
  it('muestra textos de contenido/sitio.json y envía PUT al guardar', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ settings: { ...initial, displayName: 'Grupo Beta' } }), { status: 200 }),
    );
    const onSaved = vi.fn();
    render(
      <StrictMode>
        <I18nProvider>
          <SiteSettingsView initial={initial} onSaved={onSaved} onBack={() => undefined} />
        </I18nProvider>
      </StrictMode>,
    );

    expect(screen.getByRole('heading', { name: /ajustes del sitio/i })).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Grupo Alfa'), { target: { value: 'Grupo Beta' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('PUT');
    expect(String((init as RequestInit).body)).toContain('Grupo Beta');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});