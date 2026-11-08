import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { I18nProvider } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
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
  llmProvider: 'openai',
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

interface ChatCall {
  message: string;
  context?: string;
}

let fetchMock: ReturnType<typeof vi.fn>;
let chatCalls: ChatCall[];

function openOrb(): void {
  fireEvent.click(screen.getByRole('button', { name: /asistente FiestaPay|FiestaPay assistant/i }));
}

function ask(question: string): void {
  // Scoped to the orb: /demo also has a visible grid filter textbox.
  const dialog = screen.getByRole('dialog', { name: /FiestaPay/ });
  const input = within(dialog).getByRole('textbox');
  fireEvent.change(input, { target: { value: question } });
  fireEvent.submit(input.closest('form')!);
}

function closeOrb(): void {
  fireEvent.click(screen.getByRole('button', { name: /Cerrar asistente|Close FiestaPay assistant/ }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
  chatCalls = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/capabilities') return response(capabilities);
    if (url === '/api/events') return response({ events: [] });
    if (url === '/api/chat/public') {
      const body = JSON.parse(init?.body as string) as ChatCall;
      chatCalls.push(body);
      return response({ text: `respuesta-${body.context ?? 'sin-contexto'}:${body.message}` });
    }
    throw new Error(`sin mock: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('separate public conversations', () => {
  it('keeps landing and demo histories apart, sends context, and survives navigation', async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    // Landing conversation.
    openOrb();
    ask('pregunta-portada');
    expect(await screen.findByText('respuesta-landing:pregunta-portada')).toBeInTheDocument();
    expect(chatCalls).toEqual([{ message: 'pregunta-portada', context: 'landing' }]);
    closeOrb();

    // Demo conversation starts empty and stays separate.
    fireEvent.click(screen.getAllByRole('button', { name: 'Demo para jueces' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Demo para jueces' })).toBeInTheDocument();
    openOrb();
    // The landing history stays mounted but hidden with its own context.
    expect(screen.queryByText('respuesta-landing:pregunta-portada')).not.toBeVisible();
    ask('pregunta-demo');
    expect(await screen.findByText('respuesta-demo:pregunta-demo')).toBeVisible();
    expect(chatCalls[1]).toEqual({ message: 'pregunta-demo', context: 'demo' });
    closeOrb();

    // Back on the landing, its own history is intact and the demo one is hidden.
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(window.location.pathname).toBe('/');
    openOrb();
    expect(await screen.findByText('respuesta-landing:pregunta-portada')).toBeVisible();
    expect(screen.queryByText('respuesta-demo:pregunta-demo')).not.toBeVisible();
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === '/api/chat/public')).toHaveLength(2);
  });

  it('keeps the visible history when the language changes', async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    openOrb();
    ask('pregunta-portada');
    expect(await screen.findByText('respuesta-landing:pregunta-portada')).toBeInTheDocument();

    const select = screen.getByLabelText('Idioma') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'en' } });

    // The history survives; the chrome is English now.
    expect(screen.getByText('respuesta-landing:pregunta-portada')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Type' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    ask('second-question');
    expect(await screen.findByText('respuesta-landing:second-question')).toBeInTheDocument();
    expect(chatCalls[1]).toEqual({ message: 'second-question', context: 'landing' });
    expect(localStorage.getItem('fp_locale')).toBe('en');
  });
});
