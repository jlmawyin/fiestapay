/**
 * Formulario de registro en la raíz Somos Panas (SP-4).
 * Depende de `contenido/cuentas.json` vía import estático y fetch a `/api/accounts/register`.
 */
import React, { useMemo, useState } from 'react';
import cuentas from '../../../../contenido/cuentas.json';
import { useI18n } from '../i18n/I18nContext';

type LocaleKey = 'es' | 'en';

function pick<T extends Record<LocaleKey, string>>(block: T, locale: LocaleKey): string {
  return block[locale] ?? block.es;
}

export interface AccountRegisterViewProps {
  onNavigateLogin: () => void;
  onRegistered: () => void;
}

export const AccountRegisterView: React.FC<AccountRegisterViewProps> = ({ onNavigateLogin, onRegistered }) => {
  const { locale } = useI18n();
  const lang = (locale === 'en' ? 'en' : 'es') as LocaleKey;
  const copy = useMemo(() => cuentas.registro, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** Envía el alta a la raíz; nunca muestra la contraseña en pantalla ni en el mensaje de estado. */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/accounts/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setMessage(data.error ?? 'No se pudo registrar');
        return;
      }
      setPassword('');
      setMessage(data.message ?? pick({ es: 'Revisa tu correo.', en: 'Check your email.' }, lang));
      onRegistered();
    } catch {
      setMessage(pick({ es: 'Error de red.', en: 'Network error.' }, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ maxWidth: '28rem', margin: '0 auto' }}>
      <h1>{pick(copy.titulo, lang)}</h1>
      <form onSubmit={submit} aria-labelledby="account-register-title">
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
            autoComplete="new-password"
            required
            minLength={8}
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
        <p role="status" style={{ marginTop: '1rem' }}>
          {message}
        </p>
      ) : null}
      <p style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onNavigateLogin}>
          {pick(copy.irSesion, lang)}
        </button>
      </p>
    </section>
  );
};