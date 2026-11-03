import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { errorText } from '../../mobile/www/js/game-view.js';
import { gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// Decisiones del 29/10/2026 con el servidor real y clientes reales (net.js) por WebSocket: revancha con
// sorteo nuevo, equipos de todos al terminar (iguales para todos y tras reconectar), nombre de quien sale
// e intervalo de pistas inválido con su motivo. Reloj y ubicaciones SIMULADOS.

let t;
let players = [];
afterEach(async () => {
  for (const p of players.splice(0)) p.conn.close();
  await t?.close();
});

/** Partida terminada por la anfitriona (Ana y Dani cazadores; Beto, Caro y Eva fugitivos). */
async function finishedGame() {
  t = await testServer();
  const created = await room(t, ['Ana', 'Beto', 'Caro', 'Dani', 'Eva']);
  players = created.players;
  const [ana, beto, caro, dani, eva] = players;
  for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner'], [dani, 'hunter'], [eva, 'runner']]) await p.conn.command({ type: 'set_team_pref', pref });
  assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await t.advance(5_000);
  await t.advance(2 * 60_000);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  // Durante la partida, un fugitivo no conoce a los cazadores.
  assert.equal(beto.snap.players.find((v) => v.id === ana.id).team, null, 'durante la partida, oculto');
  assert.equal((await caro.conn.command({ type: 'self_tag', hunterId: ana.id })).ok, true);
  assert.equal((await caro.conn.command({ type: 'leave' })).ok, true); // capturada y se va
  await waitFor(() => ana.snap.players.every((v) => v.id !== caro.id), 'Caro ya no está en la partida');
  assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
  const others = [ana, beto, dani, eva];
  await waitFor(() => others.every((p) => p.snap?.phase === 'FINISHED'), 'final en todos');
  return { code: created.code, ana, beto, caro, dani, eva, others, state: () => t.server.hub.roomStateByCode(created.code) };
}

const finalView = (p) => JSON.stringify(p.snap.players.map((v) => [v.id, v.name, v.team, v.status]));

describe('decisiones del primer playtest (servidor real)', () => {
  it('al terminar, todos ven los equipos de todos y el nombre de quien salió, igual para todos y tras reconectar', async () => {
    const g = await finishedGame();
    const views = g.others.map(finalView);
    assert.equal(new Set(views).size, 1, 'la misma vista final para todos');
    const caro = g.ana.snap.players.find((v) => v.id === g.caro.id);
    assert.deepEqual({ name: caro?.name, team: caro?.team, status: caro?.status }, { name: 'Caro', team: 'runner', status: 'left' });
    assert.equal(g.beto.snap.players.find((v) => v.id === g.ana.id).team, 'hunter', 'ahora sí');
    // Reconexión (como al recargar): la instantánea nueva es la misma.
    const before = finalView(g.beto);
    g.beto.conn.socket.close();
    await waitFor(() => g.beto.conn.status !== 'open', 'Beto desconectado');
    await waitFor(() => g.beto.conn.status === 'open' && g.beto.snap?.phase === 'FINISHED', 'Beto reconectado', 8_000);
    await settle(100);
    assert.equal(finalView(g.beto), before, 'tras reconectar, el mismo resultado');
  });

  it('la revancha empieza con todos en «Sorteo» y el reparto se hace al empezar', async () => {
    const g = await finishedGame();
    assert.equal((await g.ana.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
    for (const p of [g.beto, g.dani, g.eva]) assert.equal((await p.conn.command({ type: 'join_rematch' })).ok, true);
    await waitFor(() => g.others.every((p) => p.snap?.phase === 'LOBBY' && p.snap.gameNo === 2), 'revancha en la sala');
    for (const id of [g.ana.id, g.beto.id, g.dani.id, g.eva.id]) assert.equal(g.state().players[id].teamPref, 'random');
    assert.ok(g.others.every((p) => p.snap.players.every((v) => v.team === null)), 'en la sala nadie ve equipos');
    for (const p of g.others) p.at(0);
    await settle();
    for (const p of g.others) await p.conn.command({ type: 'set_ready', ready: true });
    assert.equal((await g.ana.conn.command({ type: 'start' })).ok, true);
    const teams = g.others.map((p) => g.state().players[p.id].team);
    assert.ok(teams.every((x) => x === 'hunter' || x === 'runner'), 'equipos asignados antes de la cuenta atrás');
    assert.equal(teams.filter((x) => x === 'hunter').length, 1, 'ceil(4/4) = 1 cazador, como siempre');
  });

  it('un intervalo de pistas igual a la duración se rechaza con un motivo comprensible', async () => {
    t = await testServer();
    const created = await room(t, ['Ana', 'Beto']);
    players = created.players;
    const r = await players[0].conn.command({ type: 'configure', config: gameConfig({ durationMs: 10 * 60_000, pingIntervalMs: 10 * 60_000 }) });
    assert.deepEqual({ ok: r.ok, error: r.error, detail: r.detail }, { ok: false, error: 'invalid_config', detail: 'pingIntervalMs' });
    assert.match(errorText(r.error, r.detail), /intervalo de pistas menor que la duración/);
  });
});
