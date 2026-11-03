import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { gameConfig, player, settle, testServer, waitFor } from './helpers.mjs';

// Caza del zorro, variante «Mr. X» (D-057), con servidor real y clientes reales (net.js): el zorro recibe
// las posiciones de los cazadores en directo; los cazadores, la del zorro solo en cada pista (y si sale de
// la zona); el final es igual para todos. SIMULADO: GPS (lecturas de la prueba) y reloj del servidor.

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
});

/** Ana (anfitriona) y Beto cazadores; Zoe zorro (asignada a mano). En la persecución. */
async function foxRoom() {
  const players = ['Ana', 'Beto', 'Zoe'].map((n) => player(t, n));
  clients = players;
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await players[0].conn.create('Ana');
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === 3), 'todos en la sala');
  const [ana, , zoe] = players;
  assert.equal((await ana.conn.command({ type: 'assign_team', targetId: zoe.id, pref: 'runner' })).ok, true);
  assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig({ mode: 'fox_hunt' }) })).ok, true);
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await t.advance(5_000);
  await t.advance(2 * 60_000);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  return players;
}

const lastPositions = (p) => p.positions.at(-1)?.positions ?? [];

describe('Caza del zorro por WebSocket', () => {
  it('el zorro ve a los cazadores en directo; ellos se ven entre sí y al zorro solo por las pistas', async () => {
    t = await testServer();
    const [ana, beto, zoe] = await foxRoom();
    assert.equal(zoe.snap.players.find((p) => p.id === zoe.id).team, 'runner');
    assert.equal(ana.snap.players.find((p) => p.id === zoe.id).team, 'runner', 'todos saben quién es el zorro');
    ana.at(0);
    beto.at(30);
    zoe.at(200);
    await settle(); // que las lecturas lleguen antes de adelantar el reloj
    await t.advance(6_000);
    await waitFor(() => lastPositions(zoe).filter((x) => x.lat !== null).length === 2, 'Zoe ve a Ana y a Beto');
    assert.deepEqual(lastPositions(zoe).map((x) => x.reason), ['hunter_seen', 'hunter_seen']);
    await waitFor(() => lastPositions(ana).length === 1, 'Ana recibe sus posiciones');
    assert.deepEqual(lastPositions(ana).map((x) => [x.playerId, x.reason]), [[beto.id, 'teammate']]);
    // Pista: posición exacta de Zoe para los cazadores; para Zoe, solo el aviso.
    for (const [p, n] of [[ana, 0], [beto, 30], [zoe, 200]]) p.at(n);
    await t.advance(3 * 60_000);
    await waitFor(() => ana.snap.lastPing?.pingNo === 1 && beto.snap.lastPing?.pingNo === 1, 'pista para los cazadores');
    assert.deepEqual(ana.snap.lastPing.entries.map((e) => e.runnerId), [zoe.id]);
    assert.ok(ana.snap.lastPing.entries[0].position);
    assert.equal(zoe.snap.lastPing, null);
    assert.ok(zoe.eventsOf('ping_sent').length >= 1);
    assert.ok(zoe.raw.every((m) => m.type !== 'ping'), 'Zoe nunca recibe el evento de la pista');
  });

  it('si atrapan al zorro, la partida termina y el final es igual para todos', async () => {
    t = await testServer();
    const [ana, beto, zoe] = await foxRoom();
    beto.at(100);
    zoe.at(104);
    await settle();
    const r = await beto.conn.command({ type: 'claim_tag', runnerId: zoe.id });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await zoe.conn.command({ type: 'respond_tag', claimId: r.data.claimId, accept: true })).ok, true);
    await waitFor(() => [ana, beto, zoe].every((p) => p.snap.phase === 'FINISHED'), 'final');
    for (const p of [ana, beto, zoe]) assert.deepEqual(p.snap.outcome, { winner: 'hunter', cause: 'all_captured' });
    assert.match(ana.snap.rulesVersion, /^zorro\//);
  });
});
