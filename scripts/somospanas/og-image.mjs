/**
 * Genera apps/web/public/og-image.png (1200×630) desde un SVG propio (NAP-U4).
 * Usa el navegador de Playwright ya instalado; no hace red ni instala paquetes.
 * Si el navegador no puede arrancar, deja el SVG reproducible y explica el bloqueo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SALIDA = join(RAIZ, 'apps', 'web', 'public');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF8F1"/>
      <stop offset="1" stop-color="#E7F2EF"/>
    </linearGradient>
    <linearGradient id="sol" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#FFC85A"/>
      <stop offset="1" stop-color="#E85D4A"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#fondo)"/>
  <circle cx="1010" cy="128" r="190" fill="#FFC85A" opacity="0.34"/>
  <circle cx="104" cy="548" r="150" fill="#0B8075" opacity="0.16"/>
  <circle cx="1078" cy="552" r="86" fill="url(#sol)" opacity="0.8"/>
  <path d="M0 596c190-92 360-92 540 0s350 92 660 0v34H0Z" fill="#0B8075" opacity="0.2"/>
  <g stroke="#2A2118" stroke-width="10" stroke-linecap="round" fill="none">
    <path d="M156 208v76M196 208v76M176 284v92"/>
    <path d="M246 208c-14 16-14 42 0 58v110M246 208c14 16 14 42 0 58"/>
  </g>
  <circle cx="216" cy="112" r="54" fill="#E85D4A" opacity="0.9"/>
  <circle cx="216" cy="112" r="76" fill="none" stroke="#E85D4A" stroke-width="6" opacity="0.45"/>
  <text x="330" y="250" font-family="Manrope, Nunito Sans, Segoe UI, sans-serif" font-size="104" font-weight="800" fill="#2A2118">Somos Panas</text>
  <text x="334" y="326" font-family="Manrope, Nunito Sans, Segoe UI, sans-serif" font-size="40" font-weight="600" fill="#4A5D73">Cada reunión tiene su dirección.</text>
  <text x="334" y="382" font-family="Manrope, Nunito Sans, Segoe UI, sans-serif" font-size="40" font-weight="600" fill="#4A5D73">Cada grupo, su espacio.</text>
  <rect x="334" y="438" width="330" height="70" rx="35" fill="#125FE6"/>
  <text x="374" y="484" font-family="Manrope, Nunito Sans, Segoe UI, sans-serif" font-size="30" font-weight="800" fill="#FFFFFF">somospanas.com</text>
  <text x="334" y="558" font-family="Manrope, Nunito Sans, Segoe UI, sans-serif" font-size="26" font-weight="600" fill="#0B8075">Una colecta entre panas, sin cobro en línea.</text>
</svg>`;

await mkdir(SALIDA, { recursive: true });
await writeFile(join(SALIDA, 'og-image.svg'), `${svg}\n`, 'utf8');

/** Respaldo sin navegador: dibuja la misma pieza y la codifica como PNG RGBA. */
const FUENTE = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function pngFromPixels(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fallbackPng() {
  const width = 1200;
  const height = 630;
  const px = Buffer.alloc(width * height * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const alpha = a / 255;
    px[i] = Math.round(r * alpha + px[i] * (1 - alpha));
    px[i + 1] = Math.round(g * alpha + px[i + 1] * (1 - alpha));
    px[i + 2] = Math.round(b * alpha + px[i + 2] * (1 - alpha));
    px[i + 3] = 255;
  };
  const fill = (x0, y0, w, h, color, a = 255) => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) set(x, y, color, a);
  };
  const circle = (cx, cy, r, color, a = 255) => {
    for (let y = cy - r; y <= cy + r; y += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, color, a);
      }
    }
  };
  const text = (value, x0, y0, scale, color) => {
    let x = x0;
    for (const ch of value.toUpperCase()) {
      const glyph = FUENTE[ch] ?? FUENTE[' '];
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (glyph[row][col] === '1') fill(x + col * scale, y0 + row * scale, scale, scale, color);
        }
      }
      x += 6 * scale;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = x / width;
      set(x, y, [Math.round(255 - 24 * t), Math.round(248 - 5 * t), Math.round(241 + 5 * t)]);
    }
  }
  circle(1010, 128, 190, [255, 200, 90], 90);
  circle(100, 560, 150, [11, 128, 117], 50);
  circle(1080, 120, 68, [232, 93, 74], 120);
  circle(212, 116, 54, [232, 93, 74], 230);
  circle(212, 116, 78, [232, 93, 74], 60);
  for (let i = 0; i < 26; i += 1) circle(212 + Math.cos((i / 26) * Math.PI * 2) * 78, 116 + Math.sin((i / 26) * Math.PI * 2) * 78, 7, [232, 93, 74], 220);
  circle(160, 430, 86, [255, 255, 255], 255);
  circle(160, 430, 86, [42, 33, 24], 255);
  circle(160, 430, 74, [255, 248, 241], 255);
  circle(160, 430, 12, [232, 93, 74], 255);
  text('SOMOS PANAS', 330, 205, 8, [42, 33, 24]);
  text('CADA REUNION TIENE SU DIRECCION', 334, 320, 4, [74, 93, 115]);
  text('CADA GRUPO, SU ESPACIO', 334, 378, 4, [74, 93, 115]);
  fill(334, 438, 372, 70, [18, 95, 230]);
  text('SOMOSPANAS.COM', 366, 462, 4, [255, 255, 255]);
  text('UNA COLECTA ENTRE PANAS, SIN COBRO EN LINEA', 334, 556, 3, [11, 128, 117]);
  return pngFromPixels(width, height, px);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1200px;height:630px;overflow:hidden}</style></head><body>${svg}</body></html>`);
  await page.screenshot({ path: join(SALIDA, 'og-image.png'), type: 'png' });
  console.log('og-image.png generado (1200x630)');
} catch (error) {
  console.error(`No se pudo rasterizar el SVG con Playwright: ${error instanceof Error ? error.message : 'sin detalle'}`);
  await writeFile(join(SALIDA, 'og-image.png'), fallbackPng());
  console.log('og-image.png generado (1200x630) con el respaldo PNG determinista; og-image.svg queda junto a él.');
} finally {
  await browser?.close();
}
