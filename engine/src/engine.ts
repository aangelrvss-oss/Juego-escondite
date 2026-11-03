// Motor de reglas del modo Clásico. Puro y determinista: sin E/S, sin reloj propio.
// El servidor (adaptador) le pasa la hora autoritativa `now` en cada llamada.
// Referencia: docs/technical/GAME_STATE_MACHINE.md.

import { DEFAULTS, LIMITS, LOCATION, PRESENCE, START_ZONE, TAG, TIMING } from './constants.ts';
import { validateConfig, validateName } from './config.ts';
import { distanceM, isOutsideZone } from './geo.ts';
import { availabilityOf, isValidSample, latestSample, recordSample, toStoredSample } from './location.ts';
import { modeOf } from './modes.ts';
import { resolveTeams } from './teams.ts';
import { invalidCommandField } from './validate.ts';
import { buildZonePlan, currentZone, zonePhaseStarts } from './zone.ts';
import type {
  Audience,
  Command,
  CommandResult,
  EngineEvent,
  ErrorCode,
  GameConfig,
  Outcome,
  PingEntry,
  Player,
  RoomState,
  Step,
  TeamPref,
} from './types.ts';

interface Ctx {
  s: RoomState;
  now: number;
  events: EngineEvent[];
}

const ALL: Audience = { kind: 'all' };
const toPlayers = (...ids: string[]): Audience => ({ kind: 'players', ids });
const ok = (data?: Record<string, unknown>): CommandResult => (data ? { ok: true, data } : { ok: true });
const err = (error: ErrorCode, detail?: string): CommandResult =>
  detail === undefined ? { ok: false, error } : { ok: false, error, detail };

function emit(ctx: Ctx, type: string, audience: Audience, data: Record<string, unknown>, containsLocation = false): void {
  ctx.events.push({ type, at: ctx.now, audience, data, ...(containsLocation ? { containsLocation: true } : {}) });
}

function playersInOrder(s: RoomState): Player[] {
  return s.playerOrder.map((id) => s.players[id]).filter((p): p is Player => p !== undefined);
}

const lobbyPlayers = (s: RoomState): Player[] => playersInOrder(s).filter((p) => p.status === 'lobby');
const activeOf = (s: RoomState, team: 'hunter' | 'runner'): Player[] =>
  playersInOrder(s).filter((p) => p.team === team && p.status === 'active');
const isTeamPref = (v: unknown): v is TeamPref => v === 'hunter' || v === 'runner' || v === 'random';

function newPlayer(id: string, deviceId: string, name: string, now: number): Player {
  return {
    id,
    deviceId,
    name,
    joinedAt: now,
    teamPref: 'random',
    teamPrefSetBy: null,
    team: null,
    ready: false,
    status: 'lobby',
    connected: true,
    disconnectedSince: null,
    lastSeenAt: now,
    away: false,
    leftReason: null,
    samples: [],
    outsideSince: null,
    exposed: false,
    outsideStartZone: false,
    rejectedTagCount: 0,
    speedStreak: 0,
    flags: [],
    playedGameNo: null,
    leftRoom: false,
  };
}

function clearLocationState(p: Player): void {
  p.samples = [];
  p.outsideSince = null;
  p.exposed = false;
  p.outsideStartZone = false;
  p.speedStreak = 0;
}

export interface CreateRoomInput {
  roomId: string;
  hostId: string;
  hostName: string;
  hostDeviceId: string;
  now: number;
  seed: number;
}

export function createRoom(input: CreateRoomInput): Step {
  const name = validateName(input.hostName);
  const s: RoomState = {
    roomId: input.roomId,
    gameNo: 1,
    phase: 'LOBBY',
    hostId: input.hostId,
    createdAt: input.now,
    lastActivityAt: input.now,
    seed: input.seed,
    config: null,
    players: {},
    playerOrder: [],
    blockedDevices: [],
    countdownEnd: null,
    headStartEnd: null,
    activeStart: null,
    gameEnd: null,
    nextPingAt: null,
    pingCount: 0,
    lastPing: null,
    claims: {},
    claimCounter: 0,
    captures: [],
    outcome: null,
    finishedAt: null,
    closeReason: null,
    rulesVersion: null,
    zonePlan: null,
    zonePhase: 0,
  };
  if (!name) return { state: s, events: [], result: err('invalid_name') };
  s.players[input.hostId] = newPlayer(input.hostId, input.hostDeviceId, name, input.now);
  s.playerOrder.push(input.hostId);
  return { state: s, events: [], result: ok() };
}

// ---------------------------------------------------------------- plazos

type DueKind =
  | 'countdown_end'
  | 'head_start_end'
  | 'game_end'
  | 'claim_expiry'
  | 'exposure'
  | 'ping'
  | 'zone_phase'
  | 'host_handover'
  | 'away'
  | 'absence_timeout'
  | 'lobby_idle'
  | 'lifetime'
  | 'rematch_window';

interface Due {
  at: number;
  kind: DueKind;
  priority: number; // a igual hora, menor número primero (el final va antes que una pista)
  ref?: string;
}

function handoverCandidate(s: RoomState): Player | null {
  return (
    playersInOrder(s).find(
      (p) => p.id !== s.hostId && p.connected && p.status !== 'left' && p.status !== 'invited',
    ) ?? null
  );
}

