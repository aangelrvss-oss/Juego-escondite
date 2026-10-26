import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { offsetM } from '../../engine/src/geo.ts';
import { GameConnection } from '../../mobile/www/js/net.js';
import { CENTER, gameConfig, memoryStorage, player, settle, testServer, waitFor } from './helpers.mjs';

// Reconexión y recuperación de la partida en los momentos delicados: un jugador está desconectado
// justo cuando ocurre algo que le afecta (le reclaman la captura, termina la cuenta atrás, llega la
// pista) y vuelve después. Servidor real con el reloj controlado; clientes reales (net.js).
// SIMULADO: el corte de red (el cliente no consigue abrir el WebSocket mientras está «sin cobertura»).

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
});

/** Cliente real que se puede dejar «sin cobertura»: mientras dure, cada intento de conexión falla. */
function flakyPlayer(name) {
  const net = { offline: false };
  const events = [];
  const url = t.wsUrl;
  class FlakyWebSocket extends WebSocket {
    constructor(u) {
      super(net.offline ? 'ws://127.0.0.1:9/ws' : u); // puerto cerrado: el intento falla enseguida
    }
  }
  const conn = new GameConnection({ url, storage: memoryStorage(), WebSocketImpl: FlakyWebSocket });
  conn.on('event', (e) => events.push(e));
  conn.start();
  return {
    name,
    conn,
    events,
    get snap() {
      return conn.snapshot;
    },
    get id() {
      return conn.playerId;
    },
    eventsOf: (type) => events.filter((e) => e.type === type),
    at(north, east = 0) {
      const p = offsetM(CENTER, north, east);
      return conn.sendLocation({ lat: p.lat, lng: p.lng, accuracyM: 8, ageMs: 0 });
    },
    /** Corta la conexión y no deja volver hasta `back()`. */
    async drop(others) {
      net.offline = true;
      conn.socket.close();
      await waitFor(() => others[0].snap.players.find((v) => v.id === conn.playerId)?.connected === false, `los demás ven fuera a ${name}`);
    },
    async back(others) {
      net.offline = false;
      await waitFor(
        () => conn.status === 'open' && others[0].snap.players.find((v) => v.id === conn.playerId)?.connected === true,
        `${name} vuelve`,
        12_000,
      );
    },
  };
}

/** Sala con Ana (anfitriona, cazadora) y fugitivos; todos con el cliente «cortable». */
async function game(names = ['Ana', 'Beto', 'Caro'], { toActive = true } = {}) {
  const players = names.map(flakyPlayer);
  clients = players;
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await players[0].conn.create(names[0]);
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === names.length), 'todos en la sala');
  await players[0].conn.command({ type: 'set_team_pref', pref: 'hunter' });
  for (const p of players.slice(1)) await p.conn.command({ type: 'set_team_pref', pref: 'runner' });
  assert.equal((await players[0].conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await players[0].conn.command({ type: 'start' })).ok, true);
  await waitFor(() => players.every((p) => p.snap.phase === 'COUNTDOWN'), 'cuenta atrás');
  if (toActive) {
    await t.advance(5_000);
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap.phase === 'ACTIVE'), 'persecución');
  }
  return players;
}

