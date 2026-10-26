import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locationDeniedNotice, sharingStatus } from '../www/js/game-view.js';

// AC-D9 y Plan Maestro §4.1: si falta el permiso de ubicación durante la partida, se avisa de forma
// fija y la app no finge que comparte ni que puede validar la ubicación.

test('sin permiso, el indicador no dice que se comparte, aunque el seguimiento siga activo', () => {
  assert.deepEqual(sharingStatus(true, false, true), { on: false, text: 'No se comparte tu ubicación: falta el permiso' });
  assert.equal(sharingStatus(true, true, true).on, false, 'tampoco con el envío nativo');
  assert.equal(sharingStatus(true, false).on, true, 'con permiso, como antes');
  assert.equal(sharingStatus(false, false).text, 'No se comparte tu ubicación');
});

test('el aviso explica la consecuencia y cómo recuperarse', () => {
  assert.equal(locationDeniedNotice(false), null);
  const text = locationDeniedNotice(true);
  assert.match(text, /Falta el permiso de ubicación/);
  assert.match(text, /no puede validar capturas/);
  assert.match(text, /Reintentar/);
});