function dueList(s: RoomState): Due[] {
  const due: Due[] = [];
  const host = s.players[s.hostId];
  if (
    s.phase !== 'CANCELLED' &&
    host &&
    !host.connected &&
    host.disconnectedSince !== null &&
    handoverCandidate(s)
  ) {
    due.push({ at: host.disconnectedSince + TIMING.hostHandoverMs, kind: 'host_handover', priority: 4 });
  }
  if (s.phase === 'HEAD_START' || s.phase === 'ACTIVE') {
    // D-057: presencia y periodo de gracia, contados desde la última señal de la aplicación.
    for (const p of playersInOrder(s)) {
      if (p.status !== 'active' || p.lastSeenAt == null) continue;
      if (!p.away) due.push({ at: p.lastSeenAt + PRESENCE.awayAfterMs, kind: 'away', priority: 4, ref: p.id });
      due.push({ at: p.lastSeenAt + PRESENCE.absenceTimeoutMs, kind: 'absence_timeout', priority: 4, ref: p.id });
    }
  }
  switch (s.phase) {
    case 'LOBBY':
      due.push({ at: s.lastActivityAt + TIMING.lobbyIdleMs, kind: 'lobby_idle', priority: 5 });
      due.push({ at: s.createdAt + TIMING.roomMaxLifetimeMs, kind: 'lifetime', priority: 5 });
      break;
    case 'COUNTDOWN':
      if (s.countdownEnd !== null) due.push({ at: s.countdownEnd, kind: 'countdown_end', priority: 0 });
      break;
    case 'HEAD_START':
      if (s.headStartEnd !== null) due.push({ at: s.headStartEnd, kind: 'head_start_end', priority: 0 });
      break;
    case 'ACTIVE': {
      if (s.gameEnd !== null) due.push({ at: s.gameEnd, kind: 'game_end', priority: 0 });
      for (const c of Object.values(s.claims)) {
        due.push({ at: c.expiresAt, kind: 'claim_expiry', priority: 1, ref: c.id });
      }
      for (const r of activeOf(s, 'runner')) {
        if (r.outsideSince !== null && !r.exposed && s.activeStart !== null) {
          const at = Math.max(r.outsideSince, s.activeStart) + TIMING.outOfZoneGraceMs;
          due.push({ at, kind: 'exposure', priority: 2, ref: r.id });
        }
      }
      if (s.nextPingAt !== null) due.push({ at: s.nextPingAt, kind: 'ping', priority: 3 });
      // Zona dinámica: el siguiente cambio de fase, a su hora exacta (aunque se procese con retraso).
      if (s.zonePlan && s.activeStart !== null) {
        const startOffset = zonePhaseStarts(s.zonePlan)[s.zonePhase ?? 0];
        if (startOffset !== undefined) due.push({ at: s.activeStart + startOffset, kind: 'zone_phase', priority: 2 });
      }
      break;
    }
    case 'FINISHED':
      if (s.finishedAt !== null) {
        due.push({ at: s.finishedAt + TIMING.rematchWindowMs, kind: 'rematch_window', priority: 5 });
      }
      due.push({ at: s.createdAt + TIMING.roomMaxLifetimeMs, kind: 'lifetime', priority: 5 });
      break;
    case 'CANCELLED':
      break;
  }
  return due;
}

function earliest(due: Due[]): Due | null {
  let best: Due | null = null;
  for (const d of due) {
    if (
      !best ||
      d.at < best.at ||
      (d.at === best.at && (d.priority < best.priority || (d.priority === best.priority && (d.ref ?? '') < (best.ref ?? ''))))
    ) {
      best = d;
    }
  }
  return best;
}

export function nextDeadline(state: RoomState): number | null {
  return earliest(dueList(state))?.at ?? null;
}

function runDue(ctx: Ctx, until: number): void {
  for (let guard = 0; ; guard++) {
    if (guard > 100_000) throw new Error('runDue: deadline not consumed');
    const d = earliest(dueList(ctx.s));
    if (!d || d.at > until) break;
    ctx.now = d.at;
    processDue(ctx, d);
  }
  ctx.now = until;
}

function processDue(ctx: Ctx, d: Due): void {
  const s = ctx.s;
  switch (d.kind) {
    case 'countdown_end':
      s.phase = 'HEAD_START';
      s.headStartEnd = ctx.now + (s.config?.headStartMs ?? DEFAULTS.headStartMs);
      // D-042: cada jugador descubre su rol, individualmente, al terminar la cuenta atrás.
      for (const p of playersInOrder(s)) {
        if (p.status === 'active' && p.team) emit(ctx, 'role_revealed', toPlayers(p.id), { team: p.team });
      }
      emit(ctx, 'head_start_started', ALL, { headStartEnd: s.headStartEnd });
      return;
    case 'head_start_end': {
      const config = s.config;
      if (!config) throw new Error('missing config in HEAD_START');
      s.phase = 'ACTIVE';
      s.activeStart = ctx.now;
      for (const p of playersInOrder(s)) p.outsideStartZone = false;
      s.gameEnd = ctx.now + config.durationMs;
      const firstPing = ctx.now + config.pingIntervalMs;
      s.nextPingAt = firstPing < s.gameEnd ? firstPing : null;
      emit(ctx, 'hunt_started', ALL, { gameEnd: s.gameEnd, nextPingAt: s.nextPingAt });
      return;
    }
    case 'game_end':
      finish(ctx, { winner: activeOf(s, 'runner').length > 0 ? 'runner' : 'hunter', cause: 'time_up' });
      return;
    case 'claim_expiry': {
      const claim = d.ref ? s.claims[d.ref] : undefined;
      if (!claim) return;
      delete s.claims[claim.id];
      emit(ctx, 'tag_claim_resolved', toPlayers(claim.hunterId, claim.runnerId), {
        claimId: claim.id,
        result: 'expired',
      });
      return;
    }
    case 'exposure': {
      const runner = d.ref ? s.players[d.ref] : undefined;
      if (!runner) return;
      runner.exposed = true;
      emit(ctx, 'runner_exposed', toPlayers(...activeOf(s, 'hunter').map((h) => h.id), runner.id), {
        runnerId: runner.id,
      });
      return;
    }
    case 'ping':
      doPing(ctx);
      return;
    case 'zone_phase': {
      // Empieza una fase: la zona va encogiendo y desplazándose hasta su destino, que se revela ahora (la
      // instantánea que recibe cada móvil tras el evento lo incluye). Sin coordenadas en el evento.
      const plan = s.zonePlan;
      if (!plan || s.activeStart === null) return;
      s.zonePhase = (s.zonePhase ?? 0) + 1;
      const target = plan[s.zonePhase + 1];
      if (!target) return;
      emit(ctx, 'zone_phase', ALL, {
        phase: s.zonePhase,
        radiusM: target.radiusM,
        endsAt: s.activeStart + target.fromOffsetMs,
        last: s.zonePhase >= zonePhaseStarts(plan).length,
      });
      // Quien se haya quedado fuera sin enviar ninguna lectura nueva (p. ej., quieto con el móvil
      // bloqueado) se evalúa con la última que hay, como al recibirla (GAME_STATE_MACHINE §9.4).
      for (const r of activeOf(s, 'runner')) evaluateZone(ctx, r);
      return;
    }
    case 'host_handover': {
      const candidate = handoverCandidate(s);
      if (candidate) setHost(ctx, candidate.id);
      return;
    }
    case 'away': {
      const p = d.ref ? s.players[d.ref] : undefined;
      if (!p) return;
      p.away = true;
      // Sin coordenadas ni equipo: solo que no da señales (lo ven todos, también los rivales).
      emit(ctx, 'player_presence', ALL, { playerId: p.id, away: true });
      return;
    }
    case 'absence_timeout': {
      // V-25: todos los que vencen en el mismo instante quedan fuera juntos y el final se comprueba una
      // sola vez. Así la causa no depende del orden de los identificadores (si se quedan sin fugitivos y
      // sin cazadores a la vez: runners_abandoned, sin ganador, como dice checkEnd).
      const out = playersInOrder(s).filter(
        (p) => p.status === 'active' && p.lastSeenAt != null && p.lastSeenAt + PRESENCE.absenceTimeoutMs === d.at,
      );
      if (out.length === 0) return;
      for (const p of out) removePlayer(ctx, p, 'timeout');
      if (out.some((p) => p.id === s.hostId)) transferHostNow(ctx);
      checkEnd(ctx, 'leave');
      return;
    }
    case 'lobby_idle':
    case 'lifetime':
      close(ctx, 'expired');
      return;
    case 'rematch_window':
      close(ctx, 'closed');
      return;
  }
}

