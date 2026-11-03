import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { gameConfig, player, room, settle, testServer, waitFor } from './helpers.mjs';

// Caza del zorro (D-057 §3, GAME_MODES_AND_RULES §11.3): regresiones del ciclo de validación del 30/10 con
// servidor real y clientes reales (net.js sobre WebSocket). Todo se comprueba con lo que RECIBE cada cliente
// (mensajes crudos y su instantánea); el estado del servidor solo se consulta para saber a quién le ha
// tocado ser el zorro en el sorteo. SIMULADO: GPS (lecturas de la prueba) y reloj del servidor.
// Fuera de alcance a propósito (decisiones pendientes): V-01 zorro sin GPS con la app viva, V-02 sondeo
// (no se fija ningún código de rechazo), V-03 preferencias de rol (nadie elige su rol), V-10 anfitrión que
// termina la partida (los finales aquí son por tiempo, captura o presencia) y V-21 posición «sin conexión».

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
  t = null;
});

const COUNTDOWN_MS = 5_000;
const HEAD_START_MS = 2 * 60_000;

const stateOf = (code) => t.server.hub.roomStateByCode(code);
const byId = (ps, id) => ps.find((p) => p.id === id);
const finishedOf = (p) => p.raw.filter((m) => m.t === 'event' && m.type === 'game_finished');
const lastPositions = (p) => p.positions.at(-1)?.positions ?? [];

