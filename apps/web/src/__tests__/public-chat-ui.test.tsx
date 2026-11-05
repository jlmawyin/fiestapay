import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicChatAssistant } from '../components/chat/PublicChatAssistant';
import type { Capabilities } from '../types';

const enabledCapabilities: Capabilities = {
  chat: true,
  llmProvider: 'openai',
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

function openChat(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de FiestaPay' }));
}

function questionBox(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: 'Pregunta para el chat público' }) as HTMLTextAreaElement;
}

function ask(question: string): void {
  const input = questionBox();
  fireEvent.change(input, { target: { value: question } });
  fireEvent.submit(input.closest('form')!);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PublicChatAssistant', () => {
  it('abre como chat general separado, no llama al abrir ni al usar ayuda rápida y no usa almacenamiento', () => {
    localStorage.setItem('fp_admin_fiesta', 'clave-existente');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

    render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    openChat();
    expect(screen.getByRole('dialog', { name: 'Chat público de FiestaPay' })).toBeInTheDocument();
    expect(screen.getAllByText(/separado de tu evento o del panel del organizador/i).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '¿Cómo funciona FiestaPay?' }));
    expect(questionBox()).toHaveValue('¿Cómo funciona FiestaPay?');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(getItemSpy).not.toHaveBeenCalled();
  });

  it('envía solo al botón, sin cabecera de administrador, y conserva la charla al cerrar hasta recargar', async () => {
    localStorage.setItem('fp_admin_fiesta', 'clave-que-no-debe-viajar');
    fetchMock.mockResolvedValue(response({ text: 'Respuesta pública guardada solo en memoria.' }));

    const { unmount } = render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    openChat();
    ask('  ¿Qué es FiestaPay?  ');

    await screen.findByText('Respuesta pública guardada solo en memoria.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(call[0]).toBe('/api/chat/public');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ message: '¿Qué es FiestaPay?' });
    const headers = init.headers as Headers;
    expect(headers.get('X-Fiesta-Admin-Key')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar chat público' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    openChat();
    expect(screen.getByText('Respuesta pública guardada solo en memoria.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    openChat();
    expect(screen.queryByText('Respuesta pública guardada solo en memoria.')).toBeNull();
    expect(screen.queryByText('¿Qué es FiestaPay?')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('muestra escribiendo… de verdad, deshabilita el composer y no duplica la solicitud pendiente', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValue(pending);

    render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    openChat();
    ask('¿Cómo funciona el sandbox?');

    expect(await screen.findByRole('status')).toHaveTextContent('El asistente público está escribiendo…');
    expect(questionBox()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    fireEvent.submit(questionBox().closest('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(response({ text: 'Los pagos son de prueba.' }));
    });
    await screen.findByText('Los pagos son de prueba.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(questionBox()).toBeEnabled();
  });

  it('ignora una respuesta pendiente tras desmontar sin filtrarla a otra instancia', async () => {
    let resolveOld!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    fetchMock.mockReturnValue(pending);

    const first = render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    openChat();
    ask('Pregunta de la instancia vieja');
    expect(await screen.findByRole('status')).toHaveTextContent('escribiendo…');
    first.unmount();

    render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    openChat();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveOld(response({ text: 'Respuesta vieja que no debe aparecer.' }));
    });
    expect(screen.queryByText('Respuesta vieja que no debe aparecer.')).toBeNull();
    expect(screen.queryByText('Pregunta de la instancia vieja')).toBeNull();
  });

  it('renderiza negritas y escapa HTML/scripts del modelo público', async () => {
    fetchMock.mockResolvedValue(
      response({ text: '**Importante:** <script>alert(1)</script> y <img src=x onerror=alert(1)>' }),
    );

    render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    openChat();
    ask('Resume la ayuda');

    const strong = await screen.findByText('Importante:');
    expect(strong.tagName).toBe('STRONG');
    const dialog = screen.getByRole('dialog', { name: 'Chat público de FiestaPay' });
    expect(dialog.querySelector('script')).toBeNull();
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.textContent).toContain('<script>alert(1)</script>');
    expect(dialog.textContent).not.toContain('**');
  });

  it.each([503, 429])('muestra %i con reintento manual y no repite la pregunta solo', async (status) => {
    fetchMock
      .mockResolvedValueOnce(response({ error: 'fallo temporal' }, status))
      .mockResolvedValueOnce(response({ text: 'Respuesta después del reintento manual.' }));

    render(<PublicChatAssistant capabilities={enabledCapabilities} />);
    openChat();
    ask('Pregunta que falla una vez');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(String(status));
    expect(alert).toHaveTextContent('Reintentar');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Pregunta que falla una vez')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Respuesta después del reintento manual.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Pregunta que falla una vez')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('con chat=false queda deshabilitado con una salida manual clara y sin afirmar IA', () => {
    const capabilities: Capabilities = { ...enabledCapabilities, chat: false };
    render(<PublicChatAssistant capabilities={capabilities} />);
    openChat();

    expect(screen.getByText(/El chat público no está habilitado en este servidor/i)).toBeInTheDocument();
    expect(screen.getByText(/formularios y el panel manualmente/i)).toBeInTheDocument();
    expect(questionBox()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '¿Cómo funciona FiestaPay?' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Chat público de FiestaPay' });
    expect(dialog.textContent).not.toMatch(/inteligencia artificial|\bIA\b/);
  });
});
