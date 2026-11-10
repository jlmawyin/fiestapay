import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftEventProposal, OrderResult, Quote, UiPage } from '@fiestapay/shared';
import { PublicChatAssistant } from '../components/chat/PublicChatAssistant';
import { CreateWizard } from '../components/events/CreateWizard';
import { QuoteReviewCard } from '../components/invite/QuoteReviewCard';
import { PayPalSection } from '../components/invite/PayPalSection';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { api } from '../api/client';
import { setActiveLocale } from '../i18n/locale-store';
import {
  consumeGuideDraftProposal,
  registerGuideNavigator,
  setGuideDraftProposal,
  showOnScreen,
} from '../guide/showOnScreen';
import type { Capabilities } from '../types';

const capabilities: Capabilities = {
  chat: true,
  llmProvider: 'gemini',
  paypal: false,
  voice: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const DRAFT: DraftEventProposal = {
  template: 'comida',
  title: 'Asado de excompañeros',
  meal: 'almuerzo',
  date: '2026-11-21',
  startTime: '13:00',
  durationMinutes: 180,
  location: 'Casa de Ana',
  includes: ['Asado', 'Bebidas'],
  headcount: 10,
  budgetCents: 15000,
  perPersonCents: 1500,
  suggested: ['template', 'title', 'meal', 'date', 'startTime', 'durationMinutes', 'location', 'includes', 'headcount', 'budgetCents'],
  source: 'ai',
};

function registerFakeNavigator(page: 'landing' | 'create' = 'landing', inviteSlug: string | null = null) {
  const state: { current: UiPage; inviteSlug: string | null; navigations: string[] } = {
    current: page,
    inviteSlug,
    navigations: [],
  };
  registerGuideNavigator({
    navigate: (next) => {
      state.navigations.push(next);
      state.current = next;
    },
    getCurrentPage: () => state.current,
    getCurrentInviteSlug: () => state.inviteSlug,
  });
  return state;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  registerGuideNavigator(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setActiveLocale('es');
});

describe('FP-FINAL-A2 public chat draft card', () => {
  it('keeps the old {text} answer and hands the complete proposal to /create without another fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ text: 'Preparé un borrador.', draft: DRAFT }));
    vi.stubGlobal('fetch', fetchMock);
    const nav = registerFakeNavigator('landing');

    const { unmount } = render(<PublicChatAssistant capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
    const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
    fireEvent.change(input, { target: { value: 'Asado para 10 el sábado con $150' } });
    fireEvent.submit(input.closest('form')!);

    expect(await screen.findByText('Preparé un borrador.')).toBeInTheDocument();
    expect(screen.getByTestId('public-draft-card')).toHaveTextContent('Asado de excompañeros');
    expect(screen.getByTestId('public-draft-card')).toHaveTextContent('10 personas');
    expect(screen.getByTestId('public-draft-card')).toHaveTextContent('$15,00 por persona');

    fireEvent.click(screen.getByRole('button', { name: 'Revisar en Crear' }));
    expect(nav.navigations).toEqual(['create']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consumeGuideDraftProposal()).toEqual(DRAFT);

    // A wizard mounting after the navigation reads the same complete proposal.
    unmount();
    setGuideDraftProposal(DRAFT);
    render(<CreateWizard onSubmit={vi.fn(async () => undefined)} onCancel={vi.fn()} isLoading={false} />);
    await waitFor(() => expect(screen.getByDisplayValue('Asado de excompañeros')).toBeInTheDocument());
    expect(consumeGuideDraftProposal()).toBeNull();
  });

  it('applies the proposal when the wizard is already mounted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ text: 'Preparé un borrador.', draft: DRAFT }));
    vi.stubGlobal('fetch', fetchMock);
    registerFakeNavigator('landing');

    render(
      <>
        <PublicChatAssistant capabilities={capabilities} />
        <CreateWizard onSubmit={vi.fn(async () => undefined)} onCancel={vi.fn()} isLoading={false} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
    const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
    fireEvent.change(input, { target: { value: 'Asado para 10 el sábado con $150' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByTestId('public-draft-card');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar en Crear' }));

    await waitFor(() => expect(screen.getByDisplayValue('Asado de excompañeros')).toBeInTheDocument());
    expect(consumeGuideDraftProposal()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('FP-FINAL-A2 invitation guide targets', () => {
  function mountInvite(slug: string, target: string): { root: HTMLElement; control: HTMLButtonElement; clicks: () => number } {
    const root = document.createElement('div');
    root.dataset.inviteSlug = slug;
    const control = document.createElement('button');
    control.dataset.guide = target;
    control.scrollIntoView = vi.fn();
    let clicks = 0;
    control.addEventListener('click', () => { clicks += 1; });
    root.appendChild(control);
    document.body.appendChild(root);
    return { root, control, clicks: () => clicks };
  }

  it('highlights only on the mounted active invitation and never clicks or builds a URL', async () => {
    const nav = registerFakeNavigator('landing', 'fiesta');
    const { root, control, clicks } = mountInvite('fiesta', 'generatePayment');
    try {
      await expect(showOnScreen({ target: 'generatePayment' })).resolves.toEqual({
        ok: true,
        target: 'generatePayment',
      });
      expect(nav.navigations).toEqual([]);
      expect(control.scrollIntoView).toHaveBeenCalled();
      expect(clicks()).toBe(0);
      expect(document.querySelector('a[href*="fiesta"]')).toBeNull();
    } finally {
      root.remove();
    }
  });

  it('refuses page/sentence, another invitation and a route without a mounted invite', async () => {
    registerFakeNavigator('landing', 'fiesta');
    const { root } = mountInvite('fiesta', 'quoteReview');
    try {
      await expect(showOnScreen({ target: 'quoteReview', page: 'landing' })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      await expect(showOnScreen({ target: 'quoteReview', sentence: 'algo' })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      await expect(showOnScreen({ target: 'quoteReview' }, { inviteSlug: 'otra-fiesta' })).resolves.toEqual({
        ok: false,
        reason: 'unavailable_here',
        target: 'quoteReview',
      });
      registerFakeNavigator('landing', null);
      await expect(showOnScreen({ target: 'quoteReview' })).resolves.toEqual({
        ok: false,
        reason: 'unavailable_here',
        target: 'quoteReview',
      });
    } finally {
      root.remove();
    }
  });

  it('marks the real quote and PayPal controls', () => {
    const quote: Quote = {
      id: 'q1',
      guestId: 'g1',
      people: 2,
      unitCents: 2500,
      totalCents: 5000,
      paidCents: 0,
      amountCents: 5000,
      summary: '2 personas',
      expiresAt: '2099-01-01T00:00:00Z',
    };
    const { unmount } = render(
      <QuoteReviewCard
        quote={quote}
        isLoadingQuote={false}
        onRefreshQuote={vi.fn(async () => undefined)}
        onCreateOrder={vi.fn(async () => undefined)}
        isCreatingOrder={false}
      />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('data-guide', 'quoteReview');
    expect(screen.getByRole('button', { name: /Confirmar y Generar Pago/ })).toHaveAttribute(
      'data-guide',
      'generatePayment',
    );
    unmount();

    const order: OrderResult = {
      orderId: 'order-1',
      status: 'created',
      approveUrl: 'https://sandbox.paypal.test/approve',
    };
    const { container } = render(
      <PayPalSection
        order={order}
        capabilities={capabilities}
        onCaptureSuccess={vi.fn(async () => true)}
        onCancelOrError={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-guide="openPayPal"]')).not.toBeNull();
  });
});

describe('FP-FINAL-A2 voice failure falls back to text', () => {
  class MockAudioContext {
    sampleRate = 48000;
    state = 'running';
    destination = {};
    close = vi.fn(async () => undefined);
    resume = vi.fn(async () => undefined);
  }

  it('releases voice and shows a localized text-chat notice after a token failure', async () => {
    vi.stubGlobal('AudioContext', MockAudioContext);
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(api, 'getPublicVoiceToken').mockRejectedValue(new Error('token failed'));
    const release = vi.spyOn(api, 'releaseVoiceLease').mockResolvedValue({
      ok: true,
      released: true,
      alreadyReleased: false,
    });

    render(
      <AssistantOrb
        audience="public"
        capabilities={{ ...capabilities, voice: true, voiceProvider: 'gemini' }}
        onShowToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Agente FiestaPay' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Hablar' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Escuchar información por voz/ }));

    const notice = await screen.findByTestId('voice-fallback-notice');
    expect(notice).toHaveTextContent('La voz no está disponible por un fallo de token, conexión o proveedor');
    expect(screen.getByRole('tab', { name: 'Escribir' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'Pregunta para el chat público' })).toBeInTheDocument();
    // No lease was reserved; the failed attempt never starts the microphone again.
    expect(release).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Escuchar información por voz/ })).not.toBeInTheDocument();
  });
});
