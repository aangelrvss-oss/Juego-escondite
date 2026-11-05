// THE OUTRUN · «Tu historial»: estadísticas personales guardadas SOLO en este móvil (localStorage).
// Sin servidor ni cuenta: nada sale del dispositivo. No se guardan nombres, códigos de sala, identificadores
// de jugador ni nada de ubicación: solo contadores y tiempos. Cada partida cuenta una sola vez (aunque se
// recargue la página o se reconecte): se recuerda una huella de la partida, no la partida.
// Se pierden al borrar los datos de la aplicación o del navegador, o al cambiar de móvil.
// Funciones puras sobre un `storage` con getItem/setItem (localStorage o equivalente): nunca lanzan.
import { personalResult } from './game-view.js';

export const STATS_KEY = 'outrun.stats';
const VERSION = 1;
const MAX_SEEN = 200; // huellas de partidas ya contadas (las más antiguas se olvidan)
const MODE_IDS = ['classic', 'infection', 'fox_hunt'];

const emptyMode = () => ({ games: 0, wins: 0 });

/** Historial vacío (también lo que devuelve readStats si no hay nada o está dañado). */
export function emptyStats() {
  return {
    v: VERSION,
    games: 0,
    wins: 0,
    losses: 0,
    other: 0, // sin ganador, o quedó fuera antes del final
    captures: 0, // capturas (o infecciones) hechas
    captured: 0, // veces capturado (o infectado)
    survivalMs: 0, // tiempo libre total como fugitivo (desde el inicio de la persecución)
    bestSurvivalMs: 0,
    byMode: Object.fromEntries(MODE_IDS.map((m) => [m, emptyMode()])),
    seen: [],
  };
}

const count = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Valida y normaliza lo guardado: cualquier campo dañado vuelve a 0 en vez de romper el informe. */
function normalize(raw) {
  const s = emptyStats();
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return s;
  for (const k of ['games', 'wins', 'losses', 'other', 'captures', 'captured', 'survivalMs', 'bestSurvivalMs']) s[k] = count(raw[k]);
  for (const m of MODE_IDS) {
    const r = raw.byMode?.[m];
    s.byMode[m] = { games: count(r?.games), wins: count(r?.wins) };
  }
  s.seen = Array.isArray(raw.seen) ? raw.seen.filter((x) => typeof x === 'string').slice(-MAX_SEEN) : [];
  return s;
}

/** Historial guardado en este móvil. Sin almacenamiento, vacío o dañado: historial vacío (nunca lanza). */
export function readStats(storage) {
  try {
    const text = storage?.getItem(STATS_KEY);
    return normalize(text ? JSON.parse(text) : null);
  } catch {
    return emptyStats();
  }
}

/** Huella de una partida (sala interna + nº de partida + final), resumida: no guarda el identificador. */
export function gameKey(snap) {
  const raw = `${snap?.roomId ?? ''}|${snap?.gameNo ?? ''}|${snap?.finishedAt ?? ''}`;
  let h = 0x811c9dc5; // FNV-1a de 32 bits
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Lo que esta partida suma al historial de `myId`, solo con la instantánea oficial del final. null si no
 * hay nada que contar (partida sin terminar o en la que este jugador no jugó).
 */
export function gameStats(snap, myId) {
  if (!snap || snap.phase !== 'FINISHED' || !snap.outcome || !myId) return null;
  const self = snap.players?.find((p) => p.id === myId);
  const mine = personalResult(snap, myId);
  if (!self || !mine) return null;
  const captures = snap.captures ?? [];
  const caught = captures.find((c) => c.runnerId === myId);
  const left = self.status === 'left' && self.leftReason !== 'after_end';
  // Fue fugitivo si le capturaron (o infectaron) o si acabó como fugitivo.
  const wasRunner = Boolean(caught) || self.team === 'runner';
  const chase = typeof snap.activeStart === 'number' && typeof snap.finishedAt === 'number' ? Math.max(0, snap.finishedAt - snap.activeStart) : null;
  // Supervivencia solo si se sabe con certeza: hasta la captura, o hasta el final si siguió libre (sin abandonar).
  let survivalMs = null;
  if (wasRunner && caught) survivalMs = caught.atOffsetMs;
  else if (wasRunner && !left && chase !== null) survivalMs = chase;
  return {
    mode: MODE_IDS.includes(snap.config?.mode) ? snap.config.mode : 'classic',
    result: mine.tone === 'win' ? 'win' : mine.tone === 'lose' ? 'loss' : 'other',
    captures: captures.filter((c) => c.hunterId === myId).length,
    captured: caught ? 1 : 0,
    survivalMs,
  };
}

/**
 * Suma la partida terminada al historial, una sola vez (idempotente: recargar o reconectar no la cuenta
 * otra vez). Devuelve { recorded, stats }. Si el almacenamiento falla, no guarda nada y no lanza.
 */
export function recordGame(storage, snap, myId) {
  const stats = readStats(storage);
  const g = gameStats(snap, myId);
  if (!g) return { recorded: false, stats };
  const key = gameKey(snap);
  if (stats.seen.includes(key)) return { recorded: false, stats };
  stats.games++;
  if (g.result === 'win') stats.wins++;
  else if (g.result === 'loss') stats.losses++;
  else stats.other++;
  stats.captures += g.captures;
  stats.captured += g.captured;
  if (g.survivalMs !== null) {
    stats.survivalMs += g.survivalMs;
    stats.bestSurvivalMs = Math.max(stats.bestSurvivalMs, g.survivalMs);
  }
  stats.byMode[g.mode].games++;
  if (g.result === 'win') stats.byMode[g.mode].wins++;
  stats.seen = [...stats.seen, key].slice(-MAX_SEEN);
  try {
    storage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    return { recorded: false, stats: readStats(storage) };
  }
  return { recorded: true, stats };
}
