import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { gameConfig, room, settle, testServer, waitFor } from './helpers.mjs';

// Capturas de principio a fin con el servidor real y clientes reales (net.js) por WebSocket: lo que la
// auditoría de capturas pedía y aún no estaba cubierto (desconexiones con una reclamación pendiente, cambio
// de fase o final, revancha, estado tras capturar). Las reglas son las del motor: no se cambia ninguna.
// Reloj y ubicaciones SIMULADOS.

let t;
let players = [];
afterEach(async () => {
  for (const p of players.splice(0)) p.conn.close();
  await t?.close();
});

/** Persecución: Ana (anfitriona) y Dani cazadores; Beto y Caro fugitivos; todos con lecturas frescas. */
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
  await fresh();
  return { code: created.code, ana, beto, caro, dani, state: () => t.server.hub.roomStateByCode(created.code) };
}

/** Lecturas nuevas de todos (Ana junto a Beto; Caro lejos). */
async function fresh() {
  const [ana, beto, caro, dani] = players;
  ana.at(0);
  beto.at(5);
  caro.at(300);
  dani.at(-200);
  await settle();
}

describe('capturas: desconexiones, fases y revancha (servidor real)', () => {
  it('el fugitivo pierde la conexión con una reclamación pendiente: al volver la ve y puede confirmarla', async () => {
    const g = await chase();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(claim.ok, true, JSON.stringify(claim));
    g.beto.conn.socket.close(); // corte de red: net.js reconecta y reanuda la sesión solo
    await waitFor(() => g.ana.snap.players.find((p) => p.id === g.beto.id)?.connected === false, 'Beto desconectado para los demás');
    assert.equal(Object.keys(g.state().claims).length, 1, 'la desconexión no cancela la reclamación');
    await waitFor(() => g.beto.conn.status === 'open' && g.beto.snap?.pendingClaimForMe?.claimId === claim.data.claimId, 'reclamación recuperada al reconectar');
    assert.equal((await g.beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true })).ok, true);
    await waitFor(() => g.ana.snap.captures.length === 1, 'captura vista por la cazadora');
    assert.equal(g.state().players[g.beto.id].status, 'captured');
    assert.equal(g.state().captures[0].hunterId, g.ana.id);
  });

  it('si el fugitivo no vuelve en 30 s, la reclamación caduca: no hay captura y la cazadora lo sabe', async () => {
    const g = await chase();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(claim.ok, true);
    g.beto.conn.close(); // sin reconexión
    await settle();
    await t.advance(30_001);
    await waitFor(() => g.ana.events.some((e) => e.type === 'tag_claim_resolved' && e.data.result === 'expired'), 'aviso de caducidad');
    assert.deepEqual(g.state().claims, {});
    assert.equal(g.state().players[g.beto.id].status, 'active');
    assert.equal(g.state().captures.length, 0);
  });

  it('la cazadora se desconecta con su reclamación pendiente: la confirmación del fugitivo vale y la ve al volver', async () => {
    const g = await chase();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(claim.ok, true);
    g.ana.conn.socket.close();
    await waitFor(() => g.beto.snap.players.find((p) => p.id === g.ana.id)?.connected === false, 'Ana desconectada');
    assert.equal((await g.beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true })).ok, true);
    await waitFor(() => g.ana.conn.status === 'open' && g.ana.snap?.captures.length === 1, 'Ana ve la captura al reconectar');
    assert.equal(g.ana.snap.captures[0].hunterId, g.ana.id);
  });

  it('fin de la partida con una reclamación pendiente: se descarta, no captura y después nada se puede reclamar', async () => {
    const g = await chase();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(claim.ok, true);
    assert.equal((await g.ana.conn.command({ type: 'end_game' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final');
    assert.deepEqual(g.state().claims, {}, 'el final descarta las reclamaciones');
    assert.equal((await g.beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true })).error, 'claim_not_found');
    assert.equal((await g.dani.conn.command({ type: 'claim_tag', runnerId: g.caro.id })).error, 'wrong_phase');
    assert.equal((await g.caro.conn.command({ type: 'self_tag' })).error, 'wrong_phase');
    assert.equal(g.state().captures.length, 0);
    assert.equal(g.beto.snap.pendingClaimForMe, null, 'ya no se le pregunta');
  });

  it('el tiempo se acaba con una reclamación pendiente: gana quien ganaba y la reclamación no captura', async () => {
    const g = await chase();
    await t.advance(20 * 60_000 - 20_000); // a 20 s del final
    await fresh();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(claim.ok, true, JSON.stringify(claim));
    await t.advance(20_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final por tiempo');
    assert.equal(g.state().outcome.winner, 'runner');
    assert.equal((await g.beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true })).error, 'claim_not_found');
    assert.equal(g.state().captures.length, 0);
  });

  it('una reclamación de la partida anterior no puede capturar en la revancha', async () => {
    const g = await chase();
    const old = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    assert.equal(old.ok, true);
    assert.equal((await g.ana.conn.command({ type: 'end_game' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final');
    assert.equal((await g.ana.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
    for (const p of [g.beto, g.caro, g.dani]) assert.equal((await p.conn.command({ type: 'join_rematch' })).ok, true);
    assert.equal((await g.ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
    for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
    assert.equal((await g.ana.conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000);
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE' && p.snap.gameNo === 2), 'persecución de la revancha');
    const r = await g.beto.conn.command({ type: 'respond_tag', claimId: old.data.claimId, accept: true });
    assert.equal(r.error, 'claim_not_found');
    assert.equal(g.state().captures.length, 0);
    assert.equal(g.state().players[g.beto.id].status, 'active');
  });

  it('tras una captura: el capturado deja de llegar a su compañero, pasa a espectador y no se puede volver a capturar', async () => {
    const g = await chase();
    const claim = await g.ana.conn.command({ type: 'claim_tag', runnerId: g.beto.id });
    await g.beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true });
    await waitFor(() => g.beto.snap.players.find((p) => p.id === g.beto.id)?.status === 'captured', 'Beto capturado en su vista');
    const positionsBefore = g.caro.positions.length;
    await t.advance(3_500);
    await fresh();
    await t.advance(5_000); // envío periódico de posiciones
    await waitFor(() => g.caro.positions.length > positionsBefore, 'nuevas posiciones para Caro');
    const last = g.caro.positions.at(-1).positions;
    assert.ok(!last.some((p) => p.playerId === g.beto.id), 'un capturado ya no aparece en el mapa de su compañera');
    assert.equal((await g.dani.conn.command({ type: 'claim_tag', runnerId: g.beto.id })).error, 'already_captured');
    assert.equal((await g.beto.conn.command({ type: 'self_tag' })).error, 'already_captured');
    assert.equal(g.state().captures.length, 1, 'la captura no se duplica');
    // Como espectador recibe a todos con 60 s de retraso (no al instante).
    await t.advance(61_000);
    await fresh();
    await t.advance(5_000);
    await waitFor(() => g.beto.positions.some((m) => m.positions.some((p) => p.reason === 'spectator_delayed')), 'posiciones de espectador');
  });
});
