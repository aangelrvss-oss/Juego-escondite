import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { startServer } from '../main.ts';
import { settle, waitFor } from './helpers.mjs';

// Conexión de un cliente cuya página está dormida (pantalla bloqueada): no envía nada, pero su pila
// de red contesta a los ping de protocolo sin JavaScript. Aquí el cliente es el WebSocket de Node,
// que también los contesta solo. Tiempos acortados (en producción: corte a los 75 s y ping cada 20 s);
// no es un móvil. El margen entre el corte y el ping (15 veces) evita que una pausa del bucle de eventos
// con la máquina cargada corte la conexión: con 400/100 ms fallaba con varias suites en paralelo.

let server;
afterEach(async () => server?.close());

async function silentClient(ws) {
  server = await startServer({ staticRoot: null, ws });
  const socket = new WebSocket(`${server.url.replace('http', 'ws')}/ws`);
  let closed = false;
  socket.addEventListener('close', () => (closed = true));
  await new Promise((ok, ko) => {
    socket.addEventListener('open', ok);
    socket.addEventListener('error', ko);
  });
  return {
    socket,
    get closed() {
      return closed;
    },
  };
}

describe('mantenimiento de la conexión con la página dormida', () => {
  it('con ping del servidor, un cliente que no envía nada sigue conectado más allá del tiempo de inactividad', async () => {
    const c = await silentClient({ idleTimeoutMs: 1_500, pingIntervalMs: 100 });
    await settle(3_500); // más del doble del tiempo de inactividad
    assert.equal(c.closed, false);
    assert.equal(server.hub.stats().clients, 1);
    c.socket.close();
  });

  it('sin ping del servidor, el mismo cliente se corta por inactividad (lo que pasaba antes)', async () => {
    const c = await silentClient({ idleTimeoutMs: 1_500, pingIntervalMs: 0 });
    await waitFor(() => c.closed, 'corte por inactividad', 6_000);
    assert.equal(server.hub.stats().clients, 0);
  });
});
