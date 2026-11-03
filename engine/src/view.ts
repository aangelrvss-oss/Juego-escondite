import { TIMING } from './constants.ts';
import { modeOf } from './modes.ts';
import { availabilityOf, latestSample, sampleAsOf } from './location.ts';
import type { Audience, Availability, Phase, Player, RoomState, StoredSample, Team, TeamPref, ZoneVersion } from './types.ts';
import { visibleZonePlan } from './zone.ts';

// Filtrado en el servidor ANTES de enviar: lo que esta función no devuelve,
// el cliente no lo recibe nunca (GAME_STATE_MACHINE.md §6.4).

export function canReceive(state: RoomState, audience: Audience, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  if (player.status === 'left') {
    // Quien queda fuera por el periodo de gracia (D-057) sigue sabiendo lo que es público (capturas,
    // final, revancha), sin pistas ni posiciones: así su móvil, al volver, le explica qué ha pasado.
    const timedOut = player.leftReason === 'timeout' && !player.leftRoom && player.playedGameNo === state.gameNo;
    return timedOut && audience.kind === 'all';
  }
  switch (audience.kind) {
    case 'all':
      return true;
    case 'team':
      return (player.status === 'active' || player.status === 'captured') && player.team === audience.team;
    case 'players':
      return audience.ids.includes(playerId);
  }
}

// hunter_seen: el zorro ve a los cazadores (Fox Hunt «Mr. X», D-057).
export type PositionReason = 'teammate' | 'exposed' | 'spectator_delayed' | 'hunter_seen';

export interface VisiblePosition {
  playerId: string;
  reason: PositionReason;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  ageMs: number | null;
  availability: Availability;
}

function toVisible(
  playerId: string,
  reason: PositionReason,
  sample: StoredSample | null,
  now: number,
  referenceTime: number,
): VisiblePosition {
  return {
    playerId,
    reason,
    lat: sample?.lat ?? null,
    lng: sample?.lng ?? null,
    accuracyM: sample?.accuracyM ?? null,
    ageMs: sample ? now - sample.effectiveAt : null,
    availability: availabilityOf(sample, referenceTime),
  };
}

const LIVE_PHASES: readonly Phase[] = ['HEAD_START', 'ACTIVE'];

export function visiblePositions(state: RoomState, viewerId: string, now: number): VisiblePosition[] {
  const viewer = state.players[viewerId];
  if (!viewer || !LIVE_PHASES.includes(state.phase)) return [];
  const others = state.playerOrder
    .filter((id) => id !== viewerId)
    .map((id) => state.players[id])
    .filter((p): p is Player => p !== undefined);

  if (viewer.status === 'active') {
    const out: VisiblePosition[] = [];
    const runnersSeeHunters = modeOf(state.config).runnersSeeHunters;
    for (const other of others) {
      if (other.status !== 'active') continue;
      if (other.team === viewer.team) {
        out.push(toVisible(other.id, 'teammate', latestSample(other), now, now));
      } else if (
        viewer.team === 'hunter' &&
        other.team === 'runner' &&
        state.phase === 'ACTIVE' &&
        other.exposed
      ) {
        out.push(toVisible(other.id, 'exposed', latestSample(other), now, now));
      } else if (runnersSeeHunters && viewer.team === 'runner' && other.team === 'hunter') {
        out.push(toVisible(other.id, 'hunter_seen', latestSample(other), now, now));
      }
      // Fugitivos nunca reciben cazadores. Cazadores solo reciben fugitivos expuestos
      // (y pistas, que van por eventos).
    }
    return out;
  }

  if (viewer.status === 'captured') {
    // Espectador: todos los jugadores activos con TIMING.spectatorDelayMs de retraso.
    const asOf = now - TIMING.spectatorDelayMs;
    return others
      .filter((o) => o.status === 'active')
      .map((o) => toVisible(o.id, 'spectator_delayed', sampleAsOf(o, asOf), now, asOf));
  }

  return [];
}

export interface PlayerView {
  id: string;
  name: string;
  // null si este destinatario no está autorizado a conocerlo (no significa «sin equipo»).
  team: Team | null;
  teamPref: TeamPref | null;
  status: string;
  ready: boolean;
  connected: boolean;
  // D-057: sin señal de la aplicación desde hace 30 s durante la partida (no dice desde cuándo).
  away: boolean;
  // Solo para quien ha salido: por su cuenta o por el periodo de gracia.
  leftReason: 'left' | 'timeout' | 'after_end' | null;
}

