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
  // Desfase respecto al inicio de ACTIVE. La configuración solo admite una versión con 0; el plan de la
  // zona dinámica (RoomState.zonePlan) tiene varias.
  fromOffsetMs: number;
  center: LatLng;
  radiusM: number;
}

export interface GameConfig {
  // Modo de juego (D-057). Sin modo: Clásico (las salas y clientes anteriores no lo envían).
  mode?: 'classic' | 'infection' | 'fox_hunt';
  durationMs: number; // duración de la fase ACTIVE
  headStartMs: number;
  pingIntervalMs: number;
  zone: ZoneVersion[];
  // Zona dinámica (1/11/2026): cada 5 min encoge y se desplaza (engine/src/zone.ts). Sin el campo, zona
  // fija, como en las salas y clientes anteriores.
  dynamicZone?: boolean;
  meetingPoint: LatLng;
  safetyChecklistConfirmed: boolean;
}

// Configuración que envía el anfitrión: la ventaja es opcional y, si falta, se usa el valor por
// defecto aprobado (D-042).
export type ConfigInput = Omit<GameConfig, 'headStartMs'> & { headStartMs?: number };

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
  // Salto sin confirmar respecto a las lecturas anteriores (velocidad imposible más allá de la
  // precisión). No sirve para validar una captura hasta que otra lectura lo confirme (Plan §4.1, §10).
  jump?: boolean;
}

export interface Player {
  id: string;
  deviceId: string;
  name: string;
  joinedAt: number;
  teamPref: TeamPref;
  // Quién fijó teamPref: el propio jugador, el anfitrión (asignación manual) o nadie (valor por
  // defecto o arrastre de la revancha). Solo quien la fijó puede verla.
  teamPrefSetBy: string | null;
  team: Team | null;
  ready: boolean;
  // Configuración que aceptó al marcarse listo (D-062). null o ausente si no está listo; un estado guardado
  // antes no la tiene (se toma la configuración vigente).
  readyRef?: ReadyRef | null;
  status: PlayerStatus;
  connected: boolean;
  disconnectedSince: number | null;
  // Presencia (D-057): última señal de la aplicación (mensaje por WebSocket o lectura por HTTP), con la
  // hora del servidor. A diferencia de `connected` (socket abierto), detecta también una página congelada.
  lastSeenAt: number | null;
  // Sin señal desde hace PRESENCE.awayAfterMs durante la partida: los demás lo ven «sin conexión».
  away: boolean;
  // Por qué salió de la partida: por su cuenta o por pasar PRESENCE.absenceTimeoutMs sin señal.
  // after_end: salió de la sala tras el final (no abandonó la partida).
  leftReason: 'left' | 'timeout' | 'after_end' | null;
  // Infección: cuándo se convirtió en cazador, desde cuándo puede reclamar capturas y cuántas pistas se
  // habían emitido ya (no recibe la última anterior a su conversión). null si no se ha convertido.
  convertedAt?: number | null;
  canTagFrom?: number | null;
  pingsBeforeConversion?: number | null;
  samples: StoredSample[]; // de más antigua a más reciente
  outsideSince: number | null;
  exposed: boolean;
  // Cazador fuera de la zona de salida durante la ventaja (solo para avisar una vez, D-042).
  outsideStartZone: boolean;
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
  // Infección: la captura convirtió al fugitivo en cazador.
  converted?: boolean;
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
  // Versión de las reglas de la partida en curso o de la última (se fija al empezar).
  rulesVersion: string | null;
  // Zona dinámica: plan de la partida (se calcula al empezar) y fases ya empezadas. Opcionales: un estado
  // guardado antes del 1/11/2026 no los tiene (zona fija).
  zonePlan?: ZoneVersion[] | null;
  zonePhase?: number;
  // Política de «listo» (D-058, D-062): revisión de las reglas (modo, tiempos, pistas, radio, versiones de
  // zona). Sube con cada cambio de reglas; el «listo» de cada jugador recuerda la revisión que aceptó.
  // Opcional: un estado guardado antes no la tiene (equivale a 0).
  configRev?: number;
}

// Lo que aceptó un jugador al pulsar «Estoy listo» (D-062): la revisión de las reglas y dónde estaban la
// zona y el punto de encuentro. Los recentrados se miden contra esto, no contra el anterior.
export interface ReadyRef {
  rev: number;
  centers: LatLng[];
  meetingPoint: LatLng;
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
  | { type: 'seen' }
  | { type: 'set_team_pref'; pref: TeamPref }
  | { type: 'assign_team'; targetId: string; pref: TeamPref }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'configure'; config: ConfigInput }
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
  | 'invalid_command'
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
  | 'your_location_unstable'
  | 'target_location_unstable'
  | 'hunter_outside_zone'
  | 'not_close_enough'
  | 'tag_cooldown'
  | 'claim_not_found'
  | 'rematch_window_closed'
  // La sala caducaría (6 h de vida) antes de que termine la partida y su periodo de revancha (V-06).
  | 'room_expiring';

export type CommandResult =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: ErrorCode; detail?: string };

export interface Step {
  state: RoomState;
  events: EngineEvent[];
  result: CommandResult;
}
