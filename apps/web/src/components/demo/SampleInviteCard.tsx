/**
 * Miniatura de una invitación terminada (NAP-U2): título, fecha, lugar y un QR
 * real con qrcode.react, la librería que ya usa la web. Es una ilustración
 * estática, no un enlace: la dirección de ejemplo no existe.
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface SampleInviteCardProps {
  /** Textos ya en el idioma activo, desde contenido/portada.json. */
  titulo: string;
  fecha: string;
  lugar: string;
  url: string;
  qrPie: string;
}

export const SampleInviteCard: React.FC<SampleInviteCardProps> = ({ titulo, fecha, lugar, url, qrPie }) => (
  <figure className="portal-sample" data-testid="portal-sample-invite">
    <div className="portal-sample-card">
      <p className="portal-sample-kicker">Somos Panas</p>
      <p className="portal-sample-title">{titulo}</p>
      <p className="portal-sample-line">{fecha}</p>
      <p className="portal-sample-line">{lugar}</p>
    </div>
    <div className="portal-sample-qr">
      <span className="portal-sample-qr-box" data-testid="portal-sample-qr">
        <QRCodeSVG value={url} size={120} level="M" includeMargin />
      </span>
      <figcaption className="portal-sample-url">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</figcaption>
      <p className="portal-sample-caption">{qrPie}</p>
    </div>
  </figure>
);
