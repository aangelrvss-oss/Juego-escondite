import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocationSource } from '../www/js/location.js';
import { GameConnection, uploadUrl } from '../www/js/net.js';

// Partida con la pantalla bloqueada: envío nativo de la ubicación y conexión que no se da por muerta
// cuando el sistema retrasa los temporizadores. El módulo nativo y el WebSocket están SIMULADOS.

// Punto de referencia de las pruebas del motor (fixture; no es la ubicación de nadie).
const CENTER = { lat: 40.4153, lng: -3.6845 };
const UPLOAD = { url: 'https://partida.example/api/loc', playerId: 'p_1', secret: 's'.repeat(43) };
const raw = (ageMs = 500) => ({ sessionId: 's', lat: CENTER.lat, lng: CENTER.lng, accuracyM: 6, ageMs, receivedAt: 1, measuredAt: 1, provider: 'fused', isMock: false });

/** Módulo nativo simulado con estado: una sesión a la vez, como el servicio real. */
function fakeNative({ stopDelayPolls = 0 } = {}) {
  const calls = [];
  const listeners = {};
  let running = false;
  let uploading = false;
  let pendingStopPolls = 0;
  const status = () => ({ running, uploading, uploaded: 0, uploadError: null });
  const plugin = {
    calls,
    emit: (event, data) => (listeners[event] ?? []).forEach((l) => l(data)),
    requestPermissions: async () => ({ location: 'precise', notifications: 'granted' }),
    getStatus: async () => {
      calls.push('getStatus');
      if (pendingStopPolls > 0 && --pendingStopPolls === 0) running = false; // el servicio tarda en parar
      return status();
    },
    startSession: async (args) => {
      calls.push(['startSession', args]);
      if (running) throw Object.assign(new Error('ya hay una'), { code: 'already_running' });
      running = true;
      uploading = Boolean(args.upload);
      return status();
    },
    stopSession: async () => {
      calls.push('stopSession');
      if (stopDelayPolls > 0) pendingStopPolls = stopDelayPolls;
      else running = false;
      uploading = false;
      return { running: false };
    },
    addListener: async (event, fn) => {
      (listeners[event] ??= []).push(fn);
      return { remove: async () => {} };
    },
  };
  return plugin;
}

test('regresión: tras centrar la zona, las lecturas de la partida llegan al receptor de la partida', async () => {
  // Defecto: el receptor nativo se quedaba con la función del primer start (la de «centrar la zona»),
  // así que en la partida el anfitrión nunca enviaba su ubicación desde la app.
  const plugin = fakeNative();
  const src = await createLocationSource({ loadNative: async () => ({ plugin }), nativeOptions: { pollMs: 1 } });
  const centering = [];
  await src.start((r) => centering.push(r)); // locateOnce
  plugin.emit('reading', raw());
  await src.stop();
  const game = [];
  await src.start((r) => game.push(r), undefined, { upload: UPLOAD }); // syncTracking
  plugin.emit('reading', raw(800));
  assert.equal(centering.length, 1, 'la función de centrar ya no recibe nada');
  assert.equal(game.length, 1, 'la partida recibe la lectura');
  assert.equal(game[0].ageMs, 800);
});

test('envío nativo: una sesión sin envío (p. ej., la de centrar la zona) se reinicia con el destino, esperando a que pare', async () => {
  const plugin = fakeNative({ stopDelayPolls: 3 });
  const src = await createLocationSource({ loadNative: async () => ({ plugin }), nativeOptions: { pollMs: 1 } });
  await src.start(() => {}); // sesión sin envío, que sigue en marcha
  assert.equal(src.uploading, false);
  await src.start(() => {}, undefined, { upload: UPLOAD });
  const starts = plugin.calls.filter((c) => Array.isArray(c));
  assert.deepEqual(starts.at(-1), ['startSession', { intervalMs: 5_000, upload: UPLOAD }]);
  assert.ok(plugin.calls.indexOf('stopSession') < plugin.calls.lastIndexOf(starts.at(-1)), 'se para antes de volver a empezar');
  assert.equal(plugin.calls.filter((c) => c === 'getStatus').length >= 4, true, 'espera a que el servicio pare de verdad');
  assert.equal(src.uploading, true);
  // Un fallo de red del envío nativo (estado cada 5 s) hace que la página vuelva a enviar por WebSocket.
  plugin.emit('status', { running: true, uploading: true, uploaded: 3, uploadError: 'network' });
  assert.equal(src.uploading, false);
  plugin.emit('status', { running: true, uploading: true, uploaded: 4, uploadError: null });
  assert.equal(src.uploading, true);
  await src.stop();
  assert.equal(src.uploading, false);
});

