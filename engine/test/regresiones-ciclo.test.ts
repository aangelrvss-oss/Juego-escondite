import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOUR, MINUTE, PRESENCE, SECOND, TIMING } from '../src/constants.ts';
import type { ModeId } from '../src/modes.ts';
import { snapshotFor } from '../src/view.ts';
import { Harness, T0, activeGame, config } from './helpers.ts';

// Regresiones del ciclo de validación de modos (30/10/2026). Cada bloque cita su hallazgo (V-xx) del
// informe QA/ciclo-20261030-validacion-modos/INFORME_AUDITORIA_MODOS.md §6 y su corrección (Cx) del plan.

const MODES: ModeId[] = ['classic', 'infection', 'fox_hunt'];

/** Sala con el anfitrión y `others` en la sala de espera, configurada en `mode`. */
function lobby(mode: ModeId, others: string[]): Harness {
  const g = new Harness();
  for (const id of others) g.join(id);
  g.ok('h', { type: 'configure', config: config({ mode }) });
  return g;
}

function playToEnd(g: Harness): void {
  g.advance(TIMING.countdownMs);
  g.advance(g.state.config?.headStartMs ?? 0);
  g.advance(g.state.config?.durationMs ?? 0);
  assert.equal(g.state.phase, 'FINISHED');
}

describe('C1 · V-04: quien sale en una cuenta atrás que se aborta no forma parte de la partida siguiente', () => {
  // Classic y zorro con 4 jugadores; Infección con 5 (mínimo 4 tras la salida).
  const PLAYERS: Record<ModeId, string[]> = { classic: ['a', 'b', 'x'], infection: ['a', 'b', 'c', 'x'], fox_hunt: ['a', 'b', 'x'] };
  for (const mode of MODES) {
    it(`${mode}: ni en el informe ni invitado a la revancha`, () => {
      const g = lobby(mode, PLAYERS[mode]);
      g.readyAll();
      g.ok('h', { type: 'start' });
      g.ok('x', { type: 'leave' });
      // Si su salida no vacía un equipo, el anfitrión cancela la cuenta atrás: mismo camino (backToLobby).
      if (g.state.phase === 'COUNTDOWN') g.ok('h', { type: 'abort' });
      assert.equal(g.state.phase, 'LOBBY');
      const x = g.state.players.x;
      assert.equal(x?.team, null, 'sin el equipo del sorteo abortado');
      assert.equal(x?.playedGameNo, null, 'no jugó ninguna partida');
      assert.equal(x?.leftRoom, true, 'salir sin partida = salir de la sala');

      g.readyAll();
      g.ok('h', { type: 'start' });
      playToEnd(g);
      for (const viewer of ['h', ...PLAYERS[mode].filter((id) => id !== 'x')]) {
        const ids = snapshotFor(g.state, viewer, g.now).players.map((p) => p.id);
        assert.ok(!ids.includes('x'), `${viewer} no debe ver a x en el informe: ${ids.join(',')}`);
      }
      if (mode === 'fox_hunt') {
        const foxes = snapshotFor(g.state, 'h', g.now).players.filter((p) => p.team === 'runner');
        assert.equal(foxes.length, 1, 'un solo zorro en el informe');
      }
      g.ok('h', { type: 'rematch', swapRoles: false });
      assert.equal(g.state.players.x?.status, 'left', 'no invitado a la revancha');
      // Puede volver a entrar con el mismo móvil como un jugador nuevo.
      g.ok('x2', { type: 'join', name: 'Jug x', deviceId: 'dev-x' });
      assert.equal(g.state.players.x2?.status, 'lobby');
    });
  }
});

