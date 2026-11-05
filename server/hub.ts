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
  /** Reloj del límite de mensajes (por defecto, `now`). El simulador pausa `now` y mantiene este real. */
  rateNow?: () => number;
  /** Reloj de pared para detectar que el propio servidor estuvo suspendido (por defecto, `Date.now`). */
  wallNow?: () => number;
  positionsIntervalMs?: number;
  maxRooms?: number;
  maxRoomsPerIp?: number; // salas activas creadas desde una misma dirección
  outboxLimit?: number; // eventos guardados por jugador para reanudar; más antiguos → instantánea
  replyLimit?: number; // respuestas guardadas por jugador para la idempotencia
  closedRoomGraceMs?: number; // tiempo que se conserva una sala cerrada antes de borrarla
  log?: (line: string) => void;
  generateCode?: () => string; // generador de códigos de sala (las pruebas fuerzan colisiones)
  diag?: (record: DiagRecord) => void; // registro de diagnóstico para pruebas físicas (DIAG_FILE)
}

/**
 * Registro de diagnóstico de una prueba física (server/main.ts, DIAG_FILE): un objeto por hecho, con
 * la hora del servidor. Salas, jugadores y reclamaciones van con alias (S1, J1, R1) que solo existen en
 * la memoria del servidor: nunca códigos, nombres, identificadores, secretos, direcciones ni
 * coordenadas. Del GPS solo se guardan recuentos, huecos, precisión y antigüedad.
 */
export type DiagRecord = { k: string; at: number } & Record<string, unknown>;

// Cada cuánto se resume el GPS de cada jugador en el registro de diagnóstico.
export const DIAG_GPS_WINDOW_MS = 30_000;

// Campos de los eventos del motor que pasan al diagnóstico. Los identificadores se cambian por alias;
// las horas, por segundos relativos al evento; lo demás se descarta (nombres, configuración con la
// zona, pistas con posiciones).
const DIAG_ID_KEYS: Record<string, string> = { playerId: 'who', hunterId: 'hunter', runnerId: 'runner', hostId: 'host' };
const DIAG_TIME_KEYS = new Set(['countdownEnd', 'headStartEnd', 'gameEnd', 'nextPingAt', 'expiresAt', 'exposedAt']);
// Señales de vida que se pasan al motor como mucho (D-057). Muy por debajo de PRESENCE.awayAfterMs.
const SEEN_EVERY_MS = 5_000;
// Más tiempo que esto entre dos vueltas del despertador (que vuelve cada segundo como mucho) significa que
// el proceso estuvo parado: suspensión del equipo.
const SUSPEND_GAP_MS = 60_000;

const DIAG_PLAIN_KEYS = new Set(['result', 'reason', 'connected', 'away', 'ready', 'teamPref', 'team', 'swapRoles', 'gameNo', 'pingNo', 'via', 'atOffsetMs', 'activeDurationMs', 'radiusM', 'rulesVersion']);

interface GpsWindow {
  from: number;
  ws: number;
  http: number;
  ignored: Record<string, number>;
  lastOkAt: number | null;
  maxGapMs: number;
  acc: number[];
  ageS: number[];
}

/** Quita las coordenadas de los eventos guardados para reanudar (el evento se conserva, sin datos). */
function purgeLocations(entries: OutboxEntry[]): void {
  for (const entry of entries) {
    if (entry.containsLocation) {
      entry.msg = { ...entry.msg, data: { purged: true } };
      entry.containsLocation = false;
    }
  }
}

const median = (xs: number[]): number | null => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null);

// Parámetros técnicos de abuso (no son reglas de juego).
export const RATE = {
  burst: 30, // mensajes seguidos permitidos
  perSecond: 10, // ritmo sostenido
  closeAfterDropped: 200, // mensajes descartados seguidos antes de cortar la conexión
  locMinIntervalMs: 900, // como mucho una lectura por segundo y jugador
  claimMinIntervalMs: 3_000, // reclamaciones de captura: evita sondear distancias a ráfagas
  attemptsPerMinute: 10, // create/join/resume por conexión
  // Salas activas por dirección: HubOptions.maxRoomsPerIp (por defecto 5).
  failuresPerMinutePerIp: 20, // códigos de sala incorrectos por dirección (frena adivinar códigos)
  // Sesiones incorrectas por dirección (resume y /api/loc). Presupuesto aparte y mucho más alto (AF-07):
  // tras un reinicio sin estado guardado, todos los móviles de una misma Wi-Fi fallan a la vez al
  // reanudar, y eso no debe impedirles crear ni unirse a la sala nueva. Adivinar una sesión es inviable
  // (identificador de 72 bits y secreto de 256 bits aleatorios); este límite solo acota el trabajo.
  sessionFailuresPerMinutePerIp: 300,
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
  lastSeenRunAt: Map<string, number>; // última señal de vida pasada al motor (D-057), por jugador
  deleteAt: number | null;
  // Dirección desde la que se creó (solo en memoria, para el límite de salas por dirección; no se
  // guarda en el archivo de estado).
  creatorIp: string | null;
}

interface Client {
  transport: Transport;
  ip: string;
  n: number; // número de conexión (solo para el diagnóstico)
  openedAt: number;
  playerId: string | null;
  tokens: number;
  refilledAt: number;
  dropped: number;
  attempts: number[];
  closed: boolean;
}

