import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, PRESENCE, SECOND, TIMING } from '../src/constants.ts';
import { snapshotFor } from '../src/view.ts';
import { Harness, T0, config } from './helpers.ts';
import type { GameConfig } from '../src/types.ts';

// Caza del zorro (D-057 §3, GAME_MODES_AND_RULES §11.3): regresiones del ciclo de validación del 30/10.
// Motor puro: sorteo con muchas semillas, salidas en la cuenta atrás (C1: el que sale no queda en el
// informe siguiente), capturas rechazadas sin efecto, finales con un único game_finished y revanchas.
// Fuera de alcance a propósito (decisiones de producto pendientes): V-01 zorro sin GPS con la app viva,
// V-02 sondeo con «Reclamar» (no se fija ningún código de rechazo concreto), V-03 preferencias de rol
// (aquí nadie elige su rol: sorteo o anfitrión), V-10 anfitrión que termina la partida y V-21 posición de
// quien está «sin conexión».

const FOX: Partial<GameConfig> = { mode: 'fox_hunt' };

/** Sala con el anfitrión h y los demás (todos con sorteo), configurada para el zorro y lista. */
function lobby(ids: string[], seed = 42): Harness {
  const g = new Harness('Ana', T0, seed);
  for (const id of ids) g.join(id);
  g.ok('h', { type: 'configure', config: config(FOX) });
  g.readyAll();
  return g;
}

const runnersOf = (g: Harness) => g.state.playerOrder.filter((id) => g.state.players[id]?.status === 'active' && g.state.players[id]?.team === 'runner');
const huntersOf = (g: Harness) => g.state.playerOrder.filter((id) => g.state.players[id]?.status === 'active' && g.state.players[id]?.team === 'hunter');

/** Lo que el motor considera «la partida»: lo que no debe cambiar con una captura rechazada. */
function gameView(g: Harness) {
  const s = g.state;
  return {
    phase: s.phase,
    outcome: s.outcome,
    captures: s.captures,
    claims: Object.keys(s.claims).length,
    players: s.playerOrder.map((id) => `${id}:${s.players[id]?.team}:${s.players[id]?.status}`),
  };
}

/** Informe (instantánea en FINISHED) tal como lo ve cada jugador que sigue en la sala. */
function reports(g: Harness) {
  assert.equal(g.state.phase, 'FINISHED');
  return g.state.playerOrder
    .filter((id) => g.state.players[id]?.leftRoom !== true)
    .map((id) => ({ viewer: id, snap: snapshotFor(g.state, id, g.now) }));
}

describe('Zorro · sorteo con 3 jugadores', () => {
  it('con 60 semillas: siempre un zorro y dos cazadores, y el zorro varía (lo es cada uno de los tres)', () => {
    const foxes = new Map<string, number>();
    for (let seed = 0; seed < 60; seed++) {
      const g = lobby(['b', 'c'], seed);
      g.ok('h', { type: 'start' });
      g.advance(TIMING.countdownMs);
      assert.equal(g.state.phase, 'HEAD_START', `semilla ${seed}`);
      const runners = runnersOf(g);
      assert.equal(runners.length, 1, `semilla ${seed}: ${runners}`);
      assert.equal(huntersOf(g).length, 2, `semilla ${seed}`);
      foxes.set(runners[0]!, (foxes.get(runners[0]!) ?? 0) + 1);
    }
    assert.deepEqual([...foxes.keys()].sort(), ['b', 'c', 'h'], JSON.stringify([...foxes]));
  });
});

describe('Zorro · salidas en la cuenta atrás', () => {
  it('con 4, sale un cazador en la cuenta atrás: sigue con 3 (un zorro y dos cazadores)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = lobby(['b', 'c', 'd'], seed);
      g.ok('h', { type: 'start' });
      assert.equal(g.state.phase, 'COUNTDOWN');
      const leaver = huntersOf(g).find((id) => id !== 'h')!;
      g.ok(leaver, { type: 'leave' });
      assert.equal(g.state.phase, 'COUNTDOWN', `semilla ${seed}`);
      g.advance(TIMING.countdownMs);
      assert.equal(g.state.phase, 'HEAD_START', `semilla ${seed}`);
      assert.equal(runnersOf(g).length, 1);
      assert.equal(huntersOf(g).length, 2);
      assert.ok(!huntersOf(g).includes(leaver));
    }
  });

  for (const who of ['zorro', 'cazador'] as const) {
    it(`con 3, sale el ${who} en la cuenta atrás: vuelve a la sala y (C1) no aparece en el informe siguiente ni hay dos zorros`, () => {
      const g = lobby(['b', 'c'], 7);
      g.ok('h', { type: 'start' });
      const leaver = who === 'zorro' ? runnersOf(g)[0]! : huntersOf(g).find((id) => id !== 'h')!;
      g.ok(leaver, { type: 'leave' });
      assert.equal(g.state.phase, 'LOBBY');
      // Entra otra persona y se juega la partida siguiente hasta el final por tiempo.
      g.join('d');
      g.readyAll();
      g.ok(g.state.hostId, { type: 'start' });
      g.advance(TIMING.countdownMs);
      assert.equal(runnersOf(g).length, 1);
      assert.ok(!runnersOf(g).includes(leaver) && !huntersOf(g).includes(leaver));
      g.advance(25 * MINUTE);
      assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
      for (const { viewer, snap } of reports(g)) {
        assert.equal(snap.players.some((p) => p.id === leaver), false, `${viewer} ve a ${leaver} en el informe`);
        assert.equal(snap.players.filter((p) => p.team === 'runner').length, 1, `${viewer}: dos «zorros» en el informe`);
      }
      // Revancha: quien salió en la cuenta atrás no es invitado.
      g.ok(g.state.hostId, { type: 'rematch', swapRoles: false });
      assert.notEqual(g.state.players[leaver]?.status, 'invited');
    });
  }
});

