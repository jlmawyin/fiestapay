/**
 * NAP-U3 — compartir la invitación: QR de administrador distinto con su
 * aviso, descargas 1080×1080 y 1080×1920 con canvas falso en jsdom, enlace
 * wa.me codificado y confirmación accesible al copiar. Sin red.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { EventQrCards } from '../components/share/EventQrCards';
import { ShareButtons } from '../components/share/ShareButtons';
import { SHARE_SQUARE, SHARE_STORY } from '../components/share/share-image';

const URL_PROPIA = 'https://asado.somospanas.com';
const URL_ADMIN = 'https://somospanas.com/e/asado/admin?k=clave-1';

/** Contexto 2d falso: registra llamadas sin pintar nada (el QR oculto de
 * qrcode.react también lo usa, así que todo método existe vía Proxy). */
interface FakeCtx {
  calls: string[];
}

function fakeContext(): FakeCtx & Record<string, unknown> {
  const calls: string[] = [];
  return new Proxy(
    { calls },
    {
      get(target, prop) {
        if (prop === 'calls') return calls;
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'getImageData') return () => ({ data: [] });
        if (typeof prop === 'string') {
          return (..._args: unknown[]) => {
            calls.push(prop);
          };
        }
        return (target as Record<string | symbol, unknown>)[prop];
      },
      set(target, prop, value) {
        (target as Record<string | symbol, unknown>)[prop] = value;
        return true;
      },
    },
  ) as FakeCtx & Record<string, unknown>;
}

describe('QR de invitados y de administrador (NAP-U3)', () => {
  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('el QR de administrador es distinto y lleva el aviso de no compartir', () => {
    render(
      <I18nProvider>
        <EventQrCards guestUrl={URL_PROPIA} adminUrl={URL_ADMIN} />
      </I18nProvider>,
    );
    const guest = screen.getByTestId('share-guest-qr');
    const admin = screen.getByTestId('share-admin-qr');
    expect(guest.className).not.toBe(admin.className);
    expect(guest.querySelector('svg')).toBeTruthy();
    expect(admin.querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('share-admin-warning')).toHaveTextContent(
      'No compartas este QR: abre tu panel de organizador',
    );
  });

  it('sin clave de organizador no hay QR de administrador', () => {
    render(
      <I18nProvider>
        <EventQrCards guestUrl={URL_PROPIA} adminUrl={null} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('share-guest-qr')).toBeInTheDocument();
    expect(screen.queryByTestId('share-admin-qr')).toBeNull();
  });
});

describe('botones de compartir (NAP-U3)', () => {
  let contexts: FakeCtx[];
  let sizes: Array<{ width: number; height: number }>;
  let realToBlob: typeof HTMLCanvasElement.prototype.toBlob;

  beforeEach(() => {
    localStorage.setItem('fp_locale', 'es');
    contexts = [];
    sizes = [];
    realToBlob = HTMLCanvasElement.prototype.toBlob;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      const ctx = fakeContext();
      contexts.push(ctx);
      // drawShareImage fija el tamaño antes de pedir el contexto.
      sizes.push({ width: this.width, height: this.height });
      return ctx as unknown as CanvasRenderingContext2D;
    });
    // jsdom no trae toBlob: se asigna directo (vale exista o no).
    HTMLCanvasElement.prototype.toBlob = function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ): void {
      callback(new Blob(['falso'], { type: 'image/png' }));
    };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:falso');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    HTMLCanvasElement.prototype.toBlob = realToBlob;
    localStorage.clear();
  });

  const renderShare = () =>
    render(
      <I18nProvider>
        <ShareButtons
          title="Asado del sábado"
          dateLine="sábado 18:00"
          place="Mi casa"
          url={URL_PROPIA}
          shareText={'Asado del sábado\nsábado 18:00\nMi casa\nhttps://asado.somospanas.com'}
        />
      </I18nProvider>,
    );

  it('descarga la imagen cuadrada en 1080×1080 con título, lugar, url y QR', async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download}:${this.href}`);
    });
    renderShare();
    fireEvent.click(screen.getByTestId('share-download-square'));
    await waitFor(() => expect(clicks.length).toBe(1));
    expect(clicks[0]).toContain('invitacion-cuadrada.png');
    expect(contexts.length).toBeGreaterThan(0);
    const ctx = contexts[contexts.length - 1]!;
    expect(ctx.calls).toContain('drawImage');
    expect(ctx.calls.filter((call) => call === 'fillText').length).toBeGreaterThanOrEqual(4);
    expect(sizes[sizes.length - 1]).toEqual({ width: SHARE_SQUARE.width, height: SHARE_SQUARE.height });
    expect(SHARE_SQUARE).toEqual({ width: 1080, height: 1080 });
  });

  it('descarga la imagen vertical en 1080×1920', async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download}:${this.href}`);
    });
    renderShare();
    fireEvent.click(screen.getByTestId('share-download-story'));
    await waitFor(() => expect(clicks.length).toBe(1));
    expect(clicks[0]).toContain('invitacion-vertical.png');
    expect(sizes[sizes.length - 1]).toEqual({ width: SHARE_STORY.width, height: SHARE_STORY.height });
    expect(SHARE_STORY).toEqual({ width: 1080, height: 1920 });
  });

  it('el botón de WhatsApp usa wa.me con el texto codificado', () => {
    renderShare();
    const link = screen.getByTestId('share-whatsapp') as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const text = new URL(link.href).searchParams.get('text') ?? '';
    expect(text).toContain('Asado del sábado');
    expect(text).toContain(URL_PROPIA);
    expect(link.href).toContain(encodeURIComponent(URL_PROPIA));
  });

  it('copiar el enlace muestra la confirmación accesible', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderShare();
    expect(screen.queryByTestId('share-copied')).toBeNull();
    fireEvent.click(screen.getByTestId('share-copy-link'));
    expect(writeText).toHaveBeenCalledWith(URL_PROPIA);
    await waitFor(() => expect(screen.getByTestId('share-copied')).toHaveTextContent('Enlace copiado'));
    expect(screen.getByTestId('share-copied')).toHaveAttribute('role', 'status');
  });
});
