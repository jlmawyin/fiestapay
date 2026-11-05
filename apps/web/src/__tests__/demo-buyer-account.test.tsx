import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoBuyerAccountCard } from '../components/demo/DemoBuyerAccountCard';
import { fetchDemoBuyerAccount } from '../api/demo-buyer';

vi.mock('../api/demo-buyer', () => ({
  fetchDemoBuyerAccount: vi.fn(),
}));

const fetchMock = vi.mocked(fetchDemoBuyerAccount);

const AVAILABLE = {
  available: true as const,
  sandbox: true as const,
  email: 'personal.buyer.sandbox@example.test',
  password: '  Dedicated-Sandbox-Pass!  ',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  setClipboard(vi.fn().mockResolvedValue(undefined));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DemoBuyerAccountCard', () => {
  it('never fetches on mount and fetches only from the explicit account button', async () => {
    const pending = deferred<typeof AVAILABLE>();
    fetchMock.mockReturnValue(pending.promise);
    render(<DemoBuyerAccountCard />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Correo de la cuenta de prueba')).toBeNull();
    expect(screen.getByText(/Acceso compartido de Sandbox/i)).toBeInTheDocument();
    expect(screen.getByText(/No se mueve dinero real/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver cuenta de prueba' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Consultando la cuenta de prueba');

    await act(async () => {
      pending.resolve(AVAILABLE);
    });
    expect(await screen.findByLabelText('Correo de la cuenta de prueba')).toHaveValue(AVAILABLE.email);
    expect(screen.getByLabelText('Contraseña de la cuenta de prueba')).toHaveValue(AVAILABLE.password);
    expect(screen.queryByRole('button', { name: 'Ver cuenta de prueba' })).toBeNull();
  });

  it('copies the exact email and password without storing either one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    fetchMock.mockResolvedValue(AVAILABLE);
    render(<DemoBuyerAccountCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver cuenta de prueba' }));
    await screen.findByLabelText('Correo de la cuenta de prueba');

    fireEvent.click(screen.getByRole('button', { name: 'Copiar correo' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(AVAILABLE.email));
    expect(screen.getByText('Correo copiado.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar contraseña' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(AVAILABLE.password));
    expect(screen.getByText('Contraseña copiada.')).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps copy controls pending instead of issuing duplicate clipboard writes', async () => {
    const write = deferred<void>();
    const writeText = vi.fn().mockReturnValue(write.promise);
    setClipboard(writeText);
    fetchMock.mockResolvedValue(AVAILABLE);
    render(<DemoBuyerAccountCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver cuenta de prueba' }));
    await screen.findByLabelText('Contraseña de la cuenta de prueba');

    fireEvent.click(screen.getByRole('button', { name: 'Copiar correo' }));
    expect(screen.getByRole('button', { name: 'Copiando…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar contraseña' }));
    expect(writeText).toHaveBeenCalledTimes(1);

    await act(async () => {
      write.resolve();
    });
    expect(await screen.findByText('Correo copiado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar contraseña' })).toBeEnabled();
  });

  it('selects the value and gives a manual fallback when clipboard permission fails', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError: denied')));
    fetchMock.mockResolvedValue(AVAILABLE);
    render(<DemoBuyerAccountCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver cuenta de prueba' }));
    const password = await screen.findByLabelText('Contraseña de la cuenta de prueba');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar contraseña' }));

    expect(await screen.findByText(/No se pudo copiar automáticamente/i)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+C o Cmd\+C/)).toBeInTheDocument();
    expect(password).toHaveFocus();
    expect((password as HTMLInputElement).selectionStart).toBe(0);
    expect((password as HTMLInputElement).selectionEnd).toBe(AVAILABLE.password.length);
    expect(screen.queryByText(/NotAllowedError|denied/i)).toBeNull();
    expect(screen.queryByText('Contraseña copiada.')).toBeNull();
  });

  it('shows an honest Spanish unavailable state without fake credentials', async () => {
    fetchMock.mockResolvedValue({ available: false, sandbox: true });
    render(<DemoBuyerAccountCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver cuenta de prueba' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La cuenta de prueba no está disponible');
    expect(screen.queryByLabelText('Correo de la cuenta de prueba')).toBeNull();
    expect(screen.queryByLabelText('Contraseña de la cuenta de prueba')).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
  });
});
