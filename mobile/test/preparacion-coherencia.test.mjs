import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCommand, createRoom } from '../../engine/src/engine.ts';
import { offsetM } from '../../engine/src/geo.ts';
import { snapshotFor } from '../../engine/src/view.ts';
import { acceptedConfig, readyResetNotice } from '../www/js/game-view.js';

// AF-02 (segunda auditoría; D-062): el aviso «el anfitrión ha cambiado…» tiene que salir exactamente cuando
// el motor quita el «listo», y medir desde lo que aceptó el jugador, como el motor. Se ejecuta el motor de
// verdad y, con sus instantáneas, lo que hace el cliente (app.js, conn.on('snapshot')).

const CENTER = { lat: 40.4153, lng: -3.6845 };
const T0 = Date.UTC(2026, 10, 4, 17, 0, 0);
const at = (north) => {
  const c = offsetM(CENTER, north, 0);
  return { durationMs: 20 * 60_000, headStartMs: 2 * 60_000, pingIntervalMs: 3 * 60_000, zone: [{ fromOffsetMs: 0, center: c, radiusM: 400 }], dynamicZone: true, meetingPoint: c, safetyChecklistConfirmed: true };
};

// Sala de verdad y un «cliente» por jugador que guarda lo mismo que app.js: la última instantánea, lo que
// aceptó y el último aviso.
function room(ids) {
  let state = createRoom({ roomId: 'r', hostId: 'h', hostName: 'Ana', hostDeviceId: 'dev-h', now: T0, seed: 1 }).state;
  const clients = Object.fromEntries(['h', ...ids].map((id) => [id, { snap: null, accepted: null, notices: [] }]));
  const sync = () => {
    for (const [id, c] of Object.entries(clients)) {
      const snap = snapshotFor(state, id, T0);
      const notice = readyResetNotice(c.snap, snap, id, c.accepted);
      if (notice) c.notices.push(notice);
      c.accepted = acceptedConfig(c.accepted, snap, id);
      c.snap = snap;
    }
  };
  const cmd = (actor, command) => {
    const step = applyCommand(state, actor, command, T0);
    assert.equal(step.result.ok, true, JSON.stringify(step.result));
    state = step.state;
    sync();
  };
  for (const id of ids) cmd(id, { type: 'join', name: `Jug ${id}`, deviceId: `dev-${id}` });
  cmd('h', { type: 'configure', config: at(0) });
  return { cmd, clients, engineReady: (id) => state.players[id].ready, shownReady: (id) => clients.h.snap.players.find((p) => p.id === id).ready };
}

test('el caso de los 98 m: el motor quita el «listo» a b y b ve por qué; a no pierde nada ni ve avisos', () => {
  const r = room(['a', 'b']);
  r.cmd('a', { type: 'set_ready', ready: true });
  r.cmd('h', { type: 'configure', config: at(49) });
  r.cmd('b', { type: 'set_ready', ready: true });
  r.cmd('h', { type: 'configure', config: at(-49) });
  assert.equal(r.engineReady('b'), false);
  assert.equal(r.shownReady('b'), false, 'la sala del anfitrión muestra lo mismo que el motor');
  assert.deepEqual(r.clients.b.notices, ['El anfitrión ha cambiado la zona desde que te marcaste listo. Revisa la partida y vuelve a pulsar «Estoy listo».']);
  assert.equal(r.engineReady('a'), true);
  assert.deepEqual(r.clients.a.notices, []);
});

test('deriva en pasos pequeños: el aviso sale una sola vez, en el paso en que el motor quita el «listo»', () => {
  const r = room(['a']);
  r.cmd('a', { type: 'set_ready', ready: true });
  const seen = [];
  for (let m = 10; m <= 100; m += 10) {
    r.cmd('h', { type: 'configure', config: at(m) });
    seen.push([m, r.engineReady('a'), r.clients.a.notices.length]);
  }
  const lost = seen.find(([, ready]) => !ready);
  assert.equal(lost[0], 50);
  assert.equal(lost[2], 1, 'el aviso sale en el mismo paso');
  assert.equal(r.clients.a.notices.length, 1, 'y no se repite en los siguientes');
  assert.match(r.clients.a.notices[0], /la zona/);
});

test('desmarcarse uno mismo o marcar la lista de seguridad no produce avisos', () => {
  const r = room(['a']);
  r.cmd('a', { type: 'set_ready', ready: true });
  r.cmd('h', { type: 'configure', config: { ...at(20), safetyChecklistConfirmed: false } });
  r.cmd('a', { type: 'set_ready', ready: false });
  assert.deepEqual(r.clients.a.notices, []);
});

test('cambio de reglas: el aviso nombra lo que cambió; el anfitrión no recibe avisos', () => {
  const r = room(['a']);
  r.cmd('a', { type: 'set_ready', ready: true });
  r.cmd('h', { type: 'set_ready', ready: true });
  r.cmd('h', { type: 'configure', config: { ...at(0), mode: 'fox_hunt' } });
  assert.equal(r.engineReady('a'), false);
  assert.match(r.clients.a.notices[0], /el modo/);
  assert.equal(r.engineReady('h'), true);
  assert.deepEqual(r.clients.h.notices, []);
});
