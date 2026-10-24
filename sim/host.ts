// Servidor autoritativo SIMULADO (en memoria, sin red) para la etapa S0.
// Hace lo que hará el adaptador real (Durable Objects o Node, D-014 pendiente):
// reloj autoritativo, códigos de sala, sesiones, idempotencia, numeración de eventos,
// filtrado por destinatario, reanudación y envío periódico de posiciones.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { applyCommand, createRoom, nextDeadline, tick } from '../engine/src/engine.ts';
import type { Command, CommandResult, EngineEvent, RoomState, Step } from '../engine/src/types.ts';
import { canReceive, snapshotFor, visiblePositions } from '../engine/src/view.ts';
import type { Snapshot, VisiblePosition } from '../engine/src/view.ts';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O, 1/I/L
export const CODE_LENGTH = 6;
export const JOIN_RATE_LIMIT = { attempts: 10, windowMs: 60_000 };

export type ServerMessage =
  | { kind: 'event'; seq: number; type: string; at: number; data: Record<string, unknown> }
  | { kind: 'positions'; at: number; positions: VisiblePosition[] }
  | { kind: 'snapshot'; seq: number; snapshot: Snapshot };

export interface Endpoint {
  deliver(msg: ServerMessage): void;
}

export type HostError = 'rate_limited' | 'bad_session' | 'not_found' | 'forbidden';
export type HostResult<T> = ({ ok: true } & T) | { ok: false; error: string };

interface LoggedEvent {
  seq: number;
  event: EngineEvent;
}

// Flujo propio de cada destinatario: numeración contigua aunque haya filtrado por audiencia.
interface Outbox {
  seq: number;
  entries: { seq: number; msg: ServerMessage; containsLocation: boolean }[];
}

interface RoomRecord {
  code: string;
  state: RoomState;
  log: LoggedEvent[]; // registro de auditoría de la sala (numeración global)
  seq: number;
  outboxes: Map<string, Outbox>;
  replies: Map<string, CommandResult>;
}

export interface HostOptions {
  startTime: number;
  seed: number;
  positionsIntervalMs?: number;
  logRetention?: number;
  codeGenerator?: () => string;
  idGenerator?: (prefix: string) => string;
}

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const hash = (secret: string): Buffer => createHash('sha256').update(secret).digest();

export class SimHost {
  now: number;
  readonly logLines: string[] = [];
  readonly inbound = new Map<string, number>();
  readonly outbound = new Map<string, number>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly codes = new Map<string, string>();
  private readonly playerRoom = new Map<string, string>();
  private readonly sessions = new Map<string, Buffer>();
  private readonly endpoints = new Map<string, Endpoint>();
  private readonly faults = new Map<string, (msg: ServerMessage) => ServerMessage[]>();
  private readonly joinAttempts = new Map<string, number[]>();
  private readonly positionsIntervalMs: number;
  private readonly logRetention: number;
  private readonly codeGenerator: () => string;
  private readonly idGenerator: (prefix: string) => string;
  private readonly seed: number;
  private nextPositionsAt: number;
  private roomCounter = 0;

  constructor(options: HostOptions) {
    this.now = options.startTime;
    this.seed = options.seed;
    this.positionsIntervalMs = options.positionsIntervalMs ?? 5_000;
    this.logRetention = options.logRetention ?? Number.POSITIVE_INFINITY;
    this.codeGenerator = options.codeGenerator ?? generateCode;
    this.idGenerator = options.idGenerator ?? ((prefix) => `${prefix}_${randomBytes(6).toString('hex')}`);
    this.nextPositionsAt = this.now + this.positionsIntervalMs;
  }

  // ------------------------------------------------------------ utilidades públicas

  serverTime(): number {
    return this.now;
  }

