import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { offsetM } from '../../engine/src/geo.ts';
import { CENTER, gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// Abandonar en mitad de la partida (Plan Maestro §4.5: «permitir abandonar la partida. Al salir, debe
// dejar de transmitir ubicación»; §10 Privacidad: es un fallo que «un jugador que ha abandonado sigue
// compartiendo su ubicación»). Servidor real, clientes reales por WebSocket y envío HTTP como el del
// servicio nativo. SIMULADO: el paso del tiempo y las lecturas. No es un móvil.

let t;
afterEach(async () => {
  for (const p of t?.players ?? []) p.conn.close();
  await t?.close();
});

async function upload(p, north) {
  const pos = offsetM(CENTER, north, 0);
  const res = await fetch(`${t.server.url}/api/loc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: p.conn.session.playerId, secret: p.conn.session.secret, lat: pos.lat, lng: pos.lng, acc: 8, age: 0 }),
  });
  await res.arrayBuffer();
  return res.status;
}

/** Partida en persecución: Ana cazadora; Beto y Caro fugitivos; Dani cazador. */
async function activeGame() {
  t = await testServer();
  const { code, players } = await room(t, ['Ana', 'Beto', 'Caro', 'Dani']);
  t.players = players;
  const [ana, beto, caro, dani] = players;
  for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner'], [dani, 'hunter']]) {
    assert.equal((await p.conn.command({ type: 'set_team_pref', pref })).ok, true);
  }
  assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await t.advance(5_000);
  await t.advance(2 * 60_000);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  return { players, state: () => t.server.hub.roomStateByCode(code) };
}

describe('abandonar en mitad de la partida', () => {
  it('quien sale deja de compartir: su ubicación se borra y el servidor rechaza las siguientes (410)', async () => {
    const { players, state } = await activeGame();
    const [ana, beto] = players;
    assert.equal(await upload(beto, 10), 204, 'antes de salir se acepta');
    await t.advance(1_000);
    assert.equal(state().players[beto.id].samples.length, 1);

    assert.equal((await beto.conn.command({ type: 'leave' })).ok, true);
    assert.equal(state().players[beto.id].status, 'left');
    assert.equal(state().players[beto.id].samples.length, 0, 'su última posición se borra');
    await t.advance(1_000);
    assert.equal(await upload(beto, 12), 410, 'el envío nativo recibe 410 y el servicio se detiene');
    beto.at(12); // y por WebSocket tampoco cuenta
    await settle();
    assert.equal(state().players[beto.id].samples.length, 0);
    await waitFor(() => ana.snap.players.every((v) => v.id !== beto.id), 'los demás dejan de verlo');
    assert.equal(ana.snap.phase, 'ACTIVE', 'la partida sigue (queda otro fugitivo)');
  });

  it('quien ha salido ya no recibe posiciones ni eventos de la partida', async () => {
    const { players } = await activeGame();
    const [ana, beto, caro] = players;
    ana.at(0);
    caro.at(20);
    await settle();
    assert.equal((await beto.conn.command({ type: 'leave' })).ok, true);
    const before = beto.raw.length;
    caro.at(25);
    await t.advance(6_000); // envío periódico de posiciones
    await t.advance(3 * 60_000); // pista a los cazadores
    await settle(80);
    const after = beto.raw.slice(before).filter((m) => m.t === 'positions' || m.t === 'event' || m.t === 'snapshot');
    assert.deepEqual(after, [], 'nada después de salir');
  });

  it('si sale el último fugitivo, la partida termina sin ganador por abandono', async () => {
    const { players, state } = await activeGame();
    const [, beto, caro] = players;
    assert.equal((await beto.conn.command({ type: 'leave' })).ok, true);
    assert.equal((await caro.conn.command({ type: 'leave' })).ok, true);
    assert.equal(state().phase, 'FINISHED');
    assert.deepEqual(state().outcome, { winner: null, cause: 'runners_abandoned' });
  });

  it('si sale el anfitrión, otro jugador pasa a ser anfitrión y la partida sigue', async () => {
    const { players, state } = await activeGame();
    const [ana, , , dani] = players;
    assert.equal((await ana.conn.command({ type: 'leave' })).ok, true);
    assert.notEqual(state().hostId, ana.id);
    assert.equal(state().phase, 'ACTIVE', 'queda Dani como cazador');
    await waitFor(() => dani.snap.hostId === state().hostId, 'los demás ven al nuevo anfitrión');
  });
});
