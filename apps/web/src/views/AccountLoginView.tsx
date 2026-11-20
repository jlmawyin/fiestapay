/**
 * Formulario de inicio de sesión en la raíz Somos Panas (SP-4).
 * Depende de `contenido/cuentas.json` y POST `/api/accounts/login` (cookie HttpOnly).
 */
import React, { useMemo, useState } from 'react';
import cuentas from '../../../../contenido/cuentas.json';
import { useI18n } from '../i18n/I18nContext';

type LocaleKey = 'es' | 'en';

function pick<T extends Record<LocaleKey, string>>(block: T, locale: LocaleKey): string {
  return block[locale] ?? block.es;
}

export interface AccountLoginViewProps {
  onNavigateRegister: () => void;
  onLoggedIn: () => void;
}

export const AccountLoginView: React.FC<AccountLoginViewProps> = ({ onNavigateRegister, onLoggedIn }) => {
  const { locale } = useI18n();
  const lang = (locale === 'en' ? 'en' : 'es') as LocaleKey;
  const copy = useMemo(() => cuentas.sesion, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** Pide sesión nueva en el servidor; el cuerpo solo lleva correo y contraseña. */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/accounts/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string; user?: { email: string } };
      if (!res.ok) {
        setMessage(data.error ?? pick({ es: 'No se pudo entrar', en: 'Sign-in failed' }, lang));
        return;
      }
      setPassword('');
      onLoggedIn();
    } catch {
      setMessage(pick({ es: 'Error de red.', en: 'Network error.' }, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ maxWidth: '28rem', margin: '0 auto' }}>
      <h1>{pick(copy.titulo, lang)}</h1>
      <form onSubmit={submit}>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          {pick(copy.correo, lang)}
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          {pick(copy.contrasena, lang)}
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {pick(copy.enviar, lang)}
        </button>
      </form>
      {message ? (
        <p role="alert" style={{ marginTop: '1rem' }}>
          {message}
        </p>
      ) : null}
      <p style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onNavigateRegister}>
          {pick(copy.irRegistro, lang)}
        </button>
      </p>
    </section>
  );
};