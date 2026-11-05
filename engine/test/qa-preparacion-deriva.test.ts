import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distanceM, offsetM } from '../src/geo.ts';
import type { GameConfig } from '../src/types.ts';
import { CENTER, Harness, config } from './helpers.ts';

// QA independiente (ciclo UX 11/2026). La política de «listo» compara cada `configure` con la configuración
// ANTERIOR, no con la que cada jugador aceptó al marcar «Estoy listo». Varios recentrados de menos de 50 m
// seguidos desplazan la zona tanto como se quiera sin quitar el «listo» a nadie.
// Corregido en el mismo ciclo (D-058): ya no es `todo`. Desde D-062 la referencia es la que aceptó cada
// jugador (engine/test/preparacion-referencia.test.ts).

const at = (m: number): GameConfig => {
  const c = offsetM(CENTER, m, 0);
  return config({ zone: [{ fromOffsetMs: 0, center: c, radiusM: 400 }], meetingPoint: c });
};

describe('QA · preparación: deriva acumulada de la zona', () => {
  it('un único salto de 135 m sí quita el «listo» (control)', () => {
    const g = new Harness();
    g.join('a');
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    g.ok('h', { type: 'configure', config: at(135) });
    assert.equal(g.state.players.a?.ready, false);
  });

  it('tres recentrados de 45 m (135 m en total) deberían quitar el «listo» a los demás', () => {
    const g = new Harness();
    g.join('a');
    g.ok('h', { type: 'configure', config: config() });
    g.readyAll();
    for (const m of [45, 90, 135]) g.ok('h', { type: 'configure', config: at(m) });
    assert.ok(distanceM(CENTER, g.state.config!.zone[0]!.center) > 130);
    assert.equal(g.state.players.a?.ready, false, 'la zona que «a» aceptó está a más de 130 m');
  });
});
