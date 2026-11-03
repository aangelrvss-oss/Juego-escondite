import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { gameConfig, player, settle, testServer, waitFor } from './helpers.mjs';

// Infección (D-057) con servidor real y clientes reales (net.js): la conversión llega a todos, la
// tarjeta nueva solo al convertido; tras convertirse, el tráfico que recibe es el de un cazador (nada de
// fugitivos ni de la pista anterior) y lo conserva al reconectar; el final es igual para todos.
// SIMULADO: GPS (lecturas enviadas por la prueba) y reloj del servidor.

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
});

/** Ana cazadora inicial; Beto, Caro y Dani fugitivos (a mano). En la persecución. */
async function infection() {
  const names = ['Ana', 'Beto', 'Caro', 'Dani'];
  const players = names.map((n) => player(t, n));
  clients = players;
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await players[0].conn.create('Ana');
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === 4), 'todos en la sala');
  await players[0].conn.command({ type: 'set_team_pref', pref: 'hunter' });
  for (const p of players.slice(1)) await p.conn.command({ type: 'set_team_pref', pref: 'runner' });
  assert.equal((await players[0].conn.command({ type: 'configure', config: gameConfig({ mode: 'infection' }) })).ok, true);
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await players[0].conn.command({ type: 'start' })).ok, true);
  await t.advance(5_000);
  await t.advance(2 * 60_000);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  return players;
}

const positionIds = (p) => (p.positions.at(-1)?.positions ?? []).map((x) => x.playerId).sort();

describe('Infección por WebSocket', () => {
  it('la configuración con el modo llega a todos y la partida guarda sus reglas', async () => {
    t = await testServer();
    const [ana, beto] = await infection();
    assert.equal(beto.snap.config.mode, 'infection');
    assert.match(ana.snap.rulesVersion, /^infeccion\//);
  });

  it('conversión: todos lo saben, solo él recibe su rol nuevo; desde entonces recibe lo de un cazador', async () => {
    t = await testServer();
    const [ana, beto, caro, dani] = await infection();
    for (const [p, n] of [[ana, 0], [beto, 4], [caro, 150], [dani, 160]]) p.at(n);
    await t.advance(3 * 60_000 + 1_000); // primera pista (con Beto, Caro y Dani)
    await waitFor(() => ana.snap.lastPing?.pingNo === 1, 'pista 1');
    for (const [p, n] of [[ana, 0], [beto, 4], [caro, 150], [dani, 160]]) p.at(n);
    await settle();
    const r = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal((await beto.conn.command({ type: 'respond_tag', claimId: r.data.claimId, accept: true })).ok, true);
    for (const p of [ana, caro, dani]) await waitFor(() => p.eventsOf('runner_captured').some((e) => e.data.runnerId === beto.id && e.data.converted), `${p.name} sabe que Beto está infectado`);
    await waitFor(() => beto.eventsOf('role_changed').length === 1, 'Beto recibe su rol nuevo');
    assert.equal(beto.eventsOf('role_changed')[0].data.team, 'hunter');
    for (const p of [ana, caro, dani]) assert.equal(p.eventsOf('role_changed').length, 0);
    assert.equal(beto.snap.players.find((p) => p.id === beto.id).team, 'hunter');
    assert.equal(beto.snap.players.find((p) => p.id === beto.id).status, 'active');
    assert.ok(beto.snap.canTagFrom > 0);
    assert.equal(beto.snap.lastPing, null, 'sin la pista anterior a su conversión');
    // Posiciones: Beto ve a Ana (cazadora), no a Caro ni a Dani; ellos ya no lo ven.
    beto.at(4);
    await settle(); // que la lectura llegue antes de adelantar el reloj
    await t.advance(6_000);
    await waitFor(() => positionIds(beto).join() === [ana.id].join(), 'Beto ve solo a los cazadores');
    assert.deepEqual(positionIds(caro), [dani.id]);
    assert.deepEqual(positionIds(ana), [beto.id]);
    // Reclamar antes de 60 s: rechazado.
    assert.equal((await beto.conn.command({ type: 'claim_tag', runnerId: caro.id })).error, 'tag_cooldown');
    // Al reconectar sigue siendo cazador y sin la pista anterior.
    beto.conn.socket.close();
    await waitFor(() => beto.conn.status === 'open' && beto.snap.players.find((p) => p.id === beto.id).team === 'hunter', 'Beto reconecta como cazador');
    assert.equal(beto.snap.lastPing, null);
    // La siguiente pista sí le llega.
    for (const [p, n] of [[caro, 150], [dani, 160]]) p.at(n);
    await t.advance(3 * 60_000);
    await waitFor(() => beto.snap.lastPing?.pingNo === 2, 'Beto recibe la pista 2');
    assert.deepEqual(beto.snap.lastPing.entries.map((e) => e.runnerId).sort(), [caro.id, dani.id].sort());
  });

  it('si caen todos, el final es el mismo para todos: ganan los cazadores, convertidos incluidos', async () => {
    t = await testServer();
    const [ana, beto, caro, dani] = await infection();
    assert.equal((await beto.conn.command({ type: 'self_tag', hunterId: ana.id })).ok, true);
    assert.equal((await caro.conn.command({ type: 'self_tag', hunterId: beto.id })).ok, true);
    assert.equal((await dani.conn.command({ type: 'self_tag', hunterId: beto.id })).ok, true);
    await waitFor(() => [ana, beto, caro, dani].every((p) => p.snap.phase === 'FINISHED'), 'final');
    for (const p of [ana, beto, caro, dani]) {
      assert.deepEqual(p.snap.outcome, { winner: 'hunter', cause: 'all_captured' });
      assert.deepEqual(p.snap.captures, ana.snap.captures);
      assert.ok(p.snap.players.every((x) => x.team === 'hunter'));
    }
  });
});
