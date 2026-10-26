import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// Guía de criterio §6 (capturas): «probar reclamaciones simultáneas, mensajes retrasados, repetición
// de comandos y casos dudosos». El motor ya lo prueba de forma aislada (capture.test.ts); aquí, con el
// servidor real y mensajes que se cruzan de verdad por WebSocket. Reloj y ubicaciones SIMULADOS.

let t;
let players = [];
afterEach(async () => {
  for (const p of players.splice(0)) p.conn.close();
  await t?.close();
});

/** Partida en persecución: Ana y Dani cazadores, Beto y Caro fugitivos; todos con lecturas frescas y cerca. */
async function chase() {
  t = await testServer();
  const created = await room(t, ['Ana', 'Beto', 'Caro', 'Dani']);
  players = created.players;
  const [ana, beto, caro, dani] = players;
  for (const [p, pref] of [[ana, 'hunter'], [beto, 'runner'], [caro, 'runner'], [dani, 'hunter']]) await p.conn.command({ type: 'set_team_pref', pref });
  assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await t.advance(5_000);
  await t.advance(2 * 60_000);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  ana.at(0);
  dani.at(2);
  beto.at(5);
  caro.at(300);
  await settle();
  return { code: created.code, ana, beto, caro, dani, state: () => t.server.hub.roomStateByCode(created.code) };
}

const rawResult = (p, id) => p.raw.find((m) => m.t === 'result' && m.id === id)?.result;
const send = (p, id, cmd) => p.conn.socket.send(JSON.stringify({ t: 'cmd', id, cmd }));

describe('capturas con mensajes que se cruzan (servidor real)', () => {
  it('dos cazadores reclaman al mismo fugitivo a la vez: una reclamación, la otra «ya pendiente»', async () => {
    const g = await chase();
    send(g.ana, 'c-ana', { type: 'claim_tag', runnerId: g.beto.id });
    send(g.dani, 'c-dani', { type: 'claim_tag', runnerId: g.beto.id });
    await waitFor(() => rawResult(g.ana, 'c-ana') && rawResult(g.dani, 'c-dani'), 'las dos respuestas');
    const results = [rawResult(g.ana, 'c-ana'), rawResult(g.dani, 'c-dani')];
    assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
    assert.equal(results.find((r) => !r.ok).error, 'already_pending');
    assert.equal(Object.keys(g.state().claims).length, 1);
    await waitFor(() => g.beto.eventsOf('tag_claimed').length === 1, 'un solo aviso al fugitivo');
    await settle(100);
    assert.equal(g.beto.eventsOf('tag_claimed').length, 1);
  });

  it('el fugitivo se declara capturado mientras le reclaman: una sola captura, atribuida a quien reclamaba', async () => {
    const g = await chase();
    send(g.ana, 'c-ana', { type: 'claim_tag', runnerId: g.beto.id });
    send(g.beto, 'self', { type: 'self_tag' });
    await waitFor(() => rawResult(g.ana, 'c-ana') && rawResult(g.beto, 'self'), 'las dos respuestas');
    assert.equal(rawResult(g.beto, 'self').ok, true);
    const s = g.state();
    assert.equal(s.captures.length, 1, 'una captura, no dos');
    assert.equal(s.captures[0].runnerId, g.beto.id);
    if (rawResult(g.ana, 'c-ana').ok) assert.equal(s.captures[0].hunterId, g.ana.id, 'si la reclamación llegó antes, la captura es suya');
    else assert.equal(rawResult(g.ana, 'c-ana').error, 'already_captured');
    assert.deepEqual(s.claims, {}, 'no queda ninguna reclamación colgando');
  });

  it('una confirmación que llega después de caducar la reclamación no captura', async () => {
    const g = await chase();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(claim.ok, true);
    await t.advance(30_001); // caduca en el servidor antes de que llegue la respuesta
    const late = await g.beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true });
    assert.equal(late.error, 'claim_not_found');
    assert.equal(g.state().captures.length, 0);
    assert.equal(g.state().players[g.beto.id].status, 'active');
  });

  it('la confirmación repetida (mismo id o id nuevo) produce una sola captura', async () => {
    const g = await chase();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    send(g.beto, 'r-1', { type: 'respond_tag', claimId: claim.data.claimId, accept: true });
    send(g.beto, 'r-1', { type: 'respond_tag', claimId: claim.data.claimId, accept: true });
    send(g.beto, 'r-2', { type: 'respond_tag', claimId: claim.data.claimId, accept: true });
    await waitFor(() => g.beto.raw.filter((m) => m.t === 'result' && (m.id === 'r-1' || m.id === 'r-2')).length === 3, 'tres respuestas');
    const r1 = g.beto.raw.filter((m) => m.t === 'result' && m.id === 'r-1').map((m) => m.result);
    assert.deepEqual(r1[0], r1[1], 'el mismo id recibe la misma respuesta');
    assert.equal(r1[0].ok, true);
    assert.equal(rawResult(g.beto, 'r-2').error, 'claim_not_found');
    assert.equal(g.state().captures.length, 1);
    await settle(100);
    assert.equal(g.ana.eventsOf('runner_captured').length, 1, 'un solo aviso de captura');
  });

  it('una lectura retrasada (medida hace 20 s) no hace actual al fugitivo: la reclamación se rechaza', async () => {
    const g = await chase();
    await t.advance(16_000); // las lecturas de todos dejan de ser actuales
    g.ana.at(0);
    g.beto.at(5, { age: 20_000 }); // llega ahora, pero se midió hace 20 s (sin cobertura)
    await settle();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(claim.error, 'target_location_stale');
    assert.deepEqual(g.state().claims, {});
  });
});
