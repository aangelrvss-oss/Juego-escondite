import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, SECOND } from '../src/constants.ts';
import { tick } from '../src/engine.ts';
import { availabilityOf, latestSample } from '../src/location.ts';
import { Harness, activeGame, config } from './helpers.ts';

describe('tiempo autoritativo (AC-C2, AC-C3, T09)', () => {
  it('las pistas llegan en activeStart + k·intervalo y nunca coinciden con el final', () => {
    // 12 min con pista cada 3 min: pistas a los 3, 6 y 9 min; a los 12 termina sin pista.
    const g = activeGame({ cfg: { durationMs: 12 * MINUTE, pingIntervalMs: 3 * MINUTE } });
    const start = g.state.activeStart ?? 0;
    g.advance(12 * MINUTE);
    assert.deepEqual(
      g.eventsOf('ping').map((e) => e.at - start),
      [3 * MINUTE, 6 * MINUTE, 9 * MINUTE],
    );
    assert.equal(g.state.phase, 'FINISHED');
  });

  it('un tick tardío procesa todos los plazos vencidos en orden cronológico', () => {
    const g = new Harness();
    g.join('r1', 'runner');
    g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
    g.ok('h', { type: 'configure', config: config({ durationMs: 10 * MINUTE, pingIntervalMs: 2 * MINUTE }) });
    g.readyAll();
    g.ok('h', { type: 'start' });
    // 15 min: cubre cuenta atrás + ventaja + partida, pero no la ventana de revancha.
    const step = tick(g.state, g.now + 15 * MINUTE);
    const times = step.events.map((e) => e.at);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.deepEqual(
      step.events.map((e) => e.type).filter((t) => t !== 'ping_sent'),
      ['role_revealed', 'role_revealed', 'head_start_started', 'hunt_started', 'ping', 'ping', 'ping', 'ping', 'game_finished'],
    );
  });

  it('un comando que llega tras el final se evalúa después de cerrar la partida', () => {
    const g = activeGame();
    g.at('h', 0);
    g.at('r1', 2);
    g.now += 20 * MINUTE; // sin tick intermedio: el comando dispara el procesamiento
    const r = g.cmd('h', { type: 'claim_tag', runnerId: 'r1' });
    assert.equal(r.ok ? 'ok' : r.error, 'wrong_phase');
    assert.equal(g.state.phase, 'FINISHED');
  });

  it('ningún comando de cliente provoca el paso a HEAD_START o ACTIVE', () => {
    const g = new Harness();
    g.join('r1', 'runner');
    g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    g.ok('h', { type: 'start' });
    for (const command of [{ type: 'start' }, { type: 'end_game' }, { type: 'self_tag' }] as const) {
      g.cmd('h', command);
      g.cmd('r1', command);
    }
    assert.equal(g.state.phase, 'COUNTDOWN');
  });
});

describe('marcas de tiempo de las muestras (GAME_STATE_MACHINE §6)', () => {
  it('una muestra con hora futura se marca como sospechosa y nunca es CURRENT', () => {
    const g = activeGame();
    const r = g.at('r1', 5, 8, g.now + 10 * MINUTE);
    assert.deepEqual(r, { ok: true, data: { accepted: true, clockSuspect: true } });
    const s = latestSample(g.state.players.r1!);
    assert.equal(availabilityOf(s, g.now), 'STALE');
  });

  it('una muestra antigua (guardada sin cobertura) conserva su antigüedad real', () => {
    // Corrige una ambigüedad del documento: usar la hora de recepción haría parecer
    // actual una muestra de hace minutos. El motor respeta measuredAt si es pasado.
    const g = activeGame();
    g.at('r1', 5, 8, g.now - 200 * SECOND);
    const s = latestSample(g.state.players.r1!);
    assert.equal(availabilityOf(s, g.now), 'UNAVAILABLE');
  });

  it('los umbrales: CURRENT ≤ 15 s, STALE ≤ 120 s, UNAVAILABLE después; precisión > 50 m = STALE', () => {
    const g = activeGame();
    g.at('r1', 5, 8);
    const s = latestSample(g.state.players.r1!);
    assert.equal(availabilityOf(s, g.now + 15 * SECOND), 'CURRENT');
    assert.equal(availabilityOf(s, g.now + 15 * SECOND + 1), 'STALE');
    assert.equal(availabilityOf(s, g.now + 120 * SECOND), 'STALE');
    assert.equal(availabilityOf(s, g.now + 120 * SECOND + 1), 'UNAVAILABLE');
    g.now += 1_000;
    g.at('r1', 5, 60);
    assert.equal(availabilityOf(latestSample(g.state.players.r1!), g.now), 'STALE');
    assert.equal(availabilityOf(null, g.now), 'UNAVAILABLE');
  });

  it('una muestra fuera de orden no sustituye a una más reciente (AC-D5)', () => {
    const g = activeGame();
    g.at('r1', 50, 8, g.now);
    const r = g.at('r1', 0, 8, g.now - 3_000);
    assert.deepEqual(r, { ok: true, data: { accepted: false, clockSuspect: false } });
    assert.equal(g.state.players.r1?.samples.length, 1);
  });

  it('marca ubicación simulada y velocidades implausibles sostenidas', () => {
    const g = activeGame();
    g.cmd('r1', { type: 'location', sample: { lat: 40.4153, lng: -3.6845, accuracyM: 5, measuredAt: g.now, isMock: true } });
    for (let i = 1; i <= 4; i++) {
      g.now += 1_000;
      g.at('r1', i * 100); // 100 m por segundo
    }
    assert.deepEqual(g.state.players.r1?.flags, ['mock_location', 'implausible_speed']);
  });
});