export interface ClientHandle {
  receive(text: string): void;
  /** `why`: quién o qué cerró la conexión (ws.ts), solo para el diagnóstico. */
  closed(why?: string): void;
}

// ------------------------------------------------------------ persistencia (opcional)
// Formato del archivo de estado (server/main.ts, STATE_FILE). NUNCA lleva coordenadas de jugadores:
// las lecturas y la última pista se quitan al guardar (se vuelven a llenar con las siguientes
// lecturas). Sí lleva la zona de la partida, que forma parte de la configuración.
export const STATE_VERSION = 1;
// Al restaurar, la numeración de eventos de cada jugador avanza este margen: así cualquier cliente
// acepta la nueva instantánea aunque hubiera visto eventos posteriores al último guardado.
export const RESTORE_SEQ_MARGIN = 100_000;

export interface SavedRoom {
  id: string;
  code: string;
  state: RoomState;
  deleteAt: number | null;
  seqs: Record<string, number>;
  sessions: Record<string, string>; // playerId → hash del secreto (hex); nunca el secreto
  replies: Record<string, [string, ServerResult][]>;
}

export interface SavedHub {
  version: typeof STATE_VERSION;
  savedAt: number;
  rooms: SavedRoom[];
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
  private readonly rateNow: () => number;
  private readonly wallNow: () => number;
  private readonly opts: Required<Omit<HubOptions, 'now' | 'rateNow' | 'wallNow' | 'log' | 'generateCode' | 'diag'>>;
  private readonly log: (line: string) => void;
  private readonly diag: ((record: DiagRecord) => void) | null;
  private readonly aliases = new Map<string, string>(); // id de sala, jugador o reclamación → alias
  private readonly aliasCounters = new Map<string, number>();
  private readonly gps = new Map<string, GpsWindow>(); // por jugador, solo con diagnóstico
  private nextGpsAt = 0;
  private connectionCount = 0;
  private readonly makeCode: () => string;
  private readonly rooms = new Map<string, Room>();
  private readonly codes = new Map<string, string>();
  private readonly sessions = new Map<string, { roomId: string; hash: Buffer }>();
  private readonly connections = new Map<string, Client>();
  private lastWall: number | null = null;
  // Avisos «removed» retenidos mientras se procesa un comando de un cliente (ver `command`).
  private removalNotices: Client[] | null = null;
  private readonly clients = new Set<Client>();
  private readonly failures = new Map<string, number[]>(); // códigos de sala incorrectos
  private readonly sessionFailures = new Map<string, number[]>(); // sesiones incorrectas
  private readonly accepted = { ws: 0, http: 0 }; // lecturas registradas por el motor, por canal
  private nextPositionsAt: number;
  private changes = 0; // aumenta con cada cambio de salas o sesiones (para saber cuándo guardar)