function doPing(ctx: Ctx): void {
  const s = ctx.s;
  const config = s.config;
  if (!config || s.nextPingAt === null || s.gameEnd === null) return;
  s.pingCount++;
  const entries: PingEntry[] = activeOf(s, 'runner').map((r) => {
    const last = latestSample(r);
    return {
      runnerId: r.id,
      position: last ? { lat: last.lat, lng: last.lng } : null,
      accuracyM: last?.accuracyM ?? null,
      ageMs: last ? ctx.now - last.effectiveAt : null,
      availability: availabilityOf(last, ctx.now),
    };
  });
  s.lastPing = { pingNo: s.pingCount, at: ctx.now, entries };
  // A los cazadores activos en este instante: quien se convierta después en el mismo paso (Infección) no
  // la recibe (D-057: el convertido no recibe la pista anterior a su conversión).
  emit(ctx, 'ping', toPlayers(...activeOf(s, 'hunter').map((h) => h.id)), { ping: s.lastPing }, true);
  emit(ctx, 'ping_sent', { kind: 'team', team: 'runner' }, { pingNo: s.pingCount });
  const next = s.nextPingAt + config.pingIntervalMs;
  s.nextPingAt = next < s.gameEnd ? next : null;
}

// ---------------------------------------------------------------- transiciones auxiliares

/** Señal de vida de la aplicación (D-057): reinicia el periodo de gracia y, si hacía falta, avisa de que ha vuelto. */
function markSeen(ctx: Ctx, p: Player): void {
  p.lastSeenAt = ctx.now;
  if (p.away) {
    p.away = false;
    emit(ctx, 'player_presence', ALL, { playerId: p.id, away: false });
  }
}

function finish(ctx: Ctx, outcome: Outcome): void {
  const s = ctx.s;
  s.phase = 'FINISHED';
  s.finishedAt = ctx.now;
  s.outcome = outcome;
  s.claims = {};
  s.lastPing = null;
  s.nextPingAt = null;
  const flags: Record<string, string[]> = {};
  for (const p of playersInOrder(s)) {
    clearLocationState(p);
    p.away = false;
    if (p.playedGameNo === s.gameNo && p.flags.length > 0) flags[p.id] = [...p.flags];
  }
  emit(ctx, 'game_finished', ALL, {
    outcome,
    rulesVersion: s.rulesVersion,
    captures: s.captures,
    activeDurationMs: s.activeStart !== null ? ctx.now - s.activeStart : 0,
    flags,
  });
}

function close(ctx: Ctx, reason: string): void {
  const s = ctx.s;
  s.phase = 'CANCELLED';
  s.closeReason = reason;
  s.claims = {};
  s.lastPing = null;
  for (const p of playersInOrder(s)) clearLocationState(p);
  emit(ctx, 'room_closed', ALL, { reason });
}

function setHost(ctx: Ctx, id: string): void {
  ctx.s.hostId = id;
  emit(ctx, 'host_changed', ALL, { hostId: id });
}

// Traspaso inmediato (el anfitrión se va). Prefiere a alguien conectado.
function transferHostNow(ctx: Ctx): boolean {
  const s = ctx.s;
  const eligible = playersInOrder(s).filter(
    (p) => p.id !== s.hostId && p.status !== 'left' && p.status !== 'invited',
  );
  const next = eligible.find((p) => p.connected) ?? eligible[0];
  if (!next) return false;
  setHost(ctx, next.id);
  return true;
}

