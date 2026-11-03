import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GameConnection } from '../../mobile/www/js/net.js';
import { T0, gameConfig, memoryStorage, player, settle, testServer, waitFor } from './helpers.mjs';

// Ciclo de desconexión y reconexión (31/10/2026). En la prueba física con dos móviles, los dos perdieron
// la conexión en el mismo segundo: el portátil que hacía de servidor se suspendió (Windows, 00:10:51) y
// el servidor no procesó nada en 3 h. Estas pruebas cubren lo que no tenía prueba (la suspensión del propio
// servidor, D-057 §1: «el plazo empieza de cero para todos») y la reconexión en cada modo y con revancha.

let t;
let clients = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.conn.close();
  await t?.close();
  t = undefined;
});

/**
 * Servidor de prueba cuyo reloj de pared es el reloj de la prueba. Funcionando, el servidor lo mira a
 * pasos de 20 s como mucho (`advance`); suspendido, el reloj salta de golpe sin que el servidor haga nada
 * en medio, y al despertar lo nota (como en Windows: Node no corre mientras el portátil duerme).
 */
async function serverWithWall() {
  const diag = [];
  t = await testServer({ wallNow: () => t?.clock.t ?? T0, diag: (r) => diag.push(r) });
  /** El portátil se suspende `ms`: nadie procesa nada ni da señales; al despertar, el servidor despierta. */
  const suspend = async (ms) => {
    t.clock.t += ms;
    t.server.pump();
    await settle(80);
  };
  return { diag, suspend };
}