/** Partida en la persecución con sorteo (4 jugadores); devuelve el zorro y los cazadores. */
function activeFox(seed = 3) {
  const g = lobby(['b', 'c', 'd'], seed);
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs + 2 * MINUTE);
  assert.equal(g.state.phase, 'ACTIVE');
  const fox = runnersOf(g)[0]!;
  const hunters = huntersOf(g);
  return { g, fox, hunters };
}

describe('Zorro · capturas y finales', () => {
  it('captura rechazada por el motor (lejos): la partida no cambia', () => {
    const { g, fox, hunters } = activeFox();
    for (const id of hunters) g.at(id, 0);
    g.at(fox, 300);
    const before = gameView(g);
    const r = g.cmd(hunters[0]!, { type: 'claim_tag', runnerId: fox });
    assert.equal(r.ok, false);
    assert.deepEqual(gameView(g), before);
    assert.equal(g.eventsOf('tag_claimed').length, 0);
  });

  it('captura rechazada por el zorro: la partida sigue igual (sin captura ni final)', () => {
    const { g, fox, hunters } = activeFox();
    g.at(hunters[0]!, 100);
    g.at(fox, 104);
    const before = gameView(g);
    const r = g.cmd(hunters[0]!, { type: 'claim_tag', runnerId: fox });
    assert.equal(r.ok, true, JSON.stringify(r));
    g.ok(fox, { type: 'respond_tag', claimId: String(r.ok && r.data?.claimId), accept: false });
    assert.deepEqual(gameView(g), before);
    assert.equal(g.eventsOf('game_finished').length, 0);
  });

  it('captura válida: un único game_finished y ganan los cazadores (all_captured)', () => {
    const { g, fox, hunters } = activeFox();
    g.at(hunters[1]!, 100);
    g.at(fox, 104);
    const r = g.cmd(hunters[1]!, { type: 'claim_tag', runnerId: fox });
    assert.equal(r.ok, true, JSON.stringify(r));
    g.ok(fox, { type: 'respond_tag', claimId: String(r.ok && r.data?.claimId), accept: true });
    g.advance(30 * MINUTE); // ningún plazo posterior vuelve a terminar la partida
    assert.equal(g.eventsOf('game_finished').length, 1);
    assert.deepEqual(g.state.outcome, { winner: 'hunter', cause: 'all_captured' });
    assert.equal(g.state.captures.length, 1);
  });

  it('el zorro sin señal 5 min queda fuera: sin ganador, un único game_finished', () => {
    const { g, fox } = activeFox();
    g.ok(fox, { type: 'connection', connected: false });
    g.advance(PRESENCE.absenceTimeoutMs + SECOND);
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'runners_abandoned' });
    assert.equal(g.state.players[fox]?.leftReason, 'timeout');
    g.advance(30 * MINUTE);
    assert.equal(g.eventsOf('game_finished').length, 1);
  });

  it('se acaba el tiempo: gana el zorro, un único game_finished', () => {
    const { g } = activeFox();
    g.advance(40 * MINUTE);
    assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
    assert.equal(g.eventsOf('game_finished').length, 1);
  });
});

describe('Zorro · revanchas', () => {
  for (const swapRoles of [false, true]) {
    it(`5 revanchas seguidas con swapRoles=${swapRoles}: siempre un zorro y n−1 cazadores`, () => {
      const g = lobby(['b', 'c', 'd'], 11);
      g.ok('h', { type: 'start' });
      for (let i = 0; i <= 5; i++) {
        g.advance(TIMING.countdownMs);
        assert.equal(g.state.phase, 'HEAD_START', `partida ${i + 1}`);
        assert.equal(runnersOf(g).length, 1, `partida ${i + 1}`);
        assert.equal(huntersOf(g).length, 3, `partida ${i + 1}`);
        g.advance(25 * MINUTE);
        assert.equal(g.state.phase, 'FINISHED');
        for (const { snap } of reports(g)) assert.equal(snap.players.filter((p) => p.team === 'runner').length, 1);
        if (i === 5) break;
        g.ok(g.state.hostId, { type: 'rematch', swapRoles });
        for (const id of g.state.playerOrder) if (g.state.players[id]?.status === 'invited') g.ok(id, { type: 'join_rematch' });
        assert.equal(g.state.captures.length, 0);
        assert.equal(Object.keys(g.state.claims).length, 0);
        g.readyAll();
        g.ok(g.state.hostId, { type: 'start' });
      }
    });
  }
});
