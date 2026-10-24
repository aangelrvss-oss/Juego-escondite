import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIMITS, MINUTE, TIMING } from '../src/constants.ts';
import { applyCommand } from '../src/engine.ts';
import { Harness, activeGame, config } from './helpers.ts';

function lobbyWithRunner(): Harness {
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  g.join('r1', 'runner');
  g.ok('h', { type: 'configure', config: config() });
  return g;
}

describe('transiciones válidas (GAME_STATE_MACHINE §3)', () => {
  it('LOBBY → COUNTDOWN → HEAD_START → ACTIVE → FINISHED en los instantes exactos', () => {
    const g = lobbyWithRunner();
    g.readyAll();
    const startAt = g.now;
    g.ok('h', { type: 'start' });
    assert.equal(g.state.phase, 'COUNTDOWN');
    assert.equal(g.state.countdownEnd, startAt + TIMING.countdownMs);

    g.advance(TIMING.countdownMs - 1);
    assert.equal(g.state.phase, 'COUNTDOWN');
    g.advance(1);
    assert.equal(g.state.phase, 'HEAD_START');
    assert.equal(g.state.headStartEnd, startAt + TIMING.countdownMs + 2 * MINUTE);

    g.advance(2 * MINUTE);
    assert.equal(g.state.phase, 'ACTIVE');
    assert.equal(g.state.gameEnd, (g.state.activeStart ?? 0) + 20 * MINUTE);

    g.advance(20 * MINUTE);
    assert.equal(g.state.phase, 'FINISHED');
    assert.deepEqual(g.state.outcome, { winner: 'runner', cause: 'time_up' });
  });

  it('el anfitrión puede abortar la cuenta atrás y vuelve todo a LOBBY', () => {
    const g = lobbyWithRunner();
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(g.cmd('r1', { type: 'abort' }).ok, false);
    g.ok('h', { type: 'abort' });
    assert.equal(g.state.phase, 'LOBBY');
    assert.equal(g.state.players.r1?.status, 'lobby');
    assert.equal(g.state.players.r1?.ready, false);
  });

  it('el reparto aleatorio produce al menos 1 cazador y 1 fugitivo con 2 jugadores', () => {
    const g = new Harness();
    g.join('x');
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    g.ok('h', { type: 'start' });
    const teams = Object.values(g.state.players).map((p) => p.team).sort();
    assert.deepEqual(teams, ['hunter', 'runner']);
  });
});

describe('transiciones inválidas: start (T1) rechazado', () => {
  const cases: [string, (g: Harness) => void, string][] = [
    ['no anfitrión', (g) => g.readyAll(), 'forbidden'],
    ['sin configuración', (g) => {
      g.state.config = null;
      g.readyAll();
    }, 'config_missing'],
    ['lista de seguridad sin confirmar', (g) => {
      g.ok('h', { type: 'configure', config: config({ safetyChecklistConfirmed: false }) });
      g.readyAll();
    }, 'safety_not_confirmed'],
    ['jugador no listo', () => {}, 'players_not_ready'],
    ['jugador desconectado', (g) => {
      g.readyAll();
      g.ok('r1', { type: 'connection', connected: false });
    }, 'players_not_ready'],
    ['equipos sin fugitivos', (g) => {
      g.ok('r1', { type: 'set_team_pref', pref: 'hunter' });
      g.readyAll();
    }, 'teams_unbalanced'],
  ];
  for (const [name, prepare, expected] of cases) {
    it(name, () => {
      const g = lobbyWithRunner();
      prepare(g);
      const actor = name === 'no anfitrión' ? 'r1' : 'h';
      const r = g.cmd(actor, { type: 'start' });
      assert.deepEqual(r.ok ? 'ok' : r.error, expected);
      assert.equal(g.state.phase, 'LOBBY');
    });
  }

  it('menos de 2 jugadores', () => {
    const g = new Harness();
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    const r = g.cmd('h', { type: 'start' });
    assert.equal(r.ok ? 'ok' : r.error, 'not_enough_players');
  });
});

