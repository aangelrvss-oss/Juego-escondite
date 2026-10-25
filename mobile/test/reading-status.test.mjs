import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THRESHOLDS, accuracyOf, ageNow, availabilityOf, classify, formatAge, freshnessOf, statusLabel } from '../www/js/reading-status.js';
import { availabilityOf as engineAvailability } from '../../engine/src/location.ts';
import { LOCATION } from '../../engine/src/constants.ts';

test('umbrales iguales a los del motor S0 y a los de S1 (experimentales, D-038)', () => {
  assert.equal(THRESHOLDS.currentMaxAgeMs, LOCATION.currentMaxAgeMs);
  assert.equal(THRESHOLDS.staleMaxAgeMs, LOCATION.staleMaxAgeMs);
  assert.equal(THRESHOLDS.currentMaxAccuracyM, LOCATION.currentMaxAccuracyM);
  const s1 = readFileSync(new URL('../../android/core/src/main/java/es/escondite/s1/core/ExperimentalParams.java', import.meta.url), 'utf8');
  assert.match(s1, /CURRENT_MAX_AGE_MS = 15_000;/);
  assert.match(s1, /STALE_MAX_AGE_MS = 120_000;/);
  assert.match(s1, /CURRENT_MAX_ACCURACY_M = 50f;/);
});

test('disponibilidad idéntica a availabilityOf() del motor en una rejilla de edades y precisiones', () => {
  const now = 1_000_000;
  for (const age of [0, 1, 14_999, 15_000, 15_001, 60_000, 119_999, 120_000, 120_001, 600_000]) {
    for (const acc of [0, 5, 49.9, 50, 50.1, 200]) {
      const sample = { lat: 40, lng: -3, accuracyM: acc, measuredAt: now - age, receivedAt: now, clockSuspect: false, effectiveAt: now - age };
      assert.equal(availabilityOf(age, acc), engineAvailability(sample, now), `age=${age} acc=${acc}`);
    }
  }
  assert.equal(availabilityOf(null, 10), engineAvailability(null, now));
});

test('frescura y precisión son independientes; la precisión desconocida nunca es suficiente', () => {
  assert.equal(freshnessOf(null), 'NONE');
  assert.equal(freshnessOf(15_000), 'UPDATED');
  assert.equal(freshnessOf(15_001), 'OLD');
  assert.equal(accuracyOf(50), 'SUFFICIENT');
  assert.equal(accuracyOf(50.01), 'INSUFFICIENT');
  for (const v of [null, undefined, NaN, -1, Infinity]) assert.equal(accuracyOf(v), 'UNKNOWN');
  assert.equal(availabilityOf(1_000, null), 'STALE', 'reciente pero sin precisión conocida: no es actual');
});

test('la antigüedad avanza desde la recepción, con el valor medido por el módulo nativo', () => {
  const r = { ageMs: 2_000, receivedAt: 10_000, accuracyM: 8 };
  assert.equal(ageNow(r, 10_000), 2_000);
  assert.equal(ageNow(r, 25_000), 17_000);
  assert.equal(ageNow(r, 9_000), 2_000, 'un reloj que retrocede no rejuvenece la lectura');
  assert.equal(ageNow(null, 1), null);
  assert.equal(classify(r, 12_000).availability, 'CURRENT');
  assert.equal(classify(r, 25_000).availability, 'STALE');
  assert.equal(classify(r, 200_000).availability, 'UNAVAILABLE');
});

test('etiquetas: una lectura antigua o imprecisa nunca se presenta como actual', () => {
  assert.equal(statusLabel(classify(null, 0)), 'No disponible');
  assert.equal(statusLabel(classify({ ageMs: 0, receivedAt: 0, accuracyM: 8 }, 1_000)), 'Actual');
  assert.equal(statusLabel(classify({ ageMs: 0, receivedAt: 0, accuracyM: 8 }, 20_000)), 'Antigua');
  assert.equal(statusLabel(classify({ ageMs: 0, receivedAt: 0, accuracyM: 80 }, 1_000)), 'Imprecisa');
  assert.equal(statusLabel(classify({ ageMs: 0, receivedAt: 0, accuracyM: 8 }, 200_000)), 'No disponible');
});

test('formato de antigüedad: redondea hacia arriba, como S1', () => {
  assert.equal(formatAge(null), '—');
  assert.equal(formatAge(0), '0 s');
  assert.equal(formatAge(1), '1 s');
  assert.equal(formatAge(15_000), '15 s');
  assert.equal(formatAge(15_001), '16 s');
  assert.equal(formatAge(59_001), '1 min 00 s');
  assert.equal(formatAge(3_665_000), '61 min 05 s');
});
