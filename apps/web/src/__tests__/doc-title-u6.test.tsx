// NAP-U6: la pestaña usa el lema actual de la portada en cada idioma, sin red.
import React, { useEffect } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, useMessages } from '../i18n/I18nContext';
import { setActiveLocale } from '../i18n/locale-store';
import { appCatalog } from '../i18n/catalogs/app';

// NAP-U6: sonda que repite lo que hace App.tsx con el título del documento.
function TitleProbe(): React.ReactElement {
  const m = useMessages(appCatalog);
  useEffect(() => {
    document.title = m.docTitle;
  }, [m]);
  return <span data-testid="doc-title">{m.docTitle}</span>;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.title = '';
  setActiveLocale('es');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.title = '';
  setActiveLocale('es');
});

describe('título de la pestaña (NAP-U6)', () => {
  it('muestra el lema nuevo en español', () => {
    render(
      <I18nProvider>
        <TitleProbe />
      </I18nProvider>
    );
    expect(document.title).toBe('Somos Panas — Organiza como panas');
  });

  it('muestra el lema nuevo en inglés', () => {
    window.history.replaceState({}, '', '/?lang=en');
    render(
      <I18nProvider>
        <TitleProbe />
      </I18nProvider>
    );
    expect(document.title).toBe('Somos Panas — Plan it like friends do');
  });
});