function backToLobby(ctx: Ctx, reason: string): void {
  const s = ctx.s;
  s.phase = 'LOBBY';
  s.countdownEnd = null;
  s.zonePlan = null;
  s.zonePhase = 0;
  for (const p of playersInOrder(s)) {
    if (p.status === 'active') {
      p.status = 'lobby';
      p.team = null;
      p.ready = false;
      p.playedGameNo = null;
    } else if (p.status === 'left' && !p.leftRoom && p.playedGameNo === s.gameNo) {
      // V-04: quien salió durante esta cuenta atrás no jugó ninguna partida. Sin partida, salir es salir
      // de la sala (como en LOBBY): no figura en el informe de la partida siguiente (mismo gameNo) ni se
      // le invita a la revancha. Puede volver a entrar con el código como cualquiera.
      p.team = null;
      p.playedGameNo = null;
      p.leftRoom = true;
    }
  }
  emit(ctx, 'countdown_aborted', ALL, { reason });
}

function checkEnd(ctx: Ctx, cause: 'capture' | 'leave'): void {
  const s = ctx.s;
  if (s.phase !== 'HEAD_START' && s.phase !== 'ACTIVE') return;
  if (activeOf(s, 'runner').length === 0) {
    finish(
      ctx,
      cause === 'capture'
        ? { winner: 'hunter', cause: 'all_captured' }
        : { winner: null, cause: 'runners_abandoned' },
    );
  } else if (activeOf(s, 'hunter').length === 0) {
    finish(ctx, { winner: null, cause: 'hunters_abandoned' });
  }
}

/**
 * GAME_STATE_MACHINE §5.3: quien es capturado (o abandona) deja de compartir su ubicación al instante.
 * Su entrada sale también de la última pista, que se reenvía en la instantánea al cazador que reconecta.
 */
function forgetInLastPing(s: RoomState, playerId: string): void {
  if (s.lastPing?.entries.some((e) => e.runnerId === playerId)) {
    s.lastPing = { ...s.lastPing, entries: s.lastPing.entries.filter((e) => e.runnerId !== playerId) };
  }
}

function capture(ctx: Ctx, runner: Player, hunterId: string | null, via: 'self' | 'claim'): void {
  const s = ctx.s;
  if (modeOf(s.config).onCapture === 'convert') {
    convert(ctx, runner, hunterId, via);
    return;
  }
  runner.status = 'captured';
  clearLocationState(runner);
  forgetInLastPing(s, runner.id);
  const entry = { runnerId: runner.id, hunterId, atOffsetMs: ctx.now - (s.activeStart ?? ctx.now), via };
  s.captures.push(entry);
  emit(ctx, 'runner_captured', ALL, { ...entry });
  checkEnd(ctx, 'capture');
}

/**
 * Infección (GAME_MODES_AND_RULES §3, D-057): la captura confirmada convierte al fugitivo en cazador en
 * el mismo paso. Sigue jugando (activo), con el equipo nuevo: deja de ver a los fugitivos y de ser visto
 * por ellos, ve a los cazadores, no recibe la última pista ya emitida (solo las siguientes) y no puede
 * reclamar capturas hasta `canTagFrom`. Sus lecturas de fugitivo se borran.
 */
function convert(ctx: Ctx, runner: Player, hunterId: string | null, via: 'self' | 'claim'): void {
  const s = ctx.s;
  // V-28: si estaba expuesto, los cazadores dejan de verlo como expuesto. Con `reason`, para que el cliente no
  // lo anuncie como «ha vuelto a la zona» (R-2): lo que ha pasado es la conversión.
  if (runner.exposed) {
    emit(ctx, 'runner_unexposed', toPlayers(...activeOf(s, 'hunter').map((h) => h.id), runner.id), {
      runnerId: runner.id,
      reason: 'converted',
    });
  }
  runner.team = 'hunter';
  clearLocationState(runner);
  forgetInLastPing(s, runner.id);
  runner.convertedAt = ctx.now;
  runner.canTagFrom = ctx.now + modeOf(s.config).convertTagDelayMs;
  runner.pingsBeforeConversion = s.pingCount;
  const entry = { runnerId: runner.id, hunterId, atOffsetMs: ctx.now - (s.activeStart ?? ctx.now), via, converted: true };
  s.captures.push(entry);
  emit(ctx, 'runner_captured', ALL, { ...entry });
  emit(ctx, 'role_changed', toPlayers(runner.id), { team: 'hunter', canTagFrom: runner.canTagFrom });
  checkEnd(ctx, 'capture');
}

/**
 * D-042: durante la ventaja, avisa (solo avisa, nunca sanciona) al cazador que se aleja de la zona
 * de salida. Para no castigar errores del GPS solo cuenta una lectura fiable (reciente, sin reloj
 * sospechoso y con precisión suficiente) que quede fuera incluso en el mejor caso
 * (distancia − precisión > radio). Vuelve a estar dentro con la mejor estimación (distancia ≤ radio).
 * Los avisos no llevan coordenadas.
 */
function evaluateStartZone(ctx: Ctx, hunter: Player): void {
  const meeting = ctx.s.config?.meetingPoint;
  const last = latestSample(hunter);
  if (!meeting || !last) return;
  if (last.clockSuspect || ctx.now - last.effectiveAt > LOCATION.currentMaxAgeMs) return;
  if (last.accuracyM > LOCATION.currentMaxAccuracyM) return;
  const d = distanceM(last, meeting);
  if (!hunter.outsideStartZone && d - last.accuracyM > START_ZONE.radiusM) {
    hunter.outsideStartZone = true;
    emit(ctx, 'start_zone_warning', toPlayers(hunter.id), { radiusM: START_ZONE.radiusM, headStartEnd: ctx.s.headStartEnd });
  } else if (hunter.outsideStartZone && d <= START_ZONE.radiusM) {
    hunter.outsideStartZone = false;
    emit(ctx, 'start_zone_returned', toPlayers(hunter.id), {});
  }
}

