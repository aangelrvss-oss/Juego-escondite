import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ICON_VERSION, MANIFEST } from '../scripts/iconos-pwa.mjs';

// Web instalable (PWA): manifiesto e iconos generados desde el símbolo oficial (scripts/iconos-pwa.mjs).
const www = new URL('../www/', import.meta.url);
const read = (p) => readFileSync(new URL(p.replace(/\?.*$/, ''), www)); // sin ?v=…
/** Ancho y alto de un PNG (cabecera IHDR). */
const pngSize = (buf) => {
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', 'es un PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

test('el manifiesto es el que genera el script, válido y sin URLs externas', () => {
  const text = read('manifest.webmanifest').toString('utf8');
  const m = JSON.parse(text);
  assert.deepEqual(m, MANIFEST, 'ejecuta «node scripts/iconos-pwa.mjs» en mobile/');
  assert.equal(m.name, 'THE OUTRUN');
  assert.equal(m.short_name, 'OUTRUN');
  assert.equal(m.orientation, 'portrait');
  assert.equal(m.theme_color, m.background_color, 'barra de estado del color del fondo de la app');
  for (const icon of m.icons) assert.ok(icon.src.endsWith(`?v=${ICON_VERSION}`), `${icon.src}: versionado`);
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.doesNotMatch(text, /https?:\/\//, 'sin recursos externos');
  // Chrome necesita al menos un icono de 192 y uno de 512 para instalar; Android usa el maskable.
  const sizes = (purpose) => m.icons.filter((i) => i.purpose === purpose).map((i) => i.sizes);
  assert.ok(sizes('any').includes('192x192') && sizes('any').includes('512x512'));
  assert.deepEqual(sizes('maskable'), ['512x512']);
});

test('cada icono existe y mide lo que declara', () => {
  for (const icon of MANIFEST.icons) {
    const [w, h] = pngSize(read(icon.src));
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
  }
  assert.deepEqual(pngSize(read('apple-touch-icon.png')), [180, 180]);
  const ico = read('favicon.ico');
  assert.equal(ico.readUInt16LE(2), 1, 'favicon.ico es un icono');
  assert.deepEqual(pngSize(ico.subarray(ico.readUInt32LE(18))), [32, 32]);
});

test('index.html enlaza el manifiesto y los iconos; el favicon SVG usa el símbolo oficial', async () => {
  const html = read('index.html').toString('utf8');
  const v = `?v=${ICON_VERSION}`;
  for (const link of [`rel="manifest" href="manifest.webmanifest${v}"`, `href="favicon.ico${v}"`, `href="favicon.svg${v}"`, `rel="apple-touch-icon" href="apple-touch-icon.png${v}"`]) {
    assert.ok(html.includes(link), link);
  }
  const { SYMBOL_PATHS } = await import('../www/js/brand.generated.js');
  assert.ok(read('favicon.svg').toString('utf8').includes(SYMBOL_PATHS), 'mismo símbolo que la cabecera de la app');
});
