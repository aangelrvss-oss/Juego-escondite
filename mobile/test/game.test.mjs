import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_TEXT, ago, clock, errorText, gpsStatus, phaseDeadline, rivals, startBlockers } from '../www/js/game-view.js';
import { project, radarSvg } from '../www/js/radar.js';
import { toWsUrl } from '../www/js/net.js';

// Punto de referencia de las pruebas del motor (fixture; no es la ubicación de nadie).
const CENTER = { lat: 40.4153, lng: -3.6845 };

test('dirección del servidor: lo que escribe el usuario se convierte en wss:// o ws:// con /ws', () => {
  assert.equal(toWsUrl('abc.trycloudflare.com'), 'wss://abc.trycloudflare.com/ws');
  assert.equal(toWsUrl('https://abc.trycloudflare.com/'), 'wss://abc.trycloudflare.com/ws');
  assert.equal(toWsUrl('http://192.168.1.20:8787'), 'ws://192.168.1.20:8787/ws');
  assert.equal(toWsUrl('wss://x.example/ws'), 'wss://x.example/ws');
  assert.equal(toWsUrl(''), null);
  assert.equal(toWsUrl('ftp://x'), null);
});

test('tiempos: cuenta atrás y antigüedad', () => {
  assert.equal(clock(65_000), '1:05');
  assert.equal(clock(3_600_000), '1:00:00');
  assert.equal(clock(-5), '0:00');
  assert.equal(clock(1), '0:01', 'redondea hacia arriba: nunca muestra 0 antes de tiempo');
  assert.equal(ago(12_400), 'hace 12 s');
  assert.equal(ago(180_000), 'hace 3 min');
  const snap = { phase: 'HEAD_START', countdownEnd: 1, headStartEnd: 2, gameEnd: 3 };
  assert.equal(phaseDeadline(snap), 2);
});

test('estado del GPS propio con los umbrales experimentales del motor', () => {
  assert.equal(gpsStatus(null, 0).tone, 'danger');
  assert.equal(gpsStatus({ accuracyM: 8, ageMs: 1_000, at: 0 }, 2_000).tone, 'ok');
  assert.equal(gpsStatus({ accuracyM: 80, ageMs: 0, at: 0 }, 0).tone, 'warn');
  assert.equal(gpsStatus({ accuracyM: 8, ageMs: 10_000, at: 0 }, 6_000).tone, 'warn', 'la espera local cuenta');
  assert.equal(gpsStatus({ accuracyM: 8, ageMs: 0, at: 0 }, 130_000).tone, 'danger');
});

test('rivales elegibles: solo activos que no son compañeros (lo que la vista autoriza)', () => {
  const snap = {
    players: [
      { id: 'a', team: 'hunter', status: 'active' },
      { id: 'b', team: 'hunter', status: 'active' },
      { id: 'c', team: null, status: 'active' },
      { id: 'd', team: null, status: 'captured' },
    ],
  };
  assert.deepEqual(rivals(snap, 'a').map((p) => p.id), ['c']);
  assert.deepEqual(rivals({ players: [{ id: 'x', team: null, status: 'lobby' }] }, 'x'), []);
});

test('el anfitrión ve qué falta para empezar', () => {
  const snap = { config: null, players: [{ name: 'Ana', status: 'lobby', ready: true, connected: true }] };
  assert.deepEqual(startBlockers(snap), ['Fija la zona de juego.', 'Hacen falta al menos 2 jugadores.']);
});

