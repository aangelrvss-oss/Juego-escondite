import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULTS, LIMITS, MINUTE, SECOND, START_ZONE, TIMING } from '../src/constants.ts';
import { snapshotFor } from '../src/view.ts';
import { Harness, config } from './helpers.ts';

// Secuencia de inicio de partida (D-042).

// Sala con anfitrión «h» y tres jugadores con preferencia aleatoria, ya en la cuenta atrás.
function counting(cfg: Parameters<typeof config>[0] = {}): Harness {
  const g = new Harness();
  for (const id of ['a', 'b', 'c']) g.join(id);
  g.ok('h', { type: 'configure', config: config(cfg) });
  g.readyAll();
  g.ok('h', { type: 'start' });
  assert.equal(g.state.phase, 'COUNTDOWN');
  return g;
}

describe('secuencia de inicio (D-042)', () => {
  it('cuenta atrás de 5 s marcada por el servidor, sin revelar ningún equipo', () => {
    const g = counting();
    assert.equal(TIMING.countdownMs, 5 * SECOND);
    assert.equal(g.state.countdownEnd, g.now + 5 * SECOND);
    const [started] = g.eventsOf('countdown_started');
    assert.deepEqual(started?.data, { countdownEnd: g.state.countdownEnd });
    for (const id of g.state.playerOrder) {
      const snap = snapshotFor(g.state, id, g.now);
      assert.ok(snap.players.every((p) => p.team === null), `${id} no ve equipos durante la cuenta atrás`);
    }
    assert.equal(g.eventsOf('role_revealed').length, 0);
  });

  it('al terminar, cada jugador recibe solo su propio rol', () => {
    const g = counting();
    g.advance(TIMING.countdownMs - 1);
    assert.equal(g.eventsOf('role_revealed').length, 0);
    g.advance(1);
    assert.equal(g.state.phase, 'HEAD_START');
    const reveals = g.eventsOf('role_revealed');
    assert.equal(reveals.length, g.state.playerOrder.length);
    for (const e of reveals) {
      assert.equal(e.audience.kind, 'players');
      const ids = (e.audience as { ids: string[] }).ids;
      assert.equal(ids.length, 1, 'un aviso por jugador');
      assert.equal(e.data.team, g.state.players[ids[0]!]?.team);
    }
    const own = snapshotFor(g.state, 'a', g.now).players.find((p) => p.id === 'a');
    assert.equal(own?.team, g.state.players.a?.team);
  });

  it('tiempo de huida: mínimo y valor por defecto de 2 min', () => {
    assert.equal(LIMITS.headStartMs.min, 2 * MINUTE);
    assert.equal(DEFAULTS.headStartMs, 2 * MINUTE);
    const g = new Harness();
    g.join('a');
    const tooShort = g.cmd('h', { type: 'configure', config: config({ headStartMs: 2 * MINUTE - 1 }) });
    assert.deepEqual(tooShort, { ok: false, error: 'invalid_config', detail: 'headStartMs' });
    const { headStartMs: _omitted, ...withoutHeadStart } = config();
    g.ok('h', { type: 'configure', config: withoutHeadStart });
    assert.equal(g.state.config?.headStartMs, 2 * MINUTE);
    g.ok('h', { type: 'configure', config: config({ headStartMs: 5 * MINUTE }) });
    assert.equal(g.state.config?.headStartMs, 5 * MINUTE);
  });

  it('la persecución empieza para todos a la vez, con la hora del servidor', () => {
    const g = counting({ headStartMs: 3 * MINUTE });
    g.advance(TIMING.countdownMs);
    const end = g.state.headStartEnd;
    assert.equal(end, g.now + 3 * MINUTE);
    g.advance(3 * MINUTE - 1);
    assert.equal(g.state.phase, 'HEAD_START');
    g.advance(1);
    assert.equal(g.state.phase, 'ACTIVE');
    const [hunt] = g.eventsOf('hunt_started');
    assert.deepEqual(hunt?.audience, { kind: 'all' });
    assert.equal(hunt?.at, end);
  });

  it('al reconectar se recupera la fase y el tiempo restante, sin reiniciar', () => {
    const g = counting();
    g.advance(TIMING.countdownMs + 30 * SECOND);
    const end = g.state.headStartEnd;
    g.ok('a', { type: 'connection', connected: false });
    g.advance(20 * SECOND);
    g.ok('a', { type: 'connection', connected: true });
    const snap = snapshotFor(g.state, 'a', g.now);
    assert.equal(snap.phase, 'HEAD_START');
    assert.equal(snap.headStartEnd, end);
    assert.equal(snap.headStartEnd! - snap.serverNow, 2 * MINUTE - 50 * SECOND);
    assert.equal(snap.players.find((p) => p.id === 'a')?.team, g.state.players.a?.team);
  });
});

describe('zona de salida de los cazadores durante la ventaja (D-042)', () => {
  function headStart(): Harness {
    const g = new Harness();
    g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
    g.join('r1', 'runner');
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    g.ok('h', { type: 'start' });
    g.advance(TIMING.countdownMs);
    assert.equal(g.state.phase, 'HEAD_START');
    return g;
  }
  const R = START_ZONE.radiusM;

  it('avisa una vez, solo al cazador y sin coordenadas, si se aleja con una lectura fiable', () => {
    const g = headStart();
    g.at('h', R + 40, 10);
    const [warn] = g.eventsOf('start_zone_warning');
    assert.deepEqual(warn?.audience, { kind: 'players', ids: ['h'] });
    assert.equal(warn?.containsLocation, undefined);
    assert.ok(!('lat' in (warn?.data ?? {})) && !('lng' in (warn?.data ?? {})));
    g.advance(5 * SECOND);
    g.at('h', R + 60, 10);
    assert.equal(g.eventsOf('start_zone_warning').length, 1, 'sin repetir el aviso');
    g.advance(5 * SECOND);
    g.at('h', R - 10, 10);
    assert.equal(g.eventsOf('start_zone_returned').length, 1);
    assert.equal(g.state.phase, 'HEAD_START', 'avisar no sanciona ni cambia la partida');
  });

  it('no avisa si la precisión podría explicar la distancia', () => {
    const g = headStart();
    g.at('h', R + 20, 25); // fuera según la estimación, pero dentro si la precisión es de 25 m
    g.advance(5 * SECOND);
    g.at('h', R + 30, 60); // precisión insuficiente: no cuenta
    assert.equal(g.eventsOf('start_zone_warning').length, 0);
  });

  it('no avisa con una lectura antigua', () => {
    const g = headStart();
    g.at('h', R + 200, 8, g.now - 30 * SECOND);
    assert.equal(g.eventsOf('start_zone_warning').length, 0);
  });

  it('no afecta a los fugitivos ni a la fase de persecución', () => {
    const g = headStart();
    g.at('r1', R + 300, 8);
    g.advance(2 * MINUTE);
    assert.equal(g.state.phase, 'ACTIVE');
    g.at('h', R + 300, 8);
    assert.equal(g.eventsOf('start_zone_warning').length, 0);
  });
});
