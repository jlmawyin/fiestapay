import React, { useEffect, useRef, useState } from 'react';
import { loadScript } from '@paypal/paypal-js';
import type { Capabilities, OrderResult } from '../../types';
import { api } from '../../api/client';
import { nextReturnDelay, returnServerAction } from './paymentReturn';

interface PayPalSectionProps {
  order: OrderResult;
  capabilities: Capabilities | null;
  onCaptureSuccess: (orderId: string) => Promise<boolean>;
  onCancelOrError: (msg: string) => void;
}

type CaptureKind = 'sdk' | 'manual' | 'return';

type PayPalButtonsConfig = {
  createOrder: () => Promise<string>;
  onApprove: () => Promise<void>;
  onCancel: () => void;
  onError: (err: unknown) => void;
};

type PayPalButtonsApi = {
  Buttons?: (config: PayPalButtonsConfig) => { render: (element: HTMLElement) => Promise<void> };
};

const progressBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-blue-tint)',
  color: 'var(--color-blue)',
  padding: '0.75rem',
  borderRadius: 'var(--radius-md)',
  fontSize: '0.875rem',
  marginBottom: '1rem',
  fontWeight: 600,
  textAlign: 'center',
};

export const PayPalSection: React.FC<PayPalSectionProps> = ({
  order,
  capabilities,
  onCaptureSuccess,
  onCancelOrError,
}) => {
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const [sdkStatus, setSdkStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'disabled'>('idle');
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [sdkMessage, setSdkMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const paypalAvailable = Boolean(capabilities?.paypal && capabilities?.paypalClientId);
  const mountedRef = useRef(true);
  const orderIdRef = useRef(order.orderId);
  const onCaptureSuccessRef = useRef(onCaptureSuccess);
  const onCancelRef = useRef(onCancelOrError);
  const flightRef = useRef<{ id: string; promise: Promise<boolean> } | null>(null);
  const returnGenRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const awayRef = useRef(false);
  const armingRef = useRef(false);
  const checkingRef = useRef(false);
  const pausedRef = useRef<null | { resume: () => void }>(null);
  const buttonsEpochRef = useRef(0);
  const requestCaptureRef = useRef<(id: string, kind: CaptureKind) => Promise<boolean>>(async () => false);
  const beginReturnRef = useRef<() => void>(() => {});

  onCaptureSuccessRef.current = onCaptureSuccess;
  onCancelRef.current = onCancelOrError;
  orderIdRef.current = order.orderId;

  const clearReturnTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const currentOrder = (id: string) => mountedRef.current && orderIdRef.current === id;

  requestCaptureRef.current = (id: string, kind: CaptureKind) => {
    if (!currentOrder(id)) return Promise.resolve(false);
    // A person or the yellow popup takes the single flight and cancels the return schedule.
    if (kind !== 'return') {
      returnGenRef.current += 1;
      clearReturnTimer();
      pausedRef.current = null;
      checkingRef.current = false;
      armedRef.current = false;
      setIsChecking(false);
    }
    const existing = flightRef.current;
    if (existing?.id === id) return existing.promise;

    if (kind === 'return') {
      checkingRef.current = false;
      armedRef.current = false;
      setIsChecking(false);
    }
    setIsCapturing(true);
    setProgressMessage('Verificando captura con el servidor...');

    const flight: { id: string; promise: Promise<boolean> } = {
      id,
      promise: Promise.resolve(false),
    };
    flight.promise = (async () => {
      try {
        const paid = await onCaptureSuccessRef.current(id);
        if (!currentOrder(id)) return false;
        if (paid) {
          setProgressMessage('¡Pago capturado y confirmado con éxito!');
        } else if (kind === 'return') {
          setProgressMessage('El servidor aún no confirma el pago. Puedes reintentar con Verificar. No se marcó como pagado.');
        } else {
          setProgressMessage(null);
        }
        return paid === true;
      } catch (err: unknown) {
        if (!currentOrder(id)) return false;
        setProgressMessage(null);
        const detail = err instanceof Error && err.message
          ? err.message
          : kind === 'manual'
            ? 'No se pudo confirmar la captura en este momento'
            : 'Error al capturar la orden en el servidor';
        onCancelRef.current(detail);
        return false;
      } finally {
        if (flightRef.current === flight) flightRef.current = null;
        if (currentOrder(id)) setIsCapturing(false);
      }
    })();

    flightRef.current = flight;
    return flight.promise;
  };

  const armExternalReturn = () => {
    returnGenRef.current += 1;
    clearReturnTimer();
    pausedRef.current = null;
    checkingRef.current = false;
    armedRef.current = true;
    awayRef.current = false;
    armingRef.current = true;
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      armingRef.current = false;
    }, 0);
    setIsChecking(false);
    setProgressMessage('Completa el pago en PayPal. Al volver a esta pestaña comprobaremos la orden con el servidor. No se marca como pagada hasta que el servidor lo confirme.');
  };

  beginReturnRef.current = () => {
    if (armingRef.current || !armedRef.current || !awayRef.current || document.hidden || checkingRef.current) return;
    const id = orderIdRef.current;
    const gen = returnGenRef.current;
    const startedAt = Date.now();
    checkingRef.current = true;
    pausedRef.current = null;
    setIsChecking(true);
    setProgressMessage('Comprobando el pago con el servidor…');

    const alive = () => mountedRef.current && returnGenRef.current === gen && orderIdRef.current === id;

    const finish = (message: string) => {
      if (!alive()) return;
      checkingRef.current = false;
      armedRef.current = false;
      setIsChecking(false);
      setProgressMessage(message);
    };

    const run = (finishedGets: number) => {
      if (!alive()) return;
      void (async () => {
        try {
          const result = await api.getOrder(id);
          if (!alive()) return;
          const action = returnServerAction(result.status);
          if (action === 'capture') {
            checkingRef.current = false;
            setIsChecking(false);
            await requestCaptureRef.current(id, 'return');
            return;
          }
          if (action === 'stop') {
            finish(`La orden figura como "${result.status}". No se marcó como pagada.`);
            return;
          }
          const delay = nextReturnDelay(finishedGets + 1, startedAt, Date.now());
          if (delay === null) {
            finish('No confirmamos el pago automáticamente. Usa Verificar para reintentar. Nada se marcó como pagado.');
            return;
          }
          if (!alive()) return;
          setProgressMessage('PayPal aún no confirma la aprobación. Seguimos comprobando…');
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            if (!alive()) return;
            if (document.hidden) {
              setProgressMessage('Esta pestaña está en segundo plano. Seguiremos comprobando al volver. Nada se marcó como pagado.');
              pausedRef.current = { resume: () => run(finishedGets + 1) };
              return;
            }
            run(finishedGets + 1);
          }, delay);
        } catch {
          finish('No pudimos consultar la orden. Puedes reintentar con Verificar. No se marcó como pagado.');
        }
      })();
    };

    run(0);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      returnGenRef.current += 1;
      clearReturnTimer();
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setProgressMessage(null);
    setIsCapturing(false);
    setIsChecking(false);
    return () => {
      returnGenRef.current += 1;
      armedRef.current = false;
      awayRef.current = false;
      checkingRef.current = false;
      pausedRef.current = null;
      clearReturnTimer();
    };
  }, [order.orderId]);

  useEffect(() => {
    const onFocus = () => beginReturnRef.current();
    const onBlur = () => {
      if (armedRef.current) awayRef.current = true;
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (armedRef.current) awayRef.current = true;
        return;
      }
      const paused = pausedRef.current;
      if (paused) {
        pausedRef.current = null;
        setIsChecking(true);
        setProgressMessage('Comprobando el pago con el servidor…');
        paused.resume();
        return;
      }
      beginReturnRef.current();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!paypalAvailable) {
      setSdkStatus('disabled');
      return;
    }

    let cancelled = false;
    const gen = buttonsEpochRef.current;
    setSdkStatus('loading');
    setSdkMessage(null);

    loadScript({
      clientId: capabilities!.paypalClientId!,
      currency: 'USD',
      intent: 'capture',
    })
      .then((paypal) => {
        const buttons = (paypal as PayPalButtonsApi | null)?.Buttons;
        if (cancelled || !buttons || !paypalContainerRef.current) return;

        setSdkStatus('ready');
        paypalContainerRef.current.innerHTML = '';

        buttons({
          createOrder: async () => order.orderId,
          onApprove: async () => {
            if (cancelled || buttonsEpochRef.current !== gen) return;
            await requestCaptureRef.current(order.orderId, 'sdk');
          },
          onCancel: () => {
            if (cancelled || buttonsEpochRef.current !== gen) return;
            onCancelRef.current('El flujo en PayPal fue cancelado o pausado. Si autorizaste el pago en ventana externa, puedes verificar el estado de la orden.');
          },
          onError: (err: unknown) => {
            if (cancelled || buttonsEpochRef.current !== gen) return;
            const detail = err instanceof Error && err.message ? err.message : 'La transacción no pudo completarse';
            onCancelRef.current(
              `Incidencia en PayPal: ${detail}. Puedes consultar el estado de tu orden para comprobar si fue recibida por el servidor.`
            );
          },
        })
          .render(paypalContainerRef.current)
          .catch((renderErr: unknown) => {
            if (cancelled) return;
            const detail = renderErr instanceof Error ? renderErr.message : 'error de render';
            setSdkStatus('error');
            setSdkMessage(`No se pudo cargar el botón de PayPal: ${detail}`);
          });
      })
      .catch((scriptErr: unknown) => {
        if (cancelled) return;
        const detail = scriptErr instanceof Error ? scriptErr.message : 'error de script';
        setSdkStatus('error');
        setSdkMessage(`Error cargando PayPal SDK: ${detail}`);
      });

    return () => {
      cancelled = true;
      buttonsEpochRef.current += 1;
      if (paypalContainerRef.current) paypalContainerRef.current.innerHTML = '';
    };
  }, [order.orderId, paypalAvailable, capabilities?.paypalClientId, sdkAttempt]);

  const busy = isCapturing || isChecking;
  const verifyLabel = isCapturing ? 'Verificando...' : 'Verificar / Continuar Captura';
  const verifyPayment = () => { void requestCaptureRef.current(order.orderId, 'manual'); };
  const externalLink = (label: string, className: string, compact: boolean) =>
    order.approveUrl ? (
      <a
        href={order.approveUrl}
        target="_blank"
        rel="noreferrer"
        className={className}
        style={compact ? { fontSize: '0.75rem', padding: '0.35rem 0.6rem' } : { fontSize: '0.85rem' }}
        onClick={armExternalReturn}
      >
        {label}
      </a>
    ) : null;

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1.5px solid var(--color-blue)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        marginTop: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h4 style={{ fontSize: '1rem', color: 'var(--color-ink)' }}>Completar Pago Seguro</h4>
        <span className="badge badge-yellow">Orden #{order.orderId.slice(0, 8)}</span>
      </div>

      <div role="status" aria-live="polite" aria-busy={busy}>
        {progressMessage ? <div style={progressBoxStyle}>{progressMessage}</div> : null}
      </div>

      {order.status === 'approved' && (
        <div
          style={{
            backgroundColor: 'var(--color-teal-tint)',
            border: '1.5px solid var(--color-teal)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--color-teal)', marginBottom: '0.25rem' }}>
            ✓ Autorización recibida en PayPal
          </div>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.825rem', color: 'var(--color-ink)' }}>
            Tu orden está autorizada en PayPal. Confirma la captura final para que el servidor verifique la transacción y acredite tu cuota.
          </p>
          <button
            type="button"
            onClick={() => { void requestCaptureRef.current(order.orderId, 'manual'); }}
            disabled={isCapturing}
            className="btn btn-teal"
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem', fontWeight: 600 }}
          >
            {isCapturing ? 'Verificando y Capturando...' : 'Confirmar y Completar Captura de Pago'}
          </button>
        </div>
      )}

      {!paypalAvailable ? (
        <div
          style={{
            backgroundColor: 'var(--color-surface-subtle)',
            border: '1.5px dashed var(--color-border)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            color: 'var(--color-ink-muted)',
          }}
        >
          <p style={{ fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.35rem' }}>
            Proveedor PayPal no configurado en el servidor
          </p>
          <p>
            El servidor reporta que las credenciales de PayPal Sandbox están ausentes. Los botones de pago directo no se pueden inicializar en este entorno sin configurar <code>PAYPAL_CLIENT_ID</code>.
          </p>
          {order.approveUrl && (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {externalLink('Abrir enlace de aprobación PayPal provisto por la orden ↗', 'btn btn-secondary', false)}
              <button
                type="button"
                onClick={verifyPayment}
                disabled={isCapturing}
                className="btn btn-teal"
                style={{ fontSize: '0.85rem' }}
              >
                {verifyLabel}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
            Paga de forma segura mediante PayPal Sandbox. El pago solo se considerará completado una vez que nuestro servidor capture y verifique la transacción.
          </p>

          {sdkStatus === 'loading' && (
            <div role="status" style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-ink-muted)', fontSize: '0.875rem' }}>
              Cargando interfaz oficial de PayPal Sandbox...
            </div>
          )}

          {sdkStatus === 'error' && (
            <div
              style={{
                backgroundColor: 'var(--color-coral-tint)',
                color: 'var(--color-coral)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
              role="alert"
            >
              {sdkMessage || 'No se pudo inicializar la pasarela de PayPal.'}
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem' }}
                  onClick={() => setSdkAttempt((attempt) => attempt + 1)}
                >
                  Reintentar carga de PayPal
                </button>
                {externalLink('Ir a pagar en PayPal en ventana externa ↗', 'btn btn-primary', false)}
              </div>
            </div>
          )}

          <div ref={paypalContainerRef} style={{ minHeight: '45px', marginTop: '0.5rem' }} />

          <div
            style={{
              marginTop: '1rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ color: 'var(--color-ink-muted)' }}>
              ¿Pagaste en otra ventana o necesitas conciliar?
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {externalLink('Abrir PayPal ↗', 'btn btn-secondary', true)}
              <button
                type="button"
                onClick={verifyPayment}
                disabled={isCapturing}
                className="btn btn-teal"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
              >
                {verifyLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
