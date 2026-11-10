import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS } from '@fiestapay/shared';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { ChatAssistant, normalizeChatText } from '../components/chat/ChatAssistant';
import { ApiError, api } from '../api/client';
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

function stubMatchMedia(matches: (query: string) => boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: matches(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }),
  );
}

function ask(text: string): void {
  const input = screen.getByRole('textbox', { name: 'Mensaje para el asistente' });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
}

/** Bubble texts in DOM order (each carries its timestamp; failed ones their badge). */
function bubbleTexts(): string[] {
  const list = screen.getByTestId('chat-messages');
  return Array.from(list.querySelectorAll('[data-mid]')).map((node) => node.textContent ?? '');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('FP-UX-2b chronological order', () => {
  it('normalizes text by trimming and collapsing whitespace', () => {
    expect(normalizeChatText('  Hola   mundo\n')).toBe('Hola mundo');
    expect(normalizeChatText('Sin cambios')).toBe('Sin cambios');
  });

  it('keeps polling from reordering: pending sorts by time, server echo dedups by id', async () => {
    const history = vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    const send = vi.spyOn(api, 'sendChat').mockResolvedValueOnce({
      text: 'Respuesta uno.',
      userMessageId: 'u1',
      assistantMessageId: 'a1',
    });
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    await screen.findByText(/Soy tu Agente FiestaPay/);

    ask('Primera pregunta');
    await screen.findByText('Respuesta uno.');

    history.mockResolvedValue({
      messages: [
        { id: 'u1', role: 'user', text: 'Primera pregunta', createdAt: '2026-11-09T01:44:00.000Z' },
        { id: 'a1', role: 'assistant', text: 'Respuesta uno.', createdAt: '2026-11-09T01:44:05.000Z' },
      ],
    });
    let resolveSecond!: (value: { text: string }) => void;
    send.mockReturnValueOnce(
      new Promise<{ text: string }>((resolve) => {
        resolveSecond = resolve;
      }),
    );
    ask('Segunda pregunta');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(3));
    // Wait for the merge itself, not just the call: the echo re-renders Q1.
    await screen.findByText('Primera pregunta');

    // Polling merged the echo without duplicating; the pending question sorts
    // after the older answer instead of jumping around.
    const texts = bubbleTexts();
    expect(texts).toHaveLength(4);
    expect(texts[1]).toContain('Primera pregunta');
    expect(texts[2]).toContain('Respuesta uno.');
    expect(texts[3]).toContain('Segunda pregunta');
    expect(screen.getAllByText('Primera pregunta')).toHaveLength(1);

    resolveSecond({ text: 'Respuesta dos.' });
    await screen.findByText('Respuesta dos.');
    const settled = bubbleTexts();
    expect(settled).toHaveLength(5);
    expect(settled[3]).toContain('Segunda pregunta');
    expect(settled[4]).toContain('Respuesta dos.');
  });

  it('drops the pending bubble when the server echoes its normalized text', async () => {
    const history = vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    vi.spyOn(api, 'sendChat').mockResolvedValueOnce({ text: 'Son $50.' });
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    await screen.findByText(/Soy tu Agente FiestaPay/);

    ask('  Cuota   total  ');
    await screen.findByText('Son $50.');
    // getByText collapses whitespace, so compare raw textContent instead.
    const before = bubbleTexts().filter((text) => text.includes('Cuota'));
    expect(before).toHaveLength(1);
    expect(before[0]).toContain('Cuota   total');

    history.mockResolvedValue({
      messages: [
        { id: 'srv-u', role: 'user', text: 'Cuota total', createdAt: '2026-11-09T01:44:00.000Z' },
        { id: 'srv-a', role: 'assistant', text: 'Son $50.', createdAt: '2026-11-09T01:44:05.000Z' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(3));

    // The server echo (single space) replaced the pending bubble (triple space).
    await vi.waitFor(() => {
      const quota = bubbleTexts().filter((text) => text.includes('Cuota'));
      expect(quota).toHaveLength(1);
      expect(quota[0]).toContain('Cuota total');
      expect(quota[0]).not.toContain('Cuota   total');
    });
  });

  it('keeps a failed message in place marked «No enviado · Reintentar»', async () => {
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    const send = vi.spyOn(api, 'sendChat')
      .mockResolvedValueOnce({ text: 'Respuesta uno.' })
      .mockRejectedValueOnce(new ApiError('caído', 503))
      .mockResolvedValueOnce({ text: 'Respuesta tres.' });
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    await screen.findByText(/Soy tu Agente FiestaPay/);

    ask('Pregunta uno');
    await screen.findByText('Respuesta uno.');
    ask('Pregunta dos');
    await screen.findByRole('alert');
    ask('Pregunta tres');
    await screen.findByText('Respuesta tres.');

    const texts = bubbleTexts();
    expect(texts).toHaveLength(6);
    expect(texts[1]).toContain('Pregunta uno');
    expect(texts[2]).toContain('Respuesta uno.');
    expect(texts[3]).toContain('Pregunta dos');
    expect(texts[3]).toContain('No enviado');
    expect(texts[4]).toContain('Pregunta tres');
    expect(texts[5]).toContain('Respuesta tres.');

    const failedBubble = screen.getByText('No enviado').closest('[data-mid]');
    expect(failedBubble).toHaveAttribute('data-delivery', 'failed');
    expect(within(failedBubble as HTMLElement).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

    send.mockResolvedValueOnce({ text: 'Respuesta dos al fin.' });
    fireEvent.click(within(failedBubble as HTMLElement).getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Respuesta dos al fin.');

    const retried = bubbleTexts();
    expect(retried).toHaveLength(7);
    expect(retried[3]).toContain('Pregunta dos');
    expect(retried[4]).toContain('Respuesta dos al fin.');
    expect(screen.getAllByText('Pregunta dos')).toHaveLength(1);
    expect(screen.queryByText('No enviado')).toBeNull();
  });

  it('the alert retry reuses the failed bubble instead of duplicating it', async () => {
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    const send = vi.spyOn(api, 'sendChat')
      .mockRejectedValueOnce(new ApiError('límite', 429))
      .mockResolvedValueOnce({ text: 'Respuesta al fin.' });
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    await screen.findByText(/Soy tu Agente FiestaPay/);

    ask('Pregunta con límite');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('429');
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Respuesta al fin.');
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Pregunta con límite')).toHaveLength(1);
  });
});

describe('FP-UX-2b landscape panel (height <= 560 px)', () => {
  it('renders compact: one-line header with tabs, conversation and composer inside', () => {
    stubMatchMedia((query) => query === '(max-height: 560px)');
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.es.orbLauncher }));
    const panel = screen.getByRole('dialog', { name: 'Agente FiestaPay' });

    expect(panel).toHaveAttribute('data-compact', 'true');
    const header = panel.querySelector('.fp-orb-header--compact');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByRole('tab', { name: 'Escribir' })).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole('tab', { name: 'Hablar' })).toBeInTheDocument();

    // Conversation and composer live inside the panel: no page scroll needed.
    // Landing and demo both mount (one hidden), so assert over every instance.
    const lists = within(panel).getAllByTestId('chat-messages');
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) expect(list).toHaveClass('fp-chat-messages');
    expect(
      within(panel).getByRole('textbox', { name: 'Pregunta para el chat público' }),
    ).toBeInTheDocument();
    const quicks = within(panel).getAllByTestId('quick-help');
    expect(quicks.length).toBeGreaterThan(0);
    for (const quick of quicks) expect(quick).toHaveClass('fp-quick-help--compact');
  });

  it('keeps the guest chat usable in compact mode', () => {
    stubMatchMedia((query) => query === '(max-height: 560px)');
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    render(
      <AssistantOrb
        audience="guest"
        slug="fiesta"
        capabilities={capabilities}
        theme={{ template: 'comida', themeKey: 'mesa', meal: 'cena' }}
        onShowToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.es.orbLauncher }));
    const panel = screen.getByRole('dialog', { name: 'Agente FiestaPay' });
    expect(panel).toHaveAttribute('data-compact', 'true');
    expect(within(panel).getByTestId('chat-messages')).toHaveClass('fp-chat-messages');
    expect(within(panel).getByRole('textbox', { name: 'Mensaje para el asistente' })).toBeInTheDocument();
  });

  it('stays non-compact on tall viewports', () => {
    stubMatchMedia(() => false);
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.es.orbLauncher }));
    const panel = screen.getByRole('dialog', { name: 'Agente FiestaPay' });
    expect(panel).toHaveAttribute('data-compact', 'false');
    expect(panel.querySelector('.fp-orb-header--compact')).toBeNull();
    const quicks = within(panel).getAllByTestId('quick-help');
    expect(quicks.length).toBeGreaterThan(0);
    for (const quick of quicks) expect(quick).not.toHaveClass('fp-quick-help--compact');
  });
});
