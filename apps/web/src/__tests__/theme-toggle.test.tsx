/**
 * NAP-U2 — tema día/noche: al entrar manda el sistema, el botón cambia y la
 * elección se guarda en fp_tema. Sin red ni navegador real.
 */
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { ThemeToggle } from '../components/theme/ThemeToggle';
import { nextStoredTema } from '../components/theme/theme';

type Listener = () => void;

function stubMatchMedia(prefersDark: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_type: string, listener: Listener) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      if (type === 'change') listeners.delete(listener);
    }),
    setDark(next: boolean) {
      (this as { matches: boolean }).matches = next;
      for (const listener of listeners) listener();
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return query;
}

function mount() {
  return render(
    <I18nProvider>
      <ThemeToggle />
    </I18nProvider>,
  );
}

describe('ThemeToggle (NAP-U2)', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute('data-tema');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute('data-tema');
    vi.unstubAllGlobals();
  });

  it('sin elección sigue al sistema (noche)', () => {
    stubMatchMedia(true);
    mount();
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Cambiar a modo día');
  });

  it('sin elección sigue al sistema (día)', () => {
    stubMatchMedia(false);
    mount();
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Cambiar a modo noche');
  });

  it('lo guardado manda sobre el sistema', () => {
    stubMatchMedia(false);
    localStorage.setItem('fp_tema', 'noche');
    mount();
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Cambiar a modo día');
  });

  it('el botón cambia, guarda y aplica el atributo', () => {
    stubMatchMedia(false);
    mount();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(localStorage.getItem('fp_tema')).toBe('noche');
    expect(document.documentElement.getAttribute('data-tema')).toBe('noche');
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Cambiar a modo día');
  });

  it('volver al valor del sistema borra lo guardado', () => {
    stubMatchMedia(false);
    localStorage.setItem('fp_tema', 'noche');
    mount();
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(localStorage.getItem('fp_tema')).toBeNull();
    expect(document.documentElement.getAttribute('data-tema')).toBe('dia');
  });

  it('sigue al sistema en vivo mientras no haya elección', () => {
    const query = stubMatchMedia(false);
    mount();
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Cambiar a modo noche');
    act(() => {
      query.setDark(true);
    });
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Cambiar a modo día');
  });

  it('ignora al sistema en vivo cuando hay elección guardada', () => {
    const query = stubMatchMedia(false);
    localStorage.setItem('fp_tema', 'dia');
    mount();
    act(() => {
      query.setDark(true);
    });
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Cambiar a modo noche');
    expect(localStorage.getItem('fp_tema')).toBe('dia');
  });

  it('el aria-label sale en inglés con la página en inglés', () => {
    stubMatchMedia(false);
    localStorage.setItem('fp_locale', 'en');
    mount();
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Switch to dark mode');
  });
});

describe('nextStoredTema (NAP-U2)', () => {
  it('calcula el objetivo contrario y limpia al volver al sistema', () => {
    expect(nextStoredTema('dia', 'dia')).toBe('noche');
    expect(nextStoredTema('noche', 'dia')).toBeNull();
    expect(nextStoredTema('noche', 'noche')).toBe('dia');
    expect(nextStoredTema('dia', 'noche')).toBeNull();
  });
});