describe('C2 · V-05: volver a entrar con el mismo dispositivo recupera la plaza', () => {
  it('a/b: tras «Abandonar» la partida, puede entrar en la revancha con el código y jugarla', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r2', { type: 'leave' });
    g.ok('r2', { type: 'connection', connected: false }); // la app olvida la sesión y cierra el socket
    g.ok('h', { type: 'end_game' });
    g.ok('h', { type: 'rematch', swapRoles: false });
    assert.equal(g.state.players.r2?.status, 'invited');
    g.ok('r2b', { type: 'join', name: 'Jug r2', deviceId: 'dev-r2' });
    assert.equal(g.state.players.r2b?.status, 'lobby');
    assert.equal(g.state.players.r2?.leftRoom, true, 'la plaza antigua se retira (el servidor revoca su sesión)');
    const joined = g.eventsOf('player_joined').at(-1);
    assert.deepEqual(joined?.data, { playerId: 'r2b', name: 'Jug r2', replaces: 'r2' });
    const ids = snapshotFor(g.state, 'h', g.now).players.map((p) => p.id);
    assert.ok(ids.includes('r2b') && !ids.includes('r2'), ids.join(','));
    // r1 acepta y juegan la revancha.
    g.ok('r1', { type: 'join_rematch' });
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(g.state.players.r2b?.status, 'active');
  });

  it('b: un welcome perdido en la sala de espera no deja fantasma: el reintento recupera la plaza', () => {
    const g = new Harness();
    g.join('b');
    g.ok('b', { type: 'connection', connected: false }); // el socket se cierra antes de guardar el secreto
    g.ok('b2', { type: 'join', name: 'Beto', deviceId: 'dev-b' });
    const view = snapshotFor(g.state, 'h', g.now).players.map((p) => p.id);
    assert.deepEqual(view, ['h', 'b2'], 'una sola plaza');
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(g.state.players.b2?.status, 'active');
  });

  it('conserva la asignación del anfitrión y, si era el anfitrión, la sala sigue siendo suya', () => {
    const g = new Harness();
    g.join('b');
    g.ok('h', { type: 'assign_team', targetId: 'b', pref: 'runner' });
    g.ok('b', { type: 'connection', connected: false });
    g.ok('b2', { type: 'join', name: 'Beto', deviceId: 'dev-b' });
    assert.equal(g.state.players.b2?.teamPref, 'runner');
    assert.equal(snapshotFor(g.state, 'h', g.now).players.find((p) => p.id === 'b2')?.teamPref, 'runner');

    const k = new Harness();
    k.join('c');
    k.ok('h', { type: 'connection', connected: false });
    k.ok('h2', { type: 'join', name: 'Ana', deviceId: 'dev-h' });
    assert.equal(k.state.hostId, 'h2');
    assert.equal(k.state.players.h?.leftRoom, true);
  });

  it('seguridad: nunca toma la plaza de alguien conectado, ni de un jugador en partida, ni salta el veto', () => {
    // Conectado (otra pestaña del mismo dispositivo): sigue siendo already_joined.
    const a = new Harness();
    a.join('b');
    assert.deepEqual(a.cmd('b2', { type: 'join', name: 'Beto', deviceId: 'dev-b' }), { ok: false, error: 'already_joined' });
    // Invitado a la revancha y aún conectado: tampoco.
    const r = activeGame({ runners: ['r1'] });
    r.ok('h', { type: 'end_game' });
    r.ok('h', { type: 'rematch', swapRoles: false });
    assert.deepEqual(r.cmd('x', { type: 'join', name: 'X', deviceId: 'dev-r1' }), { ok: false, error: 'already_joined' });
    // Jugador activo en partida (aunque esté desconectado): no se puede entrar en una partida en curso.
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r1', { type: 'connection', connected: false });
    assert.deepEqual(g.cmd('x', { type: 'join', name: 'X', deviceId: 'dev-r1' }), { ok: false, error: 'game_in_progress' });
    assert.equal(g.state.players.r1?.status, 'active');
    // Expulsado: el dispositivo sigue vetado.
    const k = new Harness();
    k.join('b');
    k.ok('b', { type: 'connection', connected: false });
    k.ok('h', { type: 'kick', targetId: 'b' });
    assert.deepEqual(k.cmd('b2', { type: 'join', name: 'Beto', deviceId: 'dev-b' }), { ok: false, error: 'not_found' });
  });
});

