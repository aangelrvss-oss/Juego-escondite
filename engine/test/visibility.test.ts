import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE, SECOND, TIMING } from '../src/constants.ts';
import { canReceive, snapshotFor, visiblePositions } from '../src/view.ts';
import { Harness, activeGame, config } from './helpers.ts';

const ids = (g: Harness, viewer: string) => visiblePositions(g.state, viewer, g.now).map((v) => `${v.playerId}:${v.reason}`);

function headStartGame(): Harness {
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  g.join('h2', 'hunter');
  g.join('r1', 'runner');
  g.join('r2', 'runner');
  g.ok('h', { type: 'configure', config: config() });
  g.readyAll();
  g.ok('h', { type: 'start' });
  g.advance(TIMING.countdownMs);
  assert.equal(g.state.phase, 'HEAD_START');
  return g;
}

describe('aislamiento de datos por equipo (AC-D1, AC-D2, AC-D3)', () => {
  it('en HEAD_START un cazador solo ve a cazadores, aunque un fugitivo esté fuera de zona', () => {
    const g = headStartGame();
    for (const id of ['h', 'h2', 'r1', 'r2']) g.at(id, 10);
    g.at('r1', 900); // fuera de la zona de 400 m
    g.advance(TIMING.outOfZoneGraceMs + SECOND);
    assert.deepEqual(ids(g, 'h'), ['h2:teammate']);
    assert.deepEqual(ids(g, 'r1'), ['r2:teammate']);
    // Ningún evento con audiencia de cazadores contiene datos de fugitivos en HEAD_START.
    const toHunters = g.events.filter((e) => canReceive(g.state, e.audience, 'h'));
    assert.equal(toHunters.some((e) => e.containsLocation), false);
  });

  it('en ACTIVE un fugitivo nunca recibe la posición de un cazador', () => {
    const g = activeGame({ hunters: ['h2'], runners: ['r1', 'r2'] });
    for (const id of ['h', 'h2', 'r1', 'r2']) g.at(id, 10);
    g.at('h', 900); // un cazador fuera de zona tampoco se expone a los fugitivos
    g.advance(TIMING.outOfZoneGraceMs + SECOND);
    assert.deepEqual(ids(g, 'r1'), ['r2:teammate']);
    assert.deepEqual(ids(g, 'r2'), ['r1:teammate']);
  });

  it('un cazador solo ve a un fugitivo tras 30 s fuera de zona, y deja de verlo al volver', () => {
    const g = activeGame({ runners: ['r1'] });
    g.at('h', 0);
    g.at('r1', 900);
    assert.deepEqual(ids(g, 'h'), []);
    g.advance(TIMING.outOfZoneGraceMs - 1);
    assert.deepEqual(ids(g, 'h'), []);
    g.advance(1);
    assert.deepEqual(ids(g, 'h'), ['r1:exposed']);
    g.now += SECOND;
    g.at('r1', 100);
    assert.deepEqual(ids(g, 'h'), []);
    assert.equal(g.eventsOf('runner_exposed').length, 1);
    assert.equal(g.eventsOf('runner_unexposed').length, 1);
  });

  it('beneficio de la duda: con precisión amplia en el borde no cuenta como fuera', () => {
    const g = activeGame();
    g.at('r1', 420, 30); // 420 m − 30 m de precisión = 390 m < 400 m
    assert.equal(g.state.players.r1?.outsideSince, null);
    g.now += SECOND;
    g.at('r1', 420, 10); // 410 m > 400 m
    assert.notEqual(g.state.players.r1?.outsideSince, null);
  });

  it('la pista llega solo a los cazadores, con antigüedad; los fugitivos reciben un aviso sin coordenadas', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('r1', 50);
    g.advance(10 * SECOND);
    g.advance(3 * MINUTE - 10 * SECOND);
    const [ping] = g.eventsOf('ping');
    assert.ok(ping);
    assert.deepEqual(ping.audience, { kind: 'team', team: 'hunter' });
    assert.equal(ping.containsLocation, true);
    const entries = (ping.data.ping as { entries: { runnerId: string; ageMs: number | null; availability: string }[] }).entries;
    const r1 = entries.find((e) => e.runnerId === 'r1');
    const r2 = entries.find((e) => e.runnerId === 'r2');
    assert.equal(r1?.ageMs, 3 * MINUTE);
    assert.equal(r1?.availability, 'UNAVAILABLE');
    assert.equal(r2?.ageMs, null);
    assert.equal(canReceive(g.state, ping.audience, 'r1'), false);
    const [sent] = g.eventsOf('ping_sent');
    assert.deepEqual(sent?.data, { pingNo: 1 });
  });

  it('toda posición visible incluye su antigüedad (AC-D4)', () => {
    const g = activeGame({ hunters: ['h2'] });
    g.at('h2', 10);
    g.advance(20 * SECOND);
    const [v] = visiblePositions(g.state, 'h', g.now);
    assert.equal(v?.ageMs, 20 * SECOND);
    assert.equal(v?.availability, 'STALE');
  });

  it('un capturado ve a todos con 60 s de retraso y deja de compartir su ubicación', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r2', 30);
    g.ok('r1', { type: 'self_tag' });
    assert.deepEqual(visiblePositions(g.state, 'r1', g.now).map((v) => v.lat), [null, null]);
    g.advance(TIMING.spectatorDelayMs);
    const seen = visiblePositions(g.state, 'r1', g.now);
    assert.deepEqual(seen.map((v) => `${v.playerId}:${v.reason}`), ['h:spectator_delayed', 'r2:spectator_delayed']);
    assert.ok(seen.every((v) => v.lat !== null));
    const r = g.at('r1', 10);
    assert.equal(r.ok ? 'ok' : r.error, 'not_sharing');
  });

  it('al terminar no queda ninguna posición ni pista (AC-D6, AC-G1)', () => {
    const g = activeGame();
    g.at('h', 0);
    g.at('r1', 30);
    g.advance(3 * MINUTE);
    assert.ok(g.state.lastPing);
    g.ok('h', { type: 'end_game' });
    assert.equal(g.state.lastPing, null);
    for (const p of Object.values(g.state.players)) assert.deepEqual(p.samples, []);
    assert.deepEqual(visiblePositions(g.state, 'h', g.now), []);
    const finished = g.eventsOf('game_finished')[0];
    assert.doesNotMatch(JSON.stringify(finished?.data), /"lat"|"lng"/);
  });

  it('la instantánea solo incluye la última pista para un cazador activo', () => {
    const g = activeGame();
    g.at('r1', 30);
    g.advance(3 * MINUTE);
    assert.ok(snapshotFor(g.state, 'h', g.now).lastPing);
    assert.equal(snapshotFor(g.state, 'r1', g.now).lastPing, null);
  });

  it('un jugador que se ha ido no recibe nada', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.ok('r2', { type: 'leave' });
    assert.equal(canReceive(g.state, { kind: 'all' }, 'r2'), false);
    assert.deepEqual(visiblePositions(g.state, 'r2', g.now), []);
  });
});
