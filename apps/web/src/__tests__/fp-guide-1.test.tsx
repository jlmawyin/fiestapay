import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiPage } from '@fiestapay/shared';
import { App } from '../App';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { AssistantText } from '../components/chat/AssistantText';
import { ChatAssistant } from '../components/chat/ChatAssistant';
import { GuideOverlay } from '../guide/GuideOverlay';
import {
  GUIDE_ACTION_EVENT,
  GUIDE_SHOW_EVENT,
  registerGuideNavigator,
  showOnScreen,
  startGuidedTour,
  validateShowOnScreenArgs,
} from '../guide/showOnScreen';
import { api } from '../api/client';
import type { Capabilities } from '../types';

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

const capabilities: Capabilities = {
  paypal: true,
  paypalClientId: 'sb-client',
  chat: true,
  llmProvider: 'gemini',
  voice: false,
  sandbox: true,
  email: true,
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

let fixtures: HTMLElement[] = [];

function addFixture(id: string, tag = 'button', text?: string): HTMLElement {
  const element = document.createElement(tag);
  element.setAttribute('data-guide', id);
  element.textContent = text ?? id;
  element.scrollIntoView = vi.fn();
  document.body.appendChild(element);
  fixtures.push(element);
  return element;
}

function useFakeNavigator(initial: UiPage | null = 'landing') {
  const state = { current: initial, navigations: [] as UiPage[] };
  registerGuideNavigator({
    navigate: (page) => {
      state.navigations.push(page);
      state.current = page;
    },
    getCurrentPage: () => state.current,
  });
  return state;
}

function listenTo(eventName: string): { events: Event[]; stop: () => void } {
  const events: Event[] = [];
  const onEvent = (event: Event) => {
    events.push(event);
  };
  document.addEventListener(eventName, onEvent);
  return { events, stop: () => document.removeEventListener(eventName, onEvent) };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const fixture of fixtures) fixture.remove();
  fixtures = [];
  registerGuideNavigator(null);
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('FP-GUIDE-1 argument validation', () => {
  it('rejects unknown ids without navigating', async () => {
    const nav = useFakeNavigator('landing');
    const actions = listenTo(GUIDE_ACTION_EVENT);
    try {
      await expect(showOnScreen({ target: 'noSuchTarget' })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      await expect(showOnScreen({ page: 'noSuchPage' })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      expect(nav.navigations).toEqual([]);
      expect(actions.events).toHaveLength(0);
    } finally {
      actions.stop();
    }
  });

  it('rejects URLs, selectors and any key outside the contract', async () => {
    const nav = useFakeNavigator('landing');
    const shows = listenTo(GUIDE_SHOW_EVENT);
    try {
      await expect(showOnScreen({ page: 'https://evil.test/demo' })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      await expect(showOnScreen({ target: 'paymentDemo', url: 'https://evil.test' })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      await expect(showOnScreen({ selector: '[data-guide="paymentDemo"]' })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      await expect(showOnScreen({ target: 'paymentDemo', click: true })).resolves.toEqual({
        ok: false,
        reason: 'invalid_args',
      });
      expect(nav.navigations).toEqual([]);
      expect(shows.events).toHaveLength(0);
    } finally {
      shows.stop();
    }
  });

  it('rejects empty, primitive and mistyped arguments', () => {
    expect(validateShowOnScreenArgs({})).toEqual({ ok: false });
    expect(validateShowOnScreenArgs(null)).toEqual({ ok: false });
    expect(validateShowOnScreenArgs('demo')).toEqual({ ok: false });
    expect(validateShowOnScreenArgs([])).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ page: 42 })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ target: null })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ target: 'paymentDemo', caption: 42 })).toEqual({ ok: false });
    expect(validateShowOnScreenArgs({ page: 'demo', target: 'paymentDemo', caption: 'ok' })).toEqual({
      ok: true,
      args: { page: 'demo', target: 'paymentDemo', caption: 'ok' },
    });
  });

  it('trims an over-long caption to 60 characters instead of refusing', () => {
    const long = 'x'.repeat(200);
    const validated = validateShowOnScreenArgs({ target: 'paymentDemo', caption: `  ${long}  ` });
    expect(validated).toEqual({ ok: true, args: { target: 'paymentDemo', caption: 'x'.repeat(60) } });
  });
});

