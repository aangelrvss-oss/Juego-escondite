import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATS_KEY, emptyStats, gameKey, gameStats, readStats, recordGame } from '../www/js/stats.js';

// «Tu historial»: estadísticas solo en este móvil. Una vez por partida, tolerantes a un almacenamiento
// ausente, lleno o dañado, y sin nombres, salas ni ubicaciones. Datos de ejemplo, sin red.

const memory = () => {
  const m = new Map();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const pl = (id, name, team, status = 'active', leftReason = null) => ({ id, name, team, status, leftReason });
const finished = (over = {}) => ({
  roomId: 'sala-interna-7', gameNo: 2, phase: 'FINISHED', activeStart: 100_000, finishedAt: 100_000 + 12 * 60_000,
  config: { mode: 'classic', meetingPoint: { lat: 40.41537, lng: -3.68452 } },
  outcome: { winner: 'hunter', cause: 'all_captured' },
  captures: [
    { runnerId: 'r1', hunterId: 'h1', atOffsetMs: 5 * 60_000, via: 'claim' },
    { runnerId: 'r2', hunterId: 'h1', atOffsetMs: 12 * 60_000, via: 'claim' },
  ],
  players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner', 'captured'), pl('r2', 'Dani', 'runner', 'captured')],
  ...over,
});

test('una partida cuenta una sola vez, aunque se recargue o se reconecte', () => {
  const s = memory();
  const first = recordGame(s, finished(), 'h1');
  assert.equal(first.recorded, true);
  assert.equal(first.stats.games, 1);
  // La misma partida otra vez (misma instantánea o una copia recibida tras reconectar).
  assert.equal(recordGame(s, finished(), 'h1').recorded, false);
  assert.equal(recordGame(s, JSON.parse(JSON.stringify(finished())), 'h1').recorded, false);
  assert.equal(readStats(s).games, 1);
  // La revancha (otra partida de la misma sala) sí cuenta.
  assert.equal(recordGame(s, finished({ gameNo: 3, finishedAt: 999_999_999 }), 'h1').recorded, true);
  assert.equal(readStats(s).games, 2);
});

test('suma victorias, derrotas, capturas, veces capturado y supervivencia (por modo)', () => {
  const s = memory();
  recordGame(s, finished(), 'r1'); // Caro: pierde, capturada a los 5:00
  recordGame(s, finished({ gameNo: 3, outcome: { winner: 'runner', cause: 'time_up' }, captures: [], players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner')] }), 'r1'); // gana, libre 12:00
  recordGame(s, finished({ gameNo: 4, config: { mode: 'infection' }, outcome: { winner: 'hunter', cause: 'all_captured' }, captures: [{ runnerId: 'x', hunterId: 'r1', atOffsetMs: 60_000, via: 'claim', converted: true }], players: [pl('r1', 'Caro', 'hunter'), pl('x', 'X', 'hunter')] }), 'r1'); // cazadora en Infección: gana, 1 infección
  recordGame(s, finished({ gameNo: 5, outcome: { winner: null, cause: 'ended_by_host' }, captures: [] }), 'r1'); // sin ganador
  const st = readStats(s);
  assert.deepEqual(
    { games: st.games, wins: st.wins, losses: st.losses, other: st.other, captures: st.captures, captured: st.captured, survivalMs: st.survivalMs, bestSurvivalMs: st.bestSurvivalMs },
    { games: 4, wins: 2, losses: 1, other: 1, captures: 1, captured: 1, survivalMs: (5 + 12 + 12) * 60_000, bestSurvivalMs: 12 * 60_000 },
  );
  assert.deepEqual(st.byMode, { classic: { games: 3, wins: 1 }, infection: { games: 1, wins: 1 }, fox_hunt: { games: 0, wins: 0 } });
});

test('quien abandonó cuenta la partida, sin victoria ni tiempo de supervivencia inventado', () => {
  const snap = finished({ outcome: { winner: 'runner', cause: 'time_up' }, captures: [], players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner', 'left', 'timeout'), pl('r2', 'Dani', 'runner')] });
  assert.deepEqual(gameStats(snap, 'r1'), { mode: 'classic', result: 'other', captures: 0, captured: 0, survivalMs: null });
  // Salir de la sala después del final no es abandonar.
  const after = finished({ outcome: { winner: 'runner', cause: 'time_up' }, captures: [], players: [pl('h1', 'Ana', 'hunter'), pl('r1', 'Caro', 'runner', 'left', 'after_end')] });
  assert.deepEqual(gameStats(after, 'r1'), { mode: 'classic', result: 'win', captures: 0, captured: 0, survivalMs: 12 * 60_000 });
});

test('no cuenta lo que no es una partida jugada y terminada', () => {
  const s = memory();
  assert.equal(recordGame(s, null, 'h1').recorded, false);
  assert.equal(recordGame(s, finished({ phase: 'ACTIVE' }), 'h1').recorded, false);
  assert.equal(recordGame(s, finished({ outcome: null }), 'h1').recorded, false);
  assert.equal(recordGame(s, finished(), 'otro').recorded, false, 'no jugó');
  assert.equal(recordGame(s, finished(), null).recorded, false);
  assert.equal(s.m.size, 0, 'no se ha escrito nada');
});

test('tolerante: sin almacenamiento, almacenamiento que falla o datos dañados', () => {
  assert.deepEqual(readStats(null), emptyStats());
  assert.deepEqual(readStats(undefined), emptyStats());
  assert.equal(recordGame(null, finished(), 'h1').recorded, false);
  const throwing = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); } };
  assert.deepEqual(readStats(throwing), emptyStats());
  assert.equal(recordGame(throwing, finished(), 'h1').recorded, false);
  const full = memory();
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(recordGame(full, finished(), 'h1').recorded, false);
  for (const bad of ['{', 'null', '42', '"x"', '[]', JSON.stringify({ v: 99, games: 5 }), JSON.stringify({ v: 1, games: -3, wins: 'muchas', byMode: 7, seen: 'x' })]) {
    const s = memory();
    s.setItem(STATS_KEY, bad);
    const st = readStats(s);
    assert.equal(st.games, 0, bad);
    assert.equal(recordGame(s, finished(), 'h1').stats.games, 1, `se recupera de ${bad}`);
  }
});

test('privacidad: no guarda nombres, salas, identificadores ni ubicaciones', () => {
  const s = memory();
  recordGame(s, finished(), 'h1');
  const saved = s.getItem(STATS_KEY);
  assert.doesNotMatch(saved, /Ana|Caro|Dani|sala-interna|h1|r1|lat|lng|40\.41|-3\.68/);
  assert.deepEqual([...s.m.keys()], [STATS_KEY], 'una sola clave');
  assert.match(gameKey(finished()), /^[0-9a-z]+$/);
  assert.notEqual(gameKey(finished()), gameKey(finished({ gameNo: 3 })));
});

test('recuerda como mucho 200 huellas de partidas', () => {
  const s = memory();
  for (let i = 0; i < 205; i++) recordGame(s, finished({ gameNo: i }), 'h1');
  const st = readStats(s);
  assert.equal(st.games, 205);
  assert.equal(st.seen.length, 200);
});
