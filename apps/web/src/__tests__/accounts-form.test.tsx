/**
 * SP-4 — formulario de registro en la web (sin red real; fetch simulado).
 */
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { AccountRegisterView } from '../views/AccountRegisterView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('formulario de registro de cuenta', () => {
  it('envia correo y contraseña por POST y no muestra la contraseña en pantalla', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'pending', message: 'Revisa tu correo.' }), { status: 200 }),
    );
    const onRegistered = vi.fn();
    render(
      <StrictMode>
        <I18nProvider>
          <AccountRegisterView onNavigateLogin={() => undefined} onRegistered={onRegistered} />
        </I18nProvider>
      </StrictMode>,
    );

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'panas@example.test' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'clave-super-secreta' } });
    fireEvent.click(screen.getByRole('button', { name: /registrarse/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.email).toBe('panas@example.test');
    expect(body.password).toBe('clave-super-secreta');
    expect(document.body.textContent).not.toContain('clave-super-secreta');
    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
  });
});