describe('C3 · V-06: no se empieza una partida que no cabe en la vida de la sala', () => {
  /** Lleva la sala de espera hasta `at` sin que caduque por inactividad. */
  function lobbyAt(mode: ModeId, at: number): Harness {
    const g = lobby(mode, mode === 'infection' ? ['a', 'b', 'c'] : ['a', 'b']);
    while (g.now + 20 * MINUTE < at) {
      g.now += 20 * MINUTE;
      g.ok('h', { type: 'set_ready', ready: false });
    }
    g.now = at;
    g.readyAll();
    return g;
  }
  const needed = TIMING.countdownMs + 2 * MINUTE + 20 * MINUTE + TIMING.rematchWindowMs;

  for (const mode of MODES) {
    it(`${mode}: con 5 h 50 min, rechazo room_expiring; con 5 h, empieza y deja su informe`, () => {
      const late = lobbyAt(mode, T0 + 5 * HOUR + 50 * MINUTE);
      assert.deepEqual(late.cmd('h', { type: 'start' }), { ok: false, error: 'room_expiring' });
      assert.equal(late.state.phase, 'LOBBY');

      const g = lobbyAt(mode, T0 + 5 * HOUR);
      g.ok('h', { type: 'start' });
      playToEnd(g);
      assert.notEqual(g.state.outcome, null);
    });
  }

  it('límite exacto: cabe justo (incluido el periodo de revancha) → empieza; 1 ms más tarde → no', () => {
    const edge = T0 + TIMING.roomMaxLifetimeMs - needed;
    assert.equal(lobbyAt('classic', edge).cmd('h', { type: 'start' }).ok, true);
    assert.deepEqual(lobbyAt('classic', edge + 1).cmd('h', { type: 'start' }), { ok: false, error: 'room_expiring' });
  });
});

describe('C9 · V-22: reconectar no mantiene viva una sala de espera olvidada', () => {
  it('con reconexiones cada 25 min y nada más, caduca a los 30 min de la última actividad', () => {
    const g = new Harness();
    g.join('r1');
    for (let i = 0; i < 4; i++) {
      g.now += 25 * MINUTE;
      g.cmd('r1', { type: 'connection', connected: false });
      g.cmd('r1', { type: 'connection', connected: true });
    }
    assert.equal(g.state.phase, 'CANCELLED');
    assert.equal(g.state.closeReason, 'expired');
    const closed = g.eventsOf('room_closed')[0];
    assert.equal(closed?.at, T0 + TIMING.lobbyIdleMs);
  });
});

describe('C10 · V-25: si todos quedan fuera a la vez, la causa no depende del orden de los ids', () => {
  for (const mode of MODES) {
    it(`${mode}: misma causa, sin ganador y todos fuera`, () => {
      const results = new Set<string>();
      for (const ids of [['a', 'b', 'c'], ['x', 'y', 'z']]) {
        const g = lobby(mode, ids);
        g.readyAll();
        g.ok('h', { type: 'start' });
        g.advance(TIMING.countdownMs);
        g.tickTo(g.now + PRESENCE.absenceTimeoutMs + SECOND); // nadie da señales
        assert.equal(g.state.phase, 'FINISHED');
        assert.equal(g.state.outcome?.winner, null);
        results.add(String(g.state.outcome?.cause));
        for (const id of ['h', ...ids]) {
          assert.equal(g.state.players[id]?.status, 'left', `${id} fuera`);
          assert.equal(g.state.players[id]?.leftReason, 'timeout');
        }
      }
      assert.deepEqual([...results], ['runners_abandoned']);
    });
  }
});

