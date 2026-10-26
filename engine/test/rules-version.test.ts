import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RULES_VERSION } from '../src/constants.ts';
import { snapshotFor } from '../src/view.ts';
import { Harness, activeGame } from './helpers.ts';

// Plan Maestro §8.3: «cada Match guarda versión de reglas para poder entender el resultado aunque el
// modo cambie más adelante».

describe('versión de reglas de cada partida', () => {
  it('no hay versión antes de la primera partida', () => {
    const g = new Harness();
    assert.equal(g.state.rulesVersion, null);
  });

  it('se fija al empezar, viaja en game_finished y en la instantánea, y se conserva en el final', () => {
    const g = activeGame();
    assert.equal(g.state.rulesVersion, RULES_VERSION);
    g.ok('r1', { type: 'self_tag' });
    assert.equal(g.state.phase, 'FINISHED');
    assert.equal(g.eventsOf('game_finished').at(-1)?.data.rulesVersion, RULES_VERSION);
    assert.equal(snapshotFor(g.state, 'r1', g.now).rulesVersion, RULES_VERSION);
  });
});
