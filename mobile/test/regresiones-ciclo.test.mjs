import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as gv from '../www/js/game-view.js';

// Regresiones del ciclo de validación de modos (30/10/2026, QA/ciclo-20261030-validacion-modos):
// C11–C18 y el punto 4 del encargo (cierre de reclamaciones al terminar). Funciones puras de la interfaz.

const names = { h: 'Ana', r1: 'Beto', r2: 'Caro', r3: 'Dani', r4: 'Eva', r5: 'Fede', f: 'Zoe' };
const nameOf = (id) => names[id] ?? id;
const zone = [{ fromOffsetMs: 0, center: { lat: 0, lng: 0 }, radiusM: 400 }];

// ------------------------------------------------------------------ C11 · V-09 (Caza del zorro)

function foxSnap(phase, viewer, { foxTeamVisible = true } = {}) {
  return {
    phase,
    config: { mode: 'fox_hunt', zone },
    players: [
      { id: 'h', name: 'Ana', team: viewer === 'h' || viewer === 'r1' || viewer === 'f' ? 'hunter' : null, status: 'active' },
      { id: 'r1', name: 'Beto', team: 'hunter', status: 'active' },
      { id: 'f', name: 'Zoe', team: foxTeamVisible ? 'runner' : null, status: 'active' },
    ],
  };
}

test('C11 · el cazador sabe quién es el zorro en la huida y la persecución', () => {
  assert.equal(typeof gv.foxLine, 'function', 'foxLine existe');
  assert.equal(gv.foxLine(foxSnap('HEAD_START', 'h'), 'h', nameOf), 'El zorro es Zoe');
  assert.equal(gv.foxLine(foxSnap('ACTIVE', 'h'), 'h', nameOf), 'El zorro es Zoe');
  // En la cuenta atrás el servidor no da equipos: nada que decir.
  assert.equal(gv.foxLine(foxSnap('COUNTDOWN', 'h', { foxTeamVisible: false }), 'h', nameOf), null);
  // El zorro no recibe ninguna línea nueva sobre los cazadores.
  assert.equal(gv.foxLine(foxSnap('ACTIVE', 'f'), 'f', nameOf), null);
  // Otros modos: nunca.
  assert.equal(gv.foxLine({ ...foxSnap('ACTIVE', 'h'), config: { mode: 'classic', zone } }, 'h', nameOf), null);
});

// ------------------------------------------------------------------ C12 · V-08 (Infección)

/** Ana infecta a Beto; Beto a Caro y a Dani (la e2e de 4 jugadores). */
const tree = [
  { runnerId: 'r1', hunterId: 'h', atOffsetMs: 60_000, via: 'claim', converted: true },
  { runnerId: 'r2', hunterId: 'r1', atOffsetMs: 200_000, via: 'self', converted: true },
  { runnerId: 'r3', hunterId: 'r1', atOffsetMs: 210_000, via: 'self', converted: true },
];

function infectionEnd(captures) {
  return {
    phase: 'FINISHED',
    gameNo: 1,
    config: { mode: 'infection' },
    activeStart: 0,
    finishedAt: 210_000,
    outcome: { winner: 'hunter', cause: 'all_captured' },
    captures,
    players: Object.keys(names).filter((id) => id !== 'f').map((id) => ({ id, name: names[id], team: 'hunter', status: 'active' })),
  };
}

test('C12 · el informe de Infección muestra todas las infecciones, agrupadas por quién infectó', () => {
  const r = gv.missionReport(infectionEnd(tree), nameOf);
  const line = r.highlights.find((h) => h.startsWith('Contagio:'));
  assert.equal(line, 'Contagio: Ana → Beto · Beto → Caro, Dani');
});

test('C12 · las infecciones autodeclaradas sin autor también aparecen (y lo que infectaron después)', () => {
  const captures = [
    ...tree,
    { runnerId: 'r4', hunterId: null, atOffsetMs: 220_000, via: 'self', converted: true },
    { runnerId: 'r5', hunterId: 'r4', atOffsetMs: 300_000, via: 'claim', converted: true },
  ];
  const line = gv.missionReport(infectionEnd(captures), nameOf).highlights.find((h) => h.startsWith('Contagio:'));
  for (const n of ['Beto', 'Caro', 'Dani', 'Eva', 'Fede']) assert.ok(line.includes(n), `${n} aparece en «${line}»`);
  assert.equal(line, 'Contagio: Ana → Beto · Beto → Caro, Dani · Sin autor conocido → Eva · Eva → Fede');
});

