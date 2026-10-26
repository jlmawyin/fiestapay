import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiAssistant } from '../components/chat/GeminiAssistant';
import { DemoRibbon } from '../components/common/DemoRibbon';
import { api } from '../api/client';
import type { Capabilities, Quote } from '../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Chat Provider and UI Branding (FP-OPENAI-WEB-20261024)', () => {
  it('supports OpenAI enabled with gemini=false and no Gemini branding in UI', async () => {
    const capabilities = {
      chat: true,
      llmProvider: 'openai' as const,
      gemini: false,
      paypal: true,
      voice: false,
      paypalClientId: 'sb-client-id',
      sandbox: true as const,
      email: false,
    };

    // Verify DemoRibbon displays generic Chat status and no Gemini branding
    const { unmount } = render(<DemoRibbon capabilities={capabilities} />);
    expect(screen.getByText('Chat: Configurado')).toBeInTheDocument();
    expect(screen.queryByText(/gemini/i)).toBeNull();
    unmount();

    // Verify GeminiAssistant shows generic Asistente FiestaPay text
    vi.spyOn(api, 'sendChat').mockResolvedValue({
      text: 'Hola, soy tu asistente OpenAI',
    });

    render(<GeminiAssistant slug="fiesta-slug" capabilities={capabilities} />);

    // Open chat panel
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));

    expect(screen.getByText('Asistente FiestaPay')).toBeInTheDocument();
    expect(screen.getByText('Consulta sobre tu fiesta')).toBeInTheDocument();
    expect(screen.queryByText(/gemini/i)).toBeNull();
    expect(screen.queryByLabelText(/gemini/i)).toBeNull();

    const input = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    expect(input).toBeEnabled();

    fireEvent.change(input, { target: { value: '¿Cuál es el valor?' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(api.sendChat).toHaveBeenCalledWith('fiesta-slug', '¿Cuál es el valor?');
      expect(screen.getByText('Hola, soy tu asistente OpenAI')).toBeInTheDocument();
    });

    // Confirm still no Gemini branding in the whole rendered complementary panel
    const panel = screen.getByRole('complementary', { name: 'Panel del Asistente FiestaPay' });
    expect(panel.textContent).not.toMatch(/gemini/i);
  });

  it('honors explicit chat=false despite legacy gemini=true and guards submit', async () => {
    const capabilities = {
      chat: false,
      llmProvider: 'openai' as const,
      gemini: true,
      paypal: false,
      voice: false,
      paypalClientId: null,
      sandbox: true as const,
      email: false,
    };

    // DemoRibbon should display Chat: Desactivado because false overrides gemini true
    const { unmount } = render(<DemoRibbon capabilities={capabilities} />);
    expect(screen.getByText('Chat: Desactivado')).toBeInTheDocument();
    expect(screen.queryByText(/gemini/i)).toBeNull();
    unmount();

    const sendChatSpy = vi.spyOn(api, 'sendChat');

    render(<GeminiAssistant slug="fiesta-slug" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));

    // Status shows Chat no disponible
    expect(screen.getByText('Chat no disponible')).toBeInTheDocument();
    expect(
      screen.getByText(
        '⚠️ El servicio de chat no está habilitado en este servidor. Puedes consultar la conversación previa pero las nuevas consultas están pausadas.'
      )
    ).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    expect(input).toBeDisabled();

    const submitBtn = screen.getByRole('button', { name: 'Enviar' });
    expect(submitBtn).toBeDisabled();

    // Guarded submit: even if form is submitted programmatically, sendChat is not called
    fireEvent.submit(input.closest('form')!);
    expect(sendChatSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/gemini/i)).toBeNull();
  });

  it('supports legacy response when chat property is missing', () => {
    // Legacy capabilities with only gemini: true
    const legacyActive: Capabilities = {
      gemini: true,
      paypal: true,
      voice: false,
      paypalClientId: null,
      sandbox: true,
      email: false,
    };

    const { rerender } = render(<DemoRibbon capabilities={legacyActive} />);
    expect(screen.getByText('Chat: Configurado')).toBeInTheDocument();
    expect(screen.queryByText(/gemini/i)).toBeNull();

    // Legacy capabilities with gemini: false
    const legacyInactive: Capabilities = {
      gemini: false,
      paypal: false,
      voice: false,
      paypalClientId: null,
      sandbox: true,
      email: false,
    };

    rerender(<DemoRibbon capabilities={legacyInactive} />);
    expect(screen.getByText('Chat: Desactivado')).toBeInTheDocument();

    // Null capabilities fallback
    rerender(<DemoRibbon capabilities={null} />);
    expect(screen.getByText('Chat: Desactivado')).toBeInTheDocument();
  });

  it('displays 503 fallback visible without Gemini branding and guides manual actions', async () => {
    const capabilities = {
      chat: true,
      gemini: true,
      paypal: false,
      voice: false,
      paypalClientId: null,
      sandbox: true as const,
      email: false,
    };

    const error503 = new Error('Service Unavailable');
    (error503 as any).status = 503;
    vi.spyOn(api, 'sendChat').mockRejectedValue(error503);

    render(<GeminiAssistant slug="fiesta-slug" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));

    const input = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    fireEvent.change(input, { target: { value: 'Quiero cambiar mi asistencia' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(
        screen.getByText(
          'El proveedor de chat no está disponible en este momento (503). Todas las acciones manuales de la fiesta siguen totalmente funcionales.'
        )
      ).toBeInTheDocument();
    });

    const panel = screen.getByRole('complementary', { name: 'Panel del Asistente FiestaPay' });
    expect(panel.textContent).not.toMatch(/gemini/i);
  });

  it('guarantees no payment or RSVP side effects from receiving assistant message until explicit confirmation', async () => {
    const capabilities = {
      chat: true,
      llmProvider: 'openai' as const,
      gemini: false,
      paypal: true,
      voice: false,
      paypalClientId: 'sb-123',
      sandbox: true as const,
      email: false,
    };

    const mockQuote: Quote = {
      id: 'quote-test-99',
      guestId: 'guest-1',
      people: 2,
      unitCents: 2000,
      totalCents: 4000,
      paidCents: 0,
      amountCents: 4000,
      summary: '2 personas x $20.00',
      expiresAt: '2099-01-01T00:00:00Z',
    };

    vi.spyOn(api, 'sendChat').mockResolvedValue({
      text: 'He preparado una sugerencia para ti y tu cuota.',
      quote: mockQuote,
      actions: ['rsvp:yes:1'],
    });

    const rsvpSpy = vi.spyOn(api, 'rsvp');
    const onApplyQuote = vi.fn();
    const onConfirmRsvp = vi.fn(async () => undefined);

    render(
      <GeminiAssistant
        slug="fiesta-slug"
        capabilities={capabilities}
        onApplyQuote={onApplyQuote}
        onConfirmRsvp={onConfirmRsvp}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));

    const input = screen.getByRole('textbox', { name: /Mensaje para el asistente/i });
    fireEvent.change(input, { target: { value: 'Voy con 1 acompañante' } });
    fireEvent.submit(input.closest('form')!);

    // Wait for the assistant message and proposal cards to appear
    await screen.findByText('He preparado una sugerencia para ti y tu cuota.');
    expect(screen.getByText('🧾 Propuesta de Cotización')).toBeInTheDocument();
    expect(screen.getByText('📋 Propuesta de Asistencia')).toBeInTheDocument();

    // Verify NO side effects happened merely from receiving the message:
    expect(rsvpSpy).not.toHaveBeenCalled();
    expect(onConfirmRsvp).not.toHaveBeenCalled();
    expect(onApplyQuote).not.toHaveBeenCalled();

    // Now test human confirmation for Quote:
    const reviewQuoteBtn = screen.getByRole('button', { name: 'Revisar y Confirmar en Pantalla' });
    fireEvent.click(reviewQuoteBtn);
    expect(onApplyQuote).toHaveBeenCalledTimes(1);
    expect(onApplyQuote).toHaveBeenCalledWith(mockQuote);

    // Now test human confirmation for RSVP:
    const confirmRsvpBtn = screen.getByRole('button', { name: 'Confirmar Asistencia' });
    fireEvent.click(confirmRsvpBtn);
    await waitFor(() => {
      expect(onConfirmRsvp).toHaveBeenCalledTimes(1);
      expect(onConfirmRsvp).toHaveBeenCalledWith('yes', 1);
      expect(screen.getByText('✓ Asistencia Confirmada en el Servidor')).toBeInTheDocument();
    });
  });
});