function evaluateZone(ctx: Ctx, runner: Player): void {
  const s = ctx.s;
  const last = latestSample(runner);
  if (!s.config || !last) return;
  const zone = currentZone(s, ctx.now);
  if (!zone) return;
  const outside = isOutsideZone(last, last.accuracyM, zone);
  if (outside && runner.outsideSince === null) {
    runner.outsideSince = ctx.now;
    const graceFrom = Math.max(ctx.now, s.activeStart ?? s.headStartEnd ?? ctx.now);
    emit(ctx, 'zone_exit_warning', toPlayers(runner.id), {
      exposedAt: graceFrom + TIMING.outOfZoneGraceMs,
    });
  } else if (!outside && runner.outsideSince !== null) {
    runner.outsideSince = null;
    emit(ctx, 'zone_reentered', toPlayers(runner.id), {});
    if (runner.exposed) {
      runner.exposed = false;
      emit(ctx, 'runner_unexposed', toPlayers(...activeOf(s, 'hunter').map((h) => h.id), runner.id), {
        runnerId: runner.id,
      });
    }
  }
}

function pendingClaimFor(s: RoomState, playerId: string) {
  return Object.values(s.claims).find((c) => c.runnerId === playerId || c.hunterId === playerId) ?? null;
}

// ---------------------------------------------------------------- comandos

export function tick(state: RoomState, now: number): Step {
  const ctx: Ctx = { s: structuredClone(state), now, events: [] };
  runDue(ctx, now);
  return { state: ctx.s, events: ctx.events, result: ok() };
}

export function applyCommand(state: RoomState, actorId: string, cmd: Command, now: number): Step {
  const ctx: Ctx = { s: structuredClone(state), now, events: [] };
  // El tiempo avanza primero: ningún comando se evalúa con plazos vencidos sin procesar.
  runDue(ctx, now);
  const before = ctx.events.length;
  const snapshot = structuredClone(ctx.s);
  // La forma del comando se valida antes de tocar nada: un comando mal formado nunca llega a handle.
  const invalid = invalidCommandField(cmd);
  const result = invalid === null ? handle(ctx, actorId, cmd) : err('invalid_command', invalid);
  if (result.ok) {
    // Una señal de vida o una (re)conexión no es actividad de la sala: no impide que caduque una sala de
    // espera olvidada (V-22: una pestaña que reconecta la mantenía viva hasta las 6 h).
    if (cmd.type !== 'seen' && cmd.type !== 'connection') ctx.s.lastActivityAt = now;
  } else {
    // Un comando rechazado no deja rastro en el estado ni emite eventos.
    ctx.s = snapshot;
    ctx.events.length = before;
  }
  return { state: ctx.s, events: ctx.events, result };
}

