/**
 * QR de invitados y de administrador (NAP-U3). El de administrador es
 * visualmente distinto (otro marco y color) y lleva el aviso de no
 * compartirlo, porque abre el panel de organizador.
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useMessages } from '../../i18n/I18nContext';
import { shareCatalog } from '../../i18n/messages/share';

interface EventQrCardsProps {
  guestUrl: string;
  /** Sin clave de organizador no hay QR de administrador. */
  adminUrl: string | null;
}

export const EventQrCards: React.FC<EventQrCardsProps> = ({ guestUrl, adminUrl }) => {
  const m = useMessages(shareCatalog);
  return (
    <div className="share-qrs">
      <figure className="share-qr share-qr-guest" data-testid="share-guest-qr">
        <span className="share-qr-box">
          <QRCodeSVG value={guestUrl} size={180} level="M" includeMargin />
        </span>
        <figcaption>
          <strong>{m.guestQrTitle}</strong>
          <span>{m.guestQrBody}</span>
        </figcaption>
      </figure>
      {adminUrl ? (
        <figure className="share-qr share-qr-admin" data-testid="share-admin-qr">
          <span className="share-qr-box">
            <QRCodeSVG value={adminUrl} size={180} level="M" includeMargin fgColor="#7A1F1F" />
          </span>
          <figcaption>
            <strong>{m.adminQrTitle}</strong>
            <span className="share-qr-warning" data-testid="share-admin-warning">
              {m.adminWarning}
            </span>
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
};
