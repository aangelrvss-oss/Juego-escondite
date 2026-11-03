import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorText, pingCountdown, personalResult, reportParticipants } from '../www/js/game-view.js';

// Próxima pista, resultado personal y participantes del Mission Report. Datos de ejemplo, sin red.

const names = { h1: 'Ana', h2: 'Beto', r1: 'Caro', r2: 'Dani', r3: 'Eva' };
const nameOf = (id) => names[id] ?? 'Alguien';
const T = 1_000_000;

const active = (over = {}) => ({ phase: 'ACTIVE', nextPingAt: T + 42_000, config: { pingIntervalMs: 180_000 }, ...over });

test('próxima pista: el mismo plazo para los dos roles, explicado según el rol', () => {
  const h = pingCountdown(active(), 'hunter', T);
  const r = pingCountdown(active(), 'runner', T);
  assert.equal(h.leftMs, 42_000);
  assert.equal(r.leftMs, 42_000);
  assert.equal(h.text, 'Próxima pista en');
  assert.equal(r.text, 'Los cazadores reciben tu posición en');
  assert.equal(h.imminent, true, 'menos de 1 min');
  assert.ok(Math.abs(h.progress - 42 / 180) < 1e-9);
  assert.equal(pingCountdown(active(), 'hunter', T + 60_000).leftMs, 0, 'nunca negativo');
  assert.equal(pingCountdown(active({ nextPingAt: T + 120_000 }), 'runner', T).imminent, false);
});

test('próxima pista: sin más pistas, fuera de la persecución o sin rol', () => {
  const none = pingCountdown(active({ nextPingAt: null }), 'hunter', T);
  assert.equal(none.leftMs, null);
  assert.match(none.text, /No quedan más pistas/);
  assert.equal(pingCountdown(active({ phase: 'HEAD_START' }), 'hunter', T), null);
  assert.equal(pingCountdown(active(), null, T), null);
  assert.equal(pingCountdown(null, 'hunter', T), null);
});

const finished = (over = {}) => ({
  phase: 'FINISHED',
  outcome: { winner: 'hunter', cause: 'all_captured' },
  captures: [
    { runnerId: 'r1', hunterId: 'h1', atOffsetMs: 95_000, via: 'claim' },
    { runnerId: 'r2', hunterId: null, atOffsetMs: 7 * 60_000, via: 'self' },
  ],
  players: [
    { id: 'h1', name: 'Ana', team: 'hunter', status: 'active' },
    { id: 'h2', name: 'Beto', team: null, status: 'active' },
    { id: 'r1', name: 'Caro', team: null, status: 'captured' },
    { id: 'r2', name: 'Dani', team: null, status: 'captured' },
  ],
  ...over,
});

test('resultado personal: solo con el equipo propio', () => {
  assert.deepEqual(personalResult(finished(), 'h1', nameOf), { title: 'Tu equipo gana', tone: 'win', detail: 'Hiciste 1 captura' });
  const caro = finished({ players: [{ id: 'r1', name: 'Caro', team: 'runner', status: 'captured' }] });
  assert.deepEqual(personalResult(caro, 'r1', nameOf), { title: 'Tu equipo pierde', tone: 'lose', detail: 'Te capturó Ana a los 1:35' });
  const dani = finished({ players: [{ id: 'r2', name: 'Dani', team: 'runner', status: 'captured' }] });
  assert.equal(personalResult(dani, 'r2', nameOf).detail, 'Declaraste tu captura a los 7:00');
  const eva = finished({ outcome: { winner: 'runner', cause: 'time_up' }, players: [{ id: 'r3', name: 'Eva', team: 'runner', status: 'active' }] });
  assert.deepEqual(personalResult(eva, 'r3', nameOf), { title: 'Tu equipo gana', tone: 'win', detail: 'Seguías libre al final' });
  const noWinner = finished({ outcome: { winner: null, cause: 'ended_by_host' } });
  assert.equal(personalResult(noWinner, 'h1', nameOf).title, 'Sin ganador');
  assert.equal(personalResult(finished(), 'h2', nameOf), null, 'equipo desconocido: sin resultado personal');
});

test('participantes: con el equipo que da el servidor al terminar, quien salió y sin coordenadas', () => {
  // Al terminar, el servidor da el equipo de todos y conserva a quien jugó y salió (estado «left»).
  const all = finished({
    outcome: { winner: 'runner', cause: 'time_up' },
    players: [
      { id: 'h1', name: 'Ana', team: 'hunter', status: 'active' },
      { id: 'h2', name: 'Beto', team: 'hunter', status: 'left' },
      { id: 'r1', name: 'Caro', team: 'runner', status: 'captured' },
      { id: 'r2', name: 'Dani', team: 'runner', status: 'left' },
      { id: 'r3', name: 'Eva', team: 'runner', status: 'active' },
    ],
  });
  assert.deepEqual(
    reportParticipants(all, nameOf).map((p) => [p.name, p.team, p.detail]),
    [
      ['Ana', 'hunter', '1 captura'],
      ['Beto', 'hunter', 'Abandonó'],
      ['Caro', 'runner', 'Captura a los 1:35'],
      ['Dani', 'runner', 'Captura a los 7:00 · abandonó'],
      ['Eva', 'runner', 'Libre al final'],
    ],
  );
  assert.doesNotMatch(JSON.stringify(reportParticipants(all, nameOf)), /lat|lng|accuracy/);
  assert.deepEqual(reportParticipants(finished({ phase: 'ACTIVE' }), nameOf), []);
});

test('participantes de una instantánea sin equipos: se deduce lo público y nada más', () => {
  const people = reportParticipants(finished(), nameOf);
  assert.deepEqual(people.map((p) => [p.name, p.team]), [['Ana', 'hunter'], ['Beto', null], ['Caro', 'runner'], ['Dani', 'runner']]);
});

test('configuración rechazada por el intervalo de pistas: mensaje claro, no «Configuración no válida»', () => {
  assert.match(errorText('invalid_config', 'pingIntervalMs'), /intervalo de pistas menor que la duración/);
  assert.equal(errorText('invalid_config', 'zone'), 'Configuración no válida.');
  assert.equal(errorText('invalid_config'), 'Configuración no válida.');
});