/** Sala de `names` con sorteo (nadie asignado), configurada para el zorro, todos listos y empezada. */
async function foxGame(names) {
  const r = await room(t, names);
  clients.push(...r.players);
  const [host] = r.players;
  assert.equal((await host.conn.command({ type: 'configure', config: gameConfig({ mode: 'fox_hunt' }) })).ok, true);
  for (const p of r.players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
  assert.equal((await host.conn.command({ type: 'start' })).ok, true);
  await waitFor(() => r.players.every((p) => p.snap?.phase === 'COUNTDOWN'), 'cuenta atrás');
  return r;
}

/** Zorro según el sorteo del motor (solo para orientar la prueba; lo que se comprueba es lo recibido). */
function foxOf(code, players) {
  const s = stateOf(code);
  const ids = s.playerOrder.filter((id) => s.players[id].team === 'runner' && s.players[id].status === 'active');
  assert.equal(ids.length, 1, `zorros en el estado: ${ids.length}`);
  return byId(players, ids[0]);
}

async function toActive(players) {
  await t.advance(COUNTDOWN_MS);
  await t.advance(HEAD_START_MS);
  await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
}

/** Equipos que muestra la instantánea de `p`: id → equipo (null si no lo conoce). */
const teamsSeenBy = (p) => Object.fromEntries(p.snap.players.map((x) => [x.id, x.team]));

/** Comprueba que cada cliente recibió exactamente un game_finished (y que no llega otro después). */
async function oneFinishEach(players, outcome) {
  await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final para todos');
  await t.advance(10 * 60_000); // ningún plazo posterior vuelve a terminarla (dentro del periodo de revancha)
  await settle(150);
  for (const p of players) {
    assert.equal(finishedOf(p).length, 1, `${p.name} recibe ${finishedOf(p).length} game_finished`);
    assert.deepEqual(p.snap.outcome, outcome, p.name);
  }
}

describe('Zorro por WebSocket · identidad, posiciones y pistas', () => {
  it('el equipo del zorro llega a todos tras la cuenta atrás y no antes; el zorro ve a los cazadores activos y nunca recibe la pista', async () => {
    t = await testServer();
    const { code, players } = await foxGame(['Ana', 'Beto', 'Caro', 'Dani']);
    const fox = foxOf(code, players);
    const hunters = players.filter((p) => p !== fox);
    // Cuenta atrás: ninguna instantánea recibida muestra el equipo de nadie (tampoco el propio, D-042) y
    // nadie recibe role_revealed.
    for (const p of players) {
      for (const m of p.raw) {
        if (m.t === 'snapshot' && (m.snapshot.phase === 'LOBBY' || m.snapshot.phase === 'COUNTDOWN')) {
          assert.ok(m.snapshot.players.every((x) => x.team === null), `${p.name} conoce un equipo en ${m.snapshot.phase}`);
        }
      }
      assert.equal(p.raw.some((m) => m.t === 'event' && m.type === 'role_revealed'), false, p.name);
    }
    // Tras la cuenta atrás: todos saben quién es el zorro (y que los demás cazan).
    await t.advance(COUNTDOWN_MS);
    await waitFor(() => players.every((p) => p.snap?.phase === 'HEAD_START'), 'huida');
    for (const p of players) {
      const seen = teamsSeenBy(p);
      assert.equal(seen[fox.id], 'runner', `${p.name} no sabe que el zorro es ${fox.name}`);
      for (const h of hunters) assert.equal(seen[h.id], 'hunter', `${p.name} sobre ${h.name}`);
      const revealed = p.raw.filter((m) => m.t === 'event' && m.type === 'role_revealed');
      assert.deepEqual(revealed.map((m) => m.data.team), [p === fox ? 'runner' : 'hunter'], p.name);
    }
    // Posiciones en la huida: el zorro, la de los tres cazadores; cada cazador, solo la de los otros dos.
    hunters.forEach((h, i) => h.at(i * 20));
    fox.at(250);
    await settle();
    await t.advance(6_000);
    await waitFor(() => lastPositions(fox).filter((x) => x.lat !== null).length === 3, 'el zorro ve a los 3 cazadores');
    assert.deepEqual(lastPositions(fox).map((x) => x.playerId).sort(), hunters.map((h) => h.id).sort());
    assert.ok(lastPositions(fox).every((x) => x.reason === 'hunter_seen'));
    for (const h of hunters) {
      await waitFor(() => lastPositions(h).length === 2, `${h.name} recibe a sus compañeros`);
      assert.ok(lastPositions(h).every((x) => x.reason === 'teammate' && x.playerId !== fox.id), h.name);
    }
    // Un cazador abandona: el zorro deja de recibir su posición (solo cazadores ACTIVOS).
    const gone = hunters[2];
    assert.equal((await gone.conn.command({ type: 'leave' })).ok, true);
    gone.conn.forget();
    const stay = hunters.slice(0, 2);
    const nPos = fox.positions.length;
    for (const [i, h] of stay.entries()) h.at(i * 20);
    fox.at(250);
    await settle();
    await t.advance(6_000);
    await waitFor(() => fox.positions.length > nPos, 'posiciones nuevas para el zorro');
    assert.deepEqual(lastPositions(fox).map((x) => x.playerId).sort(), stay.map((h) => h.id).sort());
    // Persecución y primera pista (cada 3 min): a los cazadores, una sola entrada que es el zorro.
    for (const [i, h] of stay.entries()) h.at(i * 20);
    fox.at(250);
    await settle();
    await t.advance(HEAD_START_MS - 6_000 + 3 * 60_000);
    for (const h of stay) {
      await waitFor(() => h.raw.some((m) => m.t === 'event' && m.type === 'ping'), `pista para ${h.name}`);
      for (const m of h.raw.filter((x) => x.t === 'event' && x.type === 'ping')) {
        assert.deepEqual(m.data.ping.entries.map((e) => e.runnerId), [fox.id], h.name);
      }
    }
    assert.ok(fox.raw.some((m) => m.t === 'event' && m.type === 'ping_sent'), 'el zorro recibe el aviso');
    assert.equal(fox.raw.some((m) => m.t === 'event' && m.type === 'ping'), false, 'el zorro nunca recibe la pista');
    assert.equal(fox.snap.lastPing, null);
    // Captura rechazada por el motor (lejos): nada cambia para nadie.
    const [h1, h2] = stay;
    h1.at(0);
    h2.at(0);
    fox.at(250);
    await settle();
    const before = JSON.stringify(stateOf(code).captures) + stateOf(code).phase;
    const far = await h1.conn.command({ type: 'claim_tag', runnerId: fox.id });
    assert.equal(far.ok, false, JSON.stringify(far));
    await settle();
    assert.equal(JSON.stringify(stateOf(code).captures) + stateOf(code).phase, before);
    assert.deepEqual(stateOf(code).claims, {});
    assert.equal(fox.raw.some((m) => m.t === 'event' && m.type === 'tag_claimed'), false, 'el zorro no recibe ninguna reclamación');
    assert.equal(fox.snap.pendingClaimForMe, null);
    // Captura válida: un único game_finished por cliente; ganan los cazadores. (Se deja pasar tiempo para
    // que acercarse 100 m no cuente como un salto de GPS imposible.)
    await t.advance(30_000);
    h2.at(100);
    fox.at(104);
    await settle();
    const ok = await h2.conn.command({ type: 'claim_tag', runnerId: fox.id });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal((await fox.conn.command({ type: 'respond_tag', claimId: ok.data.claimId, accept: true })).ok, true);
    await oneFinishEach([fox, ...stay], { winner: 'hunter', cause: 'all_captured' });
    for (const p of [fox, ...stay]) {
      assert.equal(p.snap.captures.length, 1);
      assert.equal(p.snap.players.filter((x) => x.team === 'runner').length, 1, `${p.name}: un solo zorro en el informe`);
    }
  });

  it('el zorro rechaza la reclamación: la partida sigue igual para todos', async () => {
    t = await testServer();
    const { code, players } = await foxGame(['Ana', 'Beto', 'Caro']);
    const fox = foxOf(code, players);
    const [h1] = players.filter((p) => p !== fox);
    await toActive(players);
    h1.at(100);
    fox.at(104);
    await settle();
    const r = await h1.conn.command({ type: 'claim_tag', runnerId: fox.id });
    assert.equal(r.ok, true, JSON.stringify(r));
    await waitFor(() => fox.snap.pendingClaimForMe?.claimId === r.data.claimId, 'el zorro recibe la reclamación');
    assert.equal((await fox.conn.command({ type: 'respond_tag', claimId: r.data.claimId, accept: false })).ok, true);
    await settle();
    for (const p of players) {
      assert.equal(p.snap.phase, 'ACTIVE', p.name);
      assert.deepEqual(p.snap.captures, [], p.name);
      assert.equal(byId(p.snap.players, fox.id).status, 'active', p.name);
      assert.equal(finishedOf(p).length, 0, p.name);
    }
  });
});

describe('Zorro por WebSocket · finales', () => {
  it('el zorro sin señal 5 min queda fuera: sin ganador, un único game_finished por cliente', async () => {
    t = await testServer();
    const { code, players } = await foxGame(['Ana', 'Beto', 'Caro']);
    const fox = foxOf(code, players);
    const hunters = players.filter((p) => p !== fox);
    await toActive(players);
    fox.conn.close(); // sin red: ni señales ni lecturas
    await waitFor(() => hunters.every((h) => byId(h.snap.players, fox.id)?.connected === false), 'los cazadores lo ven desconectado');
    await t.advance(5 * 60_000 + 20_000);
    await waitFor(() => hunters.every((h) => h.snap?.phase === 'FINISHED'), 'final para los cazadores');
    for (const h of hunters) assert.equal(byId(h.snap.players, fox.id)?.leftReason, 'timeout', h.name);
    await oneFinishEach(hunters, { winner: null, cause: 'runners_abandoned' });
  });

  it('se acaba el tiempo: gana el zorro, un único game_finished por cliente', async () => {
    t = await testServer();
    const { players } = await foxGame(['Ana', 'Beto', 'Caro']);
    await toActive(players);
    await t.advance(20 * 60_000);
    await oneFinishEach(players, { winner: 'runner', cause: 'time_up' });
  });
});

describe('Zorro por WebSocket · salidas en la cuenta atrás', () => {
  it('con 4, sale un cazador en la cuenta atrás: sigue con 3 y todos lo ven así', async () => {
    t = await testServer();
    const { code, players } = await foxGame(['Ana', 'Beto', 'Caro', 'Dani']);
    const s = stateOf(code);
    const leaver = players.find((p) => s.players[p.id].team === 'hunter' && p.id !== s.hostId);
    assert.equal((await leaver.conn.command({ type: 'leave' })).ok, true);
    leaver.conn.forget();
    const rest = players.filter((p) => p !== leaver);
    await t.advance(COUNTDOWN_MS);
    await waitFor(() => rest.every((p) => p.snap?.phase === 'HEAD_START'), 'huida con 3');
    for (const p of rest) {
      const teams = p.snap.players.filter((x) => x.status === 'active').map((x) => x.team).sort();
      assert.deepEqual(teams, ['hunter', 'hunter', 'runner'], p.name);
    }
  });

  for (const who of ['zorro', 'cazador']) {
    it(`con 3, sale el ${who} en la cuenta atrás: vuelve a la sala; (C1) no está en el informe siguiente ni es invitado, y nunca hay dos zorros`, async () => {
      t = await testServer();
      const { code, players } = await foxGame(['Ana', 'Beto', 'Caro']);
      const s = stateOf(code);
      const leaver =
        who === 'zorro' ? foxOf(code, players) : players.find((p) => s.players[p.id].team === 'hunter' && p.id !== s.hostId);
      // El id se guarda antes de forget(): después, `leaver.id` es null y las comprobaciones de abajo no
      // podrían fallar nunca (R-1 de la revisión adversarial).
      const leaverId = leaver.id;
      assert.ok(leaverId);
      assert.equal((await leaver.conn.command({ type: 'leave' })).ok, true);
      leaver.conn.forget();
      const rest = players.filter((p) => p !== leaver);
      await waitFor(() => rest.every((p) => p.snap?.phase === 'LOBBY'), 'vuelta a la sala');
      for (const p of rest) assert.equal(p.snap.players.some((x) => x.id === leaverId), false, `${p.name} aún ve a ${leaver.name}`);
      // Entra otra persona y se juega la partida siguiente hasta el final.
      const eva = player(t, 'Eva');
      clients.push(eva);
      await waitFor(() => eva.conn.status === 'open', 'Eva conectada');
      await eva.conn.join(code, 'Eva');
      const all = [...rest, eva];
      await waitFor(() => all.every((p) => p.snap?.players.length === 3), 'tres en la sala');
      for (const p of all) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
      const host = byId(all, stateOf(code).hostId);
      assert.equal((await host.conn.command({ type: 'start' })).ok, true);
      await toActive(all);
      await t.advance(20 * 60_000);
      await waitFor(() => all.every((p) => p.snap?.phase === 'FINISHED'), 'final');
      for (const p of all) {
        assert.equal(p.snap.players.some((x) => x.id === leaverId), false, `${p.name}: ${leaver.name} en el informe`);
        assert.equal(p.snap.players.filter((x) => x.team === 'runner').length, 1, `${p.name}: dos «zorros» en el informe`);
      }
      // Revancha: quien salió no es invitado.
      assert.equal((await host.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
      await waitFor(() => all.every((p) => p.snap?.phase === 'LOBBY'), 'sala de la revancha');
      for (const p of all) assert.equal(p.snap.players.some((x) => x.id === leaverId), false, `${p.name}: ${leaver.name} invitado`);
      assert.notEqual(stateOf(code).players[leaverId]?.status, 'invited');
    });
  }
});

describe('Zorro por WebSocket · revanchas', () => {
  it('5 revanchas sin y 5 con swapRoles: siempre un zorro para todos los clientes', async () => {
    t = await testServer();
    const { code, players } = await foxGame(['Ana', 'Beto', 'Caro']);
    const foxes = [];
    for (let game = 0; game <= 10; game++) {
      await t.advance(COUNTDOWN_MS);
      await waitFor(() => players.every((p) => p.snap?.phase === 'HEAD_START'), `huida de la partida ${game + 1}`);
      for (const p of players) {
        const teams = p.snap.players.map((x) => x.team).sort();
        assert.deepEqual(teams, ['hunter', 'hunter', 'runner'], `partida ${game + 1}, ${p.name}`);
      }
      foxes.push(foxOf(code, players).name);
      await t.advance(HEAD_START_MS + 20 * 60_000);
      await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), `final de la partida ${game + 1}`);
      if (game === 10) break;
      const host = byId(players, stateOf(code).hostId);
      const swapRoles = game >= 5;
      assert.equal((await host.conn.command({ type: 'rematch', swapRoles })).ok, true);
      await waitFor(() => players.every((p) => p.snap?.phase === 'LOBBY'), 'sala de la revancha');
      for (const p of players) if (p !== host) assert.equal((await p.conn.command({ type: 'join_rematch' })).ok, true);
      for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
      assert.deepEqual(stateOf(code).captures, []);
      assert.equal((await host.conn.command({ type: 'start' })).ok, true);
      await waitFor(() => players.every((p) => p.snap?.phase === 'COUNTDOWN'), 'cuenta atrás de la revancha');
    }
    assert.equal(foxes.length, 11);
  });
});