  stateOf(playerIdOrRoomId: string): RoomState {
    const roomId = this.playerRoom.get(playerIdOrRoomId) ?? playerIdOrRoomId;
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`unknown room for ${playerIdOrRoomId}`);
    return room.state;
  }

  eventLog(roomId: string): readonly LoggedEvent[] {
    return this.rooms.get(roomId)?.log ?? [];
  }

  setFault(playerId: string, fault: ((msg: ServerMessage) => ServerMessage[]) | null): void {
    if (fault) this.faults.set(playerId, fault);
    else this.faults.delete(playerId);
  }

  // ------------------------------------------------------------ salas y sesiones

  createRoom(deviceId: string, name: string): HostResult<{ code: string; roomId: string; playerId: string; secret: string }> {
    const roomId = this.idGenerator('room');
    const playerId = this.idGenerator('p');
    const step = createRoom({
      roomId,
      hostId: playerId,
      hostName: name,
      hostDeviceId: deviceId,
      now: this.now,
      seed: this.seed + this.roomCounter++,
    });
    if (!step.result.ok) return { ok: false, error: step.result.error };
    let code = this.codeGenerator();
    for (let tries = 0; this.codes.has(code); tries++) {
      if (tries > 100) throw new Error('code space exhausted');
      code = this.codeGenerator();
    }
    this.codes.set(code, roomId);
    this.rooms.set(roomId, { code, state: step.state, log: [], seq: 0, outboxes: new Map(), replies: new Map() });
    const secret = this.issueSession(playerId, roomId);
    this.log(`room_created room=${roomId}`);
    return { ok: true, code, roomId, playerId, secret };
  }

  join(code: string, deviceId: string, name: string): HostResult<{ playerId: string; secret: string; roomId: string }> {
    const attempts = (this.joinAttempts.get(deviceId) ?? []).filter((t) => t > this.now - JOIN_RATE_LIMIT.windowMs);
    if (attempts.length >= JOIN_RATE_LIMIT.attempts) {
      this.log(`join_rejected reason=rate_limited`);
      return { ok: false, error: 'rate_limited' };
    }
    attempts.push(this.now);
    this.joinAttempts.set(deviceId, attempts);

    const roomId = this.codes.get(code.toUpperCase());
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!roomId || !room) return { ok: false, error: 'not_found' };
    const playerId = this.idGenerator('p');
    const result = this.run(room, playerId, { type: 'join', name, deviceId });
    if (!result.ok) return { ok: false, error: result.error };
    const secret = this.issueSession(playerId, roomId);
    return { ok: true, playerId, secret, roomId };
  }

  private issueSession(playerId: string, roomId: string): string {
    const secret = randomBytes(32).toString('base64url');
    this.sessions.set(playerId, hash(secret));
    this.playerRoom.set(playerId, roomId);
    return secret;
  }

  private checkSession(playerId: string, secret: string): RoomRecord | null {
    const stored = this.sessions.get(playerId);
    const roomId = this.playerRoom.get(playerId);
    if (!stored || !roomId) return null;
    const given = hash(secret);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;
    return this.rooms.get(roomId) ?? null;
  }

  // Conexión o reconexión. lastSeq = último evento aplicado por el cliente.
  connect(playerId: string, secret: string, endpoint: Endpoint, lastSeq: number): HostResult<object> {
    const room = this.checkSession(playerId, secret);
    if (!room) {
      this.log(`connect_rejected reason=bad_session`);
      return { ok: false, error: 'bad_session' };
    }
    this.endpoints.set(playerId, endpoint);
    const box = this.outbox(room, playerId);
    const oldest = box.entries[0]?.seq ?? box.seq + 1;
    if (lastSeq === 0 || lastSeq < oldest - 1 || lastSeq > box.seq) {
      // Sin historial suficiente (o cliente nuevo): instantánea completa.
      this.deliver(playerId, { kind: 'snapshot', seq: box.seq, snapshot: snapshotFor(room.state, playerId, this.now) });
    } else {
      for (const entry of box.entries) if (entry.seq > lastSeq) this.deliver(playerId, entry.msg);
    }
    this.run(room, playerId, { type: 'connection', connected: true });
    return { ok: true };
  }

  disconnect(playerId: string): void {
    this.endpoints.delete(playerId);
    const roomId = this.playerRoom.get(playerId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (room) this.run(room, playerId, { type: 'connection', connected: false });
  }

  // Comando de un cliente. Idempotente por (jugador, commandId).
  send(playerId: string, secret: string, commandId: string, cmd: Command): CommandResult | { ok: false; error: HostError } {
    const room = this.checkSession(playerId, secret);
    if (!room) {
      this.log(`command_rejected reason=bad_session`);
      return { ok: false, error: 'bad_session' };
    }
    this.inbound.set(playerId, (this.inbound.get(playerId) ?? 0) + 1);
    // Los comandos de sistema solo los genera el propio servidor.
    if (cmd.type === 'join' || cmd.type === 'connection') return { ok: false, error: 'forbidden' };
    const key = `${playerId}:${commandId}`;
    const cached = room.replies.get(key);
    if (cached) {
      this.log(`command_duplicate room=${room.state.roomId} player=${playerId} type=${cmd.type}`);
      return cached;
    }
    const result = this.run(room, playerId, cmd);
    room.replies.set(key, result);
    return result;
  }

  // ------------------------------------------------------------ tiempo

  advance(ms: number): void {
    this.advanceTo(this.now + ms);
  }

  advanceTo(target: number): void {
    if (target < this.now) throw new Error('time cannot go backwards');
    for (let guard = 0; ; guard++) {
      if (guard > 1_000_000) throw new Error('advanceTo: no progress');
      let nextRoom: RoomRecord | null = null;
      let nextAt = Number.POSITIVE_INFINITY;
      for (const room of this.rooms.values()) {
        const d = nextDeadline(room.state);
        if (d !== null && d < nextAt) {
          nextAt = d;
          nextRoom = room;
        }
      }
      if (this.nextPositionsAt <= target && this.nextPositionsAt < nextAt) {
        this.now = this.nextPositionsAt;
        this.broadcastPositions();
        this.nextPositionsAt += this.positionsIntervalMs;
        continue;
      }
      if (!nextRoom || nextAt > target) break;
      this.now = Math.max(this.now, nextAt);
      this.commit(nextRoom, tick(nextRoom.state, this.now));
    }
    this.now = target;
  }

  // ------------------------------------------------------------ internos

  private run(room: RoomRecord, actorId: string, cmd: Command): CommandResult {
    const step = applyCommand(room.state, actorId, cmd, this.now);
    this.commit(room, step);
    this.log(
      `cmd room=${room.state.roomId} player=${actorId} type=${cmd.type} ${step.result.ok ? 'ok' : `error=${step.result.error}`}`,
    );
    return step.result;
  }

  private commit(room: RoomRecord, step: Step): void {
    room.state = step.state;
    for (const event of step.events) {
      room.seq++;
      const entry = { seq: room.seq, event };
      room.log.push(entry);
      this.log(`event room=${room.state.roomId} seq=${entry.seq} type=${event.type}`);
      for (const pid of room.state.playerOrder) {
        if (!canReceive(room.state, event.audience, pid)) continue;
        const box = this.outbox(room, pid);
        box.seq++;
        const msg: ServerMessage = { kind: 'event', seq: box.seq, type: event.type, at: event.at, data: event.data };
        box.entries.push({ seq: box.seq, msg, containsLocation: event.containsLocation === true });
        while (box.entries.length > this.logRetention) box.entries.shift();
        this.deliver(pid, msg);
      }
    }
    while (room.log.length > this.logRetention) room.log.shift();
    if (room.state.phase === 'FINISHED' || room.state.phase === 'CANCELLED') {
      // Al terminar, no queda ninguna coordenada de jugadores en los registros del servidor.
      for (const entry of room.log) {
        if (entry.event.containsLocation) entry.event = { ...entry.event, data: { purged: true } };
      }
      for (const box of room.outboxes.values()) {
        for (const entry of box.entries) {
          if (entry.containsLocation && entry.msg.kind === 'event') {
            entry.msg = { ...entry.msg, data: { purged: true } };
            entry.containsLocation = false;
          }
        }
      }
    }
    if (room.state.phase === 'CANCELLED' && this.codes.get(room.code) === room.state.roomId) {
      this.codes.delete(room.code);
    }
  }

  private broadcastPositions(): void {
    for (const room of this.rooms.values()) {
      if (room.state.phase !== 'HEAD_START' && room.state.phase !== 'ACTIVE') continue;
      for (const pid of room.state.playerOrder) {
        const positions = visiblePositions(room.state, pid, this.now);
        if (positions.length > 0) this.deliver(pid, { kind: 'positions', at: this.now, positions });
      }
    }
  }

  private outbox(room: RoomRecord, playerId: string): Outbox {
    let box = room.outboxes.get(playerId);
    if (!box) {
      box = { seq: 0, entries: [] };
      room.outboxes.set(playerId, box);
    }
    return box;
  }

  // Inspección para pruebas: todo lo que el servidor conserva para un jugador.
  outboxOf(playerId: string): readonly { seq: number; msg: ServerMessage }[] {
    const roomId = this.playerRoom.get(playerId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    return room?.outboxes.get(playerId)?.entries ?? [];
  }

  private deliver(playerId: string, msg: ServerMessage): void {
    const endpoint = this.endpoints.get(playerId);
    if (!endpoint) return; // desconectado: se perderá y se recuperará al reanudar
    const fault = this.faults.get(playerId);
    const out = fault ? fault(msg) : [msg];
    for (const m of out) {
      this.outbound.set(playerId, (this.outbound.get(playerId) ?? 0) + 1);
      endpoint.deliver(m);
    }
  }

  // Los registros nunca incluyen coordenadas ni datos de eventos: solo identificadores y tipos.
  private log(line: string): void {
    this.logLines.push(`${this.now} ${line}`);
  }
}