describe('autoridad del anfitrión (AC-C1)', () => {
  for (const command of [
    { type: 'configure', config: config() },
    { type: 'cancel' },
    { type: 'kick', targetId: 'h' },
    { type: 'assign_team', targetId: 'h', pref: 'runner' },
  ] as const) {
    it(`un jugador normal no puede ${command.type}`, () => {
      const g = lobbyWithRunner();
      const r = g.cmd('r1', command);
      assert.equal(r.ok ? 'ok' : r.error, 'forbidden');
    });
  }

  it('un jugador normal no puede terminar la partida ni la configuración cambia fuera de LOBBY', () => {
    const g = activeGame();
    assert.equal(g.cmd('r1', { type: 'end_game' }).ok, false);
    assert.equal(g.state.phase, 'ACTIVE');
    const r = g.cmd('h', { type: 'configure', config: config() });
    assert.equal(r.ok ? 'ok' : r.error, 'wrong_phase');
  });

  it('el anfitrión termina la partida: sin ganador (AC-C6)', () => {
    const g = activeGame();
    g.ok('h', { type: 'end_game' });
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'ended_by_host' });
  });

  it('un comando rechazado no altera el estado ni emite eventos', () => {
    const g = activeGame();
    const before = structuredClone(g.state);
    const step = applyCommand(g.state, 'r1', { type: 'end_game' }, g.now);
    assert.equal(step.result.ok, false);
    assert.deepEqual(step.events, []);
    assert.deepEqual(step.state, before);
  });
});

describe('entrada a la sala (AC-A4, AC-A7)', () => {
  it('no se puede entrar en una partida empezada', () => {
    const g = activeGame();
    const r = g.cmd('late', { type: 'join', name: 'Tarde', deviceId: 'dev-late' });
    assert.equal(r.ok ? 'ok' : r.error, 'game_in_progress');
    assert.equal(g.state.players.late, undefined);
  });

  it('un dispositivo expulsado no puede volver y recibe "not_found"', () => {
    const g = lobbyWithRunner();
    g.ok('h', { type: 'kick', targetId: 'r1' });
    const r = g.cmd('r1b', { type: 'join', name: 'Otra vez', deviceId: 'dev-r1' });
    assert.equal(r.ok ? 'ok' : r.error, 'not_found');
  });

  it(`la sala admite como máximo ${LIMITS.maxPlayers} jugadores`, () => {
    const g = new Harness();
    for (let i = 1; i < LIMITS.maxPlayers; i++) g.join(`p${i}`);
    const r = g.cmd('extra', { type: 'join', name: 'Extra', deviceId: 'dev-extra' });
    assert.equal(r.ok ? 'ok' : r.error, 'room_full');
  });

  it('nombres fuera de 2–20 caracteres se rechazan', () => {
    const g = new Harness();
    assert.equal(g.cmd('a', { type: 'join', name: 'A', deviceId: 'd1' }).ok, false);
    assert.equal(g.cmd('b', { type: 'join', name: 'x'.repeat(21), deviceId: 'd2' }).ok, false);
  });
});

describe('configuración (AC-B1)', () => {
  const invalid: [string, Parameters<typeof config>[0]][] = [
    ['durationMs', { durationMs: 5 * MINUTE }],
    ['headStartMs', { headStartMs: 11 * MINUTE }],
    ['pingIntervalMs', { pingIntervalMs: 1 * MINUTE }],
    ['zone', { zone: [{ fromOffsetMs: 0, center: { lat: 40, lng: -3 }, radiusM: 100 }] }],
    ['meetingPoint', { meetingPoint: { lat: 200, lng: 0 } }],
  ];
  for (const [field, overrides] of invalid) {
    it(`rechaza ${field} fuera de rango`, () => {
      const g = new Harness();
      const r = g.cmd('h', { type: 'configure', config: config(overrides) });
      assert.deepEqual(r, { ok: false, error: 'invalid_config', detail: field });
    });
  }
});