  constructor(options: HubOptions = {}) {
    this.now = options.now ?? Date.now;
    this.rateNow = options.rateNow ?? this.now;
    this.wallNow = options.wallNow ?? Date.now;
    this.log = options.log ?? (() => {});
    this.diag = options.diag ?? null;
    this.makeCode = options.generateCode ?? generateCode;
    this.opts = {
      positionsIntervalMs: options.positionsIntervalMs ?? 5_000,
      maxRooms: options.maxRooms ?? 100,
      maxRoomsPerIp: options.maxRoomsPerIp ?? 5,
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
      n: ++this.connectionCount,
      openedAt: this.now(),
      playerId: null,
      tokens: RATE.burst,
      refilledAt: this.rateNow(),
      dropped: 0,
      attempts: [],
      closed: false,
    };
    this.clients.add(client);
    this.record('ws_open', () => ({ conn: client.n }));
    return {
      receive: (text) => this.receive(client, text),
      closed: (why) => this.disconnected(client, why),
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

  /** Número de cambios hasta ahora: si no ha variado desde el último guardado, no hace falta guardar. */
  revision(): number {
    return this.changes;
  }

  /** Copia guardable del estado: salas, códigos, hashes de sesión y respuestas, sin coordenadas. */
  exportState(): SavedHub {
    const rooms: SavedRoom[] = [];
    for (const room of this.rooms.values()) {
      const state = structuredClone(room.state);
      for (const p of Object.values(state.players)) p.samples = [];
      state.lastPing = null;
      const sessions: Record<string, string> = {};
      for (const [pid, s] of this.sessions) if (s.roomId === room.id) sessions[pid] = s.hash.toString('hex');
      const seqs: Record<string, number> = {};
      for (const [pid, box] of room.outboxes) seqs[pid] = box.seq;
      const replies: Record<string, [string, ServerResult][]> = {};
      for (const [pid, map] of room.replies) replies[pid] = [...map.entries()];
      rooms.push({ id: room.id, code: room.code, state, deleteAt: room.deleteAt, seqs, sessions, replies });
    }
    return { version: STATE_VERSION, savedAt: this.now(), rooms };
  }

  /**
   * Restaura un estado guardado (al arrancar, antes de aceptar conexiones). Todos los jugadores quedan
   * desconectados hasta que su móvil reanude la sesión. Devuelve cuántas salas se han restaurado; las
   * mal formadas o con un código ya en uso se ignoran.
   */
  importState(data: unknown): number {
    const saved = data as Partial<SavedHub> | null;
    if (!saved || saved.version !== STATE_VERSION || !Array.isArray(saved.rooms)) return 0;
    const now = this.now();
    let restored = 0;
    for (const r of saved.rooms) {
      if (!r || typeof r.id !== 'string' || typeof r.code !== 'string' || !r.state || typeof r.state !== 'object') continue;
      if (this.rooms.has(r.id) || this.codes.has(r.code)) continue;
      const state = r.state;
      for (const p of Object.values(state.players ?? {})) {
        p.samples = [];
        if (p.connected) {
          p.connected = false;
          p.disconnectedSince = now;
        }
        // D-057: tras un reinicio, el periodo de gracia empieza de cero para todos (nadie queda fuera
        // por el tiempo que el servidor estuvo parado).
        p.lastSeenAt = now;
        p.away = false;
        p.leftReason ??= p.status === 'left' ? 'left' : null;
      }
      state.lastPing = null;
      const room: Room = {
        id: r.id,
        code: r.code,
        state,
        outboxes: new Map(Object.entries(r.seqs ?? {}).map(([pid, seq]) => [pid, { seq: Number(seq) + RESTORE_SEQ_MARGIN, entries: [] }])),
        replies: new Map(Object.entries(r.replies ?? {}).map(([pid, list]) => [pid, new Map(list)])),
        lastClaimAt: new Map(),
        lastLocAt: new Map(),
        lastSeenRunAt: new Map(),
        deleteAt: typeof r.deleteAt === 'number' ? r.deleteAt : null,
        creatorIp: null,
      };
      this.rooms.set(room.id, room);
      if (room.deleteAt === null) this.codes.set(room.code, room.id);
      for (const [pid, hex] of Object.entries(r.sessions ?? {})) {
        if (typeof hex === 'string' && /^[0-9a-f]{64}$/.test(hex)) this.sessions.set(pid, { roomId: room.id, hash: Buffer.from(hex, 'hex') });
      }
      restored++;
    }
    if (restored) this.changes++;
    this.log(`state_restored rooms=${restored}`);
    return restored;
  }

  /** Estado interno de una sala (solo para pruebas y diagnóstico local; nunca se envía). */
  roomStateByCode(code: string): RoomState | undefined {
    const id = this.codes.get(code);
    return id ? this.rooms.get(id)?.state : undefined;
  }

  private disconnected(client: Client, why = 'unknown'): void {
    if (client.closed) return;
    client.closed = true;
    this.clients.delete(client);
    const pid = client.playerId;
    this.record('ws_close', () => {
      const room = pid ? this.roomOf(pid) : undefined;
      return { conn: client.n, why, secs: Math.round((this.now() - client.openedAt) / 1_000), ...(room && pid ? this.where(room, pid) : {}) };
    });
    if (pid && this.connections.get(pid) === client) {
      this.connections.delete(pid);
      const room = this.roomOf(pid);
      if (room) this.run(room, pid, { type: 'connection', connected: false });
    }
  }

  private send(client: Client, msg: Record<string, unknown>): void {
    if (msg.t === 'error') {
      this.record('error_sent', () => {
        const room = client.playerId ? this.roomOf(client.playerId) : undefined;
        return { conn: client.n, error: msg.error, ...(room && client.playerId ? this.where(room, client.playerId) : {}) };
      });
    }
    if (!client.closed) client.transport.send(JSON.stringify(msg));
  }

  private allow(client: Client): boolean {
    const now = this.rateNow();
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

  /** Fallos de la dirección en el último minuto, en el registro dado (códigos o sesiones). */
  private tooManyFailures(ip: string, log = this.failures, limit: number = RATE.failuresPerMinutePerIp): boolean {
    const now = this.now();
    const recentFailures = (log.get(ip) ?? []).filter((t) => t > now - 60_000);
    log.set(ip, recentFailures);
    return recentFailures.length >= limit;
  }

  private recordFailure(ip: string, log = this.failures): void {
    const list = log.get(ip) ?? [];
    list.push(this.now());
    log.set(ip, list);
  }

  /** Sesión incorrecta (resume o /api/loc): 'rate_limited' si la dirección ya agotó su presupuesto. */
  private sessionFailure(ip: string): 'bad_session' | 'rate_limited' {
    if (this.tooManyFailures(ip, this.sessionFailures, RATE.sessionFailuresPerMinutePerIp)) return 'rate_limited';
    this.recordFailure(ip, this.sessionFailures);
    return 'bad_session';
  }

  private countAttempt(client: Client): boolean {
    const now = this.now();
    client.attempts = client.attempts.filter((t) => t > now - 60_000);
    if (client.attempts.length >= RATE.attemptsPerMinute) return false;
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
    // Cualquier mensaje de la aplicación es una señal de vida. Los pong de la pila de red no cuentan: los
    // contesta el navegador aunque la página esté congelada.
    if (client.playerId) this.seen(client.playerId);
    switch (msg.t) {
      case 'ping':
        this.send(client, { t: 'pong', c: msg.c, s: this.now() });
        return;
      case 'create':
      case 'join':
      case 'resume':
        // El límite de fallos por dirección solo frena las uniones (lo único que permite adivinar: el
        // código de 6 caracteres). Crear no adivina nada (lo limitan maxRoomsPerIp y el cubo de mensajes) y
        // la reanudación se autentica primero, como /api/loc (V-07): los fallos ajenos desde la misma Wi-Fi
        // no dejan al grupo sin poder crear la sala nueva, entrar en ella ni reanudar (AF-07).
        if ((msg.t === 'join' && this.tooManyFailures(client.ip)) || !this.countAttempt(client)) {
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
    // Una sola dirección no puede acaparar la capacidad del servidor abriendo conexiones nuevas: cada
    // conexión puede crear una sala, así que el límite va por dirección (las salas cerradas no cuentan).
    let fromIp = 0;
    for (const r of this.rooms.values()) if (r.creatorIp === client.ip && r.deleteAt === null) fromIp++;
    if (fromIp >= this.opts.maxRoomsPerIp) return this.send(client, { t: 'error', error: 'too_many_rooms' });
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
    const code = this.uniqueCode();
    const room: Room = {
      id: roomId,
      code,
      state: step.state,
      outboxes: new Map(),
      replies: new Map(),
      lastClaimAt: new Map(),
      lastLocAt: new Map(),
      lastSeenRunAt: new Map(),
      deleteAt: null,
      creatorIp: client.ip,
    };
    this.rooms.set(roomId, room);
    this.codes.set(code, roomId);
    this.bind(client, room, playerId);
    this.log(`room_created rooms=${this.rooms.size}`);
    this.record('session', () => ({ how: 'create', conn: client.n, ...this.where(room, playerId) }));
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
    this.record('session', () => ({ how: 'join', conn: client.n, ...this.where(room, playerId) }));
  }

  private resume(client: Client, msg: Extract<ClientMessage, { t: 'resume' }>): void {
    const room = this.authenticate(msg.playerId, msg.secret);
    if (!room) return this.send(client, { t: 'error', error: this.sessionFailure(client.ip) });
    if (client.playerId && client.playerId !== msg.playerId) return this.send(client, { t: 'error', error: 'already_in_room' });
    const previous = this.connections.get(msg.playerId);
    if (previous && previous !== client) {
      this.record('replaced', () => ({ conn: previous.n, by: client.n, ...this.where(room, msg.playerId) }));
      previous.playerId = null; // la conexión antigua ya no representa a este jugador
      previous.transport.close(4001, 'replaced');
    }
    client.playerId = msg.playerId;
    this.connections.set(msg.playerId, client);
    this.send(client, { t: 'welcome', playerId: msg.playerId, code: room.code });
    const box = this.outbox(room, msg.playerId);
    const oldest = box.entries[0]?.seq ?? box.seq + 1;
    const replay = msg.lastSeq >= oldest - 1 && msg.lastSeq <= box.seq;
    if (replay) {
      for (const entry of box.entries) if (entry.seq > msg.lastSeq) this.send(client, entry.msg);
    }
    this.record('session', () => ({
      how: 'resume',
      conn: client.n,
      // Eventos perdidos que se reenvían; null si eran demasiados (o de antes de un reinicio): solo instantánea.
      replayed: replay ? box.seq - msg.lastSeq : null,
      ...this.where(room, msg.playerId),
    }));
    this.sendSnapshot(room, msg.playerId);
    this.run(room, msg.playerId, { type: 'connection', connected: true });
  }

  private bind(client: Client, room: Room, playerId: string): void {
    const secret = randomBytes(32).toString('base64url');
    this.sessions.set(playerId, { roomId: room.id, hash: hash(secret) });
    this.changes++;
    client.playerId = playerId;
    this.connections.set(playerId, client);
    this.send(client, { t: 'welcome', playerId, code: room.code, secret });
    this.sendSnapshot(room, playerId);
  }

  private command(client: Client, msg: Extract<ClientMessage, { t: 'cmd' }>): void {
    // El resultado de un comando llega a quien lo envió antes que el aviso «removed» que ese mismo
    // comando provoque (p. ej., «leave» en la sala de espera o en el final): el cliente descarta sus
    // comandos pendientes al recibir «removed» (V-16) y así no pierde la respuesta del suyo.
    const outer = this.removalNotices === null;
    if (outer) this.removalNotices = [];
    try {
      this.applyClientCommand(client, msg);
    } finally {
      if (outer) {
        const notices = this.removalNotices ?? [];
        this.removalNotices = null;
        for (const conn of notices) this.send(conn, { t: 'error', error: 'removed' });
      }
    }
  }

  private applyClientCommand(client: Client, msg: Extract<ClientMessage, { t: 'cmd' }>): void {
    const pid = client.playerId;
    const room = pid ? this.roomOf(pid) : undefined;
    if (!pid || !room) return this.send(client, { t: 'error', error: 'no_session' });
    const replies = room.replies.get(pid) ?? new Map<string, ServerResult>();
    room.replies.set(pid, replies);
    const cached = replies.get(msg.id);
    if (cached) return this.send(client, { t: 'result', id: msg.id, result: cached });

    const cmd = msg.cmd as Command;
    let result: ServerResult;
    const isObject = typeof cmd === 'object' && cmd !== null && !Array.isArray(cmd);
    const type = isObject ? (cmd as { type?: unknown }).type : undefined;
    if (!isObject) {
      // `cmd` nulo, ausente o que no es un objeto: el motor no puede ni leer su tipo (V-18).
      result = { ok: false, error: 'invalid_command', detail: 'cmd' };
    } else if (type === 'join' || type === 'connection' || type === 'seen' || type === 'location') {
      // join/connection/seen los genera el servidor; la ubicación entra por `loc` (con hora del servidor).
      result = { ok: false, error: 'forbidden' };
    } else if (type === 'new_code') {
      // El código de sala es del servidor, no del motor: se cambia aquí.
      result = this.newCode(room, pid, cmd);
    } else if (type === 'claim_tag' && this.now() - (room.lastClaimAt.get(pid) ?? Number.NEGATIVE_INFINITY) < RATE.claimMinIntervalMs) {
      result = { ok: false, error: 'rate_limited' };
    } else {
      if (type === 'claim_tag') room.lastClaimAt.set(pid, this.now());
      result = this.run(room, pid, cmd);
    }
    replies.set(msg.id, result);
    while (replies.size > this.opts.replyLimit) replies.delete(replies.keys().next().value as string);
    this.record('cmd', () => {
      const c = (typeof cmd === 'object' && cmd !== null ? cmd : {}) as Record<string, unknown>;
      const target = [c.runnerId, c.targetId, c.hunterId].find((v) => typeof v === 'string') as string | undefined;
      return {
        ...this.where(room, pid),
        type: typeof type === 'string' ? type.slice(0, 32) : 'invalid',
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
        ...(target ? { target: room.state.players[target] ? this.playerAlias(room, target) : 'unknown' } : {}),
        ...(typeof c.accept === 'boolean' ? { accept: c.accept } : {}),
      };
    });
    this.send(client, { t: 'result', id: msg.id, result });
  }

  /**
   * Plan Maestro §2.2: el anfitrión puede cambiar el código de una sala privada, y el anterior deja de
   * servir para entrar. Solo en la sala de espera (después no se puede entrar de todos modos). Los
   * jugadores que ya están dentro reciben el nuevo código; sus sesiones no cambian.
   */
  private newCode(room: Room, pid: string, cmd: unknown): ServerResult {
    if (Object.keys(cmd as object).length !== 1) return { ok: false, error: 'invalid_command', detail: 'type' };
    if (room.state.hostId !== pid) return { ok: false, error: 'forbidden' };
    if (room.state.phase !== 'LOBBY') return { ok: false, error: 'wrong_phase' };
    // Nunca coincide con el de otra sala activa ni con el actual de esta (los dos están en `codes`).
    const code = this.uniqueCode();
    this.codes.delete(room.code);
    room.code = code;
    this.codes.set(code, room.id);
    this.changes++;
    for (const id of room.state.playerOrder) {
      const conn = this.connections.get(id);
      if (conn && room.state.players[id]?.status !== 'left') this.send(conn, { t: 'code', code });
    }
    this.log('room_code_changed');
    return { ok: true, data: { code } };
  }

  /** Código que no usa ninguna sala activa (se reintenta ante una colisión). */
  private uniqueCode(): string {
    let code = this.makeCode();
    while (this.codes.has(code)) code = this.makeCode();
    return code;
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
    // Primero la sesión: el límite de fallos por dirección solo frena a quien no tiene una válida. Si se
    // comprobara antes, los fallos de otros desde la misma dirección (misma Wi-Fi, CGNAT del operador)
    // dejarían sin ubicación a todo el grupo (V-07). Adivinar una sesión sigue siendo inviable (secreto
    // de 32 bytes aleatorios) y los intentos con sesión inválida siguen limitados por dirección, con el
    // presupuesto de sesiones (no el de códigos: AF-07).
    const room = this.authenticate(upload.playerId, upload.secret);
    if (!room) {
      const outcome = this.sessionFailure(ip);
      if (outcome === 'bad_session') this.record('loc_http_refused', () => ({ outcome }));
      return outcome;
    }
    // El servicio nativo envía con la pantalla bloqueada: es la aplicación, viva, aunque no haya WebSocket.
    this.seen(upload.playerId);
    return this.applyLocation(room, upload.playerId, upload, 'http');
  }

  private applyLocation(room: Room, pid: string, msg: LocationReading, channel: 'ws' | 'http'): UploadOutcome {
    const now = this.now();
    const phase = room.state.phase;
    const self = room.state.players[pid];
    // Con diagnóstico, cada lectura cuenta en el resumen de GPS del jugador con su motivo.
    const note = (outcome: UploadOutcome, reason: string): UploadOutcome => {
      if (this.diag) this.noteReading(pid, channel, msg, outcome === 'accepted' ? null : reason);
      return outcome;
    };
    if (!self || self.status !== 'active' || phase === 'LOBBY' || phase === 'FINISHED' || phase === 'CANCELLED') return note('gone', 'gone');
    if (now - (room.lastLocAt.get(pid) ?? Number.NEGATIVE_INFINITY) < RATE.locMinIntervalMs) return note('ignored', 'too_soon'); // demasiado seguidas
    if (msg.age < 0 || msg.age > PROTOCOL.maxAgeMs) return note('ignored', 'too_old');
    room.lastLocAt.set(pid, now);
    // La hora de la medida se calcula con el reloj del servidor a partir de la antigüedad que mide el
    // móvil con su reloj monótono: nunca se mezcla con la hora de pared del teléfono.
    const result = this.run(room, pid, {
      type: 'location',
      sample: { lat: msg.lat, lng: msg.lng, accuracyM: msg.acc, measuredAt: now - msg.age, ...(msg.mock === undefined ? {} : { isMock: msg.mock }) },
    });
    if (!result.ok) return note('ignored', result.error); // p. ej., cuenta atrás o lectura no válida
    if ((result.data as { accepted?: boolean } | undefined)?.accepted !== true) return note('ignored', 'not_newer');
    this.accepted[channel]++;
    return note('accepted', '');
  }

  // ------------------------------------------------------------ motor y distribución

  /**
   * D-057: pasa al motor una señal de vida del jugador. Como mucho una cada SEEN_EVERY_MS (el motor cuenta
   * 30 s para «sin conexión»), salvo si estaba marcado «sin conexión»: entonces vuelve al momento.
   * Las señales intermedias no pasan por el motor, pero su hora no se pierde (V-17): se anota en
   * `lastSeenAt`, que es lo mismo que haría el motor con un jugador que no está «sin conexión» (sin
   * eventos ni otro cambio). Así los plazos de 30 s y 5 min cuentan desde la última señal real.
   */
  private seen(playerId: string): void {
    const room = this.roomOf(playerId);
    const p = room?.state.players[playerId];
    if (!room || !p || p.status !== 'active' || (room.state.phase !== 'HEAD_START' && room.state.phase !== 'ACTIVE')) return;
    const now = this.now();
    if (!p.away && now - (room.lastSeenRunAt.get(playerId) ?? Number.NEGATIVE_INFINITY) < SEEN_EVERY_MS) {
      // Antes de anotarla, vencen los plazos ya cumplidos (como haría el motor al recibir la señal): una
      // señal que llega tarde no salva un plazo que ya había vencido.
      this.checkSuspended();
      const due = nextDeadline(room.state);
      if (due !== null && due <= now) this.commit(room, tick(room.state, now));
      const q = room.state.players[playerId];
      if (q && q.status === 'active' && !q.away && (q.lastSeenAt ?? Number.NEGATIVE_INFINITY) < now) q.lastSeenAt = now;
      else if (q?.away) this.seen(playerId); // el plazo acaba de vencer: vuelve al momento, por el motor
      return;
    }
    room.lastSeenRunAt.set(playerId, now);
    this.run(room, playerId, { type: 'seen' });
  }

  private roomOf(playerId: string): Room | undefined {
    const session = this.sessions.get(playerId);
    return session ? this.rooms.get(session.roomId) : undefined;
  }

  private run(room: Room, actorId: string, cmd: Command): CommandResult {
    this.checkSuspended();
    const step = applyCommand(room.state, actorId, cmd, this.now());
    // Una señal de vida que no cambia nada visible no obliga a guardar el estado en disco.
    this.commit(room, step, cmd.type === 'seen' && step.events.length === 0);
    if (cmd.type !== 'location' && cmd.type !== 'seen') {
      this.log(`cmd type=${cmd.type} ${step.result.ok ? 'ok' : `error=${step.result.error}`}`);
    }
    return step.result;
  }

  private commit(room: Room, step: Step, quiet = false): void {
    const phaseBefore = room.state.phase;
    const playersBefore = room.state.players;
    room.state = step.state;
    if (!quiet) this.changes++;
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
        if (this.removalNotices) this.removalNotices.push(conn); // tras el resultado del comando en curso
        else this.send(conn, { t: 'error', error: 'removed' });
      }
    }

    // Quien acaba de quedar fuera de la partida (periodo de gracia de D-057, o salió) ya no juega: al
    // reanudar no recibe las coordenadas de las pistas que se emitieron cuando aún jugaba (V-19). Se
    // reenvían sin ellas, como al terminar, para no dejar huecos en su `seq`.
    for (const pid of room.state.playerOrder) {
      if (room.state.players[pid]?.status === 'left' && playersBefore[pid]?.status !== 'left') {
        const box = room.outboxes.get(pid);
        if (box) purgeLocations(box.entries);
      }
    }

    if (this.diag) this.diagnoseStep(room, phaseBefore, step);

    const phase = room.state.phase;
    if (phase === 'FINISHED' || phase === 'CANCELLED') {
      // Al terminar no queda ninguna coordenada en los eventos guardados para reanudar.
      for (const box of room.outboxes.values()) purgeLocations(box.entries);
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
    // D-057: si el propio servidor ha estado parado (portátil suspendido), nadie ha podido dar señales
    // mientras tanto. Como tras un reinicio, el periodo de gracia empieza de cero para todos.
    this.checkSuspended();
    for (const room of [...this.rooms.values()]) {
      if (room.deleteAt !== null) {
        if (room.deleteAt <= now) this.deleteRoom(room);
        continue;
      }
      const d = nextDeadline(room.state);
      if (d !== null && d <= now) this.commit(room, tick(room.state, now));
    }
    if (this.diag && now >= this.nextGpsAt) {
      for (const room of this.rooms.values()) this.flushGps(room);
      this.nextGpsAt = now + DIAG_GPS_WINDOW_MS;
    }
    if (now >= this.nextPositionsAt) {
      this.broadcastPositions(now);
      this.nextPositionsAt = now + this.opts.positionsIntervalMs;
      // Limpieza del registro de fallos por dirección: solo importa el último minuto.
      for (const log of [this.failures, this.sessionFailures])
        for (const [ip, list] of log) if (!list.some((t) => t > now - 60_000)) log.delete(ip);
    }
  }

  private broadcastPositions(now: number): void {
    for (const room of this.rooms.values()) {
      if (room.state.phase !== 'HEAD_START' && room.state.phase !== 'ACTIVE') continue;
      for (const pid of room.state.playerOrder) {
        const conn = this.connections.get(pid);
        if (!conn) continue;
        const positions = visiblePositions(room.state, pid, now);
        // La lista vacía también se envía a quien juega o mira (capturado): si no, su móvil se quedaba
        // con la última lista y seguía dibujando a alguien que ya no le corresponde (un compañero
        // capturado, un fugitivo que vuelve a la zona). A quien ha salido no se le envía nada.
        const status = room.state.players[pid]?.status;
        if (positions.length > 0 || status === 'active' || status === 'captured') this.send(conn, { t: 'positions', at: now, positions });
      }
    }
  }

  private deleteRoom(room: Room): void {
    this.record('room_deleted', () => this.where(room));
    for (const pid of room.state.playerOrder) {
      this.gps.delete(pid);
      this.aliases.delete(pid);
    }
    this.aliases.delete(room.id);
    this.aliasCounters.delete(room.id);
    this.rooms.delete(room.id);
    this.changes++;
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

  // ------------------------------------------------------------ diagnóstico (DIAG_FILE)

  /**
   * Antes de procesar nada (despertador, comando, lectura): tras una suspensión, el primer evento que
   * atiende Node puede ser una E/S y no el despertador. Sin esto, ese comando vencería los plazos de
   * todos antes de perdonarlos.
   */
  private checkSuspended(): void {
    const wall = this.wallNow();
    if (this.lastWall !== null && wall - this.lastWall > SUSPEND_GAP_MS) this.forgiveAbsence(this.now(), wall - this.lastWall);
    this.lastWall = wall;
  }

  private forgiveAbsence(now: number, gapMs: number): void {
    let n = 0;
    for (const room of this.rooms.values()) {
      if (room.state.phase !== 'HEAD_START' && room.state.phase !== 'ACTIVE') continue;
      for (const p of Object.values(room.state.players)) {
        if (p.status !== 'active') continue;
        p.lastSeenAt = now;
        n++;
      }
    }
    if (n) this.changes++;
    this.log(`server_was_suspended players=${n}`);
    // En el registro de la prueba física (antes solo iba a la consola): una caída de todos a la vez se
    // distingue así de un fallo de los móviles (incidente del 31/10/2026: portátil suspendido 3 h).
    this.record('server_suspended', () => ({ gapS: Math.round(gapMs / 1000), players: n }));
  }

  /**
   * Cuenta como señal de vida de cada jugador con el WebSocket abierto. Solo para pruebas y simulaciones
   * que adelantan el reloj a saltos: en la realidad, la aplicación lo hace sola con su ping cada 10 s.
   * `except`: jugadores que no dan señal (el simulador congela así una pestaña con el socket abierto).
   */
  keepAliveConnected(except: ReadonlySet<string> = new Set()): void {
    for (const pid of this.connections.keys()) if (!except.has(pid)) this.seen(pid);
  }

  /** Escribe ya el resumen de GPS pendiente de cada sala (al parar el servidor). */
  flushDiagnostics(): void {
    if (this.diag) for (const room of this.rooms.values()) this.flushGps(room);
  }

  /** Escribe un hecho en el registro de diagnóstico. Los campos solo se calculan si está activo. */
  private record(k: string, fields: () => Record<string, unknown> = () => ({})): void {
    if (this.diag) this.diag({ k, at: this.now(), ...fields() });
  }

  private alias(id: string, scope: string, prefix: string): string {
    let alias = this.aliases.get(id);
    if (!alias) {
      const n = (this.aliasCounters.get(scope) ?? 0) + 1;
      this.aliasCounters.set(scope, n);
      alias = `${prefix}${n}`;
      this.aliases.set(id, alias);
    }
    return alias;
  }

  /** J1, J2… por orden de entrada en cada sala (quien la crea es J1). */
  private playerAlias(room: Room, pid: string): string {
    return this.alias(pid, room.id, 'J');
  }

  private where(room: Room, pid?: string): Record<string, unknown> {
    return {
      room: this.alias(room.id, '', 'S'),
      game: room.state.gameNo,
      phase: room.state.phase,
      ...(pid ? { player: this.playerAlias(room, pid) } : {}),
    };
  }

  private noteReading(pid: string, channel: 'ws' | 'http', msg: LocationReading, ignored: string | null): void {
    const now = this.now();
    let w = this.gps.get(pid);
    if (!w) {
      w = { from: now, ws: 0, http: 0, ignored: {}, lastOkAt: null, maxGapMs: 0, acc: [], ageS: [] };
      this.gps.set(pid, w);
    }
    if (ignored !== null) {
      w.ignored[ignored] = (w.ignored[ignored] ?? 0) + 1;
      return;
    }
    w[channel]++;
    if (w.lastOkAt !== null) w.maxGapMs = Math.max(w.maxGapMs, now - w.lastOkAt);
    w.lastOkAt = now;
    w.acc.push(Math.round(msg.acc));
    w.ageS.push(Math.round(msg.age / 1_000));
  }

  /**
   * Resumen del GPS de cada jugador de la sala desde el anterior: lecturas aceptadas por canal, las
   * ignoradas y su motivo, el mayor hueco entre lecturas aceptadas, cuánto hace de la última, y la
   * precisión (m) y la antigüedad (s) típicas y peores. Sale también para quien juega sin enviar nada
   * (justo lo que hay que ver).
   */
  private flushGps(room: Room, phase: string = room.state.phase): void {
    const now = this.now();
    const playing = phase === 'HEAD_START' || phase === 'ACTIVE';
    for (const pid of room.state.playerOrder) {
      const w = this.gps.get(pid);
      if (!w) {
        this.gps.set(pid, { from: now, ws: 0, http: 0, ignored: {}, lastOkAt: null, maxGapMs: 0, acc: [], ageS: [] });
        continue; // su ventana empieza ahora
      }
      const counted = w.ws + w.http + Object.keys(w.ignored).length > 0;
      const expected = playing && room.state.players[pid]?.status === 'active';
      if (!counted && (!expected || now - w.from < 1_000)) {
        w.from = now; // nada que contar (fuera de juego, o ya resumido en este instante)
        continue;
      }
      this.record('gps', () => ({
        ...this.where(room, pid),
        phase, // la fase que cubre el resumen (en un cambio de fase, la anterior)
        secs: Math.round((now - w.from) / 1_000),
        ws: w.ws,
        http: w.http,
        ignored: { ...w.ignored },
        maxGapS: Math.round(w.maxGapMs / 1_000),
        sinceLastS: w.lastOkAt === null ? null : Math.round((now - w.lastOkAt) / 1_000),
        accP50: median(w.acc),
        accMax: w.acc.length ? Math.max(...w.acc) : null,
        ageP50: median(w.ageS),
        ageMax: w.ageS.length ? Math.max(...w.ageS) : null,
        connected: this.connections.has(pid),
      }));
      Object.assign(w, { from: now, ws: 0, http: 0, ignored: {}, maxGapMs: 0, acc: [], ageS: [] });
    }
  }

  /** Eventos del motor (sin datos personales ni posiciones) y cambios de fase, con quién los recibe. */
  private diagnoseStep(room: Room, phaseBefore: string, step: Step): void {
    for (const e of step.events) {
      this.record('event', () => {
        const out: Record<string, unknown> = { ...this.where(room), type: e.type };
        if (e.audience.kind === 'players') out.to = e.audience.ids.map((id) => this.playerAlias(room, id));
        if (e.containsLocation) return out; // p. ej., la pista con posiciones: solo que ha ocurrido
        for (const [key, v] of Object.entries(e.data)) {
          if (key in DIAG_ID_KEYS) out[DIAG_ID_KEYS[key]!] = typeof v === 'string' ? this.playerAlias(room, v) : null;
          else if (key === 'claimId' && typeof v === 'string') out.claim = this.alias(v, `${room.id}:claims`, 'R');
          else if (DIAG_TIME_KEYS.has(key) && typeof v === 'number') out[`${key}InS`] = Math.round((v - e.at) / 100) / 10;
          else if (DIAG_PLAIN_KEYS.has(key) && ['string', 'number', 'boolean'].includes(typeof v)) out[key] = v;
          else if (key === 'outcome' && v && typeof v === 'object') {
            const o = v as { winner?: unknown; cause?: unknown };
            Object.assign(out, { winner: o.winner ?? null, cause: o.cause ?? null });
          } else if (key === 'captures' && Array.isArray(v)) out.captures = v.length;
          else if (key === 'flags' && v && typeof v === 'object') {
            out.flags = Object.fromEntries(Object.entries(v as Record<string, string[]>).map(([id, f]) => [this.playerAlias(room, id), f]));
          } else if (key === 'config' && v && typeof v === 'object') {
            const c = v as { durationMs?: number; headStartMs?: number; pingIntervalMs?: number; zone?: { radiusM?: number }[] };
            out.config = {
              durationMin: (c.durationMs ?? 0) / 60_000,
              headStartMin: (c.headStartMs ?? 0) / 60_000,
              pingEveryMin: (c.pingIntervalMs ?? 0) / 60_000,
              radiusM: c.zone?.[c.zone.length - 1]?.radiusM ?? null,
            };
          }
        }
        return out;
      });
    }
    if (room.state.phase !== phaseBefore) {
      this.flushGps(room, phaseBefore);
      this.record('phase', () => {
        const online: string[] = [];
        const offline: string[] = [];
        for (const pid of room.state.playerOrder) {
          if (room.state.players[pid]?.leftRoom) continue;
          (this.connections.has(pid) ? online : offline).push(this.playerAlias(room, pid));
        }
        // online: les llega la nueva fase en ese momento; offline: la verán al reconectar.
        return { ...this.where(room), from: phaseBefore, online, offline };
      });
    }
  }
}
