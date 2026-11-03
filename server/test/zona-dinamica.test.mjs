import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { zoneNow } from '../../mobile/www/js/game-view.js';
import { T0, gameConfig, player, settle, testServer, waitFor } from './helpers.mjs';

// Zona dinámica de extremo a extremo (ciclo del 1/11/2026): servidor real, conexiones WebSocket reales y
// el cliente de red del móvil (net.js). El reloj es el de la prueba: los 5 min no se esperan.

const P = 5 * 60_000;
const HEAD = 2 * 60_000;

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
  t = undefined;
});

async function dynamicGame(names, { radiusM = 500, mode = 'classic', teams = {}, wall = false } = {}) {
  t = await testServer(wall ? { wallNow: () => t?.clock.t ?? T0 } : {});
  const players = names.map((n) => player(t, n));
  clients.push(...players);
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await players[0].conn.create(names[0]);
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === names.length), 'todos en la sala');
  const config = gameConfig({ mode, dynamicZone: true, zone: [{ fromOffsetMs: 0, center: gameConfig().zone[0].center, radiusM }] });
  const r = await players[0].conn.command({ type: 'configure', config });
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const [name, team] of Object.entries(teams)) {
    const target = players.find((p) => p.name === name);
    assert.equal((await players[0].conn.command({ type: 'assign_team', targetId: target.id, pref: team })).ok, true);
  }
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  const started = await players[0].conn.command({ type: 'start' });
  assert.equal(started.ok, true, JSON.stringify(started));
  await t.advance(5_000 + HEAD);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
  return { code, players };
}

const stateOf = (code) => t.server.hub.roomStateByCode(code);
const phasesOf = (p) => p.eventsOf('zone_phase').map((e) => e.data.phase);
/** Zona que dibuja el móvil de `p` a la hora del servidor de la prueba. */
const drawn = (p) => zoneNow(p.snap, t.clock.t);