async function startedRoom(names, mode = 'classic', teams = {}) {
  const players = names.map((n) => player(t, n));
  clients.push(...players);
  await waitFor(() => players.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await players[0].conn.create(names[0]);
  for (const p of players.slice(1)) await p.conn.join(code, p.name);
  await waitFor(() => players.every((p) => p.snap?.players.length === names.length), 'todos en la sala');
  assert.equal((await players[0].conn.command({ type: 'configure', config: gameConfig({ mode }) })).ok, true);
  for (const [name, team] of Object.entries(teams)) {
    const target = players.find((p) => p.name === name);
    assert.equal((await players[0].conn.command({ type: 'assign_team', targetId: target.id, pref: team })).ok, true);
  }
  for (const p of players) await p.conn.command({ type: 'set_ready', ready: true });
  const started = await players[0].conn.command({ type: 'start' });
  assert.equal(started.ok, true, JSON.stringify(started));
  await t.advance(5_000);
  return { code, players };
}

const stateOf = (code) => t.server.hub.roomStateByCode(code);
const byName = (players, name) => players.find((p) => p.name === name);

describe('suspensión del propio servidor (portátil suspendido)', () => {
  it('6 min suspendido en plena persecución: nadie queda fuera, el plazo de 30 s / 5 min empieza de cero y queda en el diagnóstico', async () => {
    const { diag, suspend } = await serverWithWall();
    const { code, players } = await startedRoom(['Ana', 'Beto', 'Caro'], 'classic', { Ana: 'hunter', Beto: 'runner', Caro: 'runner' });
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
    await suspend(6 * 60_000);
    const st = stateOf(code);
    assert.equal(st.phase, 'ACTIVE');
    for (const p of players) {
      assert.equal(st.players[p.id].status, 'active', `${p.name} sigue en la partida`);
      assert.equal(st.players[p.id].away, false, `${p.name} no aparece «sin conexión» por la suspensión`);
    }
    const rec = diag.find((r) => r.k === 'server_suspended');
    assert.ok(rec, 'la suspensión queda en el registro de diagnóstico');
    assert.equal(rec.gapS, 360);
    assert.equal(rec.players, 3);
    // Tras despertar, el plazo vuelve a correr: quien no vuelve a dar señales sí queda «sin conexión».
    byName(players, 'Caro').conn.close();
    await waitFor(() => stateOf(code).players[byName(players, 'Caro').id].connected === false, 'el servidor ve el corte de Caro');
    await t.advance(40_000);
    await waitFor(() => stateOf(code).players[byName(players, 'Caro').id].away === true, 'Caro «sin conexión» 30 s después de despertar');
    assert.equal(stateOf(code).players[byName(players, 'Ana').id].away, false);
  });

  it('control: los mismos 6 min con el servidor despierto (a pasos de 20 s) sí dejan fuera a quien no da señales', async () => {
    const { diag } = await serverWithWall();
    const { code, players } = await startedRoom(['Ana', 'Beto', 'Caro'], 'classic', { Ana: 'hunter', Beto: 'runner', Caro: 'runner' });
    await t.advance(2 * 60_000);
    const caro = byName(players, 'Caro');
    caro.conn.close();
    await waitFor(() => stateOf(code).players[caro.id].connected === false, 'Caro desconectada');
    // 6 min en pasos de 20 s, con el servidor despierto: Caro no da señales y los demás sí.
    for (let i = 0; i < 18; i++) {
      t.clock.t += 20_000;
      t.server.pump();
      t.server.hub.keepAliveConnected();
    }
    await settle(80);
    assert.equal(diag.filter((r) => r.k === 'server_suspended').length, 0, 'sin suspensión no se perdona nada');
    assert.equal(stateOf(code).players[caro.id].status, 'left');
    assert.equal(stateOf(code).players[caro.id].leftReason, 'timeout');
  });

  it('3 h suspendido en la huida (lo que pasó en la prueba física): el resultado es el del motor y nadie queda «fuera» por la suspensión', async () => {
    const { suspend, diag } = await serverWithWall();
    const { players } = await startedRoom(['Ana', 'Beto'], 'classic', { Ana: 'hunter', Beto: 'runner' });
    await waitFor(() => players.every((p) => p.snap?.phase === 'HEAD_START'), 'huida');
    await suspend(3 * 60 * 60_000);
    // Como en la prueba física: al despertar se procesan los plazos atrasados, cada uno a su hora (fin de
    // la huida, pistas, final por tiempo, cierre de la ventana de revancha). La sala ya no existe; lo que
    // cuenta es lo que recibe cada móvil.
    for (const p of players) {
      await waitFor(() => p.eventsOf('game_finished').length === 1, `${p.name} recibe el final`);
      assert.deepEqual(p.eventsOf('game_finished')[0].data.outcome, { winner: 'runner', cause: 'time_up' });
      assert.equal(p.eventsOf('player_left').filter((e) => e.data.reason === 'timeout').length, 0, `${p.name}: nadie queda fuera por la suspensión`);
    }
    assert.equal(diag.find((r) => r.k === 'server_suspended')?.gapS, 3 * 60 * 60);
  });
});

describe('reconexión del móvil', () => {
  it('dos intentos de reanudar a la vez (dos pestañas con la misma sesión): queda una sola conexión y ningún jugador duplicado', async () => {
    t = await testServer();
    const { code, players } = await startedRoom(['Ana', 'Beto'], 'classic', { Ana: 'hunter', Beto: 'runner' });
    const beto = byName(players, 'Beto');
    const storage = memoryStorage();
    storage.setItem('outrun.session', JSON.stringify({ playerId: beto.id, secret: beto.conn.session.secret, code }));
    beto.conn.close();
    const tabs = [0, 1].map(() => {
      const conn = new GameConnection({ url: t.wsUrl, storage });
      clients.push({ conn });
      conn.start();
      return conn;
    });
    await waitFor(() => tabs.filter((c) => c.status === 'open').length === 1 && tabs.some((c) => c.replaced), 'una abierta y la otra sustituida (4001)');
    await settle(100);
    assert.equal(t.server.hub.stats().clients, 2, 'Ana y una sola conexión de Beto');
    assert.equal(stateOf(code).playerOrder.length, 2);
    assert.equal(stateOf(code).players[beto.id].connected, true);
    const live = tabs.find((c) => c.status === 'open');
    assert.equal(live.playerId, beto.id, 'la conexión que queda es la de Beto, con su identidad original');
  });

  it('Infección: el convertido pierde la conexión en su espera y vuelve: sigue cazador, misma espera, y no puede capturar antes de tiempo', async () => {
    t = await testServer();
    const { code, players } = await startedRoom(['Ana', 'Beto', 'Caro', 'Dani'], 'infection', { Ana: 'hunter', Beto: 'runner', Caro: 'runner', Dani: 'runner' });
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
    const beto = byName(players, 'Beto');
    assert.equal((await beto.conn.command({ type: 'self_tag', hunterId: byName(players, 'Ana').id })).ok, true);
    await waitFor(() => stateOf(code).players[beto.id].team === 'hunter', 'Beto convertido');
    const canTagFrom = stateOf(code).players[beto.id].canTagFrom;
    beto.conn.close();
    await waitFor(() => stateOf(code).players[beto.id].connected === false, 'Beto sin socket');
    await t.advance(20_000);
    beto.conn.start();
    await waitFor(() => beto.snap?.players.find((p) => p.id === beto.id)?.connected === true && beto.conn.status === 'open', 'Beto vuelve');
    await settle(100);
    const me = stateOf(code).players[beto.id];
    assert.equal(me.team, 'hunter');
    assert.equal(me.status, 'active');
    assert.equal(me.canTagFrom, canTagFrom, 'la reconexión no reinicia ni elimina la espera');
    assert.equal(beto.snap.players.find((p) => p.id === beto.id).team, 'hunter', 'su instantánea dice cazador');
    const r = await beto.conn.command({ type: 'claim_tag', runnerId: byName(players, 'Caro').id });
    assert.equal(r.ok ? 'ok' : r.error, 'tag_cooldown');
  });

  it('Caza del zorro: el zorro pierde la conexión 40 s y vuelve: sigue siendo el único zorro, con su identidad, y los cazadores lo siguen viendo como tal', async () => {
    t = await testServer();
    const { code, players } = await startedRoom(['Ana', 'Beto', 'Zoe'], 'fox_hunt', { Ana: 'hunter', Beto: 'hunter', Zoe: 'runner' });
    await t.advance(2 * 60_000);
    await waitFor(() => players.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución');
    const zoe = byName(players, 'Zoe');
    zoe.conn.close();
    await waitFor(() => stateOf(code).players[zoe.id].connected === false, 'el servidor ve el corte');
    await t.advance(40_000);
    await waitFor(() => byName(players, 'Ana').snap.players.find((p) => p.id === zoe.id)?.away === true, 'Ana ve al zorro «sin conexión»');
    zoe.conn.start();
    await waitFor(() => byName(players, 'Ana').snap.players.find((p) => p.id === zoe.id)?.away === false, 'el zorro ha vuelto');
    const st = stateOf(code);
    assert.deepEqual(st.playerOrder.filter((id) => st.players[id].team === 'runner'), [zoe.id], 'un único zorro, el mismo');
    for (const p of players.filter((x) => x !== zoe)) assert.equal(p.snap.players.find((x) => x.id === zoe.id)?.team, 'runner', `${p.name} sigue sabiendo quién es el zorro`);
    assert.equal(zoe.snap.players.find((x) => x.id === zoe.id)?.team, 'runner');
    assert.equal(st.phase, 'ACTIVE');
  });

  it('reconexión seguida de revancha: quien volvió entra en la revancha y la nueva partida empieza sin restos', async () => {
    t = await testServer();
    const { code, players } = await startedRoom(['Ana', 'Beto'], 'classic', { Ana: 'hunter', Beto: 'runner' });
    await t.advance(2 * 60_000);
    const [ana, beto] = players;
    beto.conn.close();
    await t.advance(60_000);
    beto.conn.start();
    await waitFor(() => ana.snap.players.find((p) => p.id === beto.id)?.away === false && beto.conn.status === 'open', 'Beto vuelve');
    assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
    await waitFor(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final');
    assert.equal((await ana.conn.command({ type: 'rematch', swapRoles: false })).ok, true);
    await waitFor(() => beto.snap?.phase === 'LOBBY', 'Beto ve la revancha');
    assert.equal((await beto.conn.command({ type: 'join_rematch' })).ok, true);
    for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
    assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
    await t.advance(5_000);
    const st = stateOf(code);
    assert.equal(st.gameNo, 2);
    assert.equal(st.playerOrder.length, 2, 'sin jugadores duplicados');
    for (const id of st.playerOrder) {
      assert.equal(st.players[id].status, 'active');
      assert.equal(st.players[id].away, false);
    }
    assert.deepEqual(st.captures, []);
    assert.deepEqual(st.claims, {});
  });
});

describe('informe de diagnóstico: el ordenador del servidor suspendido', () => {
  it('con el registro de suspensión, el informe lo dice como alerta (no es un fallo de los móviles)', async () => {
    const { buildReport } = await import('../informe-diagnostico.mjs');
    const at = T0;
    const md = buildReport([
      { k: 'server_start', at },
      { k: 'phase', at: at + 1_000, room: 'S1', game: 1, phase: 'ACTIVE', from: 'HEAD_START', online: ['J1', 'J2'], offline: [] },
      { k: 'server_suspended', at: at + 3 * 3_600_000, gapS: 10_800, players: 2 },
    ]);
    assert.match(md, /estuvo suspendido 180 min 0 s/);
    assert.match(md, /No es un fallo de los móviles/);
  });

  it('en un registro antiguo, sin ese hecho: un hueco largo con una partida en juego se señala; en la sala de espera, no', async () => {
    const { buildReport } = await import('../informe-diagnostico.mjs');
    const at = T0;
    const live = buildReport([
      { k: 'server_start', at },
      { k: 'phase', at: at + 1_000, room: 'S1', game: 1, phase: 'HEAD_START', from: 'COUNTDOWN', online: ['J1'], offline: [] },
      { k: 'phase', at: at + 3 * 3_600_000, room: 'S1', game: 1, phase: 'CANCELLED', from: 'HEAD_START', online: [], offline: ['J1'] },
    ]);
    assert.match(live, /Ningún hecho registrado durante 179 min 59 s .*con una partida en juego/);
    const lobby = buildReport([
      { k: 'server_start', at },
      { k: 'phase', at: at + 1_000, room: 'S1', game: 1, phase: 'FINISHED', from: 'ACTIVE', online: ['J1'], offline: [] },
      { k: 'phase', at: at + 3 * 3_600_000, room: 'S1', game: 1, phase: 'CANCELLED', from: 'FINISHED', online: [], offline: [] },
    ]);
    assert.doesNotMatch(lobby, /Ningún hecho registrado/);
  });
});
