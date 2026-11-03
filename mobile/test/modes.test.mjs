import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODES as ENGINE_MODES } from '../../engine/src/modes.ts';
import { MODES, contagionGroups, errorText, missionReport, modeInfo, personalResult, reportParticipants, startBlockers } from '../www/js/game-view.js';

// Modos en la interfaz (D-057): solo los jugables, con los mínimos del motor; textos de Infección en el
// Mission Report y en el resultado personal.

const names = { h: 'Ana', r1: 'Beto', r2: 'Caro', r3: 'Dani' };
const nameOf = (id) => names[id] ?? id;

/** Final de una Infección: Ana infecta a Beto, Beto a Caro, y Dani sobrevive (o cae). */
function finished({ allCaught = false } = {}) {
  const captures = [
    { runnerId: 'r1', hunterId: 'h', atOffsetMs: 60_000, via: 'claim', converted: true },
    { runnerId: 'r2', hunterId: 'r1', atOffsetMs: 200_000, via: 'claim', converted: true },
  ];
  if (allCaught) captures.push({ runnerId: 'r3', hunterId: 'r1', atOffsetMs: 400_000, via: 'self', converted: true });
  return {
    phase: 'FINISHED',
    gameNo: 1,
    config: { mode: 'infection' },
    activeStart: 0,
    finishedAt: allCaught ? 400_000 : 1_200_000,
    rulesVersion: ENGINE_MODES.infection.rulesVersion,
    outcome: allCaught ? { winner: 'hunter', cause: 'all_captured' } : { winner: 'runner', cause: 'time_up' },
    captures,
    players: [
      { id: 'h', name: 'Ana', team: 'hunter', status: 'active' },
      { id: 'r1', name: 'Beto', team: 'hunter', status: 'active' },
      { id: 'r2', name: 'Caro', team: 'hunter', status: 'active' },
      { id: 'r3', name: 'Dani', team: allCaught ? 'hunter' : 'runner', status: 'active' },
    ],
  };
}

test('solo se ofrecen los modos jugables, con los mínimos del motor', () => {
  assert.deepEqual(Object.keys(MODES), Object.keys(ENGINE_MODES));
  for (const id of Object.keys(MODES)) assert.equal(MODES[id].minPlayers, ENGINE_MODES[id].minPlayers);
  assert.equal(modeInfo(null).id, 'classic');
  assert.equal(modeInfo({ mode: 'infection' }).name, 'Infección');
  assert.equal(modeInfo({ mode: 'desconocido' }).id, 'classic');
});

test('la sala dice que Infección necesita 4 jugadores; los errores del motor se explican', () => {
  const snap = { config: { mode: 'infection', safetyChecklistConfirmed: true }, players: ['a', 'b', 'c'].map((id) => ({ id, name: id, status: 'lobby', connected: true, ready: true })) };
  assert.ok(startBlockers(snap).includes('Infección necesita al menos 4 jugadores.'));
  assert.equal(errorText('not_enough_players', 'infection'), 'Infección necesita al menos 4 jugadores.');
  assert.match(errorText('teams_unbalanced', 'infection'), /1 cazador por cada 4 jugadores/);
  assert.match(errorText('tag_cooldown'), /aún no puedes capturar/);
  assert.equal(errorText('not_enough_players'), 'Hacen falta al menos 2 jugadores.');
});

test('contagio a partir de las capturas oficiales: todas las infecciones, agrupadas por quién infectó', () => {
  // Ciclo 30/10/2026 (V-08): antes solo se seguía a la primera víctima de cada uno y se perdía Dani.
  assert.deepEqual(contagionGroups(finished({ allCaught: true }).captures), [
    { hunterId: 'h', victims: ['r1'] },
    { hunterId: 'r1', victims: ['r2', 'r3'] },
  ]);
  // Una infección autodeclarada sin cazador también aparece (grupo sin autor), y lo que infectó después.
  assert.deepEqual(contagionGroups([{ runnerId: 'x', hunterId: null, converted: true }, { runnerId: 'y', hunterId: 'x', converted: true }]), [
    { hunterId: null, victims: ['x'] },
    { hunterId: 'x', victims: ['y'] },
  ]);
  // Clásico: sin conversiones, sin contagio.
  assert.deepEqual(contagionGroups([{ runnerId: 'r1', hunterId: 'h' }]), []);
});

test('Mission Report de Infección: ganan los supervivientes, con la cadena de contagio', () => {
  const r = missionReport(finished(), nameOf);
  assert.equal(r.mode, 'Infección');
  assert.equal(r.winner, 'Ganan los supervivientes');
  assert.ok(r.highlights.includes('Contagio: Ana → Beto · Beto → Caro'));
  assert.ok(r.highlights.includes('Los supervivientes resistieron hasta el final'));
  assert.ok(r.captures.every((c) => c.converted));
  const people = reportParticipants(finished(), nameOf);
  assert.equal(people.find((p) => p.id === 'r1').detail, 'Infectado a los 1:00 · 1 captura');
  assert.equal(people.find((p) => p.id === 'r1').team, 'hunter');
  assert.equal(people.find((p) => p.id === 'r3').detail, 'Superviviente');
});

