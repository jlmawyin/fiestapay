import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEMES, UI_LABELS } from '@fiestapay/shared';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import {
  ASSISTANT_THEME_EVENT,
  ESPACIAL_ACCENT,
  MEAL_ICONS,
  ORB_SLOGANS,
  ORB_THEMES,
  THEME_KEY_ICONS,
  orbAccentFor,
  orbIconFor,
  orbThemeFor,
  type AssistantThemeDetail,
} from '../components/assistant/orb-themes';
import { AssistantText } from '../components/chat/AssistantText';
import { PublicChatAssistant } from '../components/chat/PublicChatAssistant';
import { ChatAssistant } from '../components/chat/ChatAssistant';
import { CreateWizard } from '../components/events/CreateWizard';
import { ENTER_MODE_KEY } from '../components/chat/ChatComposer';
import { scrollContainerToBottom, scrollMessageToTop } from '../components/chat/chat-hooks';
import { AI_REQUEST_TIMEOUT_MS, ApiError, REQUEST_TIMEOUT_MS, api } from '../api/client';
import { sendPublicChat } from '../api/public-chat';
import type { Capabilities, TemplateKind } from '../types';

const capabilities: Capabilities = {
  chat: true,
  llmProvider: 'gemini',
  paypal: false,
  voice: false,
  paypalClientId: null,
  sandbox: true,
  email: false,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

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

function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const fail = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener('abort', fail, { once: true });
    });
  });
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

describe('FP-UX-2 orb themes data', () => {
  it('defines five bilingual themes with slogans', () => {
    expect(Object.keys(ORB_THEMES).sort()).toEqual(['casa', 'comida', 'espacial', 'evento', 'viaje']);
    expect(ORB_SLOGANS.espacial).toEqual({ es: '¿En qué te ayudo?', en: 'How can I help?' });
    expect(ORB_SLOGANS.comida).toEqual({ es: '¿Te ayudo con la comida?', en: 'Need help with the meal?' });
    expect(ORB_SLOGANS.casa).toEqual({ es: 'Te ayudo con la reunión', en: "I'll help with the get-together" });
    expect(ORB_SLOGANS.viaje).toEqual({ es: '¿Listo para el viaje?', en: 'Ready for the trip?' });
    expect(ORB_SLOGANS.evento).toEqual({ es: '¡Que empiece el evento!', en: 'Let the event begin!' });
    for (const theme of Object.values(ORB_THEMES)) {
      expect(theme.scene.es.trim().length).toBeGreaterThan(0);
      expect(theme.scene.en.trim().length).toBeGreaterThan(0);
    }
  });

  it('varies the comida icons by meal', () => {
    expect(MEAL_ICONS.desayuno.map((entry) => entry.name)).toEqual(['Coffee', 'Croissant', 'EggFried']);
    expect(MEAL_ICONS.almuerzo.map((entry) => entry.name)).toEqual(['Soup', 'Salad', 'CookingPot']);
    expect(MEAL_ICONS.cena.map((entry) => entry.name)).toEqual(['Wine', 'UtensilsCrossed', 'CakeSlice']);
  });

  it('maps every invitation theme to its own icon', () => {
    expect(THEME_KEY_ICONS.mesa.name).toBe('UtensilsCrossed');
    expect(THEME_KEY_ICONS.huerto.name).toBe('Sprout');
    expect(THEME_KEY_ICONS.brindis.name).toBe('Wine');
    expect(THEME_KEY_ICONS.fogata.name).toBe('Flame');
    expect(THEME_KEY_ICONS.patio.name).toBe('Sun');
    expect(THEME_KEY_ICONS.sala.name).toBe('Sofa');
    expect(THEME_KEY_ICONS.terraza.name).toBe('Lamp');
    expect(THEME_KEY_ICONS.jardin.name).toBe('Flower2');
    expect(THEME_KEY_ICONS.camino.name).toBe('Car');
    expect(THEME_KEY_ICONS.montana.name).toBe('Mountain');
    expect(THEME_KEY_ICONS.costa.name).toBe('Palmtree');
    expect(THEME_KEY_ICONS.ciudad.name).toBe('Building2');
    expect(THEME_KEY_ICONS.escenario.name).toBe('Mic');
    expect(THEME_KEY_ICONS.galeria.name).toBe('Palette');
    expect(THEME_KEY_ICONS.taller.name).toBe('Hammer');
    expect(THEME_KEY_ICONS.noche.name).toBe('Moon');
  });

  it('uses the theme accent, or the template default without a saved theme', () => {
    const mesa = THEMES.find((theme) => theme.key === 'mesa')!;
    expect(orbAccentFor('comida', 'mesa')).toBe(mesa.accent);
    expect(orbIconFor('comida', 'mesa').name).toBe('UtensilsCrossed');
    expect(orbAccentFor('comida', undefined)).toBe(mesa.accent);
    expect(orbIconFor('viaje', undefined).name).toBe('Car');
    expect(orbThemeFor(null)).toBe('espacial');
    expect(orbThemeFor('viaje')).toBe('viaje');
    expect(ESPACIAL_ACCENT).toBe(ORB_THEMES.espacial.gradient.from);
  });
});