describe('FP-GUIDE-1 navigation and highlight', () => {
  it('navigates to a page without highlighting', async () => {
    const nav = useFakeNavigator('landing');
    const shows = listenTo(GUIDE_SHOW_EVENT);
    try {
      await expect(showOnScreen({ page: 'demo' })).resolves.toEqual({ ok: true, page: 'demo' });
      expect(nav.navigations).toEqual(['demo']);
      expect(shows.events).toHaveLength(0);
    } finally {
      shows.stop();
    }
  });

  it('opens the target page first, then scrolls, focuses and highlights', async () => {
    const nav = useFakeNavigator('landing');
    render(<GuideOverlay />);
    const fixture = addFixture('myDemos', 'section', 'Mis demos');
    const result = await showOnScreen({ target: 'myDemos' });
    expect(nav.navigations).toEqual(['demo']);
    expect(result).toEqual({ ok: true, page: 'demo', target: 'myDemos' });
    expect(fixture.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center', inline: 'center' }),
    );
    await waitFor(() => expect(document.activeElement).toBe(fixture));
    expect(await screen.findByTestId('guide-ring')).toBeInTheDocument();
    expect(screen.getByTestId('guide-bubble')).toHaveTextContent('Pulsa aquí: Mis demos');
  });

  it('shows a custom caption when the action carries one', async () => {
    useFakeNavigator('demo');
    render(<GuideOverlay />);
    addFixture('myDemos', 'section', 'Mis demos');
    const result = await showOnScreen({ target: 'myDemos', caption: 'Tus demos están aquí' });
    expect(result.ok).toBe(true);
    expect(await screen.findByTestId('guide-bubble')).toHaveTextContent('Tus demos están aquí');
  });

  it('waits for a target that mounts late', async () => {
    useFakeNavigator('demo');
    render(<GuideOverlay />);
    const pending = showOnScreen({ target: 'myDemos' }, { timeoutMs: 1000 });
    window.setTimeout(() => addFixture('myDemos', 'section', 'Mis demos'), 30);
    await expect(pending).resolves.toEqual({ ok: true, page: 'demo', target: 'myDemos' });
    expect(await screen.findByTestId('guide-ring')).toBeInTheDocument();
  });

  it('answers unavailable_here when the target never appears', async () => {
    const nav = useFakeNavigator('demo');
    const shows = listenTo(GUIDE_SHOW_EVENT);
    try {
      await expect(showOnScreen({ target: 'myDemos' }, { timeoutMs: 60 })).resolves.toEqual({
        ok: false,
        reason: 'unavailable_here',
        page: 'demo',
        target: 'myDemos',
      });
      expect(nav.navigations).toEqual([]);
      expect(shows.events).toHaveLength(0);
    } finally {
      shows.stop();
    }
  });

  it('opens navigation entries instead of highlighting them', async () => {
    const nav = useFakeNavigator('landing');
    const shows = listenTo(GUIDE_SHOW_EVENT);
    try {
      await expect(showOnScreen({ target: 'judgesDemo' })).resolves.toEqual({
        ok: true,
        page: 'demo',
        target: 'judgesDemo',
      });
      await expect(showOnScreen({ target: 'newInvitation' })).resolves.toEqual({
        ok: true,
        page: 'create',
        target: 'newInvitation',
      });
      expect(nav.navigations).toEqual(['demo', 'create']);
      expect(shows.events).toHaveLength(0);
    } finally {
      shows.stop();
    }
  });

  it('highlights header targets in place on non-guide pages', async () => {
    const nav = useFakeNavigator(null);
    render(<GuideOverlay />);
    addFixture('myInvitations', 'button', 'Mis invitaciones');
    const result = await showOnScreen({ target: 'myInvitations' });
    expect(nav.navigations).toEqual([]);
    expect(result).toEqual({ ok: true, target: 'myInvitations' });
    expect(await screen.findByTestId('guide-bubble')).toHaveTextContent('Pulsa aquí: Mis invitaciones');
  });
});

