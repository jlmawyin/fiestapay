/**
 * Imagen de invitación en canvas (NAP-U3): cuadrada 1080×1080 (publicaciones
 * y WhatsApp) y vertical 1080×1920 (estados e historias). Incluye título,
 * fecha, lugar, dirección propia y el QR ya pintado (la misma `qrcode.react`
 * de la web, leída de un canvas oculto). Función pura sobre un canvas dado,
 * para probarla en jsdom con un contexto falso.
 */

export const SHARE_SQUARE = { width: 1080, height: 1080 } as const;
export const SHARE_STORY = { width: 1080, height: 1920 } as const;

export type ShareImageVariant = 'square' | 'story';

export interface ShareImageInput {
  title: string;
  dateLine: string;
  place: string;
  url: string;
  /** QR ya pintado (canvas oculto de `QRCodeCanvas`). */
  qr: HTMLCanvasElement;
}

const INK = '#0A1930';
const PAPER = '#FAF7F1';
const GOLD = '#C9A227';
const MUTED = '#D8DEE8';
const FONT = 'Manrope, "Nunito Sans", system-ui, sans-serif';

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const probe = current ? `${current} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && current) {
      lines.push(current);
      if (lines.length >= maxLines) return lines;
      current = word;
    } else {
      current = probe;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export function drawShareImage(
  canvas: HTMLCanvasElement,
  input: ShareImageInput,
  variant: ShareImageVariant,
): void {
  const size = variant === 'square' ? SHARE_SQUARE : SHARE_STORY;
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, size.width, size.height);
  // Franja dorada superior, la marca de la portada.
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, size.width, variant === 'square' ? 18 : 24);

  const margin = variant === 'square' ? 90 : 110;
  const contentWidth = size.width - margin * 2;
  ctx.textBaseline = 'top';

  ctx.fillStyle = GOLD;
  ctx.font = `700 ${variant === 'square' ? 44 : 52}px ${FONT}`;
  ctx.fillText('Somos Panas', margin, variant === 'square' ? 70 : 120);

  ctx.fillStyle = PAPER;
  ctx.font = `800 ${variant === 'square' ? 76 : 104}px ${FONT}`;
  const titleTop = variant === 'square' ? 140 : 210;
  const titleLines = wrapLines(ctx, input.title, contentWidth, 3);
  titleLines.forEach((line, index) => {
    ctx.fillText(line, margin, titleTop + index * (variant === 'square' ? 92 : 124));
  });

  const metaTop = titleTop + titleLines.length * (variant === 'square' ? 92 : 124) + 24;
  ctx.fillStyle = MUTED;
  ctx.font = `400 ${variant === 'square' ? 44 : 54}px ${FONT}`;
  ctx.fillText(input.dateLine, margin, metaTop);
  ctx.fillText(input.place, margin, metaTop + (variant === 'square' ? 62 : 76));

  // QR sobre tarjeta clara, abajo; la dirección debajo en dorado.
  const qrSize = variant === 'square' ? 380 : 560;
  const qrX = margin;
  const qrY = size.height - margin - qrSize - (variant === 'square' ? 70 : 90);
  ctx.fillStyle = PAPER;
  const pad = 28;
  const cardH = qrSize + pad * 2;
  const cardW = Math.min(contentWidth, qrSize + pad * 2);
  ctx.fillRect(qrX - pad, qrY - pad, cardW, cardH);
  ctx.drawImage(input.qr, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = GOLD;
  ctx.font = `700 ${variant === 'square' ? 38 : 46}px ${FONT}`;
  const short = input.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  ctx.fillText(short, margin, qrY + qrSize + pad + 18);
}