describe('FP-UX-2 orb look per screen', () => {
  it('is deep-space without an invitation and names the agent accessibly', () => {
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    const launcher = screen.getByRole('button', { name: UI_LABELS.es.orbLauncher });
    expect(launcher).toHaveAttribute('data-orb', 'espacial');
    expect(launcher.textContent).toContain('Agente FiestaPay');
    expect(UI_LABELS.es.orbLauncher).toContain('Agente FiestaPay');
  });

  it.each([
    { template: 'comida', themeKey: 'mesa', icon: 'UtensilsCrossed' },
    { template: 'casa', themeKey: 'sala', icon: 'Sofa' },
    { template: 'viaje', themeKey: 'costa', icon: 'Palmtree' },
    { template: 'evento', themeKey: 'noche', icon: 'Moon' },
  ] as const)('shows $template/$themeKey with its accent and icon', ({ template, themeKey, icon }) => {
    render(
      <AssistantOrb
        audience="guest"
        slug="fiesta"
        capabilities={capabilities}
        theme={{ template, themeKey }}
        onShowToast={vi.fn()}
      />,
    );
    const launcher = screen.getByRole('button', { name: UI_LABELS.es.orbLauncher });
    const expected = THEMES.find((theme) => theme.key === themeKey)!;
    expect(launcher).toHaveAttribute('data-orb', template);
    const art = launcher.querySelector('[data-orb]');
    expect(art).toHaveAttribute('data-accent', expected.accent);
    expect(art).toHaveAttribute('data-icon', icon);
  });

  it('floats the breakfast icons on a desayuno comida orb', () => {
    render(
      <AssistantOrb
        audience="guest"
        slug="fiesta"
        capabilities={capabilities}
        theme={{ template: 'comida', themeKey: 'mesa', meal: 'desayuno' }}
        onShowToast={vi.fn()}
      />,
    );
    const launcher = screen.getByRole('button', { name: UI_LABELS.es.orbLauncher });
    expect(launcher.querySelectorAll('.fp-orb-float')).toHaveLength(3);
    expect(launcher.querySelectorAll('.fp-orb-steam')).toHaveLength(3);
  });

  it('keeps the same art in the panel header titled Agente FiestaPay', () => {
    render(
      <AssistantOrb
        audience="guest"
        slug="fiesta"
        capabilities={capabilities}
        theme={{ template: 'viaje', themeKey: 'costa' }}
        onShowToast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: UI_LABELS.es.orbLauncher }));
    const dialog = screen.getByRole('dialog', { name: 'Agente FiestaPay' });
    expect(within(dialog).getAllByText('Agente FiestaPay').length).toBeGreaterThan(0);
    expect(dialog.querySelector('[data-orb="viaje"]')).not.toBeNull();
  });

  it('folds the pill on narrow screens after ~6 s and brings it back on focus', async () => {
    vi.useFakeTimers();
    stubMatchMedia((query) => query === '(max-width: 639px)');
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    expect(screen.getByTestId('orb-pill')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.queryByTestId('orb-pill')).toBeNull();
    fireEvent.focus(screen.getByRole('button', { name: UI_LABELS.es.orbLauncher }));
    expect(screen.getByTestId('orb-pill')).toBeInTheDocument();
  });

  it('surprises every ~10 s until opened, then stops', async () => {
    vi.useFakeTimers();
    stubMatchMedia(() => false);
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    const launcher = () => screen.getByRole('button', { name: UI_LABELS.es.orbLauncher });
    expect(launcher().querySelector('[data-surprise="true"]')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(launcher().querySelector('[data-surprise="true"]')).not.toBeNull();
    const launcherEl = launcher();
    fireEvent.click(launcherEl);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(launcherEl.querySelector('[data-surprise="true"]')).toBeNull();
  });

  it('renders static art under reduced motion', () => {
    stubMatchMedia((query) => query === '(prefers-reduced-motion: reduce)');
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    const launcher = screen.getByRole('button', { name: UI_LABELS.es.orbLauncher });
    expect(launcher.querySelector('[data-static="true"]')).not.toBeNull();
  });
});

