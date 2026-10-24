import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MINUTE } from '../src/constants.ts';
import { validateConfig } from '../src/config.ts';
import { distanceM, isOutsideZone, offsetM, zoneAt } from '../src/geo.ts';
import type { ZoneVersion } from '../src/types.ts';
import { CENTER, config } from './helpers.ts';

// La zona que se reduce o se desplaza está FUERA DEL MVP (MVP_SCOPE §3) y sus reglas de
// juego (avisos, ritmo, quién la mueve) no están definidas. Aquí solo se prueba la
// geometría de la estructura versionada prevista en MVP_SCOPE §4.

const schedule: ZoneVersion[] = [
  { fromOffsetMs: 0, center: CENTER, radiusM: 800 },
  { fromOffsetMs: 10 * MINUTE, center: CENTER, radiusM: 500 }, // se reduce
  { fromOffsetMs: 20 * MINUTE, center: offsetM(CENTER, 200, 0), radiusM: 300 }, // se reduce y se desplaza
];

describe('geometría', () => {
  it('distancia y desplazamiento son coherentes', () => {
    assert.ok(Math.abs(distanceM(CENTER, offsetM(CENTER, 300, 400)) - 500) < 0.5);
  });

  it('fuera de zona solo si lo está descontando la precisión', () => {
    const zone = { fromOffsetMs: 0, center: CENTER, radiusM: 400 };
    assert.equal(isOutsideZone(offsetM(CENTER, 410, 0), 5, zone), true);
    assert.equal(isOutsideZone(offsetM(CENTER, 410, 0), 15, zone), false);
  });
});

describe('zona versionada (preparación, no regla del MVP)', () => {
  it('selecciona la versión vigente según el desfase desde el inicio de ACTIVE', () => {
    assert.equal(zoneAt(schedule, -5 * MINUTE).radiusM, 800);
    assert.equal(zoneAt(schedule, 0).radiusM, 800);
    assert.equal(zoneAt(schedule, 10 * MINUTE - 1).radiusM, 800);
    assert.equal(zoneAt(schedule, 10 * MINUTE).radiusM, 500);
    assert.equal(zoneAt(schedule, 25 * MINUTE).radiusM, 300);
  });

  it('un punto dentro de la zona inicial queda fuera tras reducirse y desplazarse', () => {
    const p = offsetM(CENTER, -350, 0);
    assert.equal(isOutsideZone(p, 5, zoneAt(schedule, 0)), false);
    assert.equal(isOutsideZone(p, 5, zoneAt(schedule, 10 * MINUTE)), false);
    assert.equal(isOutsideZone(p, 5, zoneAt(schedule, 20 * MINUTE)), true);
  });

  it('el orden de entrada del calendario no importa', () => {
    assert.equal(zoneAt([...schedule].reverse(), 12 * MINUTE).radiusM, 500);
  });

  it('el validador del MVP rechaza más de una versión o un inicio distinto de 0', () => {
    assert.equal(validateConfig(config({ zone: schedule })), 'zone');
    assert.equal(validateConfig(config({ zone: [{ fromOffsetMs: 60_000, center: CENTER, radiusM: 400 }] })), 'zone');
    assert.equal(validateConfig(config()), null);
  });
});
