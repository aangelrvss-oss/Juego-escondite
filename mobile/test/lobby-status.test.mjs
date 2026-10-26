import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionNotice, sharingStatus, startBlockers } from '../www/js/game-view.js';

// Plan Maestro §7: en la sala, indicar quién está desconectado y qué impide empezar; ante una
// incidencia, explicar qué ocurre y cómo recuperarse. Funciones puras de la interfaz.

const player = (name, { ready = false, connected = true, status = 'lobby' } = {}) => ({ id: name, name, ready, connected, status });
const cfg = { safetyChecklistConfirmed: true };

test('anfitrión: qué hacer; resto: qué falta', () => {
  const snap = { config: null, players: [player('Ana', { ready: true }), player('Beto')] };
  assert.equal(startBlockers(snap)[0], 'Fija la zona de juego.');
  assert.equal(startBlockers(snap, { forHost: false })[0], 'El anfitrión aún no ha fijado la zona de juego.');
  const unsafe = { config: { safetyChecklistConfirmed: false }, players: snap.players };
  assert.equal(startBlockers(unsafe, { forHost: false })[0], 'El anfitrión aún no ha confirmado la lista de seguridad.');
});

test('los desconectados se nombran aparte de los que no están listos', () => {
  const snap = {
    config: cfg,
    players: [player('Ana', { ready: true }), player('Beto'), player('Cris', { connected: false, ready: true }), player('Dani', { connected: false })],
  };
  assert.deepEqual(startBlockers(snap, { forHost: false }), ['Sin conexión: Cris, Dani.', 'Falta que estén listos: Beto.']);
});

test('sin bloqueos cuando todos están conectados y listos; los invitados a la revancha no cuentan', () => {
  const snap = { config: cfg, players: [player('Ana', { ready: true }), player('Beto', { ready: true }), player('Eva', { status: 'invited' })] };
  assert.deepEqual(startBlockers(snap), []);
  assert.deepEqual(startBlockers({ config: cfg, players: [player('Ana', { ready: true })] }), ['Hacen falta al menos 2 jugadores.']);
});

test('indicador de ubicación compartida (Plan §4.5): dice cuándo se comparte y cuándo no', () => {
  assert.deepEqual(sharingStatus(false, false), { on: false, text: 'No se comparte tu ubicación' });
  assert.equal(sharingStatus(false, true).on, false, 'sin seguimiento no se dice que se comparte aunque quede un envío');
  assert.match(sharingStatus(true, false).text, /^Compartiendo tu ubicación/);
  assert.match(sharingStatus(true, true).text, /pantalla bloqueada/);
});

test('aviso de conexión: nada si está abierta; en partida explica que la partida sigue', () => {
  assert.equal(connectionNotice('open', 'ACTIVE'), null);
  assert.equal(connectionNotice('idle', null), null);
  for (const phase of ['COUNTDOWN', 'HEAD_START', 'ACTIVE']) assert.match(connectionNotice('reconnecting', phase), /La partida sigue.*Reconectando/);
  assert.match(connectionNotice('reconnecting', 'LOBBY'), /Reconectando/);
  assert.match(connectionNotice('closed', 'ACTIVE'), /Vuelve al inicio/);
});