function handle(ctx: Ctx, actorId: string, cmd: Command): CommandResult {
  const s = ctx.s;
  if (cmd.type === 'join') return join(ctx, actorId, cmd.name, cmd.deviceId);
  if (s.phase === 'CANCELLED') return err('room_closed');
  const p = s.players[actorId];
  if (!p || (p.status === 'left' && p.leftRoom)) return err('unknown_player');
  const isHost = actorId === s.hostId;
  const now = ctx.now;

  switch (cmd.type) {
    case 'connection':
      if (cmd.connected) markSeen(ctx, p);
      // Una reanudación sobre una conexión que ya estaba abierta (doble socket, otra pestaña) no es un
      // cambio: no se avisa otra vez a todos.
      if (p.connected === cmd.connected) return ok();
      p.connected = cmd.connected;
      p.disconnectedSince = cmd.connected ? null : now;
      emit(ctx, 'player_connection', ALL, { playerId: p.id, connected: cmd.connected });
      return ok();

    case 'seen':
      markSeen(ctx, p);
      return ok();

    case 'set_team_pref':
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      if (p.status !== 'lobby') return err('forbidden');
      if (!isTeamPref(cmd.pref)) return err('invalid_config', 'pref');
      p.teamPref = cmd.pref;
      p.teamPrefSetBy = p.id;
      // La preferencia es privada: solo la recibe quien la ha fijado.
      emit(ctx, 'player_updated', toPlayers(p.id), { playerId: p.id, teamPref: p.teamPref });
      return ok();

    case 'assign_team': {
      if (!isHost) return err('forbidden');
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      const target = s.players[cmd.targetId];
      if (!target || target.status !== 'lobby') return err('unknown_player');
      if (!isTeamPref(cmd.pref)) return err('invalid_config', 'pref');
      target.teamPref = cmd.pref;
      target.teamPrefSetBy = actorId;
      // Asignación manual: solo el anfitrión que la hace la conoce; el asignado la descubre al
      // terminar la cuenta atrás (role_revealed).
      emit(ctx, 'player_updated', toPlayers(actorId), { playerId: target.id, teamPref: target.teamPref });
      return ok();
    }

    case 'set_ready':
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      if (p.status !== 'lobby') return err('forbidden');
      p.ready = cmd.ready;
      emit(ctx, 'player_updated', ALL, { playerId: p.id, ready: p.ready });
      return ok();

    case 'configure': {
      if (!isHost) return err('forbidden');
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      const config: GameConfig = { ...cmd.config, headStartMs: cmd.config.headStartMs ?? DEFAULTS.headStartMs };
      const invalid = validateConfig(config);
      if (invalid) return err('invalid_config', invalid);
      s.config = structuredClone(config);
      for (const lp of lobbyPlayers(s)) lp.ready = false;
      emit(ctx, 'config_updated', ALL, { config: s.config });
      return ok();
    }

    case 'kick': {
      if (!isHost) return err('forbidden');
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      const target = s.players[cmd.targetId];
      if (!target || target.id === s.hostId || (target.status !== 'lobby' && target.status !== 'invited')) {
        return err('unknown_player');
      }
      target.status = 'left';
      target.leftRoom = true;
      s.blockedDevices.push(target.deviceId);
      emit(ctx, 'player_kicked', ALL, { playerId: target.id });
      return ok();
    }

    case 'start':
      return start(ctx, isHost);

    case 'abort':
      if (!isHost) return err('forbidden');
      if (s.phase !== 'COUNTDOWN') return err('wrong_phase');
      backToLobby(ctx, 'aborted_by_host');
      return ok();

    case 'cancel':
      if (!isHost) return err('forbidden');
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      close(ctx, 'cancelled_by_host');
      return ok();

    case 'end_game':
      if (!isHost) return err('forbidden');
      if (s.phase !== 'HEAD_START' && s.phase !== 'ACTIVE') return err('wrong_phase');
      finish(ctx, { winner: null, cause: 'ended_by_host' });
      return ok();

    case 'location': {
      if (s.phase !== 'HEAD_START' && s.phase !== 'ACTIVE') return err('wrong_phase');
      if (p.status !== 'active') return err('not_sharing');
      if (!isValidSample(cmd.sample)) return err('invalid_sample');
      // Una lectura de ubicación es también una señal de vida de la aplicación (D-057).
      markSeen(ctx, p);
      const stored = toStoredSample(cmd.sample, now);
      const accepted = recordSample(p, stored, now);
      if (accepted && p.team === 'runner') evaluateZone(ctx, p);
      if (accepted && p.team === 'hunter' && s.phase === 'HEAD_START') evaluateStartZone(ctx, p);
      return ok({ accepted, clockSuspect: stored.clockSuspect });
    }

    case 'claim_tag':
      return claimTag(ctx, p, cmd.runnerId);

    case 'respond_tag': {
      const claim = s.claims[cmd.claimId];
      if (!claim || claim.runnerId !== p.id) return err('claim_not_found');
      delete s.claims[claim.id];
      if (cmd.accept) {
        emit(ctx, 'tag_claim_resolved', toPlayers(claim.hunterId, claim.runnerId), {
          claimId: claim.id,
          result: 'confirmed',
        });
        capture(ctx, p, claim.hunterId, 'claim');
      } else {
        p.rejectedTagCount++;
        if (p.rejectedTagCount >= 3 && !p.flags.includes('repeated_tag_rejections')) {
          p.flags.push('repeated_tag_rejections');
        }
        emit(ctx, 'tag_claim_resolved', toPlayers(claim.hunterId, claim.runnerId), {
          claimId: claim.id,
          result: 'rejected',
        });
      }
      return ok();
    }

    case 'self_tag': {
      if (s.phase !== 'ACTIVE') return err('wrong_phase');
      if (p.team !== 'runner') return err('not_a_runner');
      if (p.status === 'captured') return err('already_captured');
      if (p.status !== 'active') return err('not_a_runner');
      const claim = Object.values(s.claims).find((c) => c.runnerId === p.id);
      let hunterId: string | null = null;
      if (claim) {
        hunterId = claim.hunterId;
        delete s.claims[claim.id];
        emit(ctx, 'tag_claim_resolved', toPlayers(claim.hunterId, claim.runnerId), {
          claimId: claim.id,
          result: 'confirmed',
        });
      } else if (cmd.hunterId) {
        const h = s.players[cmd.hunterId];
        // Un convertido en su espera (Infección) no puede capturar: tampoco se le atribuye.
        const waiting = h?.canTagFrom != null && ctx.now < h.canTagFrom;
        if (h && h.team === 'hunter' && h.status === 'active' && !waiting) hunterId = h.id;
      }
      capture(ctx, p, hunterId, 'self');
      return ok();
    }

    case 'leave':
      return leave(ctx, p, isHost);

    case 'rematch':
      return rematch(ctx, isHost, cmd.swapRoles);

    case 'join_rematch': {
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      if (p.status !== 'invited') return err('forbidden');
      if (lobbyPlayers(s).length >= LIMITS.maxPlayers) return err('room_full');
      p.status = 'lobby';
      emit(ctx, 'player_joined', ALL, { playerId: p.id, name: p.name });
      return ok();
    }
  }
}

function join(ctx: Ctx, actorId: string, rawName: string, deviceId: string): CommandResult {
  const s = ctx.s;
  if (s.phase === 'CANCELLED') return err('room_closed');
  if (s.phase !== 'LOBBY') return err('game_in_progress');
  // Un dispositivo expulsado recibe el mismo error que un código inexistente.
  if (s.blockedDevices.includes(deviceId)) return err('not_found');
  if (s.players[actorId]) return err('already_joined');
  const sameDevice = playersInOrder(s).find((p) => p.deviceId === deviceId && !p.leftRoom && p.status !== 'left');
  // V-05: el mismo dispositivo recupera su plaza si nadie la está usando: un invitado a la revancha que
  // abandonó (el móvil olvidó la sesión) o una plaza de la sala de espera cuyo `welcome` se perdió. Solo
  // en LOBBY (nunca un jugador en partida), solo plazas sin conexión abierta (si la hay, es otra pestaña
  // o alguien que juega: already_joined) y después del veto por expulsión (not_found se mantiene).
  const reclaimed =
    sameDevice && (sameDevice.status === 'lobby' || sameDevice.status === 'invited') && !sameDevice.connected
      ? sameDevice
      : null;
  if (sameDevice && !reclaimed) return err('already_joined');
  if (lobbyPlayers(s).filter((p) => p !== reclaimed).length >= LIMITS.maxPlayers) return err('room_full');
  const name = validateName(rawName);
  if (!name) return err('invalid_name');
  const player = newPlayer(actorId, deviceId, name, ctx.now);
  s.players[actorId] = player;
  s.playerOrder.push(actorId);
  if (!reclaimed) {
    emit(ctx, 'player_joined', ALL, { playerId: actorId, name });
    return ok();
  }
  // La plaza antigua sale de la sala (el servidor revoca su sesión y avisa a su conexión, si queda
  // alguna) y la nueva hereda lo que el anfitrión o el propio jugador habían fijado para ella.
  reclaimed.status = 'left';
  reclaimed.leftRoom = true;
  reclaimed.ready = false;
  reclaimed.leftReason = 'left';
  player.teamPref = reclaimed.teamPref;
  for (const p of playersInOrder(s)) {
    if (p.teamPrefSetBy === reclaimed.id) p.teamPrefSetBy = actorId;
  }
  player.teamPrefSetBy = reclaimed.teamPrefSetBy; // ya traducido arriba si la fijó el propio jugador
  emit(ctx, 'player_joined', ALL, { playerId: actorId, name, replaces: reclaimed.id });
  if (s.hostId === reclaimed.id) setHost(ctx, actorId);
  return ok();
}

