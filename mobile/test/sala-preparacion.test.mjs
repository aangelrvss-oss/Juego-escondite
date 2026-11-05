import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATERIAL_MOVE_M,
  countdownAbortText,
  SAFETY_CHECKLIST,
  configChanges,
  configSummary,
  gpsCheckError,
  lobbySteps,
  playerReadiness,
  readyButton,
  readyProgress,
  readyResetNotice,
  startBlockers,
  startSummary,
} from '../www/js/game-view.js';

// Sala guiada (ciclo UX 11/2026): funciones puras de la sala. Pasos, estado por jugador con su motivo,
// progreso, botón «Estoy listo», avisos de cambio material y la hoja de «Empezar partida».

const CENTER = { lat: 40.4153, lng: -3.6845 };
// Desplaza `m` metros al norte (1° de latitud ≈ 111.195 m).
const north = (m) => ({ lat: CENTER.lat + m / 111_195, lng: CENTER.lng });
const cfg = (over = {}) => ({
  mode: 'classic',
  durationMs: 20 * 60_000,
  headStartMs: 2 * 60_000,
  pingIntervalMs: 3 * 60_000,
  zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 500 }],
  dynamicZone: true,
  meetingPoint: CENTER,
  safetyChecklistConfirmed: false,
  ...over,
});
const player = (id, { ready = false, connected = true, status = 'lobby' } = {}) => ({ id, name: id, ready, connected, status });
const room = (players, config = cfg(), extra = {}) => ({ phase: 'LOBBY', gameNo: 0, hostId: 'Ana', config, players, ...extra });

test('resumen de la configuración: legible y con lo importante explicado', () => {
  assert.equal(configSummary(null), null);
  const rows = configSummary(cfg());
  assert.deepEqual(rows.map((r) => r.label), ['Modo', 'Zona', 'Huida', 'Persecución', 'Pistas']);
  assert.equal(rows[0].value, 'Clásico');
  assert.equal(rows[1].value, '500 m de radio, se cierra cada 5 min');
  assert.match(rows[1].note, /encoge/);
  assert.equal(rows[2].value, '2 min');
  assert.match(rows[2].note, /ventaja/i);
  assert.equal(rows[4].value, 'cada 3 min');
  assert.equal(configSummary(cfg({ zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 1000 }] }))[1].value, '1 km de radio, se cierra cada 5 min');
  assert.match(configSummary(cfg({ mode: 'fox_hunt' }))[4].note, /zorro/);
  assert.equal(configSummary(cfg({ mode: 'infection' }))[0].value, 'Infección');
});

test('estado por jugador con su motivo: Listo, Falta confirmar, Sin conexión, Invitado; el anfitrión se confirma al empezar', () => {
  const snap = room([]);
  assert.equal(playerReadiness(player('Beto', { ready: true }), snap).text, 'Listo');
  assert.equal(playerReadiness(player('Beto'), snap).text, 'Falta confirmar');
  assert.match(playerReadiness(player('Beto'), snap).reason, /Estoy listo/);
  assert.match(playerReadiness(player('Beto'), room([], null)).reason, /zona/);
  assert.equal(playerReadiness(player('Beto', { connected: false, ready: true }), snap).text, 'Sin conexión');
  assert.equal(playerReadiness(player('Eva', { status: 'invited' }), snap).text, 'Invitado');
  assert.match(playerReadiness(player('Ana'), snap).reason, /al empezar/);
  assert.equal(playerReadiness(player('Ana', { ready: true }), snap).text, 'Listo');
});

test('progreso «N de M listos»: sin el anfitrión ni invitados; los desconectados no cuentan como listos', () => {
  const snap = room([player('Ana'), player('Beto', { ready: true }), player('Cris'), player('Dani', { ready: true, connected: false }), player('Eva', { status: 'invited' })]);
  assert.deepEqual(readyProgress(snap), { ready: 1, total: 3, text: '1 de 3 listos', ratio: 1 / 3 });
  assert.equal(readyProgress(room([player('Ana'), player('Beto', { ready: true })])).text, '1 de 1 listo');
  assert.equal(readyProgress(room([player('Ana')])).text, 'Aún no ha entrado nadie');
});