describe('reconexión en los momentos delicados de la partida', () => {
  it('el fugitivo está sin cobertura cuando le reclaman la captura: al volver ve la reclamación y puede confirmarla', async () => {
    t = await testServer();
    const [ana, beto, caro] = await game();
    ana.at(0);
    beto.at(6);
    await settle();
    await beto.drop([ana]);
    const claim = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
    assert.equal(claim.ok, true, JSON.stringify(claim));
    await t.advance(10_000); // sigue fuera 10 s de los 30 que tiene para responder
    await beto.back([ana, caro]);
    assert.equal(beto.snap.pendingClaimForMe?.claimId, claim.data.claimId, 'la reclamación aparece en su vista al volver');
    await waitFor(() => beto.eventsOf('tag_claimed').length === 1, 'recupera el aviso perdido');
    assert.equal((await beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true })).ok, true);
    await waitFor(() => [ana, beto, caro].every((p) => p.snap.captures.length === 1), 'captura vista por todos');
  });

  it('si no vuelve a tiempo, la reclamación caduca sin captura y al volver no queda nada pendiente', async () => {
    t = await testServer();
    const [ana, beto] = await game(['Ana', 'Beto', 'Caro']);
    ana.at(0);
    beto.at(6);
    await settle();
    await beto.drop([ana]);
    const claim = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
    assert.equal(claim.ok, true);
    await t.advance(31_000);
    await waitFor(() => ana.eventsOf('tag_claim_resolved').some((e) => e.data.result === 'expired'), 'caducada para el cazador');
    await beto.back([ana]);
    assert.equal(beto.snap.pendingClaimForMe, null);
    assert.equal(beto.snap.captures.length, 0);
    assert.equal(beto.snap.players.find((v) => v.id === beto.id).status, 'active', 'sigue jugando');
    assert.equal((await beto.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true })).error, 'claim_not_found');
  });

  it('sin cobertura al terminar la cuenta atrás: al volver conoce su rol y el tiempo de huida, sin ver el de los rivales', async () => {
    t = await testServer();
    const [ana, beto, caro] = await game(['Ana', 'Beto', 'Caro'], { toActive: false });
    await caro.drop([ana]);
    await t.advance(5_000);
    await waitFor(() => ana.snap.phase === 'HEAD_START', 'huida');
    await caro.back([ana, beto]);
    assert.equal(caro.snap.phase, 'HEAD_START');
    assert.equal(caro.snap.headStartEnd, ana.snap.headStartEnd, 'mismo final de huida que los demás');
    assert.equal(caro.snap.players.find((v) => v.id === caro.id).team, 'runner');
    assert.equal(caro.snap.players.find((v) => v.id === ana.id).team, null, 'no ve el rol del cazador');
    await waitFor(() => caro.eventsOf('role_revealed').length === 1, 'recupera la revelación de su rol');
    assert.equal(caro.eventsOf('role_revealed')[0].data.team, 'runner');
  });

  it('el cazador sin cobertura cuando llega la pista: al volver la tiene en su vista', async () => {
    t = await testServer();
    const [ana, beto] = await game();
    beto.at(80, 30);
    await settle();
    await ana.drop([beto]);
    await t.advance(3 * 60_000); // primera pista
    await ana.back([beto]);
    assert.equal(ana.snap.lastPing?.pingNo, 1, 'la última pista está en la instantánea');
    assert.ok(ana.snap.lastPing.entries.some((e) => e.runnerId === beto.id && e.position), 'con la posición del fugitivo');
    assert.equal(beto.snap.lastPing, null, 'el fugitivo no recibe la pista');
  });

  it('recargar la página en plena persecución: vuelve a la partida con la pista, y lo antiguo llega marcado como antiguo', async () => {
    t = await testServer();
    const [ana, beto] = await game();
    beto.at(80, 30);
    await settle();
    await t.advance(3 * 60_000); // primera pista
    await waitFor(() => ana.eventsOf('ping').length === 1, 'pista en vivo');
    assert.equal(ana.eventsOf('ping')[0].ageMs, 0, 'en vivo, sin antigüedad');
    await t.advance(30_000);
    // «Recarga»: la página pierde todo lo que tenía en memoria salvo la sesión guardada.
    ana.conn.close();
    const reloaded = new GameConnection({ url: t.wsUrl, storage: ana.conn.storage });
    clients.push({ conn: reloaded });
    const events = [];
    reloaded.on('event', (e) => events.push(e));
    reloaded.start();
    await waitFor(() => reloaded.snapshot?.phase === 'ACTIVE', 'de vuelta en la partida');
    assert.equal(reloaded.playerId, ana.id, 'misma jugadora, sin volver a entrar');
    assert.equal(reloaded.snapshot.lastPing?.pingNo, 1, 'la pista está en la vista aunque no se repitiera el evento');
    await waitFor(() => events.some((e) => e.type === 'ping'), 'eventos repetidos');
    const ping = events.find((e) => e.type === 'ping');
    assert.ok(ping.ageMs >= 30_000, `la pista repetida llega con su antigüedad (${ping.ageMs} ms)`);
    for (const type of ['role_revealed', 'hunt_started', 'ping']) {
      const e = events.find((x) => x.type === type);
      assert.ok(e && e.ageMs >= 30_000, `${type} repetido, con su antigüedad: ${e?.ageMs}`);
    }
    // Lo único reciente es su propia desconexión y vuelta (hora de la recarga).
    assert.ok(events.filter((e) => e.ageMs < 30_000).every((e) => e.type === 'player_connection'));
  });

  it('una desconexión larga, con más eventos de los que se guardan, se recupera con la vista completa', async () => {
    t = await testServer({ outboxLimit: 3 });
    const [ana, beto, caro] = await game();
    await caro.drop([ana]);
    for (let i = 0; i < 8; i++) {
      // Cambios que generan eventos para todos (conexión de Beto entrando y saliendo).
      beto.conn.socket.close();
      await waitFor(() => beto.conn.status === 'open' && ana.snap.players.find((v) => v.id === beto.id)?.connected, 'Beto vuelve');
    }
    assert.equal((await beto.conn.command({ type: 'self_tag' })).ok, true);
    await caro.back([ana]);
    await waitFor(() => caro.snap.captures.length === 1, 'la captura de Beto aparece en la vista de Caro');
    assert.equal(caro.snap.phase, 'ACTIVE');
    assert.equal(caro.snap.players.find((v) => v.id === beto.id).status, 'captured');
    assert.equal(caro.snap.gameEnd, ana.snap.gameEnd);
  });
});