describe('abandono y anfitrión (§5.1–5.3)', () => {
  it('si se va el último fugitivo: FINISHED sin ganador', () => {
    const g = activeGame();
    g.ok('r1', { type: 'leave' });
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'runners_abandoned' });
  });

  it('si se van todos los cazadores: FINISHED sin ganador', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('h', { type: 'leave' });
    assert.deepEqual(g.state.outcome, { winner: null, cause: 'hunters_abandoned' });
  });

  it('si un equipo queda vacío en la cuenta atrás, se vuelve a LOBBY', () => {
    const g = lobbyWithRunner();
    g.readyAll();
    g.ok('h', { type: 'start' });
    g.ok('r1', { type: 'leave' });
    assert.equal(g.state.phase, 'LOBBY');
  });

  it('el anfitrión desconectado 120 s cede el puesto; no antes; al volver no lo recupera', () => {
    const g = activeGame({ hunters: ['h2'] });
    g.ok('h', { type: 'connection', connected: false });
    g.advance(TIMING.hostHandoverMs - 1);
    assert.equal(g.state.hostId, 'h');
    g.advance(1);
    assert.equal(g.state.hostId, 'h2');
    g.ok('h', { type: 'connection', connected: true });
    assert.equal(g.state.hostId, 'h2');
    assert.equal(g.eventsOf('host_changed').length, 1);
  });

  it('todos desconectados: la partida sigue y termina a su hora (AC-C8)', () => {
    const g = activeGame();
    g.ok('h', { type: 'connection', connected: false });
    g.ok('r1', { type: 'connection', connected: false });
    g.advance(20 * MINUTE);
    assert.equal(g.state.phase, 'FINISHED');
    assert.equal(g.state.outcome?.cause, 'time_up');
  });

  it('el anfitrión que se va de la sala de espera cede el puesto de inmediato', () => {
    const g = lobbyWithRunner();
    g.ok('h', { type: 'leave' });
    assert.equal(g.state.hostId, 'r1');
  });
});

describe('caducidad de sala', () => {
  it('30 min sin actividad en LOBBY cierra la sala; la actividad reinicia el plazo', () => {
    const g = lobbyWithRunner();
    g.advance(TIMING.lobbyIdleMs - 1);
    g.ok('r1', { type: 'set_ready', ready: true });
    g.advance(TIMING.lobbyIdleMs - 1);
    assert.equal(g.state.phase, 'LOBBY');
    g.advance(1);
    assert.equal(g.state.phase, 'CANCELLED');
    assert.equal(g.state.closeReason, 'expired');
    const r = g.cmd('x', { type: 'join', name: 'Nuevo', deviceId: 'dev-x' });
    assert.equal(r.ok ? 'ok' : r.error, 'room_closed');
  });
});

describe('revancha (AC-G2, AC-G3)', () => {
  it('invita a los participantes, intercambia roles y solo entran quienes aceptan', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('r1', 10);
    g.ok('r1', { type: 'leave' }); // se fue durante la partida: puede volver en la revancha
    g.ok('h', { type: 'end_game' });
    g.ok('h', { type: 'rematch', swapRoles: true });
    assert.equal(g.state.phase, 'LOBBY');
    assert.equal(g.state.gameNo, 2);
    assert.equal(g.state.players.r2?.status, 'invited');
    assert.equal(g.state.players.r1?.status, 'invited');
    assert.equal(g.state.players.h?.teamPref, 'runner');
    assert.equal(g.state.players.r2?.teamPref, 'hunter');
    g.ok('r2', { type: 'join_rematch' });
    assert.equal(g.state.players.r2?.status, 'lobby');
    // AC-G3: no queda ninguna muestra de ubicación de la partida anterior.
    for (const p of Object.values(g.state.players)) assert.deepEqual(p.samples, []);
    // Quien no aceptó queda fuera al empezar.
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    g.ok('h', { type: 'start' });
    assert.equal(g.state.players.r1?.status, 'left');
  });

  it('la ventana de revancha se cierra a los 30 min', () => {
    const g = activeGame();
    g.ok('h', { type: 'end_game' });
    g.advance(TIMING.rematchWindowMs);
    assert.equal(g.state.phase, 'CANCELLED');
    assert.equal(g.cmd('h', { type: 'rematch', swapRoles: false }).ok, false);
  });
});

describe('determinismo', () => {
  it('las mismas entradas producen exactamente el mismo estado y eventos', () => {
    const run = () => {
      const g = activeGame({ runners: ['r1', 'r2', 'r3'] });
      g.at('h', 0);
      g.at('r1', 3);
      g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
      g.advance(25 * MINUTE);
      return JSON.stringify({ s: g.state, e: g.events });
    };
    assert.equal(run(), run());
  });
});
