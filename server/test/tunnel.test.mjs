import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import { startServer } from '../main.ts';

// Detrás de un túnel HTTPS (p. ej. cloudflared), el servidor recibe las peticiones de los móviles con
// la cabecera Host del dominio público (`<algo>.trycloudflare.com`), el Origin `https://` de ese mismo
// dominio y la IP real del móvil en CF-Connecting-IP. Aquí se reproducen esas cabeceras a mano, sobre
// TCP, porque el WebSocket de Node no deja cambiar Host. SIMULADO: no hay túnel ni TLS reales; lo que
// se comprueba es la decisión del servidor con esas cabeceras.

const PUBLIC_HOST = 'prueba-outrun.trycloudflare.com';
let server;
afterEach(async () => server?.close());

/** Envía una petición HTTP en bruto y devuelve la línea de estado de la respuesta. */
function rawRequest(port, lines) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(`${lines.join('\r\n')}\r\n\r\n`));
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\r\n')) {
        resolve(data.split('\r\n')[0]);
        socket.destroy();
      }
    });
    socket.on('error', reject);
    socket.setTimeout(3_000, () => reject(new Error('sin respuesta')));
  });
}

const upgrade = (port, headers) =>
  rawRequest(port, [
    'GET /ws HTTP/1.1',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Version: 13',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    ...headers,
  ]);

describe('detrás de un túnel HTTPS (cabeceras simuladas)', () => {
  it('la página servida desde el dominio público abre el WebSocket de ese mismo dominio', async () => {
    server = await startServer({ staticRoot: null });
    const port = Number(new URL(server.url).port);
    const status = await upgrade(port, [`Host: ${PUBLIC_HOST}`, `Origin: https://${PUBLIC_HOST}`, 'CF-Connecting-IP: 203.0.113.7']);
    assert.match(status, /^HTTP\/1\.1 101/, status);
  });

  it('otra web no puede abrir el WebSocket, aunque llegue por el mismo túnel', async () => {
    server = await startServer({ staticRoot: null });
    const port = Number(new URL(server.url).port);
    assert.match(await upgrade(port, [`Host: ${PUBLIC_HOST}`, 'Origin: https://otra-web.example']), /^HTTP\/1\.1 403/);
    // Un Origin con el nombre del túnel pero sin coincidir con el Host que llega tampoco vale.
    assert.match(await upgrade(port, ['Host: 127.0.0.1', `Origin: https://${PUBLIC_HOST}`]), /^HTTP\/1\.1 403/);
  });

  it('el envío de ubicación por HTTP exige el mismo origen y una sesión válida', async () => {
    server = await startServer({ staticRoot: null });
    const port = Number(new URL(server.url).port);
    const body = JSON.stringify({ playerId: 'p_falso', secret: 'x'.repeat(43), lat: 40.4, lng: -3.7, acc: 8, age: 0 });
    const post = (origin) =>
      rawRequest(port, [
        'POST /api/loc HTTP/1.1',
        `Host: ${PUBLIC_HOST}`,
        `Origin: ${origin}`,
        'Content-Type: application/json',
        `Content-Length: ${Buffer.byteLength(body)}`,
        '',
        body,
      ]);
    assert.match(await post('https://otra-web.example'), /^HTTP\/1\.1 403/);
    assert.match(await post(`https://${PUBLIC_HOST}`), /^HTTP\/1\.1 401/, 'mismo origen pero sin sesión válida');
  });

  it('/health solo da contadores: ni códigos de sala, ni nombres, ni ubicaciones', async () => {
    server = await startServer({ staticRoot: null });
    const res = await fetch(`${server.url}/health`);
    const json = await res.json();
    assert.deepEqual(Object.keys(json).sort(), ['clients', 'locHttp', 'locWs', 'ok', 'rooms', 'sessions']);
    assert.ok(Object.values(json).every((v) => typeof v === 'number' || typeof v === 'boolean'));
  });
});
