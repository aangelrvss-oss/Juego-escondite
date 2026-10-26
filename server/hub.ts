// Servidor autoritativo de THE OUTRUN, independiente del transporte. Las reglas viven solo en el
// motor (engine/); aquí están las sesiones, las salas, la distribución filtrada por destinatario,
// la idempotencia, la reanudación, los límites de abuso y la limpieza. El reloj es inyectable para
// poder probar partidas completas sin esperar (el servidor real usa Date.now).
//
// Diferencias con sim/host.ts (simulación de S0, que se conserva para sus pruebas): transporte real,
// mensajes JSON validados, instantánea autorizada tras cada cambio, conversión de la antigüedad de las
// lecturas a la hora del servidor, límites de frecuencia y de memoria, y borrado de salas cerradas.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { applyCommand, createRoom, nextDeadline, tick } from '../engine/src/engine.ts';
import type { Command, CommandResult, RoomState, Step } from '../engine/src/types.ts';
import { canReceive, snapshotFor, visiblePositions } from '../engine/src/view.ts';
import { LIMITS as PROTOCOL, parseClientMessage } from './protocol.ts';
import type { ClientMessage, LocationUpload } from './protocol.ts';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L
export const CODE_LENGTH = 6; // 31^6 ≈ 8,9·10^8 códigos, con límite de intentos fallidos

export interface Transport {
  send(text: string): void;
  close(code: number, reason: string): void;
}

export interface HubOptions {
  now?: () => number;
  positionsIntervalMs?: number;
  maxRooms?: number;
  outboxLimit?: number; // eventos guardados por jugador para reanudar; más antiguos → instantánea
  replyLimit?: number; // respuestas guardadas por jugador para la idempotencia
  closedRoomGraceMs?: number; // tiempo que se conserva una sala cerrada antes de borrarla
  log?: (line: string) => void;
}

// Parámetros técnicos de abuso (no son reglas de juego).
export const RATE = {
  burst: 30, // mensajes seguidos permitidos
  perSecond: 10, // ritmo sostenido
  closeAfterDropped: 200, // mensajes descartados seguidos antes de cortar la conexión
  locMinIntervalMs: 900, // como mucho una lectura por segundo y jugador
  claimMinIntervalMs: 3_000, // reclamaciones de captura: evita sondear distancias a ráfagas
  attemptsPerMinute: 10, // create/join/resume por conexión
  failuresPerMinutePerIp: 20, // códigos o sesiones incorrectos por dirección
} as const;

// Resultado de un comando visto por el cliente: los del motor más los límites del servidor.
export type ServerResult = CommandResult | { ok: false; error: 'rate_limited' };

// Resultado de una lectura enviada por HTTP (POST /api/loc), que main.ts traduce a un código HTTP.
//   accepted: el motor la ha registrado · ignored: fuera de fase o demasiado seguida (se sigue enviando)
//   gone: el jugador ya no comparte ubicación (capturado, partida terminada o sala de espera): el móvil
//   deja de enviar · bad_session: sesión inexistente o secreto incorrecto · rate_limited: demasiados fallos
export type UploadOutcome = 'accepted' | 'ignored' | 'gone' | 'bad_session' | 'rate_limited';

type LocationReading = { lat: number; lng: number; acc: number; age: number; mock?: boolean };

interface OutboxEntry {
  seq: number;
  msg: Record<string, unknown>;
  containsLocation: boolean;
}

interface Room {
  id: string;
  code: string;
  state: RoomState;
  outboxes: Map<string, { seq: number; entries: OutboxEntry[] }>;
  replies: Map<string, Map<string, ServerResult>>;
  lastClaimAt: Map<string, number>;
  lastLocAt: Map<string, number>; // por jugador, compartido por WebSocket y HTTP
  deleteAt: number | null;
}

interface Client {
  transport: Transport;
  ip: string;
  playerId: string | null;
  tokens: number;
  refilledAt: number;
  dropped: number;
  attempts: number[];
  closed: boolean;
}

export interface ClientHandle {
  receive(text: string): void;
  closed(): void;
}

