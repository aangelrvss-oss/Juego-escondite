// Iconos y manifiesto de la web instalable (PWA), a partir del símbolo oficial de THE OUTRUN
// (www/js/brand.generated.js, que a su vez sale de la demo con «npm run brand»). No inventa nada: el mismo
// símbolo blanco y naranja de la cabecera de la app, sobre el fondo de la app (--bg, #0a0b0d).
// Los PNG se dibujan con Chrome (Playwright, dependencia de desarrollo) y se guardan en Git: el despliegue no
// necesita Chrome. Volver a ejecutarlo solo si cambia la marca.
// Uso (en mobile/): node scripts/iconos-pwa.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYMBOL_PATHS } from '../www/js/brand.generated.js';

const BG = '#0a0b0d'; // --bg de tokens.generated.css
const SYMBOL_VIEWBOX = '18.6 20.5 112 112'; // el de la cabecera de la app (app.js)
const www = new URL('../www/', import.meta.url);
mkdirSync(new URL('icons/', www), { recursive: true });

/**
 * Icono cuadrado de `size` px: fondo de la app y el símbolo centrado ocupando `scale` del lado.
 * `radius` (fracción del lado) redondea el fondo; 0 = a sangre (para iconos que recorta el sistema).
 */
export function iconSvg(size, { scale, radius = 0 }) {
  const s = size * scale;
  const o = (size - s) / 2;
  const r = size * radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>` +
    `<svg x="${o}" y="${o}" width="${s}" height="${s}" viewBox="${SYMBOL_VIEWBOX}">${SYMBOL_PATHS}</svg></svg>`;
}

// Proporciones: «any» y Apple, símbolo al 72 % (el sistema redondea las esquinas); «maskable», al 56 %, dentro
// del círculo seguro del 80 % que exige la especificación (los lanzadores Android recortan el resto).
const ICONS = [
  { file: 'icons/icon-192.png', size: 192, scale: 0.72 },
  { file: 'icons/icon-512.png', size: 512, scale: 0.72 },
  { file: 'icons/icon-maskable-512.png', size: 512, scale: 0.56 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.72 },
  { file: 'icons/favicon-32.png', size: 32, scale: 0.86, radius: 0.18 },
];

// Versión de los iconos: va en sus URL (?v=…). Si cambia la marca, se sube y los navegadores y Android piden
// los iconos nuevos en vez de quedarse con los guardados (el servidor ya los sirve sin caché).
export const ICON_VERSION = '20261104';
const v = (path) => `${path}?v=${ICON_VERSION}`;

export const MANIFEST = {
  id: './',
  name: 'THE OUTRUN',
  short_name: 'OUTRUN',
  description: 'Escondite urbano con GPS: unos huyen, otros cazan.',
  lang: 'es',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: BG,
  theme_color: BG,
  icons: [
    { src: v('icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: v('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: v('icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/** favicon.ico con una sola imagen PNG de 32×32 dentro (formato ICO válido desde Windows Vista). */
function icoFromPng(png) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(1, 4); // una imagen
  header.writeUInt8(32, 6); // ancho
  header.writeUInt8(32, 7); // alto
  header.writeUInt8(0, 8); // sin paleta
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // planos
  header.writeUInt16LE(32, 12); // bits por píxel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18); // la imagen empieza tras la cabecera
  return Buffer.concat([header, png]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => existsSync(p));
  const browser = await chromium.launch(chrome ? { executablePath: chrome } : {});
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${iconSvg(icon.size, icon)}</body></html>`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
    writeFileSync(new URL(icon.file, www), png);
    if (icon.file === 'icons/favicon-32.png') writeFileSync(new URL('favicon.ico', www), icoFromPng(png));
    console.log(`www/${icon.file} (${icon.size}×${icon.size})`);
  }
  await browser.close();
  writeFileSync(new URL('favicon.svg', www), `${iconSvg(64, { scale: 0.86, radius: 0.18 })}\n`);
  writeFileSync(new URL('manifest.webmanifest', www), `${JSON.stringify(MANIFEST, null, 2)}\n`);
  console.log('www/favicon.ico, www/favicon.svg y www/manifest.webmanifest');
}