function start(ctx: Ctx, isHost: boolean): CommandResult {
  const s = ctx.s;
  if (!isHost) return err('forbidden');
  if (s.phase !== 'LOBBY') return err('wrong_phase');
  if (!s.config) return err('config_missing');
  if (!s.config.safetyChecklistConfirmed) return err('safety_not_confirmed');
  // V-06: la partida y su informe tienen que caber en la vida de la sala (6 h): cuenta atrás, huida,
  // persecución y el periodo de revancha, en el que se consulta el informe. Si no, la sala caducaría
  // con la partida recién terminada (CANCELLED/expired, sin informe).
  const needed = TIMING.countdownMs + s.config.headStartMs + s.config.durationMs + TIMING.rematchWindowMs;
  if (ctx.now + needed > s.createdAt + TIMING.roomMaxLifetimeMs) return err('room_expiring');
  const lobby = lobbyPlayers(s);
  const mode = modeOf(s.config);
  if (lobby.length < Math.max(LIMITS.minPlayers, mode.minPlayers)) return err('not_enough_players', mode.id);
  if (lobby.length > LIMITS.maxPlayers) return err('room_full');
  if (lobby.some((p) => !p.ready || !p.connected)) return err('players_not_ready');
  const teams = resolveTeams(lobby, s.seed + s.gameNo, mode);
  // En los modos con un número fijo de cazadores, el detalle dice el modo (la interfaz explica la regla).
  if (!teams) return err('teams_unbalanced', mode.exactHunters ? mode.id : undefined);

  for (const p of playersInOrder(s)) {
    if (p.status === 'invited') {
      p.status = 'left';
      continue;
    }
    if (p.status !== 'lobby') continue;
    p.team = teams.get(p.id) ?? null;
    p.status = 'active';
    p.ready = false;
    p.flags = [];
    p.rejectedTagCount = 0;
    p.playedGameNo = s.gameNo;
    p.lastSeenAt = ctx.now;
    p.away = false;
    p.leftReason = null;
    p.convertedAt = null;
    p.canTagFrom = null;
    p.pingsBeforeConversion = null;
    clearLocationState(p);
  }
  s.phase = 'COUNTDOWN';
  s.countdownEnd = ctx.now + TIMING.countdownMs;
  s.headStartEnd = null;
  s.activeStart = null;
  s.gameEnd = null;
  s.nextPingAt = null;
  s.pingCount = 0;
  s.lastPing = null;
  s.claims = {};
  s.captures = [];
  s.outcome = null;
  s.finishedAt = null;
  s.rulesVersion = mode.rulesVersion;
  // Zona dinámica: el plan se fija al empezar, con una semilla distinta en cada partida de la sala.
  s.zonePlan = s.config.dynamicZone ? buildZonePlan(s.config, (s.seed ^ 0x5a0e) + s.gameNo) : null;
  s.zonePhase = 0;
  // D-042: durante la cuenta atrás nadie conoce su rol; se revela al terminar (role_revealed).
  emit(ctx, 'countdown_started', ALL, { countdownEnd: s.countdownEnd });
  return ok();
}

function claimTag(ctx: Ctx, hunter: Player, runnerId: string): CommandResult {
  const s = ctx.s;
  const now = ctx.now;
  if (s.phase !== 'ACTIVE') return err('wrong_phase');
  if (hunter.team !== 'hunter' || hunter.status !== 'active') return err('not_a_hunter');
  // Infección: el recién convertido espera antes de poder capturar (GAME_MODES_AND_RULES §3.3, D-057).
  if (hunter.canTagFrom != null && now < hunter.canTagFrom) return err('tag_cooldown');
  const runner = s.players[runnerId];
  if (!runner || runner.team !== 'runner') return err('target_not_active');
  if (runner.status === 'captured') return err('already_captured');
  if (runner.status !== 'active') return err('target_not_active');
  if (pendingClaimFor(s, runner.id) || pendingClaimFor(s, hunter.id)) return err('already_pending');

  const hs = latestSample(hunter);
  const rs = latestSample(runner);
  // Nunca se valida una captura con una posición antigua o con reloj sospechoso.
  if (!hs || hs.clockSuspect || now - hs.effectiveAt > TAG.maxAgeMs) return err('your_location_stale');
  if (!rs || rs.clockSuspect || now - rs.effectiveAt > TAG.maxAgeMs) return err('target_location_stale');
  if (hs.accuracyM > TAG.maxAccuracyM || rs.accuracyM > TAG.maxAccuracyM) return err('accuracy_too_low');
  // Plan Maestro §4.1 y §10: un salto aislado del GPS nunca valida una captura. Hay que esperar a la
  // siguiente lectura, que lo confirma o lo descarta.
  if (hs.jump) return err('your_location_unstable');
  if (rs.jump) return err('target_location_unstable');
  // D-033: un cazador fuera de la zona no puede reclamar capturas mientras siga fuera. Mismo criterio
  // que para los fugitivos (fuera solo si lo está incluso descontando la precisión). No se le expone.
  const zone = currentZone(s, now);
  if (zone && isOutsideZone(hs, hs.accuracyM, zone)) {
    return err('hunter_outside_zone');
  }
  const threshold = Math.min(TAG.baseRadiusM + hs.accuracyM + rs.accuracyM, TAG.maxRadiusM);
  // El motivo del rechazo no incluye la distancia ni la posición del fugitivo.
  if (distanceM(hs, rs) > threshold) return err('not_close_enough');

  s.claimCounter++;
  const claim = {
    id: `${s.gameNo}-${s.claimCounter}`,
    hunterId: hunter.id,
    runnerId: runner.id,
    createdAt: now,
    expiresAt: now + TIMING.tagConfirmMs,
  };
  s.claims[claim.id] = claim;
  emit(ctx, 'tag_claimed', toPlayers(runner.id), {
    claimId: claim.id,
    hunterId: hunter.id,
    expiresAt: claim.expiresAt,
  });
  return ok({ claimId: claim.id, expiresAt: claim.expiresAt });
}

