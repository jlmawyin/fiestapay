/**
 * NAP-U5 — «Quién recibe a tus invitados»: foto y nombre de la anfitriona,
 * cambio con PUT avatar-choice y la clave guardada, vuelta a la general con
 * null y prioridad de la foto propia cuando está en camino o lista.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { HostAvatar } from '../components/avatar/HostAvatar';

const AVATARS = {
  avatars: [
    { id: 'elena', firstName: 'Elena', displayName: 'Elena Navarro', gender: 'female', previewUrl: 'https://img/e.jpg', loopUrl: null, tags: ['fiesta'], default: true },
    { id: 'marco', firstName: 'Marco', displayName: 'Marco Paz', gender: 'male', previewUrl: 'https://img/m.jpg', loopUrl: null, tags: ['karaoke'], default: false },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('anfitriona (NAP-U5)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    localStorage.setItem('fp_admin_asado', 'clave-1');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/avatars') return json(AVATARS);
      if (url === '/api/events/asado/avatar-choice' && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const headers = new Headers(init?.headers);
        if (headers.get('X-Fiesta-Admin-Key') !== 'clave-1') return json({ error: 'forbidden' }, 403);
        return json({ event: { slug: 'asado', avatarId: body.avatarId ?? null } });
      }
      return json({ error: 'sin mock' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('muestra foto y nombre, y cambiar guarda con PUT', async () => {
    const onChanged = vi.fn();
    render(
      <I18nProvider>
        <HostAvatar slug="asado" currentId="elena" onChanged={onChanged} />
      </I18nProvider>,
    );
    expect(await screen.findByTestId('host-avatar')).toBeInTheDocument();
    expect(screen.getByTestId('host-avatar-name')).toHaveTextContent('Elena Navarro');
    expect(screen.getByTestId('host-avatar-photo')).toHaveAttribute('src', 'https://img/e.jpg');

    fireEvent.click(screen.getByTestId('host-avatar-change'));
    fireEvent.click(screen.getByTestId('host-avatar-pick-marco'));

    await waitFor(() => expect(screen.getByTestId('host-avatar-note')).toHaveTextContent('Marco Paz recibe a tus invitados'));
    expect(onChanged).toHaveBeenCalledWith('marco');
    const put = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/avatar-choice'));
    expect(JSON.parse(String(put?.[1]?.body ?? '{}'))).toEqual({ avatarId: 'marco' });
  });

  it('volver a la general envía null', async () => {
    render(
      <I18nProvider>
        <HostAvatar slug="asado" currentId="marco" onChanged={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId('host-avatar');
    fireEvent.click(screen.getByTestId('host-avatar-change'));
    fireEvent.click(screen.getByTestId('host-avatar-pick-default'));

    await waitFor(() => expect(screen.getByTestId('host-avatar-note')).toHaveTextContent('Elena Navarro recibe a tus invitados'));
    const put = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/avatar-choice'));
    expect(JSON.parse(String(put?.[1]?.body ?? '{}'))).toEqual({ avatarId: null });
  });

  it('la foto propia en camino tiene prioridad en el texto', async () => {
    render(
      <I18nProvider>
        <HostAvatar slug="asado" currentId="elena" photoStatus="generating" onChanged={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId('host-avatar');
    expect(screen.getByText('Tu foto tiene prioridad cuando esté lista.')).toBeInTheDocument();
  });
});