test('Mission Report de Infección: todos infectados, con el último superviviente', () => {
  const r = missionReport(finished({ allCaught: true }), nameOf);
  assert.equal(r.winner, 'Ganan los cazadores');
  assert.equal(r.cause, 'Todos infectados');
  assert.ok(r.highlights.includes('Último superviviente: Dani, hasta los 6:40'));
});

test('resultado personal del convertido: gana con los cazadores y dice quién le infectó', () => {
  const caught = finished({ allCaught: true });
  assert.deepEqual(personalResult(caught, 'r1', nameOf), { title: 'Tu equipo gana', tone: 'win', detail: 'Te infectó Ana a los 1:00; después infectaste a 2' });
  assert.equal(personalResult(caught, 'r3', nameOf).detail, 'Te infectó Beto a los 6:40; después no infectaste a nadie');
  // Si sobrevive alguien, los convertidos pierden con los cazadores.
  assert.equal(personalResult(finished(), 'r2', nameOf).title, 'Tu equipo pierde');
  assert.equal(personalResult(finished(), 'r3', nameOf).title, 'Tu equipo gana');
});

test('Clásico no cambia: mismos textos de siempre', () => {
  const snap = { ...finished({ allCaught: true }), config: {}, captures: finished({ allCaught: true }).captures.map(({ converted: _c, ...c }) => c) };
  const r = missionReport(snap, nameOf);
  assert.equal(r.mode, 'Clásico');
  assert.equal(r.cause, 'Todos los fugitivos capturados');
  assert.ok(r.highlights[0].startsWith('Primera captura: Beto'));
  assert.equal(reportParticipants(snap, nameOf).find((p) => p.id === 'r1').detail, 'Captura a los 1:00');
});

test('Caza del zorro: nombre del rol, reglas, mapa e informe', async () => {
  const { briefing, mapModel, teamName } = await import('../www/js/game-view.js');
  const cfg = { mode: 'fox_hunt', durationMs: 20 * 60_000, headStartMs: 2 * 60_000, pingIntervalMs: 3 * 60_000, zone: [{ fromOffsetMs: 0, center: { lat: 0, lng: 0 }, radiusM: 400 }], meetingPoint: { lat: 0, lng: 0 }, safetyChecklistConfirmed: true };
  assert.equal(teamName('runner', cfg), 'ZORRO');
  assert.equal(teamName('hunter', cfg), 'CAZADOR');
  assert.equal(teamName('runner', {}), 'FUGITIVO');
  const text = Object.fromEntries(briefing(cfg).map((r) => [r.title, r.text]));
  assert.match(text.Objetivo, /atrapan al zorro/);
  assert.match(text.Pistas, /posición exacta del zorro/);
  assert.match(text.Pistas, /ve a los cazadores en directo/);
  assert.match(text['Captura del zorro'], /termina en ese momento/);
  assert.equal(errorText('not_enough_players', 'fox_hunt'), 'La caza del zorro necesita al menos 3 jugadores.');
  assert.match(errorText('teams_unbalanced', 'fox_hunt'), /exactamente un zorro/);
  // El zorro ve a los cazadores: marca de «visible» con el color del cazador.
  const model = mapModel({ snap: { config: cfg }, team: 'runner', positions: [{ playerId: 'h', reason: 'hunter_seen', lat: 0.001, lng: 0, accuracyM: 5, ageMs: 1_000, availability: 'CURRENT' }], positionsAt: 0, now: 0 });
  assert.deepEqual([model.dots[0].kind, model.dots[0].team], ['exposed', 'hunter']);
  const base = { phase: 'FINISHED', gameNo: 1, config: cfg, activeStart: 0, players: [{ id: 'h', name: 'Ana', team: 'hunter', status: 'active' }, { id: 'f', name: 'Zoe', team: 'runner', status: 'active' }] };
  const caught = missionReport({ ...base, finishedAt: 300_000, outcome: { winner: 'hunter', cause: 'all_captured' }, captures: [{ runnerId: 'f', hunterId: 'h', atOffsetMs: 300_000, via: 'claim' }] }, (id) => ({ h: 'Ana', f: 'Zoe' })[id]);
  assert.equal(caught.mode, 'Caza del zorro');
  assert.equal(caught.cause, 'Zorro atrapado');
  assert.ok(caught.highlights.includes('Zoe cayó a los 5:00, atrapado por Ana'));
  const escaped = { ...base, finishedAt: 1_200_000, outcome: { winner: 'runner', cause: 'time_up' }, captures: [] };
  assert.equal(missionReport(escaped, (id) => id).winner, 'Gana el zorro');
  assert.ok(missionReport(escaped, (id) => id).highlights.includes('El zorro aguantó hasta el final'));
  assert.equal(reportParticipants(escaped, (id) => id).find((p) => p.id === 'f').detail, 'Escapó');
});
