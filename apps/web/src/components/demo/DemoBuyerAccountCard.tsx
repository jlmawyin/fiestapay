import React, { useRef, useState } from 'react';
import { fetchDemoBuyerAccount, type DemoBuyerResponse } from '../../api/demo-buyer';

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
type CopyField = 'email' | 'password';

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1.5px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: '1rem 1.1rem',
  boxShadow: 'var(--shadow-md)',
};

/**
 * Explicit disclosure of the dedicated fictitious Personal sandbox buyer. The account is
 * fetched only after a click, and is never placed in local/session storage or a URL.
 */
export const DemoBuyerAccountCard: React.FC = () => {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [account, setAccount] = useState<Extract<DemoBuyerResponse, { available: true }> | null>(null);
  const [copying, setCopying] = useState<CopyField | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const loadAccount = async () => {
    if (loadState === 'loading') return;
    setLoadState('loading');
    setCopyMessage(null);
    try {
      const response = await fetchDemoBuyerAccount();
      if (response.available) {
        setAccount(response);
        setLoadState('ready');
      } else {
        setAccount(null);
        setLoadState('unavailable');
      }
    } catch {
      setAccount(null);
      setLoadState('error');
    }
  };

  const copy = async (field: CopyField) => {
    if (!account || copying) return;
    const value = field === 'email' ? account.email : account.password;
    setCopying(field);
    setCopyMessage(null);
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(value);
      setCopyMessage(field === 'email' ? 'Correo copiado.' : 'Contraseña copiada.');
    } catch {
      // Manual fallback: select the exact value so the user can copy it. Never surface the
      // browser's technical clipboard error as the account state.
      const input = field === 'email' ? emailRef.current : passwordRef.current;
      input?.focus();
      input?.select();
      setCopyMessage('No se pudo copiar automáticamente. El texto quedó seleccionado; usa Ctrl+C o Cmd+C.');
    } finally {
      setCopying(null);
    }
  };

  return (
    <section style={CARD_STYLE} aria-labelledby="demo-buyer-title" data-testid="demo-buyer-account-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 id="demo-buyer-title" style={{ fontSize: '1.15rem', margin: 0 }}>
          Cuenta Personal de prueba
        </h2>
        <span className="badge badge-teal">PayPal Sandbox</span>
      </div>
      <p style={{ margin: '0.4rem 0 0.75rem', fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
        Acceso compartido de Sandbox. No se mueve dinero real. Esta cuenta ficticia sirve solo para
        probar el pago; FiestaPay no inicia sesión ni crea órdenes por ti.
      </p>

      {loadState === 'idle' || loadState === 'error' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
          {loadState === 'error' ? (
            <p role="alert" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-coral)' }}>
              No se pudo consultar la cuenta de prueba. Inténtalo de nuevo.
            </p>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => void loadAccount()}>
            {loadState === 'error' ? 'Reintentar cuenta de prueba' : 'Ver cuenta de prueba'}
          </button>
        </div>
      ) : null}

      {loadState === 'loading' ? (
        <p role="status" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
          Consultando la cuenta de prueba…
        </p>
      ) : null}

      {loadState === 'unavailable' ? (
        <p role="alert" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
          La cuenta de prueba no está disponible en este servidor. Puedes continuar creando tu
          propia invitación, pero no mostraremos datos inventados.
        </p>
      ) : null}

      {loadState === 'ready' && account ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 700 }}>
              Correo
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <input
                  ref={emailRef}
                  readOnly
                  value={account.email}
                  aria-label="Correo de la cuenta de prueba"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ flex: '1 1 220px', minWidth: 0, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={copying !== null}
                  onClick={() => void copy('email')}
                >
                  {copying === 'email' ? 'Copiando…' : 'Copiar correo'}
                </button>
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 700 }}>
              Contraseña
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <input
                  ref={passwordRef}
                  readOnly
                  value={account.password}
                  aria-label="Contraseña de la cuenta de prueba"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ flex: '1 1 220px', minWidth: 0, padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={copying !== null}
                  onClick={() => void copy('password')}
                >
                  {copying === 'password' ? 'Copiando…' : 'Copiar contraseña'}
                </button>
              </div>
            </label>
          </div>
          {copyMessage ? (
            <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
              {copyMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
