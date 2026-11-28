/**
 * NAP-U5 — `suggest_avatars{tag}`: la tool valida contra AVATAR_TAGS y solo
 * resalta; la entrevista muestra arriba «Sugeridas para tu reunión de
 * <etiqueta>» y la persona sigue eligiendo (nada cambia sola).
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { CreateInterviewView } from '../views/CreateInterviewView';
import { createAvatarToolRouter } from '../components/avatar/toolRouter';
import {
  consumeAvatarSuggestion,
  setAvatarSuggestion,
} from '../components/avatar/avatar-suggest';

vi.mock('@touchcastllc/napster-companion-api', () => ({
  NapsterCompanionApiSdk: { init: vi.fn() },
  DataChannelMessageType: { SEND_MESSAGE: 'send_message', FUNCTION_CALL_OUTPUT: 'send_function_output' },
}));

const AVATARS = {
  avatars: [
    { id: 'elena', firstName: 'Elena', displayName: 'Elena Navarro', gender: 'female', previewUrl: 'https://img/e.jpg', loopUrl: null, tags: ['fiesta'], default: true },
    { id: 'muriel', firstName: 'Muriel', displayName: 'Muriel Ríos', gender: 'female', previewUrl: 'https://img/m.jpg', loopUrl: null, tags: ['fiesta', 'karaoke'], default: false },
    { id: 'marco', firstName: 'Marco', displayName: 'Marco Paz', gender: 'male', previewUrl: 'https://img/a.jpg', loopUrl: null, tags: ['karaoke'], default: false },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('suggest_avatars (NAP-U5)', () => {
  const noop = () => {};

  afterEach(() => {
    consumeAvatarSuggestion();
    vi.restoreAllMocks();
  });

  it('el creador sugiere un tag cerrado y la entrevista lo recibe', async () => {
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo: noop });
    const output = await tool.route({ call_id: 'c-sug', name: 'suggest_avatars', arguments: { tag: 'fiesta' } });
    expect(output).toEqual({ ok: true });
    expect(consumeAvatarSuggestion()).toBe('fiesta');
  });

  it('rechaza tag abierto, extra o sin tag', async () => {
    const tool = createAvatarToolRouter({ visitor: 'creator', navigateTo: noop });
    for (const args of [{ tag: 'pana' }, { tag: 'fiesta', extra: 1 }, {}]) {
      expect(await tool.route({ call_id: 'c-x', name: 'suggest_avatars', arguments: args })).toEqual({
        ok: false,
        error: 'not_allowed',
      });
    }
    expect(consumeAvatarSuggestion()).toBeNull();
  });

  it('público e invitado no pueden sugerir', async () => {
    for (const visitor of ['public', 'guest'] as const) {
      const tool = createAvatarToolRouter({ visitor, navigateTo: noop });
      expect(
        await tool.route({ call_id: 'c-y', name: 'suggest_avatars', arguments: { tag: 'fiesta' } }),
      ).toEqual({ ok: false, error: 'not_allowed' });
    }
    expect(consumeAvatarSuggestion()).toBeNull();
  });
});

describe('sugeridas en la entrevista (NAP-U5)', () => {
  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/avatars' ? json(AVATARS) : json({ error: 'sin mock' }, 500),
      ),
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    consumeAvatarSuggestion();
  });

  it('muestra arriba las del tag y la elegida no cambia sola', async () => {
    render(
      <I18nProvider>
        <CreateInterviewView onDone={vi.fn()} onCancel={vi.fn()} onShowToast={vi.fn()} />
      </I18nProvider>,
    );
    await screen.findByTestId('avatar-pick-elena');
    expect(screen.queryByTestId('avatar-suggested')).toBeNull();
    expect(screen.getByTestId('avatar-pick-elena')).toHaveAttribute('aria-pressed', 'true');

    setAvatarSuggestion('fiesta');

    expect(await screen.findByTestId('avatar-suggested')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-suggested-title')).toHaveTextContent('Sugeridas para tu reunión de Fiesta');
    expect(screen.getByTestId('avatar-pick-suggested-elena')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-pick-suggested-muriel')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-pick-suggested-marco')).toBeNull();
    // La tool resalta; la persona sigue con su elegida y nada arranca.
    expect(screen.getByTestId('avatar-pick-elena')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('napster-avatar-start')).toBeInTheDocument();
  });
});
