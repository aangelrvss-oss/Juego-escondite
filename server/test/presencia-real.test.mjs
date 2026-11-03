// Presencia y periodo de gracia (D-057) con la cadencia REAL del cliente, servidor real y net.js real.
//
// A diferencia de presence.test.mjs, aquí NO se usa `advance()` de helpers.mjs, que llama a
// `hub.keepAliveConnected()` y da señal de vida a todo el que tenga el socket abierto. Aquí el reloj del
// servidor avanza a mano y solo se llama a `server.pump()`: las únicas señales de vida son los mensajes
// que envía de verdad cada cliente. El cliente (net.js) usa el mismo reloj que el servidor (`now`), de
// modo que su regla real («ping si han pasado 10 s desde el último», al recibir cualquier mensaje del
// servidor, p. ej. las posiciones cada 5 s) produce un ping cada 10 s de juego.
// SIMULADO: el paso del tiempo, las lecturas de ubicación y la página congelada (el socket sigue abierto
// pero la aplicación no envía nada), no un móvil real.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { offsetM } from '../../engine/src/geo.ts';
import { GameConnection } from '../../mobile/www/js/net.js';
import { CENTER, gameConfig, memoryStorage, settle, testServer, waitFor } from './helpers.mjs';

const SECOND = 1_000;
const MINUTE = 60_000;
const AWAY_MS = 30 * SECOND; // engine/src/constants.ts PRESENCE.awayAfterMs
const TIMEOUT_MS = 5 * MINUTE; // PRESENCE.absenceTimeoutMs

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
  t = null;
});

/** Cliente real con el reloj del servidor. `frozen`: la página no envía nada (el socket sigue abierto). */
function client(name) {
  const raw = [];
  const pingsAt = []; // hora (del servidor) de cada ping que sale de verdad por el socket
  const ctl = { frozen: false };
  class RealCadenceSocket extends WebSocket {
    constructor(url) {
      super(url);
      this.addEventListener('message', (e) => raw.push(JSON.parse(e.data)));
    }
    send(data) {
      if (ctl.frozen) return;
      if (JSON.parse(data).t === 'ping') pingsAt.push(t.clock.t);
      super.send(data);
    }
  }
  const conn = new GameConnection({ url: t.wsUrl, storage: memoryStorage(), WebSocketImpl: RealCadenceSocket, now: () => t.clock.t });
  const events = [];
  conn.on('event', (e) => events.push(e));
  conn.start();
  const c = {
    name,
    conn,
    raw,
    events,
    pingsAt,
    ctl,
    get id() {
      return conn.playerId;
    },
    get snap() {
      return conn.snapshot;
    },
    pongs: () => raw.filter((m) => m.t === 'pong').length,
    lastPositionsAt: () => raw.findLast((m) => m.t === 'positions')?.at ?? null,
    at(north, east = 0) {
      const p = offsetM(CENTER, north, east);
      return conn.sendLocation({ lat: p.lat, lng: p.lng, accuracyM: 6, ageMs: 0 });
    },
  };
  clients.push(c);
  return c;
}

const state = (code) => t.server.hub.roomStateByCode(code);
const engineP = (code, c) => state(code).players[c.id];

/**
 * Adelanta el reloj del servidor a pasos de `step` ms llamando SOLO a `server.pump()`. En cada paso espera
 * a que los clientes vivos (no congelados, con el socket abierto y en partida) reciban las posiciones de
 * ese paso, si las hubo, y a que cada ping enviado tenga su respuesta: así ninguna señal llega «tarde» por
 * la lentitud de la máquina y el resultado no depende del tiempo real.
 */
async function run(code, ms, { step = 5 * SECOND, each } = {}) {
  const target = t.clock.t + ms;
  while (t.clock.t < target) {
    t.clock.t = Math.min(target, t.clock.t + step);
    const broadcastDue = t.server.hub.nextPositionsAt <= t.clock.t;
    t.server.pump();
    const st = state(code);
    const live = clients.filter((c) => !c.ctl.frozen && c.conn.status === 'open' && st?.players[c.id]?.status === 'active');
    const livePhase = st && (st.phase === 'HEAD_START' || st.phase === 'ACTIVE');
    await waitFor(
      () => live.every((c) => (!broadcastDue || !livePhase || c.lastPositionsAt() === t.clock.t) && c.pongs() >= c.pingsAt.length),
      `señales del paso ${t.clock.t}`,
    );
    await settle(5);
    each?.();
  }
}

