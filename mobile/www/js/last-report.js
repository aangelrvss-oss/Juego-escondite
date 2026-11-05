// THE OUTRUN · el último Mission Report de este móvil (AF-11, D-063). La revancha devuelve la sala a la
// espera y el servidor ya no tiene el informe anterior: este móvil guarda una copia para seguir viéndolo y
// compartiéndolo. Solo el último, solo en este móvil (localStorage) y solo lo que el informe necesita:
// nombres de la partida, equipos, capturas (sin coordenadas), resultado y tiempos, con los identificadores
// internos de la sala y de los jugadores (no sirven para entrar: reanudar exige el secreto de la sesión).
// Nada de ubicación: ni la zona, ni el punto de encuentro, ni pistas. Se sustituye con la partida
// siguiente; se pierde al borrar los datos. Funciones puras sobre un `storage` con getItem/setItem/removeItem: nunca lanzan.
import { gameKey } from './stats.js';

export const LAST_REPORT_KEY = 'outrun.lastReport';
const VERSION = 1;

/** Copia mínima de una instantánea FINISHED para el informe, sin nada de ubicación. null si no hay informe. */
export function reportCopy(snap) {
  if (!snap || snap.phase !== 'FINISHED' || !snap.outcome) return null;
  const c = snap.config ?? {};
  return {
    roomId: snap.roomId,
    gameNo: snap.gameNo,
    phase: 'FINISHED',
    hostId: snap.hostId,
    activeStart: snap.activeStart ?? null,
    finishedAt: snap.finishedAt ?? null,
    headStartEnd: snap.headStartEnd ?? null,
    rulesVersion: snap.rulesVersion ?? null,
    players: snap.players.map((p) => ({ id: p.id, name: p.name, team: p.team ?? null, status: p.status, leftReason: p.leftReason ?? null })),
    config: { mode: c.mode, durationMs: c.durationMs, headStartMs: c.headStartMs, pingIntervalMs: c.pingIntervalMs, dynamicZone: c.dynamicZone },
    captures: (snap.captures ?? []).map((k) => ({ runnerId: k.runnerId, hunterId: k.hunterId ?? null, atOffsetMs: k.atOffsetMs, via: k.via, converted: k.converted })),
    outcome: snap.outcome,
  };
}

/** Guarda el informe de la partida terminada (una vez por partida: la misma huella no se reescribe). */
export function saveLastReport(storage, snap, myId) {
  const copy = reportCopy(snap);
  if (!copy) return false;
  const key = gameKey(snap);
  if (readLastReport(storage)?.key === key) return false;
  try {
    storage.setItem(LAST_REPORT_KEY, JSON.stringify({ v: VERSION, key, myId, snap: copy }));
    return true;
  } catch {
    return false;
  }
}

/** El último informe guardado ({ key, myId, snap }) o null si no hay o está dañado. */
export function readLastReport(storage) {
  try {
    const raw = JSON.parse(storage.getItem(LAST_REPORT_KEY) ?? 'null');
    if (!raw || raw.v !== VERSION || typeof raw.key !== 'string' || !raw.snap?.outcome || !Array.isArray(raw.snap.players)) return null;
    return { key: raw.key, myId: typeof raw.myId === 'string' ? raw.myId : null, snap: raw.snap };
  } catch {
    return null;
  }
}

/**
 * ¿Ofrecer «Ver el informe anterior»? En el inicio y en la sala (la de la revancha, con la partida anterior
 * ya fuera del servidor, u otra sala). No en la partida en curso ni en un final, que ya muestra su informe.
 */
export function previousReportFor(last, snap) {
  return last && (!snap || snap.phase === 'LOBBY') ? last : null;
}
