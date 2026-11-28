/**
 * Botón de sol y luna para cambiar entre día y noche (NAP-U2). Sigue al
 * sistema hasta que la persona elige; la elección se guarda en fp_tema y se
 * sincroniza entre pestañas. Accesible con aria-label en ES y EN.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useMessages } from '../../i18n/I18nContext';
import { appCatalog } from '../../i18n/catalogs/app';
import { nextStoredTema, resolveTema, storeTema, systemTema, type Tema } from './theme';

export const ThemeToggle: React.FC = () => {
  const m = useMessages(appCatalog);
  const [tema, setTema] = useState<Tema>(() => resolveTema());

  // Sigue al sistema en vivo mientras no haya elección guardada, y a las
  // demás pestañas cuando la elección cambia fuera.
  useEffect(() => {
    setTema(resolveTema());
    let query: MediaQueryList | null = null;
    const onSystemChange = (): void => {
      try {
        if (window.localStorage.getItem('fp_tema') === null) setTema(resolveTema());
      } catch {
        setTema(resolveTema());
      }
    };
    try {
      query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
      query?.addEventListener('change', onSystemChange);
    } catch {
      query = null;
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key === 'fp_tema') setTema(resolveTema());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      try {
        query?.removeEventListener('change', onSystemChange);
      } catch {
        // El navegador ya soltó la consulta.
      }
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    setTema((visible) => storeTema(nextStoredTema(visible, systemTema())));
  }, []);

  const toNight = tema === 'dia';
  return (
    <button
      type="button"
      className="sp-theme-toggle"
      data-testid="theme-toggle"
      aria-label={toNight ? m.themeToNight : m.themeToDay}
      onClick={toggle}
    >
      {toNight ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
    </button>
  );
};