test('todos los errores del motor tienen texto para el jugador', async () => {
  const types = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../engine/src/types.ts', import.meta.url), 'utf8'));
  const codes = [...types.slice(types.indexOf('export type ErrorCode')).split(';')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(codes.length > 20);
  for (const code of codes) assert.ok(ERROR_TEXT[code], `falta el texto de ${code}`);
  assert.equal(errorText('desconocido'), 'Error: desconocido');
});

test('radar: proyección en metros y sin coordenadas en ningún texto', () => {
  const p = project(CENTER, { lat: CENTER.lat + 100 / 110_540, lng: CENTER.lng });
  assert.ok(Math.abs(p.x) < 0.01 && Math.abs(p.y + 100) < 0.01, '100 m al norte = 100 m arriba');
  const svg = radarSvg({
    center: CENTER,
    radiusM: 400,
    meeting: CENTER,
    me: { lat: CENTER.lat, lng: CENTER.lng, accuracyM: 8 },
    myTeam: 'hunter',
    dots: [{ lat: CENTER.lat + 0.001, lng: CENTER.lng, label: '<b>Caro</b> · hace 3 s', kind: 'ping', team: 'runner' }],
  });
  assert.ok(svg.startsWith('<svg'));
  assert.doesNotMatch(svg, /40\.41|3\.68/, 'las coordenadas no aparecen en el SVG');
  assert.doesNotMatch(svg, /<b>/, 'las etiquetas se escapan');
});

// Adaptador de ubicación con dobles: un plugin y una geolocalización falsos (objetos planos). Comprueban
// el contrato y la conversión de tiempos, NO el comportamiento real de Android, iOS ni del navegador.
import { createLocationSource } from '../www/js/location.js';

test('ubicación nativa (Android hoy, iOS con el mismo contrato): permiso, sesión de 5 s y antigüedad monótona', async () => {
  const calls = [];
  let emit;
  const plugin = {
    requestPermissions: async () => (calls.push('requestPermissions'), { location: 'precise', notifications: 'granted' }),
    getStatus: async () => (calls.push('getStatus'), { running: false }),
    startSession: async (args) => (calls.push(['startSession', args]), { running: true }),
    stopSession: async () => (calls.push('stopSession'), { running: false }),
    addListener: async (event, fn) => {
      if (event === 'reading') emit = fn;
      return { remove: async () => {} };
    },
  };
  const src = await createLocationSource({ loadNative: async () => ({ plugin }) });
  assert.equal(src.kind, 'native');
  const got = [];
  await src.start((r) => got.push(r));
  assert.deepEqual(calls, ['requestPermissions', 'getStatus', ['startSession', { intervalMs: 5_000 }]]);
  emit({ sessionId: 's', lat: CENTER.lat, lng: CENTER.lng, accuracyM: 7, ageMs: 900, receivedAt: 1, measuredAt: 1, provider: 'fused', isMock: false });
  assert.equal(got.length, 1);
  assert.equal(got[0].ageMs, 900, 'la antigüedad viene del reloj monótono del móvil, no de su hora de pared');
  assert.equal(typeof got[0].at, 'number');
  await src.stop();
  assert.equal(calls.at(-1), 'stopSession');
});

test('ubicación nativa sin permiso: no se inicia ninguna sesión', async () => {
  const calls = [];
  const plugin = {
    requestPermissions: async () => ({ location: 'denied', notifications: 'prompt' }),
    startSession: async () => calls.push('startSession'),
    addListener: async () => ({ remove: async () => {} }),
  };
  const src = await createLocationSource({ loadNative: async () => ({ plugin }) });
  await assert.rejects(src.start(() => {}), /permission_missing/);
  assert.deepEqual(calls, []);
});

test('ubicación web (navegador, también iPhone): antigüedad con el reloj del propio dispositivo y permiso denegado', async () => {
  let ok;
  let fail;
  const geolocation = { watchPosition: (s, e) => ((ok = s), (fail = e), 7), clearWatch: () => {} };
  const src = await createLocationSource({ geolocation, loadNative: async () => ({ plugin: null }) });
  assert.equal(src.kind, 'web');
  const got = [];
  const started = src.start((r) => got.push(r));
  ok({ coords: { latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 12 }, timestamp: Date.now() - 3_000 });
  await started;
  assert.ok(got[0].ageMs >= 3_000 && got[0].ageMs < 4_000);
  await src.stop();
  const denied = await createLocationSource({ geolocation, loadNative: async () => ({ plugin: null }) });
  const p = denied.start(() => {});
  fail({ code: 1 });
  await assert.rejects(p, /permission_missing/);
});

test('ubicación web con el móvil quieto: si el seguimiento no da lecturas, se pide una nueva (la posición no caduca)', async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ok;
  const asked = [];
  const geolocation = {
    watchPosition: (s) => ((ok = s), 7),
    clearWatch: () => {},
    getCurrentPosition: (s, e, opts) => asked.push({ s, opts }),
  };
  const fix = (ageMs = 0) => ({ coords: { latitude: CENTER.lat, longitude: CENTER.lng, accuracy: 9 }, timestamp: Date.now() - ageMs });
  const src = await createLocationSource({ geolocation, loadNative: async () => ({ plugin: null }), webOptions: { refreshAfterMs: 60, checkMs: 10 } });
  const got = [];
  const started = src.start((r) => got.push(r));
  ok(fix());
  await started;
  // Mientras el seguimiento entrega lecturas, no se pide nada más.
  for (let i = 0; i < 5; i++) {
    await sleep(20);
    ok(fix());
  }
  assert.equal(asked.length, 0);
  // Quieto: sin lecturas durante más de refreshAfterMs se pide una, sin caché y sin duplicar peticiones.
  await sleep(120);
  assert.equal(asked.length, 1, 'una sola petición pendiente');
  assert.equal(asked[0].opts.maximumAge, 0);
  asked[0].s(fix(200));
  assert.equal(got.length, 7);
  assert.ok(got.at(-1).ageMs >= 200 && got.at(-1).ageMs < 1_000, 'con su antigüedad real');
  await src.stop();
  const before = asked.length;
  await sleep(120);
  assert.equal(asked.length, before, 'al parar no se piden más');
});

test('conexión: tras varias reconexiones solo hay una cadena de ping', async () => {
  const { GameConnection } = await import('../www/js/net.js');
  const sockets = [];
  class FakeSocket {
    constructor() {
      this.readyState = 1;
      this.sent = [];
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(text) {
      this.sent.push(JSON.parse(text));
    }
    close() {
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.({ code: 1006 }));
    }
  }
  const mem = new Map();
  const conn = new GameConnection({ url: 'ws://x/ws', WebSocketImpl: FakeSocket, storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) } });
  conn.start();
  await new Promise((r) => setTimeout(r, 10));
  for (let i = 0; i < 3; i++) {
    sockets.at(-1).close();
    await new Promise((r) => setTimeout(r, 800)); // primera espera de reconexión: 0,5–0,75 s
  }
  const timers = [...conn.timers].length;
  conn.close();
  assert.equal(sockets.length, 4, 'tres reconexiones');
  assert.ok(timers <= 1, `temporizadores vivos: ${timers}`);
});