// ------------------------------------------------------------------ C13 · V-11 (posiciones viejas)

const mapSnap = (players) => ({ config: { zone, meetingPoint: { lat: 0, lng: 0 } }, players });
const pos = (playerId, reason) => ({ playerId, lat: 0.001, lng: 0, accuracyM: 5, ageMs: 1_000, availability: 'CURRENT', reason });

test('C13 · tras convertirse, las posiciones de los antiguos compañeros no se pintan como «Tu equipo»', () => {
  // Beto acaba de pasar a cazador: su vista ya no da el equipo de Caro (fugitiva), pero la lista de
  // posiciones local es la del envío anterior (Caro como compañera).
  const snap = mapSnap([
    { id: 'h', team: 'hunter', status: 'active' },
    { id: 'r1', team: 'hunter', status: 'active' },
    { id: 'r2', team: null, status: 'active' },
  ]);
  const m = gv.mapModel({ snap, team: 'hunter', positions: [pos('r2', 'teammate')], positionsAt: 0, now: 1_000 });
  assert.deepEqual(m.dots.map((d) => d.id), [], 'Caro ya no es de su equipo');
  // Los compañeros de verdad sí siguen.
  const ok = gv.mapModel({ snap, team: 'hunter', positions: [pos('h', 'teammate')], positionsAt: 0, now: 1_000 });
  assert.deepEqual(ok.dots.map((d) => d.id), ['h']);
});

test('C13 · quien sale de la partida desaparece del mapa sin esperar al siguiente envío', () => {
  const snap = mapSnap([{ id: 'r1', team: 'runner', status: 'active' }]); // Caro ya no está en la vista
  const m = gv.mapModel({ snap, team: 'runner', positions: [pos('r2', 'teammate'), pos('r1', 'teammate')], positionsAt: 0, now: 1_000 });
  assert.deepEqual(m.dots.map((d) => d.id), ['r1']);
  const left = mapSnap([{ id: 'h', team: 'hunter', status: 'left' }]);
  assert.deepEqual(gv.mapModel({ snap: left, team: 'runner', positions: [pos('h', 'hunter_seen')], positionsAt: 0, now: 1_000 }).dots, []);
});

// ------------------------------------------------------------------ C14 · V-12 (tarjeta tras reconectar)

function convertedSnap(extra = {}) {
  return {
    roomId: 'room1',
    gameNo: 2,
    phase: 'ACTIVE',
    config: { mode: 'infection', zone },
    captures: [{ runnerId: 'r1', hunterId: 'h', atOffsetMs: 60_000, via: 'claim', converted: true }],
    players: [{ id: 'r1', team: 'hunter', status: 'active' }],
    canTagFrom: null,
    ...extra,
  };
}

test('C14 · la tarjeta «Te han infectado» se deduce de la instantánea si el evento llegó viejo', () => {
  assert.equal(typeof gv.pendingConversion, 'function', 'pendingConversion existe');
  // El evento llega reenviado con > 15 s: se da por antiguo y no abre la tarjeta.
  assert.equal(gv.isStaleEvent({ type: 'role_changed', ageMs: 20_000 }, convertedSnap()), true);
  // La instantánea sí la da, una sola vez por partida.
  const p = gv.pendingConversion(convertedSnap(), 'r1', null);
  assert.deepEqual(p, { key: 'room1:2', team: 'hunter' });
  assert.equal(gv.pendingConversion(convertedSnap(), 'r1', 'room1:2'), null, 'ya vista: no se repite');
  assert.notEqual(gv.pendingConversion(convertedSnap({ gameNo: 3 }), 'r1', 'room1:2'), null, 'otra partida (revancha)');
  assert.equal(gv.pendingConversion(convertedSnap(), 'h', null), null, 'no fue infectado');
  assert.equal(gv.pendingConversion(convertedSnap({ phase: 'FINISHED' }), 'r1', null), null, 'con la partida terminada, no');
  assert.equal(gv.pendingConversion({ ...convertedSnap(), config: { mode: 'classic' }, captures: [{ runnerId: 'r1', hunterId: 'h' }] }, 'r1', null), null);
});

