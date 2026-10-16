import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../common/Modal';

interface QrShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteUrl: string;
  eventTitle: string;
}

export const QrShareModal: React.FC<QrShareModalProps> = ({
  isOpen,
  onClose,
  inviteUrl,
  eventTitle,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compartir Invitación"
      description={`Invita a tus amigos a "${eventTitle}"`}
      maxWidth="480px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: '#FFFFFF',
            borderRadius: 'var(--radius-lg)',
            border: '2px dashed var(--color-blue)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '1.25rem',
          }}
        >
          <QRCodeSVG
            value={inviteUrl}
            size={220}
            level="M"
            fgColor="#12263A"
            bgColor="#FFFFFF"
            includeMargin={true}
          />
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', marginBottom: '1.25rem' }}>
          Tus amigos pueden escanear este código con la cámara de su teléfono para unirse al instante, sin necesidad de descargar ninguna app.
        </p>

        <div style={{ width: '100%', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              readOnly
              value={inviteUrl}
              className="form-input"
              style={{ fontSize: '0.85rem', backgroundColor: 'var(--color-surface-subtle)' }}
              aria-label="Enlace de invitación para copiar"
            />
            <button
              onClick={handleCopy}
              className={`btn ${copied ? 'btn-teal' : 'btn-primary'}`}
              style={{ minWidth: '110px', fontSize: '0.85rem' }}
            >
              {copied ? '¡Copiado! ✓' : 'Copiar enlace'}
            </button>
          </div>
        </div>

        <button onClick={onClose} className="btn btn-secondary" style={{ width: '100%' }}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
};