describe('zona dinámica: servidor y móviles', () => {
  it('a los 5 min empieza la fase 1 para todos a la vez; todos tienen el mismo plan y dibujan el mismo círculo', async () => {
    const { code, players } = await dynamicGame(['Ana', 'Beto', 'Caro'], { teams: { Ana: 'hunter', Beto: 'runner', Caro: 'runner' } });
    const start = stateOf(code).activeStart;
    for (const p of players) assert.equal(p.snap.zonePlan.length, 2, `${p.name}: solo la zona inicial antes de la fase 1`);
    await t.advance(P - 1_000);
    for (const p of players) assert.equal(p.eventsOf('zone_phase').length, 0);
    await t.advance(1_000);
    for (const p of players) await waitFor(() => phasesOf(p).length === 1, `${p.name} recibe la fase 1`);
    for (const p of players) {
      const [e] = p.eventsOf('zone_phase');
      assert.equal(e.at, start + P, 'a su hora exacta');
      assert.deepEqual(e.data, { phase: 1, radiusM: 425, endsAt: start + 2 * P, last: false });
      assert.equal(p.snap.zonePlan.length, 3, 'la instantánea trae el destino de la fase');
      assert.deepEqual(p.snap.zonePlan, players[0].snap.zonePlan);
    }
    await t.advance(150_000);
    await settle(50);
    const circles = players.map(drawn);
    for (const c of circles) assert.deepEqual(c, circles[0]);
    assert.equal(circles[0].radiusM, 462.5, 'a mitad de la fase, a mitad de camino');
  });

  it('reconexión durante una fase: el móvil recupera el mismo plan y la fase sigue su hora (no reinicia los 5 min)', async () => {
    const { code, players } = await dynamicGame(['Ana', 'Beto'], { teams: { Ana: 'hunter', Beto: 'runner' } });
    const [ana, beto] = players;
    const start = stateOf(code).activeStart;
    await t.advance(P + 60_000);
    await waitFor(() => phasesOf(beto).length === 1, 'fase 1');
    beto.conn.close();
    await waitFor(() => stateOf(code).players[beto.id].connected === false, 'corte');
    await t.advance(90_000);
    beto.conn.start();
    await waitFor(() => beto.conn.status === 'open' && beto.snap?.phase === 'ACTIVE', 'Beto vuelve');
    await settle(50);
    assert.deepEqual(beto.snap.zonePlan, ana.snap.zonePlan);
    assert.deepEqual(drawn(beto), drawn(ana));
    assert.equal(drawn(beto).target.at, start + 2 * P, 'el destino se alcanza a los 10 min, no 5 min después de volver');
    assert.equal(phasesOf(beto).length, 1, 'el aviso no se repite');
  });

  it('móvil sin conexión durante un cambio de fase: al volver recibe la fase que se perdió y el mismo círculo que los demás', async () => {
    const { code, players } = await dynamicGame(['Ana', 'Beto'], { teams: { Ana: 'hunter', Beto: 'runner' } });
    const [ana, beto] = players;
    await t.advance(2 * P - 30_000);
    beto.conn.close();
    await waitFor(() => stateOf(code).players[beto.id].connected === false, 'corte');
    await t.advance(60_000); // la fase 2 empieza mientras Beto no tiene conexión (bloqueado, sin red…)
    await waitFor(() => phasesOf(ana).length === 2, 'Ana recibe la fase 2');
    assert.equal(beto.snap.zonePlan.length, 3, 'el móvil de Beto aún no sabe el destino de la fase 2');
    // Mientras tanto, su móvil mantiene el último destino conocido: no se inventa ni extrapola la zona.
    assert.equal(drawn(beto).radiusM, 425);
    beto.conn.start();
    await waitFor(() => beto.conn.status === 'open' && beto.snap?.zonePlan.length === 4, 'Beto vuelve con el plan al día');
    await settle(50);
    assert.deepEqual(drawn(beto), drawn(ana));
    assert.ok(phasesOf(beto).includes(2), 'se le reenvía el aviso perdido (reanudación con lastSeq)');
  });

  it('servidor suspendido 11 min en plena persecución: al despertar aplica cada fase a su hora, y el círculo es el de la hora real', async () => {
    const { code, players } = await dynamicGame(['Ana', 'Beto'], { teams: { Ana: 'hunter', Beto: 'runner' }, wall: true });
    const start = stateOf(code).activeStart;
    await t.advance(60_000);
    t.clock.t += 11 * 60_000; // el portátil duerme: nadie procesa nada
    t.server.pump();
    await settle(100);
    for (const p of players) {
      await waitFor(() => phasesOf(p).length === 2, `${p.name}: fases 1 y 2`);
      assert.deepEqual(p.eventsOf('zone_phase').map((e) => e.at - start), [P, 2 * P], 'cada fase con su hora, no la del despertar');
    }
    const st = stateOf(code);
    assert.equal(st.phase, 'ACTIVE');
    assert.equal(st.zonePhase, 2);
    // 12 min de persecución: fase 2, a 2/5 de su camino de 425 a 361 m.
    assert.equal(drawn(players[0]).radiusM, 425 + (361 - 425) * (2 / 5));
  });

  it('el servidor valida el radio inicial y no acepta zonas que no haya calculado él', async () => {
    t = await testServer();
    const host = player(t, 'Ana');
    clients.push(host);
    await waitFor(() => host.conn.status === 'open', 'conexión');
    await host.conn.create('Ana');
    const center = gameConfig().zone[0].center;
    const send = (config) => host.conn.command({ type: 'configure', config });
    for (const radiusM of [50, 100, 250, 500, 1_000]) {
      const r = await send(gameConfig({ dynamicZone: true, zone: [{ fromOffsetMs: 0, center, radiusM }] }));
      assert.equal(r.ok, true, `${radiusM} m`);
      await waitFor(() => host.snap?.config?.zone[0].radiusM === radiusM, 'todos reciben la configuración');
      assert.equal(host.snap.config.dynamicZone, true);
    }
    assert.deepEqual(await send(gameConfig({ zone: [{ fromOffsetMs: 0, center, radiusM: 30 }] })), { ok: false, error: 'invalid_config', detail: 'zone' });
    const twoZones = [{ fromOffsetMs: 0, center, radiusM: 500 }, { fromOffsetMs: P, center, radiusM: 50 }];
    assert.deepEqual(await send(gameConfig({ dynamicZone: true, zone: twoZones })), { ok: false, error: 'invalid_config', detail: 'zone' });
    assert.equal((await send({ ...gameConfig(), zonePlan: twoZones })).error, 'invalid_command', 'el plan no lo manda el cliente');
    assert.equal((await send({ ...gameConfig(), dynamicZone: 'sí' })).error, 'invalid_command');
  });

  it('revancha: la sala vuelve sin plan y la partida nueva empieza con su propia fase 1 a los 5 min', async () => {
    const { code, players } = await dynamicGame(['Ana', 'Beto'], { teams: { Ana: 'hunter', Beto: 'runner' } });
    const [ana, beto] = players;
    await t.advance(P);
    await waitFor(() => phasesOf(ana).length === 1, 'fase 1');
    const firstPlan = ana.snap.zonePlan;
    assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final');
    assert.equal((await ana.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
    await waitFor(() => beto.snap?.phase === 'LOBBY', 'revancha');
    for (const p of players) assert.equal(p.snap.zonePlan, null, `${p.name}: sin restos de la zona anterior`);
    assert.equal((await beto.conn.command({ type: 'join_rematch' })).ok, true);
    for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000 + HEAD);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE' && p.snap.gameNo === 2), 'segunda partida');
    const start2 = stateOf(code).activeStart;
    for (const p of players) assert.equal(p.snap.zonePlan.length, 2);
    await t.advance(P);
    for (const p of players) {
      await waitFor(() => p.eventsOf('zone_phase').some((e) => e.at === start2 + P), `${p.name}: fase 1 de la revancha`);
      assert.deepEqual(p.snap.zonePlan, ana.snap.zonePlan);
    }
    assert.notDeepEqual(ana.snap.zonePlan[2].center, firstPlan[2].center, 'destino nuevo: otra semilla');
  });

  it('Infección y Caza del zorro: la zona evoluciona igual para todos los jugadores', async () => {
    for (const [mode, names, teams] of [
      ['infection', ['Ana', 'Beto', 'Caro', 'Dani'], { Ana: 'hunter', Beto: 'runner', Caro: 'runner', Dani: 'runner' }],
      ['fox_hunt', ['Ana', 'Beto', 'Zoe'], { Ana: 'hunter', Beto: 'hunter', Zoe: 'runner' }],
    ]) {
      const { players } = await dynamicGame(names, { mode, teams, radiusM: 250 });
      await t.advance(P + 60_000);
      for (const p of players) await waitFor(() => phasesOf(p).length === 1, `${mode}: ${p.name}`);
      await settle(50);
      for (const p of players) assert.deepEqual(drawn(p), drawn(players[0]), `${mode}: ${p.name}`);
      for (const c of clients.splice(0)) c.conn.close();
      await t.close();
      t = undefined;
    }
  });
});
