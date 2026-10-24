import React from 'react';
import type { ToastMessage } from '../../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-live="polite" aria-label="Notificaciones del sistema">
      {toasts.map((toast) => {
        let borderColor = 'var(--color-border)';
        let badgeColor = 'var(--color-blue)';
        let badgeText = 'Aviso';

        if (toast.type === 'success') {
          borderColor = 'var(--color-teal)';
          badgeColor = 'var(--color-teal)';
          badgeText = 'Éxito';
        } else if (toast.type === 'error') {
          borderColor = 'var(--color-coral)';
          badgeColor = 'var(--color-coral)';
          badgeText = 'Error';
        } else if (toast.type === 'warning') {
          borderColor = 'var(--color-yellow-dark)';
          badgeColor = 'var(--color-yellow)';
          badgeText = 'Atención';
        }

        return (
          <div
            key={toast.id}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${borderColor}`,
              boxShadow: 'var(--shadow-md)',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span
                  style={{
                    backgroundColor: badgeColor,
                    color: toast.type === 'warning' ? 'var(--color-ink)' : '#FFFFFF',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  {badgeText}
                </span>
                {toast.title && (
                  <strong style={{ fontSize: '0.9rem', color: 'var(--color-ink)' }}>{toast.title}</strong>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>{toast.message}</div>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-ink-light)',
                padding: '0.2rem',
                fontSize: '1.1rem',
                lineHeight: 1,
              }}
              aria-label="Cerrar notificación"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
