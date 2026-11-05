import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guideStaysOpen } from '../www/js/game-view.js';
import { LAST_REPORT_KEY, previousReportFor, readLastReport, reportCopy, saveLastReport } from '../www/js/last-report.js';
import { missionReportScreen } from '../www/js/report-view.js';
import { readStats, recordGame } from '../www/js/stats.js';

// Segunda auditoría (04/11/2026): la guía no puede tapar la cuenta atrás ni la tarjeta del rol (AF-10), y la
// revancha no puede borrar sin aviso el informe de la partida anterior (AF-11, D-063).

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

const snapAt = (phase, gameNo = 1) => ({ phase, gameNo, players: [] });

test('AF-10 · la guía se cierra al cambiar de fase y no se queda en la cuenta atrás ni sobre el rol', () => {
  assert.equal(guideStaysOpen(snapAt('LOBBY'), snapAt('LOBBY'), null, 0), true, 'en la sala sigue abierta');
  assert.equal(guideStaysOpen(snapAt('LOBBY'), snapAt('COUNTDOWN'), null, 0), false, 'empieza la cuenta atrás');
  assert.equal(guideStaysOpen(null, snapAt('COUNTDOWN'), null, 0), false, 'ni abrirla durante la cuenta atrás');
  assert.equal(guideStaysOpen(snapAt('COUNTDOWN'), snapAt('HEAD_START'), null, 0), false, 'empieza la huida');
  assert.equal(guideStaysOpen(snapAt('HEAD_START'), snapAt('HEAD_START'), { team: 'runner', until: 5_000 }, 1_000), false, 'tarjeta del rol a la vista');
  assert.equal(guideStaysOpen(snapAt('HEAD_START'), snapAt('HEAD_START'), { team: 'runner', until: 5_000 }, 6_000), true, 'pasada la tarjeta, se puede abrir');
  assert.equal(guideStaysOpen(snapAt('ACTIVE'), snapAt('FINISHED'), null, 0), false, 'termina la partida');
  assert.equal(guideStaysOpen(snapAt('FINISHED', 1), snapAt('LOBBY', 2), null, 0), false, 'revancha');
  assert.equal(guideStaysOpen(null, null, null, 0), true, 'en el inicio, sin sala');
});

const finished = {
  roomId: 'room-1',
  gameNo: 1,
  phase: 'FINISHED',
  hostId: 'h',
  serverNow: 0,
  activeStart: 1_000,
  headStartEnd: 1_000,
  finishedAt: 601_000,
  rulesVersion: 'r1',
  players: [
    { id: 'h', name: 'Ana', team: 'hunter', status: 'active', ready: false, connected: true, away: false, leftReason: null, teamPref: null },
    { id: 'b', name: 'Beto', team: 'runner', status: 'active', ready: false, connected: true, away: false, leftReason: null, teamPref: null },
  ],
  config: { mode: 'classic', durationMs: 600_000, headStartMs: 120_000, pingIntervalMs: 180_000, dynamicZone: true, zone: [{ fromOffsetMs: 0, center: { lat: 40.4153, lng: -3.6845 }, radiusM: 250 }], meetingPoint: { lat: 40.4153, lng: -3.6845 }, safetyChecklistConfirmed: true },
  zonePlan: [{ fromOffsetMs: 0, center: { lat: 40.4153, lng: -3.6845 }, radiusM: 250 }],
  captures: [{ runnerId: 'b', hunterId: 'h', atOffsetMs: 300_000, via: 'claim' }],
  outcome: { winner: 'hunter', cause: 'all_captured' },
  lastPing: null,
};

test('AF-11 · la copia del informe no guarda nada de ubicación', () => {
  const copy = reportCopy(finished);
  const text = JSON.stringify(copy);
  assert.ok(!/lat|lng|center|meetingPoint|zonePlan|lastPing/.test(text), text);
  assert.equal(reportCopy({ ...finished, phase: 'LOBBY' }), null);
  assert.equal(reportCopy({ ...finished, outcome: null }), null);
});

test('AF-11 · tras la revancha, el informe anterior sigue igual en este móvil y se puede abrir desde la sala', () => {
  const store = memoryStorage();
  assert.equal(saveLastReport(store, finished, 'b'), true);
  assert.equal(saveLastReport(store, finished, 'b'), false, 'recargar no lo reescribe');
  const last = readLastReport(store);
  const original = missionReportScreen(finished, { myId: 'b' });
  const archived = missionReportScreen(last.snap, { myId: last.myId, archived: true });
  // El informe común es el mismo (solo cambian los botones del final).
  const body = (html) => html.slice(0, html.indexOf('<div class="result-actions">'));
  assert.equal(body(archived), body(original));
  assert.ok(archived.includes('data-act="close-report"') && !archived.includes('data-act="rematch"'));
  // Sala de la revancha: se ofrece; en la partida o en un final, no.
  assert.equal(previousReportFor(last, { ...finished, phase: 'LOBBY', gameNo: 2 }), last);
  assert.equal(previousReportFor(last, null), last, 'también desde el inicio');
  assert.equal(previousReportFor(last, { ...finished, phase: 'ACTIVE', gameNo: 2 }), null);
  assert.equal(previousReportFor(last, finished), null);
});

test('AF-11 · la partida siguiente sustituye la copia; el historial no mezcla ni duplica partidas', () => {
  const store = memoryStorage();
  saveLastReport(store, finished, 'b');
  recordGame(store, finished, 'b');
  const second = { ...finished, gameNo: 2, finishedAt: 1_201_000, captures: [], outcome: { winner: 'runner', cause: 'time_up' } };
  saveLastReport(store, second, 'b');
  recordGame(store, second, 'b');
  recordGame(store, second, 'b');
  assert.equal(readLastReport(store).snap.gameNo, 2);
  const stats = readStats(store);
  assert.equal(stats.games, 2);
  assert.equal(stats.wins + stats.losses + stats.other, 2);
});

test('AF-11 · almacenamiento dañado o bloqueado: no lanza', () => {
  const store = memoryStorage();
  store.setItem(LAST_REPORT_KEY, '{roto');
  assert.equal(readLastReport(store), null);
  const blocked = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem() {} };
  assert.equal(readLastReport(blocked), null);
  assert.equal(saveLastReport(blocked, finished, 'b'), false);
});

test('AF-11 · la revancha pide un segundo toque y explica que el informe queda guardado', () => {
  const host = missionReportScreen(finished, { myId: 'h' });
  assert.match(host, /data-act="rematch">Revancha</);
  const confirm = missionReportScreen(finished, { myId: 'h', confirmRematch: true });
  assert.match(confirm, /Toca otra vez para empezar la revancha/);
  assert.match(confirm, /informe queda guardado/);
});
