import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAPTURE_NORMS, NIGHT, nightNotice } from '../www/js/game-view.js';

// AC-B3: aviso de juego nocturno antes de empezar (de 21:00 a 7:00, hora local; HIPÓTESIS D-038).
// AC-B4: las normas de captura aparecen en la tarjeta del rol.

const at = (h, m = 0) => new Date(2026, 9, 26, h, m);

test('aviso nocturno: de 21:00 a 6:59, nunca de día', () => {
  assert.deepEqual(NIGHT, { fromHour: 21, toHour: 7 });
  for (const [h, m] of [[21, 0], [23, 59], [0, 0], [3, 30], [6, 59]]) assert.ok(nightNotice(at(h, m)), `${h}:${m}`);
  for (const [h, m] of [[7, 0], [12, 0], [20, 59]]) assert.equal(nightNotice(at(h, m)), null, `${h}:${m}`);
  assert.match(nightNotice(at(22)), /Es de noche/);
  assert.match(nightNotice(at(22)), /calzadas/);
});

test('normas de captura de la tarjeta del rol: toque suave y nunca en la calzada', () => {
  assert.match(CAPTURE_NORMS, /toque suave/);
  assert.match(CAPTURE_NORMS, /calzada/);
});
