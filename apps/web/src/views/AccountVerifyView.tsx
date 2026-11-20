/**
 * Canje del token de verificación de correo (SP-4).
 * Lee el fragmento `#t=` y llama POST `/api/accounts/verify` sin exponer el token en la URL persistente.
 */
import React, { useEffect, useMemo, useState } from 'react';
import cuentas from '../../../../contenido/cuentas.json';
import { useI18n } from '../i18n/I18nContext';

const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;

type LocaleKey = 'es' | 'en';

function pick<T extends Record<LocaleKey, string>>(block: T, locale: LocaleKey): string {
  return block[locale] ?? block.es;
}

function readTokenFromHash(): string | null {
  const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash);
  const value = params.get('t');
  if (value && TOKEN_RE.test(value)) return value;
  return null;
}

export const AccountVerifyView: React.FC<{ onVerified: () => void }> = ({ onVerified }) => {
  const { locale } = useI18n();
  const lang = (locale === 'en' ? 'en' : 'es') as LocaleKey;
  const copy = useMemo(() => cuentas.verificar, []);
  const [token, setToken] = useState<string | null>(() => readTokenFromHash());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }, [token]);

  const confirm = async () => {
    if (!token) {
      setMessage(pick(copy.sinToken, lang));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/accounts/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? pick({ es: 'Enlace invalido', en: 'Invalid link' }, lang));
        return;
      }
      setToken(null);
      onVerified();
    } catch {
      setMessage(pick({ es: 'Error de red.', en: 'Network error.' }, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ maxWidth: '28rem', margin: '0 auto' }}>
      <h1>{pick(copy.titulo, lang)}</h1>
      {!token ? <p>{pick(copy.sinToken, lang)}</p> : null}
      <button type="button" className="btn btn-primary" disabled={busy || !token} onClick={confirm}>
        {pick(copy.enviar, lang)}
      </button>
      {message ? (
        <p role="status" style={{ marginTop: '1rem' }}>
          {message}
        </p>
      ) : null}
    </section>
  );
};