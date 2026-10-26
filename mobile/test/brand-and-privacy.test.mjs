import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extractBrand, renderBrand } from '../scripts/sync-brand.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('la marca generada coincide con la de la demo (única fuente)', () => {
  const out = renderBrand(extractBrand(read('../../demo/src/ui.js'), read('../../demo/src/styles.css')));
  assert.equal(read('../www/js/brand.generated.js'), out.js, 'ejecuta «npm run brand»');
  assert.equal(read('../www/css/tokens.generated.css'), out.css, 'ejecuta «npm run brand»');
});

// Pantalla de diagnóstico de H1: sigue sin red. Juego (H2): solo el servidor propio, por WebSocket,
// y únicamente desde net.js; nunca URLs externas, fetch, XHR ni sendBeacon.
const DIAGNOSTIC = ['diagnostic.js', 'location-bridge.js', 'reading-status.js', 'view-model.js', 'brand.generated.js'];

test('la pantalla de diagnóstico no usa la red: sin URLs externas, fetch, XHR ni WebSocket', () => {
  const files = DIAGNOSTIC.map((f) => [f, read(`../www/js/${f}`)]);
  files.push(['diagnostic.html', read('../www/diagnostic.html')], ['app.css', read('../www/css/app.css')]);
  for (const [name, src] of files) {
    assert.doesNotMatch(src, /https?:\/\//, name);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/, name);
  }
});

test('el juego solo habla con el servidor propio, por WebSocket y desde net.js', () => {
  const dir = new URL('../www/js/', import.meta.url);
  const files = readdirSync(dir).filter((f) => !DIAGNOSTIC.includes(f)).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);
  files.push(['index.html', read('../www/index.html')], ['game.css', read('../www/css/game.css')]);
  assert.ok(files.length >= 6, 'módulos del juego');
  for (const [name, src] of files) {
    assert.doesNotMatch(src, /https?:\/\/[\w-]/, `${name}: URL externa`); // `https://${...}` (esquema por defecto) sí vale
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon/, name);
    if (name !== 'net.js') assert.doesNotMatch(src, /new\s+\w*WebSocket/, name);
  }
});
