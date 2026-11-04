import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startServer } from '../main.ts';

// Web instalable: el servidor (sin cambios) sirve el manifiesto y los iconos, también con la versión en la
// URL (?v=…), y sin caché: tras actualizar la app, el navegador pide siempre la versión actual.
test('manifiesto, favicons e iconos responden 200, sin caché y con la versión en la URL', async () => {
  const s = await startServer({ staticRoot: fileURLToPath(new URL('../../mobile/www/', import.meta.url)) });
  try {
    const expect = {
      '/manifest.webmanifest?v=20261104': null, // tipo genérico: Chrome lee el manifiesto igual (comprobado)
      '/favicon.ico?v=20261104': null,
      '/favicon.svg?v=20261104': 'image/svg+xml',
      '/apple-touch-icon.png?v=20261104': 'image/png',
      '/icons/icon-192.png?v=20261104': 'image/png',
      '/icons/icon-512.png?v=20261104': 'image/png',
      '/icons/icon-maskable-512.png?v=20261104': 'image/png',
      '/favicon.ico': null, // la ruta que piden los navegadores por defecto
    };
    for (const [path, type] of Object.entries(expect)) {
      const r = await fetch(`${s.url}${path}`);
      assert.equal(r.status, 200, path);
      if (type) assert.equal(r.headers.get('content-type'), type, path);
      assert.equal(r.headers.get('cache-control'), 'no-store', path);
      await r.arrayBuffer();
    }
  } finally {
    await s.close();
  }
});
