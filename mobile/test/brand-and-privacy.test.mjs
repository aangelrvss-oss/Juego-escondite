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

test('la interfaz no usa la red: sin URLs externas, fetch, XHR ni WebSocket', () => {
  const dir = new URL('../www/js/', import.meta.url);
  const files = readdirSync(dir).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);
  files.push(['index.html', read('../www/index.html')], ['app.css', read('../www/css/app.css')]);
  for (const [name, src] of files) {
    assert.doesNotMatch(src, /https?:\/\//, name);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/, name);
  }
});
