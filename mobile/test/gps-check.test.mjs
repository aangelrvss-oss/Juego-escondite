import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gpsCheckError } from '../www/js/game-view.js';

// Comprobación de GPS al pulsar «Estoy listo» (Plan Maestro §2.1 paso 4 y §4.1). Solo los textos: el
// flujo se prueba en un navegador real en mobile/e2e/web-flow.e2e.mjs.

test('permiso denegado: explica para qué se usa la ubicación y qué hacer', () => {
  const t = gpsCheckError('permission_missing');
  assert.match(t, /permitir la ubicación/);
  assert.match(t, /validar capturas/);
  assert.match(t, /solo durante la partida/);
  assert.match(t, /Estoy listo/);
});

test('sin posición fiable a tiempo: pide salir al aire libre y reintentar', () => {
  assert.match(gpsCheckError('timeout'), /aire libre/);
});

test('cualquier otro fallo da un mensaje útil, sin códigos internos', () => {
  for (const code of ['position_unavailable', 'unavailable', undefined, '']) {
    const t = gpsCheckError(code);
    assert.match(t, /ubicación/);
    assert.doesNotMatch(t, /_/);
  }
});
