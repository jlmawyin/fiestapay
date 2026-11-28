/**
 * Botones para compartir la invitación (NAP-U3): descarga de la imagen en
 * cuadrado y vertical (canvas en el navegador), «Enviar por WhatsApp» con
 * wa.me y «Copiar enlace» con confirmación accesible. El QR de la imagen sale
 * de un canvas oculto de `QRCodeCanvas`, la librería que ya usa la web.
 */
import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useMessages } from '../../i18n/I18nContext';
import { shareCatalog } from '../../i18n/messages/share';
import { drawShareImage, type ShareImageVariant } from './share-image';
import { whatsAppMeUrl } from './share-urls';

interface ShareButtonsProps {
  title: string;
  dateLine: string;
  place: string;
  /** Dirección propia (publicUrl) que viaja en el QR y el texto. */
  url: string;
  /** Texto largo ya armado (título, fecha, lugar y link). */
  shareText: string;
}

const FILE_BY_VARIANT: Record<ShareImageVariant, string> = {
  square: 'invitacion-cuadrada.png',
  story: 'invitacion-vertical.png',
};

export const ShareButtons: React.FC<ShareButtonsProps> = ({ title, dateLine, place, url, shareText }) => {
  const m = useMessages(shareCatalog);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<ShareImageVariant | null>(null);

  const download = (variant: ShareImageVariant): void => {
    const qr = qrRef.current;
    if (!qr) return;
    setBusy(variant);
    try {
      const canvas = document.createElement('canvas');
      drawShareImage(canvas, { title, dateLine, place, url, qr }, variant);
      if (typeof canvas.toBlob !== 'function') {
        setBusy(null);
        return;
      }
      canvas.toBlob((blob) => {
        setBusy(null);
        if (!blob) return;
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = href;
        anchor.download = FILE_BY_VARIANT[variant];
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      }, 'image/png');
    } catch {
      setBusy(null);
    }
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="share-buttons" data-testid="share-buttons">
      <span className="share-qr-hidden" aria-hidden="true">
        <QRCodeCanvas ref={qrRef} value={url} size={360} level="M" includeMargin />
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        data-testid="share-download-square"
        disabled={busy !== null}
        onClick={() => download('square')}
      >
        {busy === 'square' ? m.downloading : m.downloadSquare}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        data-testid="share-download-story"
        disabled={busy !== null}
        onClick={() => download('story')}
      >
        {busy === 'story' ? m.downloading : m.downloadStory}
      </button>
      <a
        className="btn btn-teal"
        data-testid="share-whatsapp"
        href={whatsAppMeUrl(shareText)}
        target="_blank"
        rel="noreferrer"
      >
        {m.whatsapp}
      </a>
      <button type="button" className="btn btn-primary" data-testid="share-copy-link" onClick={() => void copy()}>
        {m.copyLink}
      </button>
      {copied ? (
        <span className="share-copied" role="status" data-testid="share-copied">
          {m.copied}
        </span>
      ) : null}
    </div>
  );
};
