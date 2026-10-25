// Motor de reglas del modo Clásico. Puro y determinista: sin E/S, sin reloj propio.
// El servidor (adaptador) le pasa la hora autoritativa `now` en cada llamada.
// Referencia: docs/technical/GAME_STATE_MACHINE.md.

import { DEFAULTS, LIMITS, LOCATION, START_ZONE, TAG, TIMING } from './constants.ts';
import { validateConfig, validateName } from './config.ts';
import { distanceM, isOutsideZone, zoneAt } from './geo.ts';
import { availabilityOf, isValidSample, latestSample, recordSample, toStoredSample } from './location.ts';
import { resolveTeams } from './teams.ts';
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
    team: null,
    ready: false,
    status: 'lobby',
    connected: true,
    disconnectedSince: null,
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
  | 'host_handover'
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
    case 'host_handover': {
      const candidate = handoverCandidate(s);
      if (candidate) setHost(ctx, candidate.id);
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
  emit(ctx, 'ping', { kind: 'team', team: 'hunter' }, { ping: s.lastPing }, true);
  emit(ctx, 'ping_sent', { kind: 'team', team: 'runner' }, { pingNo: s.pingCount });
  const next = s.nextPingAt + config.pingIntervalMs;
  s.nextPingAt = next < s.gameEnd ? next : null;
}

// ---------------------------------------------------------------- transiciones auxiliares

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
    if (p.playedGameNo === s.gameNo && p.flags.length > 0) flags[p.id] = [...p.flags];
  }
  emit(ctx, 'game_finished', ALL, {
    outcome,
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
  for (const p of playersInOrder(s)) {
    if (p.status === 'active') {
      p.status = 'lobby';
      p.team = null;
      p.ready = false;
      p.playedGameNo = null;
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

function capture(ctx: Ctx, runner: Player, hunterId: string | null, via: 'self' | 'claim'): void {
  const s = ctx.s;
  runner.status = 'captured';
  clearLocationState(runner);
  const entry = { runnerId: runner.id, hunterId, atOffsetMs: ctx.now - (s.activeStart ?? ctx.now), via };
  s.captures.push(entry);
  emit(ctx, 'runner_captured', ALL, { ...entry });
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
  const zone = zoneAt(s.config.zone, ctx.now - (s.activeStart ?? ctx.now));
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
  const result = handle(ctx, actorId, cmd);
  if (result.ok) {
    ctx.s.lastActivityAt = now;
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
      p.connected = cmd.connected;
      p.disconnectedSince = cmd.connected ? null : now;
      emit(ctx, 'player_connection', ALL, { playerId: p.id, connected: cmd.connected });
      return ok();

    case 'set_team_pref':
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      if (p.status !== 'lobby') return err('forbidden');
      if (!isTeamPref(cmd.pref)) return err('invalid_config', 'pref');
      p.teamPref = cmd.pref;
      emit(ctx, 'player_updated', ALL, { playerId: p.id, teamPref: p.teamPref });
      return ok();

    case 'assign_team': {
      if (!isHost) return err('forbidden');
      if (s.phase !== 'LOBBY') return err('wrong_phase');
      const target = s.players[cmd.targetId];
      if (!target || target.status !== 'lobby') return err('unknown_player');
      if (!isTeamPref(cmd.pref)) return err('invalid_config', 'pref');
      target.teamPref = cmd.pref;
      emit(ctx, 'player_updated', ALL, { playerId: target.id, teamPref: target.teamPref });
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
        if (h && h.team === 'hunter' && h.status === 'active') hunterId = h.id;
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
  if (sameDevice) return err('already_joined');
  if (lobbyPlayers(s).length >= LIMITS.maxPlayers) return err('room_full');
  const name = validateName(rawName);
  if (!name) return err('invalid_name');
  s.players[actorId] = newPlayer(actorId, deviceId, name, ctx.now);
  s.playerOrder.push(actorId);
  emit(ctx, 'player_joined', ALL, { playerId: actorId, name });
  return ok();
}

function start(ctx: Ctx, isHost: boolean): CommandResult {
  const s = ctx.s;
  if (!isHost) return err('forbidden');
  if (s.phase !== 'LOBBY') return err('wrong_phase');
  if (!s.config) return err('config_missing');
  if (!s.config.safetyChecklistConfirmed) return err('safety_not_confirmed');
  const lobby = lobbyPlayers(s);
  if (lobby.length < LIMITS.minPlayers) return err('not_enough_players');
  if (lobby.length > LIMITS.maxPlayers) return err('room_full');
  if (lobby.some((p) => !p.ready || !p.connected)) return err('players_not_ready');
  const teams = resolveTeams(lobby, s.seed + s.gameNo);
  if (!teams) return err('teams_unbalanced');

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
  // D-042: durante la cuenta atrás nadie conoce su rol; se revela al terminar (role_revealed).
  emit(ctx, 'countdown_started', ALL, { countdownEnd: s.countdownEnd });
  return ok();
}

function claimTag(ctx: Ctx, hunter: Player, runnerId: string): CommandResult {
  const s = ctx.s;
  const now = ctx.now;
  if (s.phase !== 'ACTIVE') return err('wrong_phase');
  if (hunter.team !== 'hunter' || hunter.status !== 'active') return err('not_a_hunter');
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
  p.status = 'left';
  p.ready = false;
  clearLocationState(p);
  p.leftRoom = phase === 'LOBBY' || phase === 'FINISHED';
  for (const c of Object.values(s.claims)) {
    if (c.runnerId === p.id || c.hunterId === p.id) {
      delete s.claims[c.id];
      emit(ctx, 'tag_claim_resolved', toPlayers(c.hunterId, c.runnerId), { claimId: c.id, result: 'cancelled' });
    }
  }
  emit(ctx, 'player_left', ALL, { playerId: p.id });

  if (isHost && !transferHostNow(ctx) && phase === 'LOBBY') {
    close(ctx, 'empty');
    return ok();
  }
  if (phase === 'LOBBY' && lobbyPlayers(s).length === 0) {
    close(ctx, 'empty');
  } else if (phase === 'COUNTDOWN') {
    if (activeOf(s, 'runner').length === 0 || activeOf(s, 'hunter').length === 0) backToLobby(ctx, 'team_empty');
  } else if (phase === 'HEAD_START' || phase === 'ACTIVE') {
    checkEnd(ctx, 'leave');
  }
  return ok();
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
    p.teamPref = previous === null ? 'random' : swapRoles ? (previous === 'hunter' ? 'runner' : 'hunter') : previous;
    p.team = null;
    p.ready = false;
    clearLocationState(p);
    p.status = p.id === s.hostId ? 'lobby' : 'invited';
  }
  emit(ctx, 'rematch_offered', ALL, { gameNo: s.gameNo, swapRoles });
  return ok();
}