const hash = (secret: string): Buffer => createHash('sha256').update(secret).digest();
const randomId = (prefix: string): string => `${prefix}_${randomBytes(9).toString('base64url')}`;

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export class Hub {
  private readonly now: () => number;
  private readonly opts: Required<Omit<HubOptions, 'now' | 'log'>>;
  private readonly log: (line: string) => void;
  private readonly rooms = new Map<string, Room>();
  private readonly codes = new Map<string, string>();
  private readonly sessions = new Map<string, { roomId: string; hash: Buffer }>();
  private readonly connections = new Map<string, Client>();
  private readonly clients = new Set<Client>();
  private readonly failures = new Map<string, number[]>();
  private readonly accepted = { ws: 0, http: 0 }; // lecturas registradas por el motor, por canal
  private nextPositionsAt: number;

  constructor(options: HubOptions = {}) {
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => {});
    this.opts = {
      positionsIntervalMs: options.positionsIntervalMs ?? 5_000,
      maxRooms: options.maxRooms ?? 100,
      outboxLimit: options.outboxLimit ?? 300,
      replyLimit: options.replyLimit ?? 64,
      closedRoomGraceMs: options.closedRoomGraceMs ?? 60_000,
    };
    this.nextPositionsAt = this.now() + this.opts.positionsIntervalMs;
  }

  // ------------------------------------------------------------ conexiones

  connect(transport: Transport, ip: string): ClientHandle {
    const client: Client = {
      transport,
      ip,
      playerId: null,
      tokens: RATE.burst,
      refilledAt: this.now(),
      dropped: 0,
      attempts: [],
      closed: false,
    };
    this.clients.add(client);
    return {
      receive: (text) => this.receive(client, text),
      closed: () => this.disconnected(client),
    };
  }

  /** Contadores sin datos personales. locWs/locHttp permiten comprobar en una prueba física por qué
   * canal llegan las lecturas (p. ej., que siguen llegando por HTTP con la pantalla bloqueada). */
  stats(): { rooms: number; sessions: number; clients: number; locWs: number; locHttp: number } {
    return {
      rooms: this.rooms.size,
      sessions: this.sessions.size,
      clients: this.clients.size,
      locWs: this.accepted.ws,
      locHttp: this.accepted.http,
    };
  }

  /** Estado interno de una sala (solo para pruebas y diagnóstico local; nunca se envía). */
  roomStateByCode(code: string): RoomState | undefined {
    const id = this.codes.get(code);
    return id ? this.rooms.get(id)?.state : undefined;
  }

  private disconnected(client: Client): void {
    if (client.closed) return;
    client.closed = true;
    this.clients.delete(client);
    const pid = client.playerId;
    if (pid && this.connections.get(pid) === client) {
      this.connections.delete(pid);
      const room = this.roomOf(pid);
      if (room) this.run(room, pid, { type: 'connection', connected: false });
    }
  }

  private send(client: Client, msg: Record<string, unknown>): void {
    if (!client.closed) client.transport.send(JSON.stringify(msg));
  }

  private allow(client: Client): boolean {
    const now = this.now();
    client.tokens = Math.min(RATE.burst, client.tokens + ((now - client.refilledAt) / 1_000) * RATE.perSecond);
    client.refilledAt = now;
    if (client.tokens >= 1) {
      client.tokens -= 1;
      client.dropped = 0;
      return true;
    }
    if (++client.dropped >= RATE.closeAfterDropped) client.transport.close(4008, 'rate limited');
    return false;
  }

  private tooManyFailures(ip: string): boolean {
    const now = this.now();
    const recentFailures = (this.failures.get(ip) ?? []).filter((t) => t > now - 60_000);
    this.failures.set(ip, recentFailures);
    return recentFailures.length >= RATE.failuresPerMinutePerIp;
  }

  private recordFailure(ip: string): void {
    const list = this.failures.get(ip) ?? [];
    list.push(this.now());
    this.failures.set(ip, list);
  }

  private countAttempt(client: Client): boolean {
    const now = this.now();
    client.attempts = client.attempts.filter((t) => t > now - 60_000);
    if (client.attempts.length >= RATE.attemptsPerMinute || this.tooManyFailures(client.ip)) return false;
    client.attempts.push(now);
    return true;
  }

  private fail(client: Client, error: string): void {
    this.recordFailure(client.ip);
    this.send(client, { t: 'error', error });
  }

  /** Sesión válida (secreto comprobado en tiempo constante) → su sala; si no, undefined. */
  private authenticate(playerId: string, secret: string): Room | undefined {
    const session = this.sessions.get(playerId);
    const room = session ? this.rooms.get(session.roomId) : undefined;
    return session && room && timingSafeEqual(hash(secret), session.hash) ? room : undefined;
  }

  // ------------------------------------------------------------ mensajes

  private receive(client: Client, text: string): void {
    if (client.closed || !this.allow(client)) return;
    const msg = parseClientMessage(text);
    if (!msg) {
      this.send(client, { t: 'error', error: 'bad_message' });
      return;
    }
    switch (msg.t) {
      case 'ping':
        this.send(client, { t: 'pong', c: msg.c, s: this.now() });
        return;
      case 'create':
      case 'join':
      case 'resume':
        if (!this.countAttempt(client)) {
          this.send(client, { t: 'error', error: 'rate_limited' });
          return;
        }
        if (msg.t === 'create') this.create(client, msg);
        else if (msg.t === 'join') this.join(client, msg);
        else this.resume(client, msg);
        return;
      case 'cmd':
        this.command(client, msg);
        return;
      case 'loc':
        this.location(client, msg);
        return;
    }
  }

  private create(client: Client, msg: Extract<ClientMessage, { t: 'create' }>): void {
    if (client.playerId) return this.send(client, { t: 'error', error: 'already_in_room' });
    if (this.rooms.size >= this.opts.maxRooms) return this.send(client, { t: 'error', error: 'server_full' });
    const roomId = randomId('room');
    const playerId = randomId('p');
    const step = createRoom({
      roomId,
      hostId: playerId,
      hostName: msg.name,
      hostDeviceId: msg.installId,
      now: this.now(),
      seed: randomInt(2 ** 31),
    });
    if (!step.result.ok) return this.send(client, { t: 'error', error: step.result.error });
    let code = generateCode();
    while (this.codes.has(code)) code = generateCode();
    const room: Room = {
      id: roomId,
      code,
      state: step.state,
      outboxes: new Map(),
      replies: new Map(),
      lastClaimAt: new Map(),
      lastLocAt: new Map(),
      deleteAt: null,
    };
    this.rooms.set(roomId, room);
    this.codes.set(code, roomId);
    this.bind(client, room, playerId);
    this.log(`room_created rooms=${this.rooms.size}`);
  }

  private join(client: Client, msg: Extract<ClientMessage, { t: 'join' }>): void {
    if (client.playerId) return this.send(client, { t: 'error', error: 'already_in_room' });
    const roomId = this.codes.get(msg.code.trim().toUpperCase());
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room) return this.fail(client, 'not_found');
    const playerId = randomId('p');
    const result = this.run(room, playerId, { type: 'join', name: msg.name, deviceId: msg.installId });
    if (!result.ok) {
      if (result.error === 'not_found') return this.fail(client, 'not_found');
      return this.send(client, { t: 'error', error: result.error });
    }
    this.bind(client, room, playerId);
  }

  private resume(client: Client, msg: Extract<ClientMessage, { t: 'resume' }>): void {
    const room = this.authenticate(msg.playerId, msg.secret);
    if (!room) return this.fail(client, 'bad_session');
    if (client.playerId && client.playerId !== msg.playerId) return this.send(client, { t: 'error', error: 'already_in_room' });
    const previous = this.connections.get(msg.playerId);
    if (previous && previous !== client) {
      previous.playerId = null; // la conexión antigua ya no representa a este jugador
      previous.transport.close(4001, 'replaced');
    }
    client.playerId = msg.playerId;
    this.connections.set(msg.playerId, client);
    this.send(client, { t: 'welcome', playerId: msg.playerId, code: room.code });
    const box = this.outbox(room, msg.playerId);
    const oldest = box.entries[0]?.seq ?? box.seq + 1;
    if (msg.lastSeq >= oldest - 1 && msg.lastSeq <= box.seq) {
      for (const entry of box.entries) if (entry.seq > msg.lastSeq) this.send(client, entry.msg);
    }
    this.sendSnapshot(room, msg.playerId);
    this.run(room, msg.playerId, { type: 'connection', connected: true });
  }

  private bind(client: Client, room: Room, playerId: string): void {
    const secret = randomBytes(32).toString('base64url');
    this.sessions.set(playerId, { roomId: room.id, hash: hash(secret) });
    client.playerId = playerId;
    this.connections.set(playerId, client);
    this.send(client, { t: 'welcome', playerId, code: room.code, secret });
    this.sendSnapshot(room, playerId);
  }

  private command(client: Client, msg: Extract<ClientMessage, { t: 'cmd' }>): void {
    const pid = client.playerId;
    const room = pid ? this.roomOf(pid) : undefined;
    if (!pid || !room) return this.send(client, { t: 'error', error: 'no_session' });
    const replies = room.replies.get(pid) ?? new Map<string, ServerResult>();
    room.replies.set(pid, replies);
    const cached = replies.get(msg.id);
    if (cached) return this.send(client, { t: 'result', id: msg.id, result: cached });

    const cmd = msg.cmd as Command;
    let result: ServerResult;
    const type = typeof cmd === 'object' && cmd !== null ? (cmd as { type?: unknown }).type : undefined;
    if (type === 'join' || type === 'connection' || type === 'location') {
      // join/connection los genera el servidor; la ubicación entra por `loc` (con hora del servidor).
      result = { ok: false, error: 'forbidden' };
    } else if (type === 'claim_tag' && this.now() - (room.lastClaimAt.get(pid) ?? Number.NEGATIVE_INFINITY) < RATE.claimMinIntervalMs) {
      result = { ok: false, error: 'rate_limited' };
    } else {
      if (type === 'claim_tag') room.lastClaimAt.set(pid, this.now());
      result = this.run(room, pid, cmd);
    }
    replies.set(msg.id, result);
    while (replies.size > this.opts.replyLimit) replies.delete(replies.keys().next().value as string);
    this.send(client, { t: 'result', id: msg.id, result });
  }

  private location(client: Client, msg: Extract<ClientMessage, { t: 'loc' }>): void {
    const pid = client.playerId;
    const room = pid ? this.roomOf(pid) : undefined;
    if (pid && room) this.applyLocation(room, pid, msg, 'ws');
  }

  /**
   * Lectura enviada por HTTP por el servicio nativo de la app (sigue funcionando con la pantalla
   * bloqueada, cuando la interfaz web puede estar dormida). Misma validación y mismo límite por
   * jugador que por WebSocket: enviar por los dos canales no permite más lecturas.
   */
  uploadLocation(ip: string, upload: LocationUpload): UploadOutcome {
    if (this.tooManyFailures(ip)) return 'rate_limited';
    const room = this.authenticate(upload.playerId, upload.secret);
    if (!room) {
      this.recordFailure(ip);
      return 'bad_session';
    }
    return this.applyLocation(room, upload.playerId, upload, 'http');
  }

  private applyLocation(room: Room, pid: string, msg: LocationReading, channel: 'ws' | 'http'): UploadOutcome {
    const now = this.now();
    const phase = room.state.phase;
    const self = room.state.players[pid];
    if (!self || self.status !== 'active' || phase === 'LOBBY' || phase === 'FINISHED' || phase === 'CANCELLED') return 'gone';
    if (now - (room.lastLocAt.get(pid) ?? Number.NEGATIVE_INFINITY) < RATE.locMinIntervalMs) return 'ignored'; // demasiado seguidas
    if (msg.age < 0 || msg.age > PROTOCOL.maxAgeMs) return 'ignored';
    room.lastLocAt.set(pid, now);
    // La hora de la medida se calcula con el reloj del servidor a partir de la antigüedad que mide el
    // móvil con su reloj monótono: nunca se mezcla con la hora de pared del teléfono.
    const result = this.run(room, pid, {
      type: 'location',
      sample: { lat: msg.lat, lng: msg.lng, accuracyM: msg.acc, measuredAt: now - msg.age, ...(msg.mock === undefined ? {} : { isMock: msg.mock }) },
    });
    if (!result.ok) return 'ignored'; // p. ej., cuenta atrás o lectura no válida
    if ((result.data as { accepted?: boolean } | undefined)?.accepted !== true) return 'ignored';
    this.accepted[channel]++;
    return 'accepted';
  }

  // ------------------------------------------------------------ motor y distribución

  private roomOf(playerId: string): Room | undefined {
    const session = this.sessions.get(playerId);
    return session ? this.rooms.get(session.roomId) : undefined;
  }

  private run(room: Room, actorId: string, cmd: Command): CommandResult {
    const step = applyCommand(room.state, actorId, cmd, this.now());
    this.commit(room, step);
    if (cmd.type !== 'location') {
      this.log(`cmd type=${cmd.type} ${step.result.ok ? 'ok' : `error=${step.result.error}`}`);
    }
    return step.result;
  }

  private commit(room: Room, step: Step): void {
    room.state = step.state;
    const touched = new Set<string>();
    for (const event of step.events) {
      for (const pid of room.state.playerOrder) {
        if (!canReceive(room.state, event.audience, pid)) continue;
        const box = this.outbox(room, pid);
        box.seq++;
        const msg = { t: 'event', seq: box.seq, type: event.type, at: event.at, data: event.data };
        box.entries.push({ seq: box.seq, msg, containsLocation: event.containsLocation === true });
        while (box.entries.length > this.opts.outboxLimit) box.entries.shift();
        const conn = this.connections.get(pid);
        if (conn) this.send(conn, msg);
        touched.add(pid);
      }
    }
    // Tras cada cambio, cada afectado recibe su vista autorizada completa: el cliente no necesita
    // reconstruir el estado a partir de los eventos (estos sirven para avisos puntuales).
    for (const pid of touched) this.sendSnapshot(room, pid);
    // Quien ya no pertenece a la sala (expulsado, o salió en la sala de espera o en el final) no recibe
    // nada más de ella: se le avisa una vez y su sesión deja de valer.
    for (const pid of room.state.playerOrder) {
      if (!room.state.players[pid]?.leftRoom || !this.sessions.has(pid)) continue;
      this.sessions.delete(pid);
      const conn = this.connections.get(pid);
      if (conn) {
        this.connections.delete(pid);
        conn.playerId = null;
        this.send(conn, { t: 'error', error: 'removed' });
      }
    }

    const phase = room.state.phase;
    if (phase === 'FINISHED' || phase === 'CANCELLED') {
      // Al terminar no queda ninguna coordenada en los eventos guardados para reanudar.
      for (const box of room.outboxes.values()) {
        for (const entry of box.entries) {
          if (entry.containsLocation) {
            entry.msg = { ...entry.msg, data: { purged: true } };
            entry.containsLocation = false;
          }
        }
      }
    }
    if (phase === 'CANCELLED' && room.deleteAt === null) {
      room.deleteAt = this.now() + this.opts.closedRoomGraceMs;
      this.codes.delete(room.code);
    }
  }

  private sendSnapshot(room: Room, playerId: string): void {
    const conn = this.connections.get(playerId);
    if (!conn) return;
    const box = this.outbox(room, playerId);
    this.send(conn, { t: 'snapshot', seq: box.seq, snapshot: snapshotFor(room.state, playerId, this.now()) });
  }

  private outbox(room: Room, playerId: string): { seq: number; entries: OutboxEntry[] } {
    let box = room.outboxes.get(playerId);
    if (!box) {
      box = { seq: 0, entries: [] };
      room.outboxes.set(playerId, box);
    }
    return box;
  }

  // ------------------------------------------------------------ tiempo

  /** Próximo instante en que pump() tiene algo que hacer. */
  nextWakeAt(): number {
    let at = this.nextPositionsAt;
    for (const room of this.rooms.values()) {
      const d = room.deleteAt ?? nextDeadline(room.state);
      if (d !== null && d < at) at = d;
    }
    return at;
  }

  /** Procesa plazos vencidos, el envío periódico de posiciones y el borrado de salas cerradas. */
  pump(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (room.deleteAt !== null) {
        if (room.deleteAt <= now) this.deleteRoom(room);
        continue;
      }
      const d = nextDeadline(room.state);
      if (d !== null && d <= now) this.commit(room, tick(room.state, now));
    }
    if (now >= this.nextPositionsAt) {
      this.broadcastPositions(now);
      this.nextPositionsAt = now + this.opts.positionsIntervalMs;
      // Limpieza del registro de fallos por dirección: solo importa el último minuto.
      for (const [ip, list] of this.failures) if (!list.some((t) => t > now - 60_000)) this.failures.delete(ip);
    }
  }

  private broadcastPositions(now: number): void {
    for (const room of this.rooms.values()) {
      if (room.state.phase !== 'HEAD_START' && room.state.phase !== 'ACTIVE') continue;
      for (const pid of room.state.playerOrder) {
        const conn = this.connections.get(pid);
        if (!conn) continue;
        const positions = visiblePositions(room.state, pid, now);
        if (positions.length > 0) this.send(conn, { t: 'positions', at: now, positions });
      }
    }
  }

  private deleteRoom(room: Room): void {
    this.rooms.delete(room.id);
    if (this.codes.get(room.code) === room.id) this.codes.delete(room.code);
    for (const pid of room.state.playerOrder) {
      this.sessions.delete(pid);
      const conn = this.connections.get(pid);
      if (conn) {
        this.connections.delete(pid);
        conn.playerId = null;
        conn.transport.close(4000, 'room closed');
      }
    }
    this.log(`room_deleted rooms=${this.rooms.size}`);
  }
}