test('envío nativo: start y stop seguidos no se cruzan (van en fila)', async () => {
  const plugin = fakeNative();
  const src = await createLocationSource({ loadNative: async () => ({ plugin }), nativeOptions: { pollMs: 1 } });
  const a = src.start(() => {}, undefined, { upload: UPLOAD });
  const b = src.stop();
  const c = src.start(() => {}, undefined, { upload: UPLOAD });
  await Promise.all([a, b, c]);
  const order = plugin.calls.filter((x) => x !== 'getStatus').map((x) => (Array.isArray(x) ? x[0] : x));
  assert.deepEqual(order, ['startSession', 'stopSession', 'startSession']);
  assert.equal(src.uploading, true);
});

test('la dirección de envío nativo solo existe para servidores wss:// (HTTPS)', () => {
  assert.equal(uploadUrl('wss://algo.trycloudflare.com/ws'), 'https://algo.trycloudflare.com/api/loc');
  assert.equal(uploadUrl('wss://h.example:8443/ws'), 'https://h.example:8443/api/loc');
  assert.equal(uploadUrl('ws://127.0.0.1:8787/ws'), null, 'sin cifrar: la página envía por WebSocket');
  assert.equal(uploadUrl('no es una url'), null);
});

/** WebSocket simulado: responde a los ping si `alive.value` es true. */
function fakeSockets(alive) {
  const sockets = [];
  class FakeSocket {
    constructor() {
      this.readyState = 1;
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(text) {
      const msg = JSON.parse(text);
      if (msg.t === 'ping' && alive.value) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ t: 'pong', c: msg.c, s: msg.c }) }));
    }
    close() {
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.({ code: 1006 }));
    }
  }
  return { sockets, FakeSocket };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test('regresión: con los temporizadores retrasados (pantalla bloqueada), una conexión viva no se da por muerta', async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['setTimeout'] });
  const clock = { t: 1_000_000 };
  const alive = { value: true };
  const { sockets, FakeSocket } = fakeSockets(alive);
  const conn = new GameConnection({ url: 'wss://x/ws', WebSocketImpl: FakeSocket, now: () => clock.t });
  conn.start();
  await flush();
  assert.equal(conn.status, 'open');
  // El sistema congela la página 60 s: el temporizador de ping despierta tarde y ve un silencio largo.
  clock.t += 60_000;
  mock.timers.tick(10_000);
  await flush();
  // Antes: se cerraba y reconectaba al instante. Ahora: sonda; el servidor responde y sigue abierta.
  clock.t += 5_000;
  mock.timers.tick(5_000);
  await flush();
  assert.equal(sockets.length, 1, 'sin reconexión');
  assert.equal(conn.status, 'open');
  conn.close();
});

test('una conexión muerta de verdad se detecta: silencio largo y sonda sin respuesta', async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['setTimeout'] });
  const clock = { t: 1_000_000 };
  const alive = { value: true };
  const { sockets, FakeSocket } = fakeSockets(alive);
  const conn = new GameConnection({ url: 'wss://x/ws', WebSocketImpl: FakeSocket, now: () => clock.t });
  conn.start();
  await flush();
  alive.value = false; // la red cae sin cerrar el socket
  for (let i = 0; i < 3; i++) {
    clock.t += 10_000;
    mock.timers.tick(10_000);
    await flush();
  }
  assert.equal(sockets.length, 1, '30 s de silencio: todavía solo una sonda');
  clock.t += 5_000;
  mock.timers.tick(5_000);
  await flush();
  assert.equal(conn.status, 'reconnecting');
  clock.t += 1_000;
  mock.timers.tick(1_000);
  await flush();
  assert.equal(sockets.length, 2, 'se reconecta');
  conn.close();
});