test('«Estoy listo» no se puede pulsar hasta que el anfitrión fija la zona (el primer configure lo quitaría)', () => {
  assert.deepEqual(readyButton(room([player('Ana'), player('Beto')], null), 'Beto'), { label: 'Espera a que el anfitrión fije la zona', disabled: true, primary: false });
  assert.deepEqual(readyButton(room([player('Ana'), player('Beto')]), 'Beto'), { label: 'Estoy listo', disabled: false, primary: true });
  assert.equal(readyButton(room([player('Ana'), player('Beto')]), 'Beto', { locating: true }).label, 'Comprobando tu GPS…');
  assert.equal(readyButton(room([player('Ana'), player('Beto', { ready: true })]), 'Beto').label, 'No estoy listo');
});

test('pasos del anfitrión: uno solo es el actual, el primero sin hacer', () => {
  const state = (snap) => lobbySteps(snap, 'Ana').map((s) => `${s.id}:${s.state}`);
  assert.deepEqual(state(room([player('Ana')], null)), ['config:current', 'invite:todo', 'ready:todo', 'start:todo']);
  assert.deepEqual(state(room([player('Ana')])), ['config:done', 'invite:current', 'ready:todo', 'start:todo']);
  assert.deepEqual(state(room([player('Ana'), player('Beto')])), ['config:done', 'invite:done', 'ready:current', 'start:todo']);
  assert.deepEqual(state(room([player('Ana'), player('Beto', { ready: true })])), ['config:done', 'invite:done', 'ready:done', 'start:current']);
  // Mínimos por modo: Infección 4, Caza del zorro 3.
  assert.deepEqual(state(room([player('Ana'), player('Beto', { ready: true }), player('Cris', { ready: true })], cfg({ mode: 'infection' })))[1], 'invite:current');
  assert.deepEqual(state(room([player('Ana'), player('Beto', { ready: true }), player('Cris', { ready: true })], cfg({ mode: 'fox_hunt' })))[3], 'start:current');
});

test('pasos del jugador: zona fijada, «Estoy listo», resto listo, empieza', () => {
  const state = (snap) => lobbySteps(snap, 'Beto').map((s) => `${s.id}:${s.state}`);
  assert.deepEqual(state(room([player('Ana'), player('Beto')], null)), ['config:current', 'ready:todo', 'wait:todo', 'start:todo']);
  assert.deepEqual(state(room([player('Ana'), player('Beto')])), ['config:done', 'ready:current', 'wait:todo', 'start:todo']);
  assert.deepEqual(state(room([player('Ana'), player('Beto', { ready: true }), player('Cris')])), ['config:done', 'ready:done', 'wait:current', 'start:todo']);
  assert.deepEqual(state(room([player('Ana'), player('Beto', { ready: true })])), ['config:done', 'ready:done', 'wait:done', 'start:current']);
});

test('bloqueos en la sala guiada: sin lista de seguridad ni el «listo» del anfitrión (se confirman al empezar)', () => {
  const snap = room([player('Ana'), player('Beto', { ready: true })]);
  assert.deepEqual(startBlockers(snap, { atStart: true }), []);
  assert.deepEqual(startBlockers(snap, { forHost: false, atStart: true }), []);
  // Sin la opción, como antes (compatibilidad).
  assert.deepEqual(startBlockers(snap), ['Confirma la lista de seguridad.', 'Falta que estén listos: Ana.']);
  // Un anfitrión desconectado sí se nombra.
  assert.deepEqual(startBlockers(room([player('Ana', { connected: false }), player('Beto', { ready: true })]), { forHost: false, atStart: true }), ['Sin conexión: Ana.']);
  // Mínimos por modo.
  assert.deepEqual(startBlockers(room([player('Ana'), player('Beto', { ready: true })], cfg({ mode: 'infection' })), { atStart: true }), ['Infección necesita al menos 4 jugadores.']);
  assert.deepEqual(startBlockers(room([player('Ana'), player('Beto', { ready: true })], cfg({ mode: 'fox_hunt' })), { atStart: true }), ['Caza del zorro necesita al menos 3 jugadores.']);
  assert.deepEqual(startBlockers(room([player('Ana'), player('Beto')]), { atStart: true }), ['Falta que estén listos: Beto.']);
  // Sin zona no se pide a nadie que confirme (aún no puede).
  assert.deepEqual(startBlockers(room([player('Ana'), player('Beto')], null), { forHost: false, atStart: true }), ['El anfitrión aún no ha fijado la zona de juego.']);
});