function leave(ctx: Ctx, p: Player, isHost: boolean): CommandResult {
  const s = ctx.s;
  const phase = s.phase;
  if (phase === 'HEAD_START' || phase === 'ACTIVE') {
    // Ya fuera de la partida (periodo de gracia, D-057) y ahora sale también de la sala: sin otro aviso.
    if (p.status === 'left') {
      p.leftRoom = true;
      return ok();
    }
    withdraw(ctx, p, 'left');
    return ok();
  }
  removePlayer(ctx, p, 'left');

  if (isHost && !transferHostNow(ctx) && phase === 'LOBBY') {
    close(ctx, 'empty');
    return ok();
  }
  if (phase === 'LOBBY' && lobbyPlayers(s).length === 0) {
    close(ctx, 'empty');
  } else if (phase === 'COUNTDOWN') {
    const active = activeOf(s, 'runner').length + activeOf(s, 'hunter').length;
    if (activeOf(s, 'runner').length === 0 || activeOf(s, 'hunter').length === 0 || active < modeOf(s.config).minPlayers) {
      backToLobby(ctx, 'team_empty');
    }
  }
  return ok();
}

/** Lo común a salir de la sala o de una partida: deja de jugar, se cancelan sus reclamaciones y se avisa a todos. */
function removePlayer(ctx: Ctx, p: Player, reason: 'left' | 'timeout'): void {
  const s = ctx.s;
  p.status = 'left';
  p.ready = false;
  p.away = false;
  // Tras el final, salir de la sala no cambia lo que pasó en la partida: el informe sigue igual (y quien
  // quedó fuera por el periodo de gracia sigue saliendo como «Sin conexión»).
  p.leftReason = s.phase === 'FINISHED' ? (p.leftReason ?? 'after_end') : reason;
  clearLocationState(p);
  forgetInLastPing(s, p.id);
  p.leftRoom = s.phase === 'LOBBY' || s.phase === 'FINISHED';
  for (const c of Object.values(s.claims)) {
    if (c.runnerId === p.id || c.hunterId === p.id) {
      delete s.claims[c.id];
      emit(ctx, 'tag_claim_resolved', toPlayers(c.hunterId, c.runnerId), { claimId: c.id, result: 'cancelled' });
    }
  }
  emit(ctx, 'player_left', ALL, reason === 'left' ? { playerId: p.id } : { playerId: p.id, reason });
}

/**
 * Salida de una partida en curso: por decisión propia (`leave`) o al vencer el periodo de gracia (D-057:
 * mismas consecuencias que abandonar). Si se queda sin fugitivos o sin cazadores, termina sin ganador.
 */
function withdraw(ctx: Ctx, p: Player, reason: 'left' | 'timeout'): void {
  const s = ctx.s;
  const wasHost = p.id === s.hostId;
  removePlayer(ctx, p, reason);
  if (wasHost) transferHostNow(ctx);
  checkEnd(ctx, 'leave');
}

function rematch(ctx: Ctx, isHost: boolean, swapRoles: boolean): CommandResult {
  const s = ctx.s;
  if (!isHost) return err('forbidden');
  if (s.phase !== 'FINISHED') return err('wrong_phase');
  const playedGame = s.gameNo;
  s.gameNo++;
  s.phase = 'LOBBY';
  s.countdownEnd = null;
  s.headStartEnd = null;
  s.activeStart = null;
  s.gameEnd = null;
  s.nextPingAt = null;
  s.pingCount = 0;
  s.lastPing = null;
  s.claims = {};
  s.captures = [];
  s.outcome = null;
  s.finishedAt = null;
  s.zonePlan = null;
  s.zonePhase = 0;
  for (const p of playersInOrder(s)) {
    const eligible = p.playedGameNo === playedGame && !p.leftRoom;
    if (!eligible && p.id !== s.hostId) {
      if (p.status !== 'left') {
        p.status = 'left';
        p.leftRoom = true;
      }
      continue;
    }
    const previous = p.team;
    // Revancha = sorteo nuevo (decisión del 29/10/2026, D-037): nadie arrastra su equipo, y el reparto
    // se hace al empezar, como en la primera partida. Solo un cambio de equipos pedido expresamente
    // (swapRoles) fija el contrario. El anfitrión puede seguir asignando a mano en la sala.
    const swap = swapRoles && previous !== null && !modeOf(s.config).exactHunters;
    p.teamPref = swap ? (previous === 'hunter' ? 'runner' : 'hunter') : 'random';
    // El arrastre de equipos de la revancha no lo ve nadie (ni el propio jugador ni el anfitrión).
    p.teamPrefSetBy = null;
    p.team = null;
    p.ready = false;
    p.away = false;
    p.leftReason = null;
    clearLocationState(p);
    p.status = p.id === s.hostId ? 'lobby' : 'invited';
  }
  emit(ctx, 'rematch_offered', ALL, { gameNo: s.gameNo, swapRoles });
  return ok();
}
