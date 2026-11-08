import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n, useMessages } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { headerCatalog } from '../i18n/catalogs/header';

function Probe(): React.ReactElement {
  const { locale, setLocale, formatMoney } = useI18n();
  const m = useMessages(headerCatalog);
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="tagline">{m.tagline}</span>
      <span data-testid="money">{formatMoney(5000)}</span>
      <button type="button" onClick={() => setLocale('en')}>
        to-en
      </button>
      <button type="button" onClick={() => setLocale('es')}>
        to-es
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.lang = 'es';
  setActiveLocale('es');
});

describe('locale resolution', () => {
  it('defaults to Spanish without a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    expect(screen.getByTestId('tagline')).toHaveTextContent('Invitaciones con pagos claros');
    expect(screen.getByTestId('money')).toHaveTextContent('$50,00');
  });

  it('defaults to Spanish with a provider and keeps other URL state on ?lang=en', () => {
    window.history.replaceState({}, '', '/?lang=en&paypal=approved#t=abc');
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );

    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(screen.getByTestId('tagline')).toHaveTextContent('Invitations with clear payments');
    expect(screen.getByTestId('money')).toHaveTextContent('$50.00');
    expect(localStorage.getItem('fp_locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    // Only lang is cleaned; payment returns and recovery hashes keep working.
    expect(window.location.search).toBe('?paypal=approved');
    expect(window.location.hash).toBe('#t=abc');
  });

  it('accepts ?lang=EN-us liberally and persists the choice', () => {
    window.history.replaceState({}, '', '/demo?lang=EN-us');
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(localStorage.getItem('fp_locale')).toBe('en');
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/demo');
  });

  it('reads the persisted preference when the URL names no language', () => {
    localStorage.setItem('fp_locale', 'en');
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores an unknown ?lang value instead of breaking', () => {
    localStorage.setItem('fp_locale', 'en');
    window.history.replaceState({}, '', '/?lang=fr');
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });

  it('persists through the selector action and updates <html lang>', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'to-en' }));
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
    expect(localStorage.getItem('fp_locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    fireEvent.click(screen.getByRole('button', { name: 'to-es' }));
    expect(screen.getByTestId('locale')).toHaveTextContent('es');
    expect(localStorage.getItem('fp_locale')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('keeps rendering Spanish when storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      render(
        <I18nProvider>
          <Probe />
        </I18nProvider>
      );
      expect(screen.getByTestId('locale')).toHaveTextContent('es');
      expect(screen.getByTestId('tagline')).toHaveTextContent('Invitaciones con pagos claros');

      // Switching still works in memory even when it cannot persist.
      fireEvent.click(screen.getByRole('button', { name: 'to-en' }));
      expect(screen.getByTestId('locale')).toHaveTextContent('en');
      expect(document.documentElement.lang).toBe('en');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('honors ?lang=en in memory when storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      window.history.replaceState({}, '', '/?lang=en');
      render(
        <I18nProvider>
          <Probe />
        </I18nProvider>
      );
      expect(screen.getByTestId('locale')).toHaveTextContent('en');
      expect(window.location.search).toBe('');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