test('C14/C18 · el texto de la tarjeta usa la espera real (canTagFrom) y no un «1 min» fijo', () => {
  assert.match(gv.conversionText(70_000, 10_000), /Podrás capturar dentro de 1:00/);
  assert.match(gv.conversionText(40_000, 10_000), /Podrás capturar dentro de 0:30/);
  assert.match(gv.conversionText(null, 10_000), /Ya puedes capturar/);
});

// ------------------------------------------------------------------ C15 · V-13 (tarjeta sobre el informe)

test('C15 · la tarjeta de rol o de conversión no se dibuja con la partida terminada', () => {
  assert.equal(typeof gv.revealOpen, 'function', 'revealOpen existe');
  const reveal = { team: 'hunter', converted: true, until: 10_000 };
  assert.equal(gv.revealOpen(reveal, { phase: 'ACTIVE' }, 5_000), true);
  assert.equal(gv.revealOpen(reveal, { phase: 'FINISHED' }, 5_000), false, 'no tapa el Mission Report');
  assert.equal(gv.revealOpen(reveal, { phase: 'ACTIVE' }, 10_000), false, 'pasados los 15 s');
  assert.equal(gv.revealOpen(null, { phase: 'ACTIVE' }, 0), false);
});

// ------------------------------------------------------------------ C16 · V-14 (cuenta atrás cancelada)

test('C16 · al cancelarse la cuenta atrás se explica el motivo y que hay que volver a marcar «Estoy listo»', () => {
  assert.equal(typeof gv.countdownAbortText, 'function', 'countdownAbortText existe');
  assert.match(gv.countdownAbortText('team_empty'), /faltan jugadores/);
  assert.match(gv.countdownAbortText('aborted_by_host'), /anfitrión ha cancelado/);
  for (const r of ['team_empty', 'aborted_by_host', 'otro_motivo', undefined]) assert.match(gv.countdownAbortText(r), /«Estoy listo»/);
});

// ------------------------------------------------------------------ C17 · V-15 (fuera por conexión)

function classicEnd(players, captures = []) {
  return { phase: 'FINISHED', gameNo: 1, config: { mode: 'classic' }, activeStart: 0, finishedAt: 600_000, outcome: { winner: 'runner', cause: 'time_up' }, captures, players };
}

test('C17 · «Tu partida» de quien quedó fuera por 5 min sin conexión no dice «Seguías libre»', () => {
  const snap = classicEnd([
    { id: 'h', team: 'hunter', status: 'active' },
    { id: 'r1', team: 'runner', status: 'left', leftReason: 'timeout' },
    { id: 'r2', team: 'runner', status: 'active' },
  ]);
  const mine = gv.personalResult(snap, 'r1', nameOf);
  assert.doesNotMatch(mine.detail, /Seguías libre/);
  assert.match(mine.detail, /sin conexión/i);
  assert.equal(mine.tone, 'none');
  // Coherente con el informe común, que dice «Sin conexión».
  assert.equal(gv.reportParticipants(snap, nameOf).find((p) => p.id === 'r1').detail, 'Sin conexión');
  // Quien abandonó por su cuenta tampoco «seguía libre».
  const quit = classicEnd([{ id: 'h', team: 'hunter', status: 'active' }, { id: 'r1', team: 'runner', status: 'left', leftReason: 'left' }]);
  assert.match(gv.personalResult(quit, 'r1', nameOf).detail, /Abandonaste/);
  // Quien salió después del final jugó entera la partida: resultado de siempre.
  const after = classicEnd([{ id: 'h', team: 'hunter', status: 'active' }, { id: 'r1', team: 'runner', status: 'left', leftReason: 'after_end' }]);
  assert.equal(gv.personalResult(after, 'r1', nameOf).detail, 'Seguías libre al final');
});

// ------------------------------------------------------------------ C18 · V-33 (textos)