describe('FP-GUIDE-1 clickable labels', () => {
  it('renders a button only for exact label matches', () => {
    const { container } = render(
      <AssistantText text={'Pulsa "Mis invitaciones" o "Algo inventado".'} />,
    );
    const action = screen.getByRole('button', { name: /Mis invitaciones/ });
    expect(action).toHaveClass('fp-assistant-label--action');
    expect(action.textContent).toContain('→');
    expect(container.querySelectorAll('button.fp-assistant-label')).toHaveLength(1);
    const plain = Array.from(container.querySelectorAll('span.fp-assistant-label')).map(
      (node) => node.textContent,
    );
    expect(plain).toEqual(['Algo inventado']);
  });

  it('matches labels in the viewer language only', () => {
    localStorage.setItem('fp_locale', 'en');
    const { container } = render(
      <I18nProvider>
        <AssistantText text={'Tap "My invitations" or "Mis invitaciones".'} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: /My invitations/ })).toBeInTheDocument();
    expect(container.querySelectorAll('button.fp-assistant-label')).toHaveLength(1);
    expect(screen.getByText('Mis invitaciones')).toHaveClass('fp-assistant-label');
    expect(screen.getByText('Mis invitaciones').tagName).toBe('SPAN');
  });

  it('keeps near matches as text', () => {
    const { container } = render(
      <AssistantText text={'Pulsa "mis invitaciones" o "Mis invitacion".'} />,
    );
    expect(container.querySelectorAll('button.fp-assistant-label')).toHaveLength(0);
    expect(container.querySelectorAll('span.fp-assistant-label')).toHaveLength(2);
  });

  it('clicking a label highlights the element', async () => {
    useFakeNavigator('landing');
    render(
      <>
        <GuideOverlay />
        <AssistantText text={'Pulsa "Mis invitaciones" para verlas.'} />
      </>,
    );
    addFixture('myInvitations', 'button', 'Destino cabecera');
    fireEvent.click(screen.getByRole('button', { name: /Mis invitaciones/ }));
    expect(await screen.findByTestId('guide-ring')).toBeInTheDocument();
    expect(screen.getByTestId('guide-bubble')).toHaveTextContent('Pulsa aquí: Mis invitaciones');
  });

  it('page scope only offers targets present on the page', () => {
    addFixture('myInvitations', 'button', 'Mis invitaciones');
    const { container, unmount } = render(
      <AssistantText text={'Mira "Mis invitaciones".'} guideScope="page" />,
    );
    expect(container.querySelectorAll('button.fp-assistant-label')).toHaveLength(1);
    unmount();
    for (const fixture of fixtures) fixture.remove();
    fixtures = [];
    const rerendered = render(<AssistantText text={'Mira "Mis invitaciones".'} guideScope="page" />);
    expect(rerendered.container.querySelectorAll('button.fp-assistant-label')).toHaveLength(0);
    expect(rerendered.container.querySelector('span.fp-assistant-label')?.textContent).toBe(
      'Mis invitaciones',
    );
  });

  it('guest chat offers header labels and keeps demo labels as text', async () => {
    vi.spyOn(api, 'getChatHistory').mockResolvedValue({ messages: [] });
    vi.spyOn(api, 'sendChat').mockResolvedValue({
      text: 'Mira "Mis invitaciones" y "Ver panel de ejemplo (AG Grid)".',
    });
    addFixture('myInvitations', 'button', 'Destino cabecera');
    render(<ChatAssistant slug="fiesta" capabilities={capabilities} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir asistente IA' }));
    const input = screen.getByRole('textbox', { name: 'Mensaje para el asistente' });
    fireEvent.change(input, { target: { value: '¿Dónde miro?' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('button', { name: /Mis invitaciones/ })).toBeInTheDocument();
    const panel = screen.getByText('Ver panel de ejemplo (AG Grid)');
    expect(panel.tagName).toBe('SPAN');
  });
});

function stubAppFetch(replyText: string): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/capabilities') return response(capabilities);
    if (url === '/api/events') return response({ events: [] });
    if (url === '/api/chat/public') {
      expect(JSON.parse(init?.body as string).message).toBeTruthy();
      return response({ text: replyText });
    }
    throw new Error(`sin mock: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function openOrb(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Agente FiestaPay' }));
}

function askInOrb(question: string): void {
  const dialog = screen.getByRole('dialog', { name: 'Agente FiestaPay' });
  const input = within(dialog).getByRole('textbox');
  fireEvent.change(input, { target: { value: question } });
  fireEvent.submit(input.closest('form')!);
}

describe('FP-GUIDE-1 panel minimizes and history survives', () => {
  it('minimizes on label tap, highlights the header and restores the chat intact', async () => {
    stubAppFetch('Pulsa "Mis invitaciones" para verlas.');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    openOrb();
    askInOrb('¿Dónde están mis invitaciones?');
    const dialog = screen.getByRole('dialog', { name: 'Agente FiestaPay' });
    const action = await within(dialog).findByRole('button', { name: /Mis invitaciones/ });
    fireEvent.click(action);

    expect(screen.queryByRole('dialog', { name: 'Agente FiestaPay' })).toBeNull();
    expect(await screen.findByTestId('guide-ring')).toBeInTheDocument();
    expect(screen.getByTestId('guide-bubble')).toHaveTextContent('Pulsa aquí: Mis invitaciones');

    openOrb();
    const restored = screen.getByRole('dialog', { name: 'Agente FiestaPay' });
    expect(within(restored).getByText('¿Dónde están mis invitaciones?')).toBeInTheDocument();
    expect(
      within(restored).getByRole('button', { name: /Mis invitaciones/ }),
    ).toBeInTheDocument();
  });
});

describe('FP-GUIDE-1 guided tour', () => {
  async function openDemo(): Promise<void> {
    stubAppFetch('Hola.');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Demo para jueces' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Demo para jueces' })).toBeInTheDocument();
  }

  it('offers a Recorrido guiado button marked with data-guide', async () => {
    await openDemo();
    const tourButton = screen.getByRole('button', { name: 'Recorrido guiado' });
    expect(tourButton).toHaveAttribute('data-guide', 'guidedTour');
  });

  it('walks the demo steps in order and finishes on the last Siguiente', async () => {
    await openDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Recorrido guiado' }));
    expect(await screen.findByTestId('guide-bubble')).toHaveTextContent(
      'Aquí ves la tabla de invitados y pagos de ejemplo.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByTestId('guide-bubble')).toHaveTextContent(
      'Este botón crea una comida ficticia',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByTestId('guide-bubble')).toHaveTextContent(
      'cómo FiestaPay usa PayPal e IA',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.queryByTestId('guide-bubble')).toBeNull();
  });

  it('exits on Salir and on Esc', async () => {
    await openDemo();
    fireEvent.click(screen.getByRole('button', { name: 'Recorrido guiado' }));
    expect(await screen.findByTestId('guide-bubble')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(screen.queryByTestId('guide-bubble')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Recorrido guiado' }));
    expect(await screen.findByTestId('guide-bubble')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('guide-bubble')).toBeNull();
  });
});

describe('FP-GUIDE-1 reduced motion and dismissal', () => {
  it('renders a static ring under prefers-reduced-motion', () => {
    stubMatchMedia((query) => query === '(prefers-reduced-motion: reduce)');
    render(<GuideOverlay />);
    addFixture('myDemos', 'section', 'Mis demos');
    act(() => {
      document.dispatchEvent(
        new CustomEvent(GUIDE_SHOW_EVENT, { detail: { target: 'myDemos' } }),
      );
    });
    expect(screen.getByTestId('guide-ring')).toHaveAttribute('data-motion', 'static');
  });

  it('renders an animated ring otherwise', () => {
    stubMatchMedia(() => false);
    render(<GuideOverlay />);
    addFixture('myDemos', 'section', 'Mis demos');
    act(() => {
      document.dispatchEvent(
        new CustomEvent(GUIDE_SHOW_EVENT, { detail: { target: 'myDemos' } }),
      );
    });
    expect(screen.getByTestId('guide-ring')).toHaveAttribute('data-motion', 'animated');
  });

  it('closes the highlight on tap, Esc and after 12 s', async () => {
    vi.useFakeTimers();
    stubMatchMedia(() => false);
    render(<GuideOverlay />);
    addFixture('myDemos', 'section', 'Mis demos');

    act(() => {
      document.dispatchEvent(
        new CustomEvent(GUIDE_SHOW_EVENT, { detail: { target: 'myDemos' } }),
      );
    });
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('guide-bubble')).toBeNull();

    act(() => {
      document.dispatchEvent(
        new CustomEvent(GUIDE_SHOW_EVENT, { detail: { target: 'myDemos' } }),
      );
    });
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('guide-bubble')).toBeNull();

    act(() => {
      document.dispatchEvent(
        new CustomEvent(GUIDE_SHOW_EVENT, { detail: { target: 'myDemos' } }),
      );
    });
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(screen.queryByTestId('guide-bubble')).toBeNull();
  });

  it('keeps tour steps open past 12 s until an explicit exit', async () => {
    vi.useFakeTimers();
    stubMatchMedia(() => false);
    render(<GuideOverlay />);
    addFixture('previewPanel', 'section', 'Panel');
    addFixture('paymentDemo', 'button', 'Pago');
    addFixture('paypalAiPanel', 'section', 'PayPal e IA');
    act(() => {
      startGuidedTour();
    });
    expect(screen.getByTestId('guide-bubble')).toHaveTextContent('tabla de invitados y pagos');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByTestId('guide-bubble')).toHaveTextContent('comida ficticia');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(screen.getByTestId('guide-bubble')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(screen.queryByTestId('guide-bubble')).toBeNull();
  });
});

describe('FP-GUIDE-1 never presses anything', () => {
  it('highlights and tours without clicking payment or creation buttons', async () => {
    const nav = useFakeNavigator('demo');
    render(<GuideOverlay />);
    const paymentClicks = vi.fn();
    const createClicks = vi.fn();
    const payment = addFixture('paymentDemo', 'button', 'Probar pago con PayPal');
    const create = addFixture('privateDemo', 'button', 'Crear mi demo privada');
    addFixture('previewPanel', 'section', 'Panel');
    addFixture('paypalAiPanel', 'section', 'PayPal e IA');
    payment.addEventListener('click', paymentClicks);
    create.addEventListener('click', createClicks);

    await expect(showOnScreen({ target: 'paymentDemo' })).resolves.toMatchObject({ ok: true });
    expect(paymentClicks).not.toHaveBeenCalled();

    act(() => {
      startGuidedTour();
    });
    expect(await screen.findByTestId('guide-bubble')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByTestId('guide-bubble')).toHaveTextContent('comida ficticia');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByTestId('guide-bubble')).toHaveTextContent('PayPal e IA');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.queryByTestId('guide-bubble')).toBeNull();

    expect(paymentClicks).not.toHaveBeenCalled();
    expect(createClicks).not.toHaveBeenCalled();
    expect(nav.navigations).toEqual([]);
  });
});