describe('FP-UX-2 /create theme surprise', () => {
  it('transforms the public orb while the wizard type is picked', () => {
    render(<AssistantOrb audience="public" capabilities={capabilities} onShowToast={vi.fn()} />);
    const launcher = () => screen.getByRole('button', { name: UI_LABELS.es.orbLauncher });
    expect(launcher()).toHaveAttribute('data-orb', 'espacial');
    act(() => {
      document.dispatchEvent(
        new CustomEvent<AssistantThemeDetail>(ASSISTANT_THEME_EVENT, { detail: { template: 'viaje' } }),
      );
    });
    expect(launcher()).toHaveAttribute('data-orb', 'viaje');
    act(() => {
      document.dispatchEvent(
        new CustomEvent<AssistantThemeDetail>(ASSISTANT_THEME_EVENT, { detail: { template: null } }),
      );
    });
    expect(launcher()).toHaveAttribute('data-orb', 'espacial');
  });

  it('CreateWizard emits the picked type and null on unmount', () => {
    const seen: Array<TemplateKind | null> = [];
    const onTheme = (event: Event) => {
      seen.push((event as CustomEvent<AssistantThemeDetail>).detail.template);
    };
    document.addEventListener(ASSISTANT_THEME_EVENT, onTheme);
    try {
      const view = render(<CreateWizard onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
      const group = screen.getByRole('radiogroup', { name: 'Selecciona una de las 4 plantillas' });
      const radios = within(group).getAllByRole('radio');
      fireEvent.click(radios[2]!);
      expect(seen).toEqual(['viaje']);
      view.unmount();
      expect(seen).toEqual(['viaje', null]);
    } finally {
      document.removeEventListener(ASSISTANT_THEME_EVENT, onTheme);
    }
  });
});

describe('FP-UX-2 Enter to send', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  function openPublic(): void {
    render(<PublicChatAssistant capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
  }

  function composer(): HTMLTextAreaElement {
    return screen.getByRole('textbox', { name: 'Pregunta para el chat público' }) as HTMLTextAreaElement;
  }

  it('sends with Enter by default, with a one-line explanation', async () => {
    fetchMock.mockResolvedValue(response({ text: 'Respuesta.' }));
    openPublic();
    expect(screen.getByText('Enter envía · Mayús+Enter = nueva línea')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Enter envía' })).toBeChecked();
    expect(composer()).toHaveAttribute('enterkeyhint', 'send');

    fireEvent.change(composer(), { target: { value: '¿Hola?' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(await screen.findByText('Respuesta.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never sends with Shift+Enter nor during IME composition', () => {
    fetchMock.mockResolvedValue(response({ text: 'Respuesta.' }));
    openPublic();
    fireEvent.change(composer(), { target: { value: 'Línea' } });
    fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(composer(), { key: 'Enter', isComposing: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('button-only mode keeps Enter as a newline and remembers the choice', () => {
    fetchMock.mockResolvedValue(response({ text: 'Respuesta.' }));
    openPublic();
    fireEvent.click(screen.getByRole('radio', { name: 'Solo con el botón' }));
    expect(screen.getByText('Enter hace nueva línea; envía con el botón')).toBeInTheDocument();
    expect(composer()).toHaveAttribute('enterkeyhint', 'enter');

    fireEvent.change(composer(), { target: { value: '¿Hola?' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ENTER_MODE_KEY)).toBe('button');

    cleanup();
    openPublic();
    expect(screen.getByRole('radio', { name: 'Solo con el botón' })).toBeChecked();
  });

  it('sends the guest chat with Enter too', async () => {
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    const send = vi.spyOn(api, 'sendChat').mockResolvedValue({ text: 'Tu cuota es $50,00.' });
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    const input = screen.getByRole('textbox', { name: 'Mensaje para el asistente' });
    fireEvent.change(input, { target: { value: '¿Cuál es mi cuota?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Tu cuota es $50,00.')).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith('fiesta', '¿Cuál es mi cuota?');
  });
});

describe('FP-UX-2 safe answer formatting', () => {
  it('renders unordered and ordered lists', () => {
    const { container } = render(<AssistantText text={'- primero\n- segundo'} />);
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    const { container: ordered } = render(<AssistantText text={'1. uno\n2. dos'} />);
    expect(ordered.querySelectorAll('ol li')).toHaveLength(2);
  });

  it('renders bold and button-name labels without delimiters', () => {
    const { container } = render(
      <AssistantText text={'Pulsa **"Aprobar en PayPal"** o «Reintentar» y luego `/demo`.'} />,
    );
    expect(container.querySelector('strong')).not.toBeNull();
    const labels = Array.from(container.querySelectorAll('.fp-assistant-label')).map((node) => node.textContent);
    expect(labels).toEqual(['Aprobar en PayPal', 'Reintentar', '/demo']);
    expect(container.textContent).not.toContain('`');
    expect(container.textContent).not.toContain('"');
    expect(container.textContent).not.toContain('«');
  });

  it('never injects HTML nor links', () => {
    const { container } = render(
      <AssistantText text={'<script>alert(1)</script><a href="https://x.test">pulsa</a> https://x.test'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('formats public replies with lists and labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ text: '- Pulsa **"Aprobar en PayPal"**\n- Luego «Reintentar»' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PublicChatAssistant capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
    const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
    fireEvent.change(input, { target: { value: '¿Cómo pago?' } });
    fireEvent.submit(input.closest('form')!);
    const dialog = screen.getByRole('dialog', { name: 'Chat público de FiestaPay' });
    expect(await within(dialog).findByText('Aprobar en PayPal')).toHaveClass('fp-assistant-label');
    expect(dialog.querySelectorAll('ul li')).toHaveLength(2);
  });
});

describe('FP-UX-2 readable chat', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('scrolls the container so the answer start sits at the top', () => {
    const container = document.createElement('div');
    const target = document.createElement('div');
    target.setAttribute('data-mid', 'm2');
    container.appendChild(target);
    Object.defineProperty(target, 'offsetTop', { value: 250, configurable: true });
    expect(scrollMessageToTop(container, 'm2')).toBe(true);
    expect(container.scrollTop).toBe(242);
    expect(scrollMessageToTop(container, 'missing')).toBe(false);
    const bottom = { scrollTop: 0, scrollHeight: 500 } as HTMLElement;
    scrollContainerToBottom(bottom);
    expect(bottom.scrollTop).toBe(500);
  });

  it('shows the question, the thinking seconds, then the answer start', async () => {
    vi.useFakeTimers();
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetTop');
    Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', { configurable: true, get: () => 250 });
    try {
      let resolveFetch!: (value: Response) => void;
      fetchMock.mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
      render(<PublicChatAssistant capabilities={capabilities} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
      const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
      fireEvent.change(input, { target: { value: '¿Qué incluye?' } });
      fireEvent.submit(input.closest('form')!);

      expect(screen.getByRole('status')).toHaveTextContent('Pensando… 0 s');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Pensando… 2 s');

      await act(async () => {
        resolveFetch(response({ text: 'Incluye cena y brindis.' }));
      });
      expect(screen.getByText('Incluye cena y brindis.')).toBeInTheDocument();
      const list = screen.getByTestId('chat-messages');
      expect(list.scrollTop).toBe(242);
      expect(list).toHaveClass('fp-chat-messages');
    } finally {
      if (descriptor) Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', descriptor);
      else delete (window.HTMLElement.prototype as { offsetTop?: number }).offsetTop;
    }
  });

  it('keeps the notices inside «Sobre este chat»', () => {
    render(<PublicChatAssistant capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
    const about = screen.getByTestId('about-chat');
    expect(within(about).getByText('Sobre este chat')).toBeInTheDocument();
    expect(about.textContent).toContain('separado de tu evento o del panel del organizador');
    expect(about.textContent).toContain('Gemini procesa tus consultas');
  });

  it('shows quick help only before the first question', async () => {
    fetchMock.mockResolvedValue(response({ text: 'Respuesta.' }));
    render(<PublicChatAssistant capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
    expect(screen.getByRole('button', { name: '¿Cómo funciona FiestaPay?' })).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
    fireEvent.change(input, { target: { value: '¿Hola?' } });
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('Respuesta.');

    expect(screen.queryByRole('button', { name: '¿Cómo funciona FiestaPay?' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preguntas sugeridas' }));
    expect(screen.getByRole('button', { name: '¿Cómo funciona FiestaPay?' })).toBeInTheDocument();
  });

  it('gives the guest list most of the panel with the notice folded', async () => {
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    const about = await screen.findByTestId('about-chat');
    expect(within(about).getByText('Sobre este chat')).toBeInTheDocument();
    expect(about.textContent).toContain('Revisa tu cuota antes de abrir PayPal');
    expect(screen.getByTestId('chat-messages')).toHaveClass('fp-chat-messages');
  });
});

describe('FP-UX-2 waits and errors', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it.each([504, 408])('public chat explains %i and retries the same question', async (status) => {
    fetchMock
      .mockResolvedValueOnce(response({ error: 'tardó demasiado' }, status))
      .mockResolvedValueOnce(response({ text: 'Respuesta tras reintentar.' }));
    render(<PublicChatAssistant capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
    const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
    fireEvent.change(input, { target: { value: 'Pregunta lenta' } });
    fireEvent.submit(input.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El agente tardó demasiado. Tu pregunta no se procesó; pulsa «Reintentar».');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Respuesta tras reintentar.');
    expect(screen.getAllByText('Pregunta lenta')).toHaveLength(1);
  });

  it.each([503, 429])('public chat keeps the %i message with a manual retry', async (status) => {
    fetchMock.mockResolvedValueOnce(response({ error: 'fallo' }, status));
    render(<PublicChatAssistant capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
    const input = screen.getByRole('textbox', { name: 'Pregunta para el chat público' });
    fireEvent.change(input, { target: { value: 'Pregunta' } });
    fireEvent.submit(input.closest('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(String(status));
    expect(alert).toHaveTextContent('Reintentar');
  });

  it('guest chat retries a 504 without duplicating the question', async () => {
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    const send = vi.spyOn(api, 'sendChat')
      .mockRejectedValueOnce(new ApiError('tardó demasiado', 504))
      .mockResolvedValueOnce({ text: 'Respuesta tras reintentar.' });
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    const input = screen.getByRole('textbox', { name: 'Mensaje para el asistente' });
    fireEvent.change(input, { target: { value: 'Pregunta lenta' } });
    fireEvent.submit(input.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El agente tardó demasiado. Tu pregunta no se procesó; pulsa «Reintentar».');
    expect(screen.getByText('No enviado')).toBeInTheDocument();
    const failedBubble = screen.getByText('No enviado').closest('[data-mid]');
    expect(failedBubble).not.toBeNull();
    fireEvent.click(within(failedBubble as HTMLElement).getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Respuesta tras reintentar.');
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Pregunta lenta')).toHaveLength(1);
    expect(screen.queryByText('No enviado')).toBeNull();
  });

  it.each([503, 429])('guest chat names the %i failure', async (status) => {
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    vi.spyOn(api, 'sendChat').mockRejectedValueOnce(new ApiError('fallo', status));
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    const input = screen.getByRole('textbox', { name: 'Mensaje para el asistente' });
    fireEvent.change(input, { target: { value: 'Pregunta' } });
    fireEvent.submit(input.closest('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(String(status));
  });

  it('AI routes wait 55 s and never claim a fixed 30 seconds', async () => {
    vi.useFakeTimers();
    hangingFetch();
    const calls = [
      () => sendPublicChat('¿Hola?'),
      () => api.sendChat('fiesta', '¿Hola?'),
      () => api.sendOrganizerChat('fiesta', '¿Hola?'),
      () => api.draftEvent('una frase de prueba para el borrador'),
      () => api.suggestPresentation({ template: 'comida', title: 'Asado' }),
      () => api.draftReminders('fiesta', 'amable'),
    ];
    for (const call of calls) {
      let settled: unknown = null;
      const pending = call().then(
        (value) => { settled = { ok: value }; },
        (error) => { settled = { error }; },
      );
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      expect(settled, 'still waiting at 30 s').toBeNull();
      await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS - REQUEST_TIMEOUT_MS);
      await pending;
      const error = (settled as { error: ApiError }).error;
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(408);
      expect(error.message).toContain('55 segundos');
      expect(error.message).not.toContain('30 segundos');
    }
  });

  it('non-AI routes keep the 30 s budget', async () => {
    vi.useFakeTimers();
    hangingFetch();
    const pending = api.getHealth();
    const assertion = expect(pending).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
  });
});
