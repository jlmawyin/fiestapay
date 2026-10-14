import React, { useEffect, useRef, useState } from 'react';
import { loadScript } from '@paypal/paypal-js';
import type { Capabilities, OrderResult } from '../../types';

interface PayPalSectionProps {
  order: OrderResult;
  capabilities: Capabilities | null;
  onCaptureSuccess: (capturedStatus: string) => Promise<void>;
  onCancelOrError: (msg: string) => void;
}

export const PayPalSection: React.FC<PayPalSectionProps> = ({
  order,
  capabilities,
  onCaptureSuccess,
  onCancelOrError,
}) => {
  const paypalContainerRef = useRef<HTMLDivElement>(null);
  const [sdkStatus, setSdkStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'disabled'>('idle');
  const [isCapturing, setIsCapturing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const paypalAvailable = Boolean(capabilities?.paypal && capabilities?.paypalClientId);

  useEffect(() => {
    if (!paypalAvailable) {
      setSdkStatus('disabled');
      return;
    }

    let isMounted = true;
    setSdkStatus('loading');

    loadScript({
      clientId: capabilities!.paypalClientId!,
      currency: 'USD',
      intent: 'capture',
    })
      .then((paypal) => {
        if (!isMounted || !paypal || !paypal.Buttons || !paypalContainerRef.current) return;

        setSdkStatus('ready');
        paypalContainerRef.current.innerHTML = '';

        paypal
          .Buttons({
            createOrder: async () => {
              // Return already created backend orderId
              return order.orderId;
            },
            onApprove: async (_data, _actions) => {
              setIsCapturing(true);
              setStatusMessage('Verificando captura con el servidor...');
              try {
                await onCaptureSuccess(order.orderId);
                setStatusMessage('¡Pago capturado y confirmado con éxito!');
              } catch (err: any) {
                setStatusMessage(null);
                onCancelOrError(err.message || 'Error al capturar la orden en el servidor');
              } finally {
                if (isMounted) setIsCapturing(false);
              }
            },
            onCancel: () => {
              onCancelOrError('El flujo en PayPal fue cancelado o pausado. Si autorizaste el pago en ventana externa, puedes verificar el estado de la orden.');
            },
            onError: (err: any) => {
              onCancelOrError(
                `Incidencia en PayPal: ${err?.message || 'La transacción no pudo completarse'}. Puedes consultar el estado de tu orden para comprobar si fue recibida por el servidor.`
              );
            },
          })
          .render(paypalContainerRef.current)
          .catch((renderErr) => {
            if (isMounted) {
              setSdkStatus('error');
              setStatusMessage(`No se pudo cargar el botón de PayPal: ${renderErr.message}`);
            }
          });
      })
      .catch((scriptErr) => {
        if (isMounted) {
          setSdkStatus('error');
          setStatusMessage(`Error cargando PayPal SDK: ${scriptErr.message}`);
        }
      });

    return () => {
      isMounted = false;
      if (paypalContainerRef.current) {
        paypalContainerRef.current.innerHTML = '';
      }
    };
  }, [order.orderId, paypalAvailable, capabilities?.paypalClientId]);

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
            <div style={{ marginTop: '0.75rem' }}>
              <a
                href={order.approveUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
              >
                Abrir enlace de aprobación PayPal provisto por la orden ↗
              </a>
            </div>
          )}
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.825rem', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
            Paga de forma segura mediante PayPal Sandbox. El pago solo se considerará completado una vez que nuestro servidor capture y verifique la transacción.
          </p>

          {isCapturing && (
            <div
              style={{
                backgroundColor: 'var(--color-blue-tint)',
                color: 'var(--color-blue)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                marginBottom: '1rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              ⏳ {statusMessage || 'Capturando y verificando la orden en el servidor...'}
            </div>
          )}

          {sdkStatus === 'loading' && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-ink-muted)', fontSize: '0.875rem' }}>
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
              {statusMessage || 'No se pudo inicializar la pasarela de PayPal.'}
              {order.approveUrl && (
                <div style={{ marginTop: '0.5rem' }}>
                  <a href={order.approveUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
                    Ir a pagar en PayPal en ventana externa ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* PayPal Buttons Mount Target */}
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
              {order.approveUrl && (
                <a
                  href={order.approveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                >
                  Abrir PayPal ↗
                </a>
              )}
              <button
                type="button"
                onClick={async () => {
                  setIsCapturing(true);
                  setStatusMessage('Consultando conciliación con el servidor...');
                  try {
                    await onCaptureSuccess(order.orderId);
                  } catch (err: any) {
                    setStatusMessage(null);
                    onCancelOrError(err.message || 'No se pudo confirmar la captura en este momento');
                  } finally {
                    setIsCapturing(false);
                  }
                }}
                disabled={isCapturing}
                className="btn btn-teal"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
              >
                {isCapturing ? 'Verificando...' : 'Verificar / Continuar Captura'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