test('C18 · el panel de pistas no dice «la primera pista» si ya se han enviado pistas (convertido)', () => {
  assert.equal(typeof gv.pingWaitText, 'function', 'pingWaitText existe');
  const base = { config: { mode: 'infection', pingIntervalMs: 180_000 }, activeStart: 0 };
  assert.match(gv.pingWaitText({ ...base, nextPingAt: 180_000 }), /La primera pista llega sola/);
  assert.match(gv.pingWaitText({ ...base, nextPingAt: 540_000 }), /La próxima pista llega sola/);
  assert.doesNotMatch(gv.pingWaitText({ ...base, nextPingAt: 540_000 }), /primera/);
  assert.match(gv.pingWaitText({ ...base, config: { mode: 'fox_hunt', pingIntervalMs: 180_000 }, nextPingAt: 180_000 }), /el zorro/);
  assert.equal(gv.pingWaitText({ ...base, nextPingAt: null }), null);
});

test('C18 · la sala del zorro no dice que los roles se reparten «en secreto»', () => {
  assert.equal(typeof gv.lobbyRolesHint, 'function', 'lobbyRolesHint existe');
  assert.doesNotMatch(gv.lobbyRolesHint({ mode: 'fox_hunt' }), /en secreto/);
  assert.match(gv.lobbyRolesHint({ mode: 'fox_hunt' }), /todos sabrán quién es el zorro/);
  assert.match(gv.lobbyRolesHint({ mode: 'classic' }), /en secreto/);
  assert.match(gv.lobbyRolesHint(null), /en secreto/);
});

test('C18 · el zorro juega solo: «Ganas» / «Pierdes», no «Tu equipo»', () => {
  const players = [{ id: 'h', team: 'hunter', status: 'active' }, { id: 'f', team: 'runner', status: 'active' }];
  const won = { phase: 'FINISHED', config: { mode: 'fox_hunt' }, outcome: { winner: 'runner', cause: 'time_up' }, captures: [], players };
  assert.equal(gv.personalResult(won, 'f', nameOf).title, 'Ganas');
  assert.equal(gv.personalResult(won, 'h', nameOf).title, 'Tu equipo pierde');
  const lost = { ...won, outcome: { winner: 'hunter', cause: 'all_captured' }, captures: [{ runnerId: 'f', hunterId: 'h', atOffsetMs: 1_000, via: 'claim' }] };
  assert.equal(gv.personalResult(lost, 'f', nameOf).title, 'Pierdes');
});

test('C18 · errores: «forbidden» según la acción, «busy» y «room_expiring» con texto', () => {
  assert.equal(typeof gv.commandErrorText, 'function', 'commandErrorText existe');
  assert.equal(gv.commandErrorText('forbidden', undefined, 'start'), 'Solo el anfitrión puede hacer eso.');
  assert.doesNotMatch(gv.commandErrorText('forbidden', undefined, 'set_ready'), /anfitrión/);
  assert.match(gv.commandErrorText('forbidden', undefined, 'join_rematch'), /revancha/);
  assert.doesNotMatch(gv.commandErrorText('forbidden', undefined, 'claim_tag'), /anfitrión/);
  // Sin acción conocida, igual que errorText.
  assert.equal(gv.commandErrorText('not_found'), gv.errorText('not_found'));
  assert.doesNotMatch(gv.errorText('busy'), /^Error:/);
  assert.doesNotMatch(gv.errorText('room_expiring'), /^Error:/);
  assert.match(gv.errorText('room_expiring'), /sala nueva/);
});

test('C18 · compartir el resultado dice el modo (y «infectados» en Infección)', () => {
  const text = gv.reportShareText(gv.missionReport(infectionEnd(tree), nameOf));
  assert.match(text.split('\n')[0], /Infección/);
  assert.match(text, /3 infectados/);
  assert.doesNotMatch(text, /capturas/);
});

// ------------------------------------------------------------------ Punto 4 · reclamaciones al terminar

test('Punto 4 · al terminar la partida no queda abierta ninguna hoja de reclamación', () => {
  assert.equal(typeof gv.sheetAfterSnapshot, 'function', 'sheetAfterSnapshot existe');
  // La hoja «¿Quién te ha pillado?» no sobrevive al final (antes volvía a abrirse en la persecución de la revancha).
  assert.equal(gv.sheetAfterSnapshot('selftag', { phase: 'FINISHED' }), null);
  assert.equal(gv.sheetAfterSnapshot('selftag', { phase: 'LOBBY' }), null);
  assert.equal(gv.sheetAfterSnapshot('selftag', { phase: 'ACTIVE' }), 'selftag');
  // Otras hojas no se tocan.
  assert.equal(gv.sheetAfterSnapshot('qr', { phase: 'LOBBY' }), 'qr');
});
