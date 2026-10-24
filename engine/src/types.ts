export type Phase = 'LOBBY' | 'COUNTDOWN' | 'HEAD_START' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';
export type Team = 'hunter' | 'runner';
export type TeamPref = Team | 'random';
// lobby: en la sala de espera · invited: invitado a la revancha sin aceptar todavía
// active/captured/left: estado dentro de una partida (left también para quien sale de la sala)
export type PlayerStatus = 'lobby' | 'invited' | 'active' | 'captured' | 'left';
export type Availability = 'CURRENT' | 'STALE' | 'UNAVAILABLE';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ZoneVersion {
  // Desfase respecto al inicio de ACTIVE. En el MVP solo hay una versión con 0.
  fromOffsetMs: number;
  center: LatLng;
  radiusM: number;
}

export interface GameConfig {
  durationMs: number; // duración de la fase ACTIVE
  headStartMs: number;
  pingIntervalMs: number;
  zone: ZoneVersion[];
  meetingPoint: LatLng;
  safetyChecklistConfirmed: boolean;
}

// Muestra tal como la envía el cliente. measuredAt ya está en la base de tiempo del
// servidor (el cliente aplica el desfase obtenido al sincronizar el reloj).
export interface LocationSample {
  lat: number;
  lng: number;
  accuracyM: number;
  measuredAt: number;
  isMock?: boolean;
}

export interface StoredSample extends LocationSample {
  receivedAt: number;
  clockSuspect: boolean;
  // Momento que se usa para calcular la antigüedad.
  effectiveAt: number;
}

export interface Player {
  id: string;
  deviceId: string;
  name: string;
  joinedAt: number;
  teamPref: TeamPref;
  team: Team | null;
  ready: boolean;
  status: PlayerStatus;
  connected: boolean;
  disconnectedSince: number | null;
  samples: StoredSample[]; // de más antigua a más reciente
  outsideSince: number | null;
  exposed: boolean;
  rejectedTagCount: number;
  speedStreak: number;
  flags: string[];
  playedGameNo: number | null; // última partida en la que jugó (para la revancha)
  leftRoom: boolean; // salió de la sala (no solo de una partida en curso)
}

export interface TagClaim {
  id: string;
  hunterId: string;
  runnerId: string;
  createdAt: number;
  expiresAt: number;
}

export type WinCause =
  | 'time_up'
  | 'all_captured'
  | 'runners_abandoned'
  | 'hunters_abandoned'
  | 'ended_by_host';

export interface Outcome {
  winner: Team | null;
  cause: WinCause;
}

export interface Capture {
  runnerId: string;
  hunterId: string | null;
  atOffsetMs: number; // desde el inicio de ACTIVE; sin coordenadas
  via: 'self' | 'claim';
}

export interface PingEntry {
  runnerId: string;
  position: LatLng | null;
  accuracyM: number | null;
  ageMs: number | null;
  availability: Availability;
}

export interface PingSnapshot {
  pingNo: number;
  at: number;
  entries: PingEntry[];
}

export interface RoomState {
  roomId: string;
  gameNo: number;
  phase: Phase;
  hostId: string;
  createdAt: number;
  lastActivityAt: number;
  seed: number;
  config: GameConfig | null;
  players: Record<string, Player>;
  playerOrder: string[];
  blockedDevices: string[];
  countdownEnd: number | null;
  headStartEnd: number | null;
  activeStart: number | null;
  gameEnd: number | null;
  nextPingAt: number | null;
  pingCount: number;
  lastPing: PingSnapshot | null;
  claims: Record<string, TagClaim>;
  claimCounter: number;
  captures: Capture[];
  outcome: Outcome | null;
  finishedAt: number | null;
  closeReason: string | null;
}

export type Audience =
  | { kind: 'all' }
  | { kind: 'team'; team: Team }
  | { kind: 'players'; ids: string[] };

export interface EngineEvent {
  type: string;
  at: number;
  audience: Audience;
  data: Record<string, unknown>;
  // Marca los eventos con coordenadas: se purgan al terminar la partida.
  containsLocation?: boolean;
}

export type Command =
  | { type: 'join'; name: string; deviceId: string }
  | { type: 'connection'; connected: boolean }
  | { type: 'set_team_pref'; pref: TeamPref }
  | { type: 'assign_team'; targetId: string; pref: TeamPref }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'configure'; config: GameConfig }
  | { type: 'kick'; targetId: string }
  | { type: 'start' }
  | { type: 'abort' }
  | { type: 'cancel' }
  | { type: 'end_game' }
  | { type: 'location'; sample: LocationSample }
  | { type: 'claim_tag'; runnerId: string }
  | { type: 'respond_tag'; claimId: string; accept: boolean }
  | { type: 'self_tag'; hunterId?: string }
  | { type: 'leave' }
  | { type: 'rematch'; swapRoles: boolean }
  | { type: 'join_rematch' };

export type ErrorCode =
  | 'forbidden'
  | 'wrong_phase'
  | 'unknown_player'
  | 'not_found'
  | 'room_full'
  | 'room_closed'
  | 'game_in_progress'
  | 'already_joined'
  | 'invalid_name'
  | 'invalid_config'
  | 'config_missing'
  | 'safety_not_confirmed'
  | 'not_enough_players'
  | 'players_not_ready'
  | 'teams_unbalanced'
  | 'not_sharing'
  | 'invalid_sample'
  | 'not_a_hunter'
  | 'not_a_runner'
  | 'target_not_active'
  | 'already_pending'
  | 'already_captured'
  | 'your_location_stale'
  | 'target_location_stale'
  | 'accuracy_too_low'
  | 'not_close_enough'
  | 'claim_not_found'
  | 'rematch_window_closed';

export type CommandResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: ErrorCode; detail?: string };

export interface Step {
  state: RoomState;
  events: EngineEvent[];
  result: CommandResult;
}
