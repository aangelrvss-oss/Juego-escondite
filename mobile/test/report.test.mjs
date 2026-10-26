import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missionReport } from '../www/js/game-view.js';

// Mission Report (Plan Maestro §4.4) a partir de la instantánea oficial. Datos de ejemplo, sin red.

const names = { h1: 'Ana', h2: 'Beto', r1: 'Caro', r2: 'Dani', r3: 'Eva' };
const nameOf = (id) => names[id] ?? 'Alguien';
const base = (over = {}) => ({
  phase: 'FINISHED',
  activeStart: 1_000_000,
  finishedAt: 1_000_000 + 12 * 60_000,
  outcome: { winner: 'hunter', cause: 'all_captured' },
  captures: [],
  ...over,
});

test('sin final no hay informe', () => {
  assert.equal(missionReport(null), null);
  assert.equal(missionReport(base({ phase: 'ACTIVE' })), null);
  assert.equal(missionReport(base({ outcome: null })), null);
});

test('todos capturados: duración, tiempo hasta la victoria, ranking y momentos verificables', () => {
  const r = missionReport(
    base({
      captures: [
        { runnerId: 'r3', hunterId: 'h1', atOffsetMs: 12 * 60_000, via: 'claim' }, // desordenadas a propósito
        { runnerId: 'r1', hunterId: 'h1', atOffsetMs: 95_000, via: 'claim' },
        { runnerId: 'r2', hunterId: null, atOffsetMs: 7 * 60_000, via: 'self' },
      ],
    }),
    nameOf,
  );
  assert.equal(r.winner, 'Ganan los cazadores');
  assert.equal(r.cause, 'Todos los fugitivos capturados');
  assert.equal(r.durationMs, 12 * 60_000);
  assert.equal(r.timeToVictoryMs, 12 * 60_000);
  assert.equal(r.captureCount, 3);
  assert.equal(r.selfDeclared, 1);
  assert.deepEqual(r.captures.map((c) => c.runner), ['Caro', 'Dani', 'Eva'], 'en orden cronológico');
  assert.deepEqual(r.hunterRanking, [{ name: 'Ana', captures: 2 }]);
  assert.deepEqual(r.highlights, ['Primera captura: Caro a los 1:35', 'Captura decisiva: Eva por Ana a los 12:00', 'Más capturas: Ana (2)']);
});

test('fin por tiempo con fugitivos libres: sin «hasta la victoria» y sin empate como «más capturas»', () => {
  const r = missionReport(
    base({
      outcome: { winner: 'runner', cause: 'time_up' },
      captures: [
        { runnerId: 'r1', hunterId: 'h1', atOffsetMs: 60_000, via: 'claim' },
        { runnerId: 'r2', hunterId: 'h2', atOffsetMs: 120_000, via: 'claim' },
      ],
    }),
    nameOf,
  );
  assert.equal(r.winner, 'Ganan los fugitivos');
  assert.equal(r.timeToVictoryMs, null);
  assert.ok(r.highlights.includes('Los fugitivos aguantaron hasta el final'));
  assert.ok(!r.highlights.some((h) => h.startsWith('Más capturas')), 'empate a 1: no hay destacado');
});

test('terminada por el anfitrión durante la huida: sin ganador y sin duración de persecución', () => {
  const r = missionReport(base({ activeStart: null, outcome: { winner: null, cause: 'ended_by_host' } }), nameOf);
  assert.equal(r.winner, 'Sin ganador');
  assert.equal(r.durationMs, null);
  assert.deepEqual(r.highlights, []);
});

test('el informe indica con qué versión de reglas se jugó (Plan §8.3)', () => {
  assert.equal(missionReport(base({ rulesVersion: 'clasico/2026-10-26' }), nameOf).rulesVersion, 'clasico/2026-10-26');
  assert.equal(missionReport(base(), nameOf).rulesVersion, null, 'partidas guardadas antes de existir el campo');
});

test('el informe no contiene coordenadas ni equipos', () => {
  const r = missionReport(base({ captures: [{ runnerId: 'r1', hunterId: 'h1', atOffsetMs: 1000, via: 'claim' }] }), nameOf);
  assert.doesNotMatch(JSON.stringify(r), /"(lat|lng|team|teamPref|accuracyM)"/);
});
