import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { adminHeaderFor, adminKeyFor, rememberAdminKey } from '../api/admin-key';
import { RecoveryEmailCard } from '../components/dashboard/RecoveryEmailCard';
import { forgetRecoveryToken, OrganizerRecoveryView } from '../views/OrganizerRecoveryView';

const TOKEN = 'a'.repeat(43);
const NEXT = 'b'.repeat(43);
const THIRD = 'c'.repeat(43);
const QUERY = 'd'.repeat(43);

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function arrive(path: string): Promise<void> {
  window.history.replaceState({}, '', path);
  await act(async () => {
    window.dispatchEvent(new Event('hashchange'));
  });
}

type ConsumeResult = Awaited<ReturnType<typeof api.consumeRecovery>>;
type RequestResult = Awaited<ReturnType<typeof api.requestRecovery>>;

afterEach(() => {
  cleanup();
  forgetRecoveryToken();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('recuperacion en el navegador', () => {
  it('quita el fragmento, confirma por POST y no manda la clave de organizador', async () => {
    rememberAdminKey('casa-uno', 'clave-organizador');
    window.history.replaceState({}, '', `/recover#t=${TOKEN}&otro=1`);
    const consume = vi.spyOn(api, 'consumeRecovery').mockResolvedValue({
      purpose: 'recover',
      slug: 'casa-uno',
      adminKey: 'clave-nueva',
    });
    render(
      <StrictMode>
        <OrganizerRecoveryView available />
      </StrictMode>,
    );
    expect(window.location.pathname).toBe('/recover');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(await screen.findByDisplayValue(/clave-nueva/)).toBeTruthy();
    expect(consume).toHaveBeenCalledWith(TOKEN);
    expect(adminKeyFor('casa-uno')).toBe('clave-nueva');
  });

  it('no usa un token que llego por query y limpia el fallo', async () => {
    window.history.replaceState({}, '', `/recover?token=${TOKEN}&t=${TOKEN}`);
    render(<OrganizerRecoveryView available />);
    expect(screen.queryByRole('button', { name: 'Confirmar enlace' })).toBeNull();
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(TOKEN);

    cleanup();
    forgetRecoveryToken();
    window.history.replaceState({}, '', `/recover#t=${TOKEN}`);
    vi.spyOn(api, 'consumeRecovery').mockRejectedValue(new Error('Este enlace ya se uso. Solicita uno nuevo.'));
    render(<OrganizerRecoveryView available />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(await screen.findByText(/ya se uso/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar enlace' })).toBeNull();
  });

  it('sin proveedor no ofrece el formulario y el cliente no adjunta la clave en lo publico', async () => {
    render(<OrganizerRecoveryView available={false} />);
    expect(screen.getByText(/no esta disponible/i)).toBeTruthy();
    expect(screen.queryByText(/terceros/i)).toBeNull();
    expect(screen.queryByLabelText('Correo verificado')).toBeNull();

    rememberAdminKey('casa-uno', 'clave-organizador');
    expect(adminHeaderFor('/api/events/casa-uno/recovery', 'GET')).toBe('clave-organizador');
    expect(adminHeaderFor('/api/events/casa-uno/recovery/contact', 'PUT')).toBe('clave-organizador');
    expect(adminHeaderFor('/api/events/casa-uno/recovery/contact', 'DELETE')).toBe('clave-organizador');
    expect(adminHeaderFor('/api/recovery/request', 'POST')).toBeNull();
    expect(adminHeaderFor('/api/recovery/consume', 'POST')).toBeNull();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'accepted' }),
    } as Response);
    await api.requestRecovery('casa-uno', 'fiesta-test@example.test');
    await api.consumeRecovery(TOKEN);
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: true, contact: { state: 'none', masked: null } }),
    } as Response);
    await api.getRecoveryStatus('casa-uno');

    const requestHeaders = new Headers((fetchSpy.mock.calls[0]?.[1] as RequestInit).headers);
    const consumeHeaders = new Headers((fetchSpy.mock.calls[1]?.[1] as RequestInit).headers);
    const statusHeaders = new Headers((fetchSpy.mock.calls[2]?.[1] as RequestInit).headers);
    expect(requestHeaders.get('X-Fiesta-Admin-Key')).toBeNull();
    expect(consumeHeaders.get('X-Fiesta-Admin-Key')).toBeNull();
    expect(statusHeaders.get('X-Fiesta-Admin-Key')).toBe('clave-organizador');
    expect(String((fetchSpy.mock.calls[1]?.[1] as RequestInit).body)).toContain(TOKEN);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('/api/recovery/consume');
  });

  it('dice que la aceptacion SMTP no es llegada a la bandeja', async () => {
    vi.spyOn(api, 'getRecoveryStatus').mockResolvedValue({ email: true, contact: { state: 'none', masked: null } });
    vi.spyOn(api, 'setRecoveryContact').mockResolvedValue({
      contact: { state: 'pending', masked: 'f***@example.test' },
      delivery: 'accepted',
    });
    render(<RecoveryEmailCard slug="casa-uno" available />);
    expect(await screen.findByText('Sin correo de recuperacion')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Correo del organizador'), { target: { value: 'fiesta-test@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar correo' }));
    expect(await screen.findByText(/no confirma que haya llegado a la bandeja/i)).toBeTruthy();
    expect(screen.queryByText(/spam/i)).toBeNull();

    cleanup();
    render(<RecoveryEmailCard slug="casa-uno" available={false} />);
    expect(screen.getByText(/no esta disponible/i)).toBeTruthy();
    expect(screen.queryByLabelText('Correo del organizador')).toBeNull();
  });

  it('adopta un hash nuevo despues del error, sin consumirlo, y confirma solo ese token', async () => {
    rememberAdminKey('casa-uno', 'clave-organizador');
    window.history.replaceState({}, '', `/recover#t=${TOKEN}`);
    const consume = vi.spyOn(api, 'consumeRecovery').mockRejectedValueOnce(new Error('Este enlace ya se uso. Solicita uno nuevo.'));
    render(
      <StrictMode>
        <OrganizerRecoveryView available />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(await screen.findByText(/ya se uso/)).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(TOKEN);

    await arrive(`/recover?sigue=1&token=${QUERY}&t=${QUERY}#t=${NEXT}&otro=1`);
    expect(window.location.pathname).toBe('/recover');
    expect(window.location.search).toBe('?sigue=1');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(NEXT);
    expect(window.location.href).not.toContain(QUERY);
    expect(screen.queryByText(/ya se uso/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(localStorage)).not.toContain(NEXT);
    expect(JSON.stringify(sessionStorage)).not.toContain(NEXT);
    expect(adminKeyFor('casa-uno')).toBe('clave-organizador');

    await arrive(`/recover#t=corto`);
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(1);

    consume.mockResolvedValue({ purpose: 'recover', slug: 'casa-dos', adminKey: 'clave-correcta' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(await screen.findByDisplayValue(/clave-correcta/)).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(2);
    expect(consume).toHaveBeenLastCalledWith(NEXT);
    expect(consume.mock.calls.map((call) => call[0])).not.toContain(QUERY);
    expect(adminKeyFor('casa-dos')).toBe('clave-correcta');
    expect(adminKeyFor('casa-uno')).toBe('clave-organizador');
    expect(document.body.textContent).not.toContain(NEXT);
  });

  it('la resolucion tardia de un confirm viejo no guarda su clave ni pisa el token nuevo', async () => {
    rememberAdminKey('casa-uno', 'clave-previa');
    window.history.replaceState({}, '', `/recover#t=${TOKEN}`);
    const pending = deferred<ConsumeResult>();
    const consume = vi.spyOn(api, 'consumeRecovery').mockReturnValueOnce(pending.promise);
    render(<OrganizerRecoveryView available />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(consume).toHaveBeenCalledWith(TOKEN);

    await arrive(`/recover#t=${NEXT}`);
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    await act(async () => {
      pending.resolve({ purpose: 'recover', slug: 'casa-uno', adminKey: 'clave-tardia' });
      await pending.promise;
    });
    expect(adminKeyFor('casa-uno')).toBe('clave-previa');
    expect(screen.queryByDisplayValue(/clave-tardia/)).toBeNull();
    expect(screen.queryByText(/enlace nuevo/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(window.location.href).not.toContain(NEXT);

    consume.mockResolvedValue({ purpose: 'recover', slug: 'casa-dos', adminKey: 'clave-correcta' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(await screen.findByDisplayValue(/clave-correcta/)).toBeTruthy();
    expect(consume).toHaveBeenLastCalledWith(NEXT);
    expect(adminKeyFor('casa-dos')).toBe('clave-correcta');
    expect(adminKeyFor('casa-uno')).toBe('clave-previa');

    await arrive(`/recover#t=${THIRD}`);
    expect(screen.queryByDisplayValue(/clave-correcta/)).toBeNull();
    expect(screen.queryByText(/enlace nuevo/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(2);
    expect(window.location.href).not.toContain(THIRD);
    expect(adminKeyFor('casa-dos')).toBe('clave-correcta');
  });

  it('un rechazo tardio no borra el token nuevo y la solicitud en vuelo tampoco', async () => {
    window.history.replaceState({}, '', `/recover#t=${TOKEN}`);
    const pending = deferred<ConsumeResult>();
    const consume = vi.spyOn(api, 'consumeRecovery').mockReturnValueOnce(pending.promise);
    render(<OrganizerRecoveryView available />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    await arrive(`/recover#t=${NEXT}`);
    await act(async () => {
      pending.reject(new Error('Este enlace ya se uso. Solicita uno nuevo.'));
      await pending.promise.catch(() => undefined);
    });
    expect(screen.queryByText(/ya se uso/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    consume.mockResolvedValue({ purpose: 'verify', slug: 'casa-verificada', verified: true });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(await screen.findByText(/Correo guardado para/)).toBeTruthy();
    expect(consume).toHaveBeenLastCalledWith(NEXT);
    expect(adminKeyFor('casa-verificada')).toBeNull();

    await arrive(`/recover#t=${THIRD}`);
    expect(screen.queryByText(/Correo guardado para/)).toBeNull();
    expect(screen.queryByText(/quedo verificado/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(2);

    cleanup();
    forgetRecoveryToken();
    window.history.replaceState({}, '', '/');
    const requestPending = deferred<RequestResult>();
    const request = vi.spyOn(api, 'requestRecovery').mockReturnValueOnce(requestPending.promise);
    render(<OrganizerRecoveryView available />);
    fireEvent.change(screen.getByLabelText('Identificador de la fiesta'), { target: { value: 'casa-uno' } });
    fireEvent.change(screen.getByLabelText('Correo verificado'), { target: { value: 'fiesta-test@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar enlace' }));
    expect(request).toHaveBeenCalledWith('casa-uno', 'fiesta-test@example.test');
    await arrive(`/recover?token=${QUERY}#t=${NEXT}`);
    await act(async () => {
      requestPending.resolve({ status: 'accepted' });
      await requestPending.promise;
    });
    expect(screen.queryByText(/recibirás instrucciones/)).toBeNull();
    expect(screen.queryByText(/resultado es el mismo/i)).toBeNull();
    expect(screen.queryByLabelText('Correo verificado')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain(QUERY);
    expect(window.location.href).not.toContain(NEXT);

    cleanup();
    forgetRecoveryToken();
    window.history.replaceState({}, '', '/');
    const rejected = deferred<RequestResult>();
    vi.spyOn(api, 'requestRecovery').mockReturnValueOnce(rejected.promise);
    render(<OrganizerRecoveryView available />);
    fireEvent.change(screen.getByLabelText('Identificador de la fiesta'), { target: { value: 'casa-uno' } });
    fireEvent.change(screen.getByLabelText('Correo verificado'), { target: { value: 'fiesta-test@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar enlace' }));
    await arrive(`/recover#t=${THIRD}`);
    await act(async () => {
      rejected.reject(new Error('No se pudo solicitar el enlace'));
      await rejected.promise.catch(() => undefined);
    });
    expect(screen.queryByText(/No se pudo solicitar el enlace/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it('al desmontar no guarda la clave tardia ni olvida el token de la vista nueva', async () => {
    rememberAdminKey('casa-uno', 'clave-previa');
    const pending = deferred<ConsumeResult>();
    const consume = vi.spyOn(api, 'consumeRecovery').mockReturnValueOnce(pending.promise);
    window.history.replaceState({}, '', `/recover#t=${TOKEN}`);
    const first = render(<OrganizerRecoveryView available />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(consume).toHaveBeenCalledWith(TOKEN);
    first.unmount();

    window.history.replaceState({}, '', `/recover#t=${NEXT}`);
    const second = render(<OrganizerRecoveryView available />);
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(consume).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ purpose: 'recover', slug: 'casa-uno', adminKey: 'clave-tardia' });
      await pending.promise;
    });
    expect(adminKeyFor('casa-uno')).toBe('clave-previa');
    expect(screen.queryByDisplayValue(/clave-tardia/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    second.unmount();

    window.history.replaceState({}, '', '/recover');
    render(<OrganizerRecoveryView available />);
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    consume.mockResolvedValue({ purpose: 'recover', slug: 'casa-dos', adminKey: 'clave-correcta' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    expect(await screen.findByDisplayValue(/clave-correcta/)).toBeTruthy();
    expect(consume).toHaveBeenLastCalledWith(NEXT);
    expect(adminKeyFor('casa-uno')).toBe('clave-previa');
    expect(adminKeyFor('casa-dos')).toBe('clave-correcta');

    cleanup();
    forgetRecoveryToken();
    window.history.replaceState({}, '', `/recover#t=${TOKEN}`);
    const rejected = deferred<ConsumeResult>();
    vi.spyOn(api, 'consumeRecovery').mockReturnValueOnce(rejected.promise);
    const viewed = render(<OrganizerRecoveryView available />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar enlace' }));
    viewed.unmount();
    await act(async () => {
      rejected.reject(new Error('Este enlace ya se uso. Solicita uno nuevo.'));
      await rejected.promise.catch(() => undefined);
    });
    window.history.replaceState({}, '', '/recover');
    render(<OrganizerRecoveryView available />);
    expect(screen.getByRole('button', { name: 'Confirmar enlace' })).toBeTruthy();
    expect(screen.queryByText(/ya se uso/)).toBeNull();
    expect(adminKeyFor('casa-uno')).toBe('clave-previa');
  });

  it('el listener de hash se retira al desmontar', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(
      <StrictMode>
        <OrganizerRecoveryView available />
      </StrictMode>,
    );
    const added = add.mock.calls.filter((call) => call[0] === 'hashchange').length;
    view.unmount();
    const removed = remove.mock.calls.filter((call) => call[0] === 'hashchange').length;
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(added);
  });

  it('dice la condicion del correo sin la frase redundante ni recursos de terceros', async () => {
    vi.spyOn(api, 'requestRecovery').mockResolvedValue({ status: 'accepted' });
    render(<OrganizerRecoveryView available />);
    expect(screen.queryByText(/terceros/i)).toBeNull();
    expect(screen.queryByText(/resultado es el mismo/i)).toBeNull();
    fireEvent.change(screen.getByLabelText('Identificador de la fiesta'), { target: { value: 'casa-uno' } });
    fireEvent.change(screen.getByLabelText('Correo verificado'), { target: { value: 'fiesta-test@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar enlace' }));
    expect(await screen.findByText('Si el correo esta verificado para esa fiesta, recibirás instrucciones.')).toBeTruthy();
    expect(screen.queryByText(/resultado es el mismo/i)).toBeNull();
    expect(screen.queryByText(/terceros/i)).toBeNull();
  });
});
