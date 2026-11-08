import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { rememberAdminKey } from '../api/admin-key';
import { useMessages } from '../i18n/I18nContext';
import { recoveryCatalog } from '../i18n/messages/organizerRecovery';
import { OrganizerLinkCard } from '../components/dashboard/OrganizerLinkCard';

const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;

let remembered: { token: string | null } | null = null;

function fragmentToken(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const value = params.get('t');
  return value && TOKEN_RE.test(value) ? value : null;
}

/** Strips a fragment or a query token immediately. The token itself stays in memory only. */
function inspectLocation(): { fromFragment: string | null; dirty: boolean } {
  const url = new URL(window.location.href);
  const queryLeak = url.searchParams.has('t') || url.searchParams.has('token');
  const fromFragment = fragmentToken(url.hash);
  const dirty = url.hash.length > 0 || queryLeak;
  if (dirty) {
    url.hash = '';
    url.searchParams.delete('t');
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }
  return { fromFragment, dirty };
}

/** Reads the fragment, then keeps it in memory. A later strict-mode render still sees it. */
export function readRecoveryTokenFromLocation(): string | null {
  const { fromFragment, dirty } = inspectLocation();
  if (!dirty && remembered) return remembered.token;
  remembered = { token: fromFragment };
  return fromFragment;
}

/** A valid fragment replaces the in-memory token. A query token or a bad fragment is only stripped. */
function adoptIncomingFragment(): string | null {
  const { fromFragment, dirty } = inspectLocation();
  if (!dirty || !fromFragment) return null;
  remembered = { token: fromFragment };
  return fromFragment;
}

export function forgetRecoveryToken(): void {
  remembered = null;
}

interface OrganizerRecoveryViewProps {
  available: boolean;
}

export const OrganizerRecoveryView: React.FC<OrganizerRecoveryViewProps> = ({ available }) => {
  const m = useMessages(recoveryCatalog);
  const [token, setToken] = useState<string | null>(() => readRecoveryTokenFromLocation());
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verifiedSlug, setVerifiedSlug] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<{ slug: string; adminKey: string } | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const adoptHash = () => {
      if (!mounted.current) return;
      const incoming = adoptIncomingFragment();
      if (!incoming) return;
      generation.current += 1;
      setToken(incoming);
      setMessage(null);
      setVerifiedSlug(null);
      setRecovered(null);
      setBusy(false);
    };
    // Cover a fragment that lands after the first read and before this listener.
    adoptHash();
    window.addEventListener('hashchange', adoptHash);
    return () => {
      mounted.current = false;
      window.removeEventListener('hashchange', adoptHash);
    };
  }, []);

  const stillCurrent = (gen: number): boolean => mounted.current && generation.current === gen;

  const confirm = async () => {
    if (!token) return;
    const current = token;
    const gen = generation.current;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.consumeRecovery(current);
      // A newer fragment, or a view that already unmounted, owns the screen.
      if (!stillCurrent(gen)) return;
      setToken(null);
      forgetRecoveryToken();
      if (result.purpose === 'verify') {
        setVerifiedSlug(result.slug);
        setMessage(m.verifyOk);
        return;
      }
      rememberAdminKey(result.slug, result.adminKey);
      setRecovered({ slug: result.slug, adminKey: result.adminKey });
      setMessage(m.recoveredNote);
    } catch (err: unknown) {
      if (!stillCurrent(gen)) return;
      setToken(null);
      forgetRecoveryToken();
      setMessage(err instanceof Error ? err.message : m.consumeFail);
    } finally {
      if (stillCurrent(gen)) setBusy(false);
    }
  };

  const requestLink = async (event: React.FormEvent) => {
    event.preventDefault();
    const gen = generation.current;
    setBusy(true);
    setMessage(null);
    try {
      await api.requestRecovery(slug.trim(), email.trim());
      if (!stillCurrent(gen)) return;
      setEmail('');
      setMessage(m.requestOk);
    } catch (err: unknown) {
      if (!stillCurrent(gen)) return;
      setMessage(err instanceof Error ? err.message : m.requestFail);
    } finally {
      if (stillCurrent(gen)) setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <section className="panel" aria-label={m.panelAria}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>{m.title}</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
          {m.sub}
        </p>

        {token ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.875rem' }}>
              {m.tokenNote}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy}>
              {busy ? m.confirming : m.confirm}
            </button>
          </div>
        ) : null}

        {verifiedSlug ? (
          <p style={{ fontSize: '0.875rem' }}>
            {m.verifiedLead} <span>{verifiedSlug}</span>.
          </p>
        ) : null}

        {recovered ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <OrganizerLinkCard slug={recovered.slug} adminKey={recovered.adminKey} recoveryAvailable={available} />
            <a className="btn btn-secondary" href={`/e/${encodeURIComponent(recovered.slug)}/admin`} referrerPolicy="no-referrer">
              {m.goDashboard}
            </a>
          </div>
        ) : null}

        {!token && !recovered ? (
          available ? (
            <form onSubmit={(event) => void requestLink(event)} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
                {m.requestLead}
              </p>
              <label className="form-label" htmlFor="recovery-slug">{m.slugLabel}</label>
              <input id="recovery-slug" className="form-input" value={slug} onChange={(event) => setSlug(event.target.value)} required maxLength={80} autoComplete="off" />
              <label className="form-label" htmlFor="recovery-request-email">{m.emailLabel}</label>
              <input id="recovery-request-email" className="form-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? m.sending : m.requestCta}
              </button>
            </form>
          ) : (
            <p style={{ fontSize: '0.875rem' }}>
              {m.unavailable}
            </p>
          )
        ) : null}

        {message ? <p style={{ fontSize: '0.875rem', marginTop: '0.75rem' }}>{message}</p> : null}
      </section>
    </div>
  );
};