/** Sala en la persecución. `hunter`: el único cazador (por preferencia); el resto, fugitivos. */
async function activeRoom(names, { mode, hunter = names[0] } = {}) {
  const players = names.map((n) => client(n));
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await players[0].conn.create(names[0]);
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === names.length), 'todos en la sala');
  for (const p of players) assert.equal((await p.conn.command({ type: 'set_team_pref', pref: p.name === hunter ? 'hunter' : 'runner' })).ok, true);
  assert.equal((await players[0].conn.command({ type: 'configure', config: gameConfig(mode ? { mode } : {}) })).ok, true);
  for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
  assert.equal((await players[0].conn.command({ type: 'start' })).ok, true);
  await run(code, 5 * SECOND + 2 * MINUTE);
  assert.equal(state(code).phase, 'ACTIVE');
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución en los clientes');
  return { code, players };
}

const presenceEvents = (c, id, away) => c.events.filter((e) => e.type === 'player_presence' && e.data.playerId === id && e.data.away === away);

describe('presencia con la cadencia real del cliente (sin keepAliveConnected)', () => {
  it('con un ping cada 10 s nadie aparece nunca «sin conexión» ni queda fuera (12 min de persecución)', async () => {
    t = await testServer();
    const { code, players } = await activeRoom(['Ana', 'Beto', 'Caro']);
    let maxSilence = 0;
    await run(code, 12 * MINUTE, {
      each: () => {
        for (const p of players) {
          const ep = engineP(code, p);
          assert.equal(ep.away, false, `${p.name} nunca «sin conexión» (t=${t.clock.t})`);
          assert.equal(ep.status, 'active');
          maxSilence = Math.max(maxSilence, t.clock.t - ep.lastSeenAt);
        }
      },
    });
    assert.equal(state(code).phase, 'ACTIVE');
    // La cadencia es la real: entre dos pings consecutivos de cada cliente hay como mucho 10 s de juego.
    for (const p of players) {
      const inChase = p.pingsAt.filter((x) => x >= state(code).activeStart);
      assert.ok(inChase.length >= 70, `${p.name}: ${inChase.length} pings en 12 min`);
      const gaps = inChase.slice(1).map((x, i) => x - inChase[i]);
      assert.ok(Math.max(...gaps) <= 10 * SECOND, `${p.name}: hueco máximo ${Math.max(...gaps)} ms`);
    }
    assert.ok(maxSilence <= 10 * SECOND, `silencio máximo visto por el motor: ${maxSilence} ms`);
    for (const p of players) assert.equal(p.events.filter((e) => e.type === 'player_presence').length, 0);
  });

  it('con 31 s de silencio (página congelada) sí: «sin conexión» justo a los 30 s de la última señal; al despertar, vuelve', async () => {
    t = await testServer();
    const { code, players } = await activeRoom(['Ana', 'Beto', 'Caro']);
    const [ana, beto] = players;
    beto.ctl.frozen = true;
    const last = engineP(code, beto).lastSeenAt;
    // Hasta 1 ms antes del plazo, sigue «con conexión»; los demás no se ven afectados.
    await run(code, last + AWAY_MS - 1 - t.clock.t, { step: SECOND });
    if (t.clock.t !== last + AWAY_MS - 1) await run(code, last + AWAY_MS - 1 - t.clock.t, { step: 1 });
    assert.equal(engineP(code, beto).away, false, 'a 29,999 s todavía no');
    await run(code, 1, { step: 1 });
    assert.equal(engineP(code, beto).away, true, 'a los 30 s exactos, «sin conexión»');
    await run(code, SECOND, { step: SECOND }); // 31 s de silencio
    assert.equal(engineP(code, beto).away, true);
    assert.equal(engineP(code, beto).connected, true, 'el socket sigue abierto');
    assert.equal(engineP(code, ana).away, false);
    await waitFor(() => presenceEvents(ana, beto.id, true).length === 1, 'Ana recibe el aviso');
    // Despierta: la aplicación hace ping al momento y vuelve.
    beto.ctl.frozen = false;
    beto.conn.wake();
    await waitFor(() => engineP(code, beto).away === false, 'Beto vuelve');
    await waitFor(() => presenceEvents(ana, beto.id, false).length === 1, 'Ana ve que ha vuelto');
    assert.equal(engineP(code, beto).status, 'active');
  });

  it('a los 5 min (+ margen) sin señal queda fuera: status left, leftReason timeout; ni antes ni a los demás', async () => {
    t = await testServer();
    const { code, players } = await activeRoom(['Ana', 'Beto', 'Caro', 'Dani']);
    const [ana, beto, caro, dani] = players;
    beto.conn.close(); // sin cobertura: socket cerrado
    caro.ctl.frozen = true; // página congelada: socket abierto y mudo
    await waitFor(() => engineP(code, beto).connected === false, 'Beto desconectado');
    const lastBeto = engineP(code, beto).lastSeenAt;
    const lastCaro = engineP(code, caro).lastSeenAt;
    const firstDeadline = Math.min(lastBeto, lastCaro) + TIMEOUT_MS;
    await run(code, firstDeadline - 5 * SECOND - t.clock.t, { step: 5 * SECOND });
    for (const p of [beto, caro]) {
      assert.equal(engineP(code, p).status, 'active', `${p.name} aún dentro a 5 s del plazo`);
      assert.equal(engineP(code, p).away, true);
    }
    await run(code, Math.max(lastBeto, lastCaro) + TIMEOUT_MS + 10 * SECOND - t.clock.t, { step: 5 * SECOND });
    for (const p of [beto, caro]) {
      assert.equal(engineP(code, p).status, 'left', p.name);
      assert.equal(engineP(code, p).leftReason, 'timeout', p.name);
    }
    for (const p of [ana, dani]) assert.equal(engineP(code, p).status, 'active', `${p.name} sigue (señal real cada 10 s)`);
    assert.equal(state(code).phase, 'ACTIVE', 'queda Dani');
    await waitFor(() => ['Beto', 'Caro'].every((n) => ana.events.some((e) => e.type === 'player_left' && e.data.playerId === players.find((p) => p.name === n).id && e.data.reason === 'timeout')), 'Ana recibe que quedan fuera');
  });
});

