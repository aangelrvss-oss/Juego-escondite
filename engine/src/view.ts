import { TIMING } from './constants.ts';
import { availabilityOf, latestSample, sampleAsOf } from './location.ts';
import type { Audience, Availability, Phase, Player, RoomState, StoredSample, Team } from './types.ts';

// Filtrado en el servidor ANTES de enviar: lo que esta función no devuelve,
// el cliente no lo recibe nunca (GAME_STATE_MACHINE.md §6.4).

export function canReceive(state: RoomState, audience: Audience, playerId: string): boolean {
  const player = state.players[playerId];
  if (!player || player.status === 'left') return false;
  switch (audience.kind) {
    case 'all':
      return true;
    case 'team':
      return (player.status === 'active' || player.status === 'captured') && player.team === audience.team;
    case 'players':
      return audience.ids.includes(playerId);
  }
}

export type PositionReason = 'teammate' | 'exposed' | 'spectator_delayed';

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
  team: Team | null;
  teamPref: string;
  status: string;
  ready: boolean;
  connected: boolean;
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
  players: PlayerView[];
  config: RoomState['config'];
  captures: RoomState['captures'];
  outcome: RoomState['outcome'];
  lastPing: RoomState['lastPing'];
  pendingClaimForMe: { claimId: string; hunterId: string; expiresAt: number } | null;
  closeReason: string | null;
}

export function snapshotFor(state: RoomState, viewerId: string, now: number): Snapshot {
  const viewer = state.players[viewerId];
  const isHunter = viewer?.team === 'hunter' && viewer.status === 'active';
  const pending = Object.values(state.claims).find((c) => c.runnerId === viewerId) ?? null;
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
    players: state.playerOrder
      .map((id) => state.players[id])
      .filter((p): p is Player => p !== undefined && p.status !== 'left')
      .map((p) => ({
        id: p.id,
        name: p.name,
        // D-042: durante la cuenta atrás no se revela ningún equipo, tampoco el propio.
        team: state.phase === 'COUNTDOWN' ? null : p.team,
        teamPref: p.teamPref,
        status: p.status,
        ready: p.ready,
        connected: p.connected,
      })),
    config: state.config,
    captures: state.captures,
    outcome: state.outcome,
    // La última pista solo la recibe un cazador activo (para reanudar tras reconectar).
    lastPing: isHunter ? state.lastPing : null,
    pendingClaimForMe: pending
      ? { claimId: pending.id, hunterId: pending.hunterId, expiresAt: pending.expiresAt }
      : null,
    closeReason: state.closeReason,
  };
}
