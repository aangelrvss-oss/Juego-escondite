// Utilidades de las pruebas del servidor: servidor real (HTTP + WebSocket en un puerto local) con el
// reloj del motor controlado por la prueba, y clientes reales (mobile/www/js/net.js) sobre el
// WebSocket nativo de Node. Lo único simulado es el paso del tiempo y las lecturas de ubicación.
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../main.ts';
import { GameConnection } from '../../mobile/www/js/net.js';

// Punto de referencia de las pruebas del motor (fixture ya existente; no es la ubicación de nadie).
export const CENTER = { lat: 40.4153, lng: -3.6845 };
export const T0 = Date.UTC(2026, 9, 26, 17, 0, 0);

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

export async function testServer(hub = {}) {
  const clock = { t: T0 };
  const server = await startServer({ staticRoot: null, hub: { now: () => clock.t, ...hub } });
  const wsUrl = `${server.url.replace('http', 'ws')}/ws`;
  return {
    server,
    clock,
    wsUrl,
    /**
     * Adelanta el reloj del servidor y procesa los plazos vencidos. Como en la realidad (la aplicación
     * envía un ping cada 10 s), quien tiene el WebSocket abierto da señales de vida cada 20 s: el periodo
     * de gracia (D-057) solo afecta a quien está desconectado. `jump` adelanta sin señales.
     */
    async advance(ms) {
      const target = clock.t + ms;
      while (clock.t < target) {
        clock.t = Math.min(target, clock.t + 20_000);
        server.pump();
        server.hub.keepAliveConnected();
      }
      await settle();
    },
    async jump(ms) {
      clock.t += ms;
      server.pump();
      await settle();
    },
    close: () => server.close(),
  };
}

export const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(predicate, what, timeoutMs = 4_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return;
    await settle(10);
  }
  throw new Error(`timeout esperando: ${what}`);
}

/** Cliente real con registro de todo lo que recibe del servidor (texto crudo incluido). */
export function player(t, name, { now } = {}) {
  const raw = [];
  class SpyWebSocket extends WebSocket {
    constructor(url) {
      super(url);
      this.addEventListener('message', (e) => raw.push(JSON.parse(e.data)));
    }
  }
  const conn = new GameConnection({ url: t.wsUrl, storage: memoryStorage(), WebSocketImpl: SpyWebSocket, ...(now ? { now } : {}) });
  const events = [];
  const positions = [];
  conn.on('event', (e) => events.push(e));
  conn.on('positions', (p) => positions.push(p));
  conn.start();
  return {
    name,
    conn,
    raw,
    events,
    positions,
    get snap() {
      return conn.snapshot;
    },
    get id() {
      return conn.playerId;
    },
    /** Envía una lectura a `north` m al norte del centro (y `east` al este). */
    at(north, { east = 0, acc = 8, age = 0, mock } = {}) {
      const p = offsetM(CENTER, north, east);
      return conn.sendLocation({ lat: p.lat, lng: p.lng, accuracyM: acc, ageMs: age, ...(mock === undefined ? {} : { isMock: mock }) });
    },
    eventsOf(type) {
      return events.filter((e) => e.type === type);
    },
  };
}

export function gameConfig(overrides = {}) {
  return {
    durationMs: 20 * 60_000,
    headStartMs: 2 * 60_000,
    pingIntervalMs: 3 * 60_000,
    zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 400 }],
    meetingPoint: CENTER,
    safetyChecklistConfirmed: true,
    ...overrides,
  };
}

/** Crea una sala con el primero y une a los demás. Devuelve el código. */
export async function room(t, names) {
  const players = names.map((n) => player(t, n));
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones abiertas');
  const { code } = await players[0].conn.create(names[0]);
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === names.length), 'todos en la sala');
  return { code, players };
}