describe('Infección: presencia del convertido con la cadencia real', () => {
  /** Ana reclama a `runner` a 4 m y este lo confirma: se convierte. */
  async function infect(code, hunter, runner) {
    hunter.at(0);
    runner.at(4);
    await settle();
    const r = await hunter.conn.command({ type: 'claim_tag', runnerId: runner.id });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await runner.conn.command({ type: 'respond_tag', claimId: r.data.claimId, accept: true })).ok, true);
    assert.equal(engineP(code, runner).team, 'hunter');
    assert.equal(engineP(code, runner).status, 'active');
  }

  it('un convertido sin señal queda fuera a los 5 min (timeout) y la partida sigue con el otro cazador', async () => {
    t = await testServer();
    const { code, players } = await activeRoom(['Ana', 'Beto', 'Caro', 'Dani'], { mode: 'infection' });
    const [ana, beto] = players;
    assert.equal(state(code).config.mode, 'infection');
    await infect(code, ana, beto);
    beto.ctl.frozen = true;
    const last = engineP(code, beto).lastSeenAt;
    await run(code, last + TIMEOUT_MS + 10 * SECOND - t.clock.t);
    assert.equal(engineP(code, beto).status, 'left');
    assert.equal(engineP(code, beto).leftReason, 'timeout');
    assert.equal(engineP(code, beto).team, 'hunter', 'sale como cazador');
    assert.equal(engineP(code, ana).status, 'active');
    assert.equal(state(code).phase, 'ACTIVE');
    assert.equal(state(code).outcome, null);
  });

  it('si el convertido sin señal era el último cazador: hunters_abandoned, sin ganador', async () => {
    t = await testServer();
    const { code, players } = await activeRoom(['Ana', 'Beto', 'Caro', 'Dani'], { mode: 'infection' });
    const [ana, beto, caro, dani] = players;
    await infect(code, ana, beto);
    // La cazadora inicial abandona: el convertido es el último cazador.
    assert.equal((await ana.conn.command({ type: 'leave' })).ok, true);
    assert.equal(engineP(code, ana).status, 'left');
    assert.equal(state(code).phase, 'ACTIVE');
    beto.ctl.frozen = true;
    const last = engineP(code, beto).lastSeenAt;
    await run(code, last + TIMEOUT_MS - 5 * SECOND - t.clock.t);
    assert.equal(state(code).phase, 'ACTIVE', 'a 5 s del plazo sigue');
    await run(code, 15 * SECOND);
    assert.equal(engineP(code, beto).status, 'left');
    assert.equal(engineP(code, beto).leftReason, 'timeout');
    assert.equal(state(code).phase, 'FINISHED');
    assert.deepEqual(state(code).outcome, { winner: null, cause: 'hunters_abandoned' });
    for (const p of [caro, dani]) {
      assert.equal(engineP(code, p).status, 'active', `${p.name} sigue libre al final`);
      await waitFor(() => p.snap?.phase === 'FINISHED', `${p.name} recibe el final`);
      assert.deepEqual(p.snap.outcome, { winner: null, cause: 'hunters_abandoned' });
    }
  });
});