export interface Snapshot {
  roomId: string;
  gameNo: number;
  phase: Phase;
  hostId: string;
  serverNow: number;
  countdownEnd: number | null;
  headStartEnd: number | null;
  gameEnd: number | null;
  nextPingAt: number | null;
  // Inicio de la persecución y momento del final (hora del servidor; iguales para todos). Permiten
  // reconstruir el Mission Report tras una reconexión sin depender del evento game_finished.
  activeStart: number | null;
  finishedAt: number | null;
  rulesVersion: string | null;
  players: PlayerView[];
  config: RoomState['config'];
  // Zona dinámica: puntos clave del plan hasta el destino de la fase en curso (las fases futuras no se
  // revelan). Con la hora del servidor y `activeStart`, cada móvil calcula el mismo círculo (zoneInPlan).
  zonePlan: ZoneVersion[] | null;
  captures: RoomState['captures'];
  outcome: RoomState['outcome'];
  lastPing: RoomState['lastPing'];
  pendingClaimForMe: { claimId: string; hunterId: string; expiresAt: number } | null;
  // La reclamación que ha hecho este cazador y espera respuesta (para no perderla al recargar).
  pendingClaimByMe: { claimId: string; runnerId: string; expiresAt: number } | null;
  // Infección: desde cuándo puede reclamar capturas quien recibe la vista (si acaba de convertirse).
  canTagFrom: number | null;
  closeReason: string | null;
}

// Equipo de `p` tal como puede verlo `viewer`: el propio y el de sus compañeros (que ya comparten
// posiciones, §6.4), nunca el del otro equipo. Durante la cuenta atrás, ninguno (D-042). Con la partida
// ya terminada, todos ven el de todos (decisión del 29/10/2026): solo en FINISHED, nunca antes.
function teamVisibleTo(state: RoomState, viewer: Player | undefined, p: Player): Team | null {
  if (state.phase === 'FINISHED') return viewer ? p.team : null;
  if (state.phase === 'COUNTDOWN' || !viewer || !viewer.team || !p.team) return null;
  if (p.id === viewer.id) return p.team;
  const inGame = (x: Player) => x.status === 'active' || x.status === 'captured';
  // Fox Hunt: tras la cuenta atrás los roles son públicos (un zorro contra todos; el zorro ve a los
  // cazadores y ellos reciben su posición).
  if (modeOf(state.config).runnersSeeHunters && inGame(viewer) && inGame(p)) return p.team;
  return inGame(viewer) && inGame(p) && p.team === viewer.team ? p.team : null;
}

export function snapshotFor(state: RoomState, viewerId: string, now: number): Snapshot {
  const viewer = state.players[viewerId];
  const isHunter = viewer?.team === 'hunter' && viewer.status === 'active';
  // Infección: un convertido no recibe la última pista anterior a su conversión, solo las siguientes.
  const pingVisible =
    isHunter && state.lastPing !== null && (viewer.pingsBeforeConversion == null || state.lastPing.pingNo > viewer.pingsBeforeConversion);
  const pending = Object.values(state.claims).find((c) => c.runnerId === viewerId) ?? null;
  const mine = Object.values(state.claims).find((c) => c.hunterId === viewerId) ?? null;
  return {
    roomId: state.roomId,
    gameNo: state.gameNo,
    phase: state.phase,
    hostId: state.hostId,
    serverNow: now,
    countdownEnd: state.countdownEnd,
    headStartEnd: state.headStartEnd,
    gameEnd: state.gameEnd,
    nextPingAt: state.nextPingAt,
    activeStart: state.activeStart,
    finishedAt: state.finishedAt,
    rulesVersion: state.rulesVersion ?? null,
    players: state.playerOrder
      .map((id) => state.players[id])
      // Quien jugó esta partida y salió sigue en el resultado final (con estado «left»), para que el
      // informe tenga su nombre y su equipo igual para todos y tras recargar.
      // Quien recibe la vista se ve siempre a sí mismo (también si ha quedado fuera de la partida).
      .filter((p): p is Player => p !== undefined && (p.status !== 'left' || p.id === viewerId || (state.phase === 'FINISHED' && p.playedGameNo === state.gameNo)))
      .map((p) => ({
        id: p.id,
        name: p.name,
        team: teamVisibleTo(state, viewer, p),
        // La preferencia solo la ve quien la fijó: el propio jugador o el anfitrión que la asignó.
        teamPref: p.teamPrefSetBy === viewerId ? p.teamPref : null,
        status: p.status,
        ready: p.ready,
        connected: p.connected,
        away: p.away === true,
        leftReason: p.status === 'left' ? (p.leftReason ?? 'left') : null,
      })),
    config: state.config,
    zonePlan: state.zonePlan ? visibleZonePlan(state.zonePlan, state.zonePhase ?? 0) : null,
    captures: state.captures,
    outcome: state.outcome,
    // La última pista solo la recibe un cazador activo (para reanudar tras reconectar).
    lastPing: pingVisible ? state.lastPing : null,
    pendingClaimForMe: pending
      ? { claimId: pending.id, hunterId: pending.hunterId, expiresAt: pending.expiresAt }
      : null,
    pendingClaimByMe: mine ? { claimId: mine.id, runnerId: mine.runnerId, expiresAt: mine.expiresAt } : null,
    // V-27: solo en la huida y la persecución (no queda en el informe ni en la sala de la revancha).
    canTagFrom:
      LIVE_PHASES.includes(state.phase) && viewer?.canTagFrom != null && viewer.canTagFrom > now ? viewer.canTagFrom : null,
    closeReason: state.closeReason,
  };
}
