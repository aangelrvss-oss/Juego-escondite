import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TIMING } from '../src/constants.ts';
import type { Command, Phase } from '../src/types.ts';
import { Harness, config } from './helpers.ts';

// Plan Maestro §2.3, estado BRIEFING: «roles y reglas quedan fijados; no se permiten cambios que
// alteren una ventaja». En este motor no hay una fase BRIEFING aparte: las reglas se fijan al pulsar
// «Empezar». Aquí se comprueba que, desde ese momento, nada de lo que decide la partida cambia, y que
// en la sala de espera cualquier cambio de reglas obliga a todos a aceptarlas otra vez.

function startedGame(): Harness {
  const g = new Harness();
  g.ok('h', { type: 'set_team_pref', pref: 'hunter' });
  g.join('r1', 'runner');
  g.join('r2', 'runner');
  g.ok('h', { type: 'configure', config: config() });
  g.readyAll();
  g.ok('h', { type: 'start' });
  return g;
}

const CHANGES: [string, string, Command][] = [
  ['configurar', 'h', { type: 'configure', config: config({ durationMs: 10 * 60_000 }) }],
  ['asignar un rol', 'h', { type: 'assign_team', targetId: 'r1', pref: 'hunter' }],
  ['cambiar la preferencia', 'r1', { type: 'set_team_pref', pref: 'hunter' }],
  ['expulsar', 'h', { type: 'kick', targetId: 'r2' }],
  ['cambiar el «listo»', 'r1', { type: 'set_ready', ready: false }],
];

describe('reglas y roles fijados desde «Empezar» (BRIEFING del Plan)', () => {
  for (const [phase, advance] of [
    ['COUNTDOWN', 0],
    ['HEAD_START', TIMING.countdownMs],
    ['ACTIVE', TIMING.countdownMs + 2 * 60_000],
  ] as [Phase, number][]) {
    it(`en ${phase} no se puede cambiar nada que altere la partida`, () => {
      const g = startedGame();
      g.advance(advance);
      assert.equal(g.state.phase, phase);
      const before = structuredClone({
        config: g.state.config,
        teams: Object.fromEntries(Object.values(g.state.players).map((p) => [p.id, p.team])),
        statuses: Object.fromEntries(Object.values(g.state.players).map((p) => [p.id, p.status])),
        rulesVersion: g.state.rulesVersion,
      });
      for (const [what, actor, command] of CHANGES) {
        const r = g.cmd(actor, command);
        assert.equal(r.ok ? 'ok' : r.error, 'wrong_phase', what);
      }
      assert.deepEqual(
        {
          config: g.state.config,
          teams: Object.fromEntries(Object.values(g.state.players).map((p) => [p.id, p.team])),
          statuses: Object.fromEntries(Object.values(g.state.players).map((p) => [p.id, p.status])),
          rulesVersion: g.state.rulesVersion,
        },
        before,
      );
    });
  }

  it('en la sala de espera, cambiar las reglas quita el «listo» a todos: nadie empieza con reglas que no ha visto', () => {
    const g = new Harness();
    g.join('r1', 'runner');
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    assert.ok(Object.values(g.state.players).every((p) => p.ready));
    g.ok('h', { type: 'configure', config: config({ pingIntervalMs: 5 * 60_000 }) });
    assert.ok(Object.values(g.state.players).every((p) => !p.ready));
    assert.equal(g.cmd('h', { type: 'start' }).ok, false, 'no se puede empezar hasta que vuelvan a estar listos');
  });
});
