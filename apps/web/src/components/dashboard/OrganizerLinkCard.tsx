import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface OrganizerLinkCardProps {
  slug: string;
  adminKey: string;
  recoveryAvailable?: boolean;
}

export const OrganizerLinkCard: React.FC<OrganizerLinkCardProps> = ({ slug, adminKey, recoveryAvailable = false }) => {
  const origin = window.location.origin;
  const adminUrl = `${origin}/e/${encodeURIComponent(slug)}/admin?k=${encodeURIComponent(adminKey)}`;
  const publicUrl = `${origin}/e/${encodeURIComponent(slug)}`;
  const [copied, setCopied] = useState<'admin' | 'public' | null>(null);

  const copy = async (which: 'admin' | 'public', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="panel" aria-label="Enlaces de la invitación">
      <h2 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>Guarda el enlace de organizador</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
        Este enlace abre el panel en otro navegador. No lo compartas con invitados. El enlace publico es otro.
        El correo es opcional y no reemplaza este enlace.
        {recoveryAvailable ? (
          <>
            {' '}
            <a href="/recover" referrerPolicy="no-referrer">Si lo pierdes, pide recuperacion por correo</a>.
          </>
        ) : (
          ' La recuperacion por correo no esta disponible en este servidor.'
        )}
      </p>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '8px' }}>
          <QRCodeSVG value={adminUrl} size={148} level="M" includeMargin />
        </div>
        <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label className="form-label" htmlFor="organizer-link">Enlace de organizador</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input id="organizer-link" className="form-input" readOnly value={adminUrl} />
            <button type="button" className="btn btn-primary" onClick={() => void copy('admin', adminUrl)}>
              {copied === 'admin' ? 'Copiado' : 'Copiar enlace de organizador'}
            </button>
          </div>
          <label className="form-label" htmlFor="public-link">Enlace publico para invitados</label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input id="public-link" className="form-input" readOnly value={publicUrl} />
            <button type="button" className="btn btn-secondary" onClick={() => void copy('public', publicUrl)}>
              {copied === 'public' ? 'Copiado' : 'Copiar enlace publico'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