test('cambios materiales: misma regla que el motor (50 m), en palabras del jugador', () => {
  assert.equal(MATERIAL_MOVE_M, 50);
  assert.deepEqual(configChanges(cfg(), cfg({ safetyChecklistConfirmed: true })), []);
  assert.deepEqual(configChanges(cfg(), cfg()), []);
  assert.deepEqual(configChanges(cfg(), cfg({ zone: [{ fromOffsetMs: 0, center: north(40), radiusM: 500 }], meetingPoint: north(40) })), []);
  assert.deepEqual(configChanges(cfg(), cfg({ zone: [{ fromOffsetMs: 0, center: north(60), radiusM: 500 }], meetingPoint: north(60) })), ['la zona']);
  assert.deepEqual(configChanges(cfg(), cfg({ mode: 'fox_hunt' })), ['el modo']);
  assert.deepEqual(configChanges(cfg({ mode: undefined }), cfg({ mode: 'classic' })), []);
  assert.deepEqual(configChanges(cfg(), cfg({ zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 250 }] })), ['la zona']);
  assert.deepEqual(configChanges(cfg(), cfg({ headStartMs: 5 * 60_000, durationMs: 30 * 60_000, pingIntervalMs: 5 * 60_000 })), ['la huida', 'la persecución', 'las pistas']);
  assert.deepEqual(configChanges(null, cfg()), []);
});

test('aviso al jugador al que el motor quita el «listo» por un cambio material', () => {
  const before = room([player('Ana', { ready: true }), player('Beto', { ready: true })]);
  const after = room([player('Ana', { ready: true }), player('Beto')], cfg({ durationMs: 30 * 60_000, mode: 'infection' }));
  assert.equal(readyResetNotice(before, after, 'Beto'), 'El anfitrión ha cambiado el modo y la persecución desde que te marcaste listo. Revisa la partida y vuelve a pulsar «Estoy listo».');
  // El anfitrión no recibe el aviso; ni quien lo desmarcó él mismo (sin cambio material).
  assert.equal(readyResetNotice(before, after, 'Ana'), null);
  assert.equal(readyResetNotice(before, room([player('Ana', { ready: true }), player('Beto')]), 'Beto'), null);
  // Ni al volver de la cuenta atrás o empezar otra partida (lo explica su propio aviso).
  assert.equal(readyResetNotice({ ...before, phase: 'COUNTDOWN' }, after, 'Beto'), null);
  assert.equal(readyResetNotice(before, { ...after, gameNo: 1 }, 'Beto'), null);
  assert.equal(readyResetNotice(null, after, 'Beto'), null);
});

test('hoja de empezar: resumen breve y lista de seguridad', () => {
  const rows = startSummary(room([player('Ana'), player('Beto'), player('Eva', { status: 'invited' })]));
  assert.deepEqual(rows, [
    { label: 'Modo', value: 'Clásico' },
    { label: 'Zona', value: '500 m, se cierra cada 5 min' },
    { label: 'Tiempos', value: '2 min de huida + 20 min de persecución, pistas cada 3 min' },
    { label: 'Jugadores', value: '2' },
  ]);
  assert.deepEqual(startSummary(room([player('Ana')], null)), []);
  assert.equal(SAFETY_CHECKLIST.length, 4);
  assert.ok(SAFETY_CHECKLIST.some((t) => /calzada/.test(t)) && SAFETY_CHECKLIST.some((t) => /18/.test(t)));
});

test('errores de GPS comprensibles, con el botón que hay que volver a pulsar', () => {
  assert.match(gpsCheckError('permission_missing'), /permitir la ubicación.*«Estoy listo»/);
  assert.match(gpsCheckError('permission_missing', 'Empezar ya'), /«Empezar ya»/);
  assert.match(gpsCheckError('position_unavailable', 'Centrar la zona aquí'), /aire libre.*«Centrar la zona aquí»/);
  assert.match(gpsCheckError('timeout'), /aire libre/);
  assert.match(gpsCheckError('unavailable'), /No se pudo activar la ubicación/);
});

test('cuenta atrás cancelada: el anfitrión de la sala guiada vuelve a «Empezar partida», no a «Estoy listo»', () => {
  for (const r of ['team_empty', 'aborted_by_host', undefined]) {
    assert.match(countdownAbortText(r, { host: true }), /«Empezar partida»/);
    assert.doesNotMatch(countdownAbortText(r, { host: true }), /«Estoy listo»/);
    assert.match(countdownAbortText(r), /«Estoy listo»/);
  }
});
