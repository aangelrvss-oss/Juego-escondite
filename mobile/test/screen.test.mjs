import assert from 'node:assert/strict';
import { test } from 'node:test';
import { screenNotice } from '../www/js/game-view.js';

// Pantalla encendida durante la partida en el navegador: con ella apagada, el navegador deja de dar y
// enviar la ubicación. En la app no hace falta (el servicio nativo envía con la pantalla bloqueada).

test('en la app no se muestra nada', () => {
  assert.equal(screenNotice({ app: true, held: false }), null);
  assert.equal(screenNotice({ app: true, held: true }), null);
});

test('en el navegador: si se mantiene encendida se informa; si no, se avisa de que hay que hacerlo a mano', () => {
  assert.deepEqual(screenNotice({ app: false, held: true }), {
    warn: false,
    text: 'La pantalla se mantiene encendida durante la partida: con ella apagada, el navegador no envía tu ubicación.',
  });
  const manual = screenNotice({ app: false, held: false });
  assert.equal(manual.warn, true);
  assert.match(manual.text, /^Mantén la pantalla encendida/);
});
