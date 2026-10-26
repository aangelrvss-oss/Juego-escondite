import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SECOND } from '../src/constants.ts';
import { latestSample } from '../src/location.ts';
import { activeGame } from './helpers.ts';
import type { Harness } from './helpers.ts';

// Plan Maestro §4.1 («filtrar saltos imposibles… si hay duda, pedir que espere») y §10 («se considera
// fallo si un salto GPS aislado valida captura o llegada»). Lecturas SIMULADAS: no es GPS real.

const err = (r: { ok: boolean; error?: string }) => (r.ok ? 'ok' : r.error);
const claim = (g: Harness, runner = 'r1') => err(g.cmd('h', { type: 'claim_tag', runnerId: runner }));
const jumpOf = (g: Harness, id: string) => latestSample(g.state.players[id]!)?.jump === true;

describe('saltos del GPS y capturas (Plan Maestro §4.1 y §10)', () => {
  it('un fugitivo lejos que «aparece» junto al cazador en un salto aislado no puede ser capturado', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 300); // 300 m al norte
    g.now += 5 * SECOND;
    g.at('h', 0);
    g.at('r1', 6); // 294 m en 5 s: ~59 m/s, imposible
    assert.equal(jumpOf(g, 'r1'), true);
    assert.equal(claim(g), 'target_location_unstable');
    assert.equal(g.eventsOf('tag_claimed').length, 0, 'ni siquiera se crea la reclamación');
  });

  it('si la siguiente lectura confirma la nueva posición, la captura vuelve a ser posible', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 300);
    g.now += 5 * SECOND;
    g.at('r1', 6); // salto
    g.now += 5 * SECOND;
    g.at('h', 0);
    g.at('r1', 7); // coherente con la anterior: confirma el movimiento
    assert.equal(jumpOf(g, 'r1'), false);
    assert.equal(claim(g), 'ok');
  });

  it('un valor atípico aislado se descarta: la lectura que vuelve a la posición real no es un salto', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 6);
    g.now += 5 * SECOND;
    g.at('r1', 500); // atípico
    assert.equal(jumpOf(g, 'r1'), true);
    g.now += 5 * SECOND;
    g.at('h', 0);
    g.at('r1', 6); // vuelve: coherente con la última lectura sana
    assert.equal(jumpOf(g, 'r1'), false);
    assert.equal(claim(g), 'ok');
  });

  it('el salto del propio cazador también bloquea la reclamación', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0, 8, g.now, 300); // 300 m al este
    g.at('r1', 6);
    g.now += 5 * SECOND;
    g.at('h', 0); // salta al centro
    g.at('r1', 6);
    assert.equal(claim(g), 'your_location_unstable');
  });

  it('el ruido normal del GPS (dentro de la precisión) no es un salto', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 6, 25);
    g.now += 2 * SECOND;
    g.at('h', 0);
    g.at('r1', 50, 25); // 44 m en 2 s, pero con ±25 m en cada lectura
    assert.equal(jumpOf(g, 'r1'), false);
  });

  it('caminar o correr de verdad no es un salto (8 m/s durante 10 s)', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    for (let i = 0; i <= 10; i++) {
      g.at('r1', i * 8, 5);
      assert.equal(jumpOf(g, 'r1'), false, `paso ${i}`);
      g.now += SECOND;
    }
  });

  it('dos lecturas casi simultáneas muy separadas cuentan como salto (no se ignoran por llegar juntas)', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('h', 0);
    g.at('r1', 300);
    g.now += 300;
    g.at('r1', 6);
    assert.equal(jumpOf(g, 'r1'), true);
    assert.equal(claim(g), 'target_location_unstable');
  });

  it('el salto no aparece en lo que ve nadie (posiciones visibles y pistas sin campos internos)', () => {
    const g = activeGame({ runners: ['r1', 'r2'] });
    g.at('r1', 300);
    g.now += 5 * SECOND;
    g.at('r1', 6);
    g.at('r2', 10);
    assert.doesNotMatch(JSON.stringify(g.events), /"jump"/);
  });
});