describe('C19 · V-27/V-28: higiene de Infección', () => {
  it('V-27: canTagFrom solo se entrega en la huida y la persecución', () => {
    const g = activeGame({ runners: ['r1', 'r2', 'r3'], cfg: { mode: 'infection' } });
    g.ok('r1', { type: 'self_tag', hunterId: 'h' });
    assert.ok((snapshotFor(g.state, 'r1', g.now).canTagFrom ?? 0) > g.now, 'en ACTIVE sí');
    g.ok('r2', { type: 'self_tag', hunterId: 'h' });
    g.ok('r3', { type: 'self_tag', hunterId: 'h' }); // la última conversión termina la partida
    assert.equal(g.state.phase, 'FINISHED');
    assert.equal(snapshotFor(g.state, 'r3', g.now).canTagFrom, null, 'en FINISHED no');
    g.ok('h', { type: 'rematch', swapRoles: false });
    assert.equal(snapshotFor(g.state, 'r3', g.now).canTagFrom, null, 'en la sala de la revancha no');
  });

  it('V-28: convertir a un fugitivo expuesto avisa a los cazadores con runner_unexposed', () => {
    const g = activeGame({ runners: ['r1', 'r2', 'r3'], cfg: { mode: 'infection' } });
    g.at('r1', 600); // fuera de la zona (radio 400 m)
    g.advance(TIMING.outOfZoneGraceMs + SECOND);
    assert.equal(g.state.players.r1?.exposed, true);
    const before = g.events.length;
    g.ok('r1', { type: 'self_tag', hunterId: 'h' });
    const unexposed = g.events.slice(before).filter((e) => e.type === 'runner_unexposed');
    assert.equal(unexposed.length, 1);
    // R-2: con el motivo, para que el cliente no lo anuncie como «ha vuelto a la zona».
    assert.deepEqual(unexposed[0]?.data, { runnerId: 'r1', reason: 'converted' });
    const audience = unexposed[0]?.audience;
    assert.ok(audience?.kind === 'players' && audience.ids.includes('h') && audience.ids.includes('r1'));
  });
});

describe('Verificación (punto 4): al terminar no queda ninguna reclamación pendiente', () => {
  const SETUP: Record<ModeId, { hunters?: string[]; runners: string[] }> = {
    classic: { runners: ['r1'] },
    infection: { runners: ['r1', 'r2', 'r3'] },
    fox_hunt: { hunters: ['h2'], runners: ['r1'] },
  };
  for (const mode of MODES) {
    for (const ending of ['end_game', 'time_up'] as const) {
      it(`${mode} · ${ending}: ni en el estado ni en la vista; responder después da claim_not_found`, () => {
        const g = activeGame({ ...SETUP[mode], cfg: { mode } });
        if (ending === 'time_up') g.advance((g.state.gameEnd ?? 0) - g.now - 10 * SECOND);
        g.at('h', 0);
        g.at('r1', 3);
        const claim = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
        assert.equal(claim.ok, true, JSON.stringify(claim));
        const claimId = String(claim.ok ? claim.data?.claimId : '');
        if (ending === 'end_game') g.ok('h', { type: 'end_game' });
        else g.tickTo(g.state.gameEnd ?? 0);
        assert.equal(g.state.phase, 'FINISHED');
        assert.deepEqual(g.state.claims, {});
        for (const id of g.state.playerOrder) {
          const v = snapshotFor(g.state, id, g.now);
          assert.equal(v.pendingClaimForMe, null, id);
          assert.equal(v.pendingClaimByMe, null, id);
        }
        const stateBefore = structuredClone(g.state);
        assert.deepEqual(g.cmd('r1', { type: 'respond_tag', claimId, accept: true }), { ok: false, error: 'claim_not_found' });
        assert.deepEqual(g.cmd('r1', { type: 'respond_tag', claimId, accept: false }), { ok: false, error: 'claim_not_found' });
        assert.deepEqual(g.state.claims, stateBefore.claims);
        assert.deepEqual(g.state.captures, stateBefore.captures);
        assert.deepEqual(g.state.outcome, stateBefore.outcome);
      });
    }
  }
});
