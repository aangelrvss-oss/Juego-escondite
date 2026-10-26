import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TAG, TIMING } from '../../engine/src/constants.ts';
import { RULES, briefing } from '../www/js/game-view.js';

// Briefing común (Plan Maestro §2.1 paso 5, §3.3 y §7). La interfaz explica las reglas del motor; esta
// prueba impide que los textos se desincronicen de los valores que aplica el servidor.

test('los números del briefing son los del motor', () => {
  assert.equal(RULES.countdownMs, TIMING.countdownMs);
  assert.equal(RULES.tagMaxAgeMs, TAG.maxAgeMs);
  assert.equal(RULES.tagMaxAccuracyM, TAG.maxAccuracyM);
  assert.equal(RULES.tagConfirmMs, TIMING.tagConfirmMs);
  assert.equal(RULES.outOfZoneGraceMs, TIMING.outOfZoneGraceMs);
  assert.equal(RULES.spectatorDelayMs, TIMING.spectatorDelayMs);
});

test('sin configuración no hay briefing', () => {
  assert.equal(briefing(null), null);
});

test('usa la configuración de la sala y cubre todo lo que cambia la estrategia', () => {
  const rules = briefing({
    durationMs: 45 * 60_000,
    headStartMs: 3 * 60_000,
    pingIntervalMs: 5 * 60_000,
    zone: [{ fromOffsetMs: 0, center: { lat: 0, lng: 0 }, radiusM: 600 }],
    meetingPoint: { lat: 0, lng: 0 },
    safetyChecklistConfirmed: true,
  });
  const titles = rules.map((r) => r.title);
  assert.deepEqual(titles, ['Objetivo', 'Roles', 'Tiempo', 'Zona', 'Pistas', 'Captura', 'Capturados', 'Seguridad']);
  const text = Object.fromEntries(rules.map((r) => [r.title, r.text]));
  assert.match(text.Tiempo, /3 min de huida.*45 min de persecución/);
  assert.match(text.Zona, /600 m/);
  assert.match(text.Zona, /30 s fuera/);
  assert.match(text.Zona, /cazador fuera de la zona no puede capturar/);
  assert.match(text.Pistas, /Cada 5 min/);
  assert.match(text.Captura, /15 s o menos.*±30 m.*30 s/);
  assert.match(text.Captura, /sin saltos del GPS/);
  assert.match(text.Capturados, /60 s de retraso/);
  assert.match(text.Seguridad, /calzadas/);
  assert.match(text.Seguridad, /abandonar la partida/);
  assert.doesNotMatch(JSON.stringify(rules), /lat|lng/, 'sin coordenadas');
});
