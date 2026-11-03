// Simulación local de una partida de THE OUTRUN con 10 participantes (herramienta de desarrollo, no forma
// parte del juego).
//
// REAL: el servidor (server/main.ts y server/hub.ts, el mismo código que en una partida), el motor y sus
// reglas (engine/src), el protocolo WebSocket y la capa de red del cliente (mobile/www/js/net.js): cada
// participante es un GameConnection con su propio WebSocket, y quien juega desde la interfaz usa la app real.
// SIMULADO: el GPS de los 10 (coordenadas sintéticas alrededor del punto de referencia de las pruebas, no la
// ubicación de nadie), las decisiones de los bots y el reloj del servidor (se puede pausar, acelerar y
// adelantar). Ninguna acción salta las reglas: los bots solo envían lecturas y comandos que el motor valida.
import { performance } from 'node:perf_hooks';
import { distanceM, offsetM } from '../../engine/src/geo.ts';
import { mulberry32 } from '../../engine/src/rng.ts';
import { visiblePositions } from '../../engine/src/view.ts';
import { visibleZonePlan } from '../../engine/src/zone.ts';
import { GameConnection } from '../../mobile/www/js/net.js';
import { startServer } from '../../server/main.ts';

// Punto de referencia de las pruebas del motor (fixture ya existente; no es la ubicación de nadie).
export const CENTER = Object.freeze({ lat: 40.4153, lng: -3.6845 });
export const ZONE_RADIUS_M = 400;
export const NAMES = Object.freeze(Array.from({ length: 10 }, (_, i) => `AVATAR_${String(i + 1).padStart(2, '0')}`));
export const HOST_NAME = NAMES[0];
export const MODES = Object.freeze(['classic', 'infection', 'fox_hunt']);
export const SPEEDS = Object.freeze([1, 2, 5, 10, 20]);
const MINUTE = 60_000;
const TICK_MS = 250; // cada cuánto deciden los bots (tiempo real)
const LOC_EVERY_MS = 4_000; // cada cuánto envía su lectura cada participante (tiempo de juego)
const ACCURACY_M = 6;
const JUMP_STEP_MS = 5_000; // «Avanzar el tiempo» va a pasos de 5 s: nadie deja de dar señal por el salto
const LOG_LIMIT = 400;
// Vista física simulada: a menos de esto, un cazador VE al fugitivo (en la calle se ve a quien está cerca;
// no es información del juego). Es la única vez que un bot usa la posición real de otro.
export const SIGHT_M = 35;
const RECLAIM_AFTER_MS = 45_000; // no vuelve a reclamar al mismo fugitivo hasta pasado este tiempo

/**
 * Partida de la simulación: los valores mínimos que admite el motor, para ver pistas a menudo. `game` cambia
 * el radio, la duración o activa la zona dinámica (p. ej., la grabación promocional); sin él, como siempre.
 */
export function simConfig(mode, { radiusM = ZONE_RADIUS_M, durationMs = 20 * MINUTE, dynamicZone = false } = {}) {
  return {
    mode,
    durationMs,
    headStartMs: 2 * MINUTE,
    pingIntervalMs: 2 * MINUTE,
    zone: [{ fromOffsetMs: 0, center: { ...CENTER }, radiusM }],
    ...(dynamicZone ? { dynamicZone: true } : {}),
    meetingPoint: { ...CENTER },
    safetyChecklistConfirmed: true,
  };
}

/**
 * Reloj del servidor de la simulación. Empieza en la hora real; se puede pausar, acelerar y adelantar.
 * `real` es el reloj monótono (las pruebas lo sustituyen).
 */
export class SimClock {
  constructor({ start = Date.now(), real = () => performance.now() } = {}) {
    this.real = real;
    this.base = start;
    this.at = real();
    this.speed = 1;
    this.paused = false;
  }
  now() {
    return this.paused ? this.base : this.base + (this.real() - this.at) * this.speed;
  }
  #rebase() {
    this.base = this.now();
    this.at = this.real();
  }
  setSpeed(speed) {
    if (!SPEEDS.includes(speed)) throw new Error('speed');
    this.#rebase();
    this.speed = speed;
  }
  pause() {
    this.#rebase();
    this.paused = true;
  }
  resume() {
    this.at = this.real();
    this.paused = false;
  }
  advance(ms) {
    this.#rebase();
    this.base += ms;
  }
  info() {
    return { now: this.now(), speed: this.speed, paused: this.paused };
  }
}

function memoryStorage(seed = []) {
  const m = new Map(seed);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), entries: () => [...m] };
}

const TEXT = {
  classic: 'Clásico',
  infection: 'Infección',
  fox_hunt: 'Caza del zorro',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un participante: su conexión real, su GPS simulado y, si lo maneja el sistema, su bot. */
class Avatar {
  constructor(sim, name, index) {
    this.sim = sim;
    this.name = name;
    this.index = index;
    this.storage = memoryStorage();
    this.control = 'bot'; // bot | interfaz (lo maneja una persona desde la app real)
    this.frozen = false; // pestaña suspendida: el socket sigue abierto, pero la app no envía nada
    this.offline = false; // desconexión forzada desde el panel
    this.extra = null; // segunda conexión (pestaña duplicada) mientras la interfaz tiene la sesión
    this.pos = offsetM(CENTER, (index % 5) * 3 - 6, Math.floor(index / 5) * 4 - 2); // junto al punto de encuentro
    this.target = null;
    this.hideout = null;
    this.searched = new Set(); // pistas ya revisadas sin éxito (runnerId:pingNo)
    this.guided = null; // runnerId: encuentro guiado («captura válida»)
    this.nextLocAt = 0;
    this.nextClaimAt = 0;
    this.pendingResponses = [];
    this.claimedAt = new Map(); // runnerId → hora de su última reclamación
    this.lastPingNo = 0;
    this.lastAction = '';
    this.conn = this.#connect();
  }

  get id() {
    return this.conn.playerId ?? this.storage.entries().find(([k]) => k === 'outrun.session')?.[1]?.match(/"playerId":"([^"]+)"/)?.[1] ?? null;
  }

  /** Conexión real (net.js) con un WebSocket que deja de enviar mientras la pestaña está suspendida. */
  #connect(storage = this.storage) {
    const self = this;
    class AvatarSocket extends WebSocket {
      send(data) {
        if (!self.frozen) super.send(data);
      }
    }
    const conn = new GameConnection({ url: this.sim.wsUrl, storage, WebSocketImpl: AvatarSocket });
    conn.on('event', (e) => this.#onEvent(conn, e));
    conn.on('positions', (p) => {
      if (conn === this.conn) this.positions = p;
    });
    conn.on('status', (status) => this.sim.connStatus(this, conn, status));
    conn.start();
    return conn;
  }

  #onEvent(conn, e) {
    if (conn !== this.conn) return;
    this.sim.observe(this, e);
    if (e.type === 'tag_claimed' && this.control === 'bot') this.pendingResponses.push(e.data.claimId);
  }

  get snap() {
    return this.conn.snapshot;
  }

  me() {
    return this.snap?.players.find((p) => p.id === this.id) ?? null;
  }

  async command(cmd, label) {
    const sent = this.conn.command(cmd);
    this.sim.inflight.add(sent);
    void sent.finally(() => this.sim.inflight.delete(sent));
    const r = await sent;
    this.lastAction = `${label ?? cmd.type}: ${r.ok ? 'aceptado' : `rechazado (${r.error})`}`;
    return r;
  }

  disconnect() {
    this.offline = true;
    this.conn.close();
  }

  restore() {
    this.offline = false;
    if (this.frozen) {
      this.frozen = false;
      this.conn.wake(); // como al volver a la pestaña: da señal de vida al momento
    }
    if (this.conn.status !== 'open') this.conn = this.#reconnectWith(this.storage);
  }

  #reconnectWith(storage) {
    const old = this.conn;
    const conn = this.#connect(storage);
    if (old !== conn && old.status !== 'closed') old.close();
    return conn;
  }

  /** Abre la misma sesión en otra conexión (otra pestaña). El servidor cierra la anterior (4001). */
  duplicate() {
    const copy = memoryStorage(this.storage.entries());
    if (this.control === 'interfaz') {
      this.extra?.close();
      this.extra = new GameConnection({ url: this.sim.wsUrl, storage: copy });
      this.extra.on('status', (status) => this.sim.connStatus(this, this.extra, status));
      this.extra.start();
      return;
    }
    const old = this.conn;
    this.conn = this.#connect(copy);
    this.storage = copy;
    this.oldConn = old; // la «pestaña» anterior: el servidor la cerrará con 4001
  }

  /** Devuelve el control al bot: abre su conexión (la interfaz queda «abierta en otra pestaña»). */
  takeBack() {
    this.control = 'bot';
    this.extra?.close();
    this.extra = null;
    this.conn = this.#reconnectWith(this.storage);
  }

  /** Revancha: vuelve al punto de encuentro y olvida lo que sabía de la partida anterior (su conexión sigue). */
  resetForRematch() {
    this.pos = offsetM(CENTER, (this.index % 5) * 3 - 6, Math.floor(this.index / 5) * 4 - 2);
    this.target = null;
    this.hideout = null;
    this.manualTarget = null;
    this.searched = new Set();
    this.guided = null;
    this.fleeing = false;
    this.positions = null;
    this.nextLocAt = 0;
    this.nextClaimAt = 0;
    this.pendingResponses = [];
    this.claimedAt = new Map();
    this.lastPingNo = 0;
  }

  close() {
    this.conn.close();
    this.oldConn?.close();
    this.extra?.close();
  }

  // ------------------------------------------------------------------ comportamiento

  /** Avanza el GPS simulado `dt` ms de juego y, si toca, envía la lectura (lo hace también si lo maneja la interfaz: es su GPS). */
  move(now, dt) {
    // Fase y estado según el servidor (la instantánea de este GameConnection deja de llegar si la interfaz
    // ha tomado la sesión).
    const st = this.sim.room();
    const me = st && this.id ? st.players[this.id] : null;
    const phase = st?.phase;
    if (!me || me.status !== 'active' || (phase !== 'HEAD_START' && phase !== 'ACTIVE')) return;
    const speed = this.#speed(me);
    const goal = this.target;
    if (goal) {
      const d = distanceM(this.pos, goal);
      const stepM = Math.min(d, (speed * dt) / 1_000);
      if (d > 0.5) {
        const k = stepM / d;
        this.pos = { lat: this.pos.lat + (goal.lat - this.pos.lat) * k, lng: this.pos.lng + (goal.lng - this.pos.lng) * k };
      }
    }
    if (this.control === 'bot' && !this.offline && !this.frozen && now >= this.nextLocAt) {
      this.nextLocAt = now + LOC_EVERY_MS;
      this.conn.sendLocation({ lat: this.pos.lat, lng: this.pos.lng, accuracyM: ACCURACY_M, ageMs: 0 });
    }
  }

  #speed(me) {
    if (this.guided) return 2.2;
    if (me.team === 'hunter') return 1.9;
    if (this.sim.mode === 'fox_hunt') return this.fleeing ? 1.8 : 1.2;
    return 1.5;
  }

  /** Decide qué hacer (solo si lo maneja el sistema y la conexión está viva). */
  decide(now) {
    if (this.control === 'interfaz') return this.#steerHuman();
    if (this.offline || this.frozen || this.conn.status !== 'open') return;
    const snap = this.snap;
    const me = this.me();
    if (!snap || !me) return;
    for (const claimId of this.pendingResponses.splice(0)) {
      // Bot honesto: confirma la captura que el servidor ha validado por distancia.
      void this.command({ type: 'respond_tag', claimId, accept: true }, 'Confirma la captura').then((r) =>
        this.sim.note(this.name, 'acción', `Confirma la reclamación ${claimId}: ${r.ok ? 'aceptado' : `rechazado (${r.error})`}`),
      );
    }
    if (me.status !== 'active') {
      this.target = null;
      return;
    }
    if (snap.phase === 'HEAD_START') {
      if (me.team === 'hunter') this.target = this.pos; // espera en la zona de salida
      else this.#hide();
      return;
    }
    if (snap.phase !== 'ACTIVE') return;
    if (me.team === 'hunter') this.#hunt(now, snap, me);
    else if (this.sim.mode === 'fox_hunt') this.#flee();
    else this.#hide(snap);
  }

  /** Quien juega desde la interfaz: va adonde lo mandes en el mapa del panel; si no, en la huida se esconde. */
  #steerHuman() {
    const st = this.sim.room();
    const p = st && this.id ? st.players[this.id] : null;
    if (!p || p.status !== 'active') return;
    if (this.manualTarget) this.target = this.manualTarget;
    else if (st.phase === 'HEAD_START' && p.team === 'runner') {
      this.hideout ??= this.#randomPoint(120, 330);
      this.target = this.hideout;
    } else if (st.phase === 'HEAD_START') this.target = this.pos;
    else if (st.phase === 'ACTIVE' && p.team === 'runner' && this.hideout) {
      // Zona dinámica: si el escondite queda fuera del destino de la zona, busca otro dentro.
      if (!this.#inside(this.hideout, 15)) {
        this.hideout = this.#randomPoint(40, 200);
        this.sim.note(this.name, 'acción', 'La zona se cierra: busca un escondite dentro');
      }
      this.target = this.hideout;
    }
  }

  #rand() {
    return this.sim.random();
  }

  /**
   * Zona que tiene en cuenta el bot: la configurada o, con zona dinámica, el destino de la fase en curso (lo
   * mismo que ve cualquier jugador: las fases futuras no se conocen).
   */
  #zone() {
    const st = this.sim.room();
    const fixed = st?.config?.zone?.[0];
    if (st?.zonePlan) return visibleZonePlan(st.zonePlan, st.zonePhase ?? 0).at(-1);
    return fixed ?? { center: CENTER, radiusM: ZONE_RADIUS_M };
  }

  #inside(p, margin = 50) {
    const z = this.#zone();
    return distanceM(p, z.center) <= z.radiusM - Math.min(margin, z.radiusM * 0.3);
  }

  // Distancias pensadas para la zona de 400 m: con otra zona se escalan (con 400 m y zona fija, como siempre).
  #randomPoint(minM, maxM, around = null) {
    const z = this.#zone();
    const k = around ? 1 : z.radiusM / ZONE_RADIUS_M;
    const from = around ?? z.center;
    for (let i = 0; i < 20; i++) {
      const a = this.#rand() * 2 * Math.PI;
      const d = (minM + this.#rand() * (maxM - minM)) * k;
      const p = offsetM(from, Math.cos(a) * d, Math.sin(a) * d);
      if (this.#inside(p)) return p;
    }
    return offsetM(z.center, 0, 0);
  }

  /** Fugitivo (Clásico, Infección): busca un escondite y espera; tras algunas pistas, cambia de sitio. */
  #hide(snap) {
    if (!this.hideout) this.hideout = this.#randomPoint(120, 330);
    // Zona dinámica: si el escondite queda fuera del destino de la zona, se mueve a uno dentro.
    if (snap?.phase === 'ACTIVE' && !this.#inside(this.hideout, 15)) {
      this.hideout = this.#randomPoint(40, 200);
      this.lastAction = 'La zona se cierra: busca un escondite dentro';
    }
    // Los fugitivos no reciben la pista: notan que ha pasado porque cambia la hora de la siguiente.
    const next = snap?.nextPingAt ?? 0;
    if (next && this.lastPingNo && next !== this.lastPingNo && this.#rand() < 0.3) {
      this.hideout = this.#randomPoint(40, 120, this.pos);
      this.lastAction = 'Cambia de escondite tras la pista';
    }
    if (next) this.lastPingNo = next;
    this.target = this.hideout;
  }

  /** Zorro: ve a los cazadores en directo (regla del modo) y huye del más cercano, sin salir de la zona. */
  #flee() {
    const hunters = (this.positions?.positions ?? []).filter((p) => p.reason === 'hunter_seen' && p.lat !== null && p.lng !== null);
    let nearest = null;
    for (const h of hunters) {
      const d = distanceM(this.pos, h);
      if (!nearest || d < nearest.d) nearest = { d, h };
    }
    this.fleeing = Boolean(nearest && nearest.d < 140);
    if (this.fleeing) {
      // Alejarse del cazador más cercano (y volver hacia el centro si se acerca al borde).
      const dn = (this.pos.lat - nearest.h.lat) * 110_540;
      const de = (this.pos.lng - nearest.h.lng) * 111_320 * Math.cos((CENTER.lat * Math.PI) / 180);
      const len = Math.hypot(dn, de) || 1;
      let next = offsetM(this.pos, (dn / len) * 60, (de / len) * 60);
      if (!this.#inside(next, 60)) next = this.#randomPoint(0, 150);
      this.target = next;
      this.lastAction = 'Huye del cazador más cercano';
    } else if (!this.target || distanceM(this.pos, this.target) < 5) {
      this.target = this.#randomPoint(60, 300);
    }
  }

  /** Cazador: va a la última pista (o al fugitivo expuesto) y, al llegar, reclama la captura. */
  #hunt(now, snap, me) {
    const waiting = snap.canTagFrom && now < snap.canTagFrom;
    const players = new Map(snap.players.map((p) => [p.id, p]));
    const free = (id) => players.get(id)?.status === 'active';
    const clues = [];
    const recently = (id) => now - (this.claimedAt.get(id) ?? -Infinity) < RECLAIM_AFTER_MS;
    for (const other of this.sim.avatars) {
      const p = players.get(other.id);
      if (other === this || p?.team !== 'runner' || !free(other.id) || recently(other.id)) continue;
      if (distanceM(this.pos, other.pos) <= SIGHT_M) clues.push({ runnerId: other.id, ...other.pos, key: `vista:${other.id}`, seen: true });
    }
    for (const p of this.positions?.positions ?? []) {
      if (p.reason === 'exposed' && p.lat !== null && free(p.playerId)) clues.push({ runnerId: p.playerId, lat: p.lat, lng: p.lng, key: `exp:${p.playerId}` });
    }
    const ping = snap.lastPing;
    for (const e of ping?.entries ?? []) {
      if (e.position && free(e.runnerId)) clues.push({ runnerId: e.runnerId, ...e.position, key: `${e.runnerId}:${ping.pingNo}` });
    }
    let goal = null;
    if (this.guided) {
      const runner = this.sim.avatarById(this.guided);
      if (runner && free(this.guided)) goal = { runnerId: this.guided, ...runner.pos, key: 'guiado' };
      else this.guided = null;
    }
    if (!goal) {
      // Cada cazador prefiere una pista distinta (reparto por orden), y no repite las ya revisadas.
      const open = clues.filter((c) => !this.searched.has(c.key) && !recently(c.runnerId));
      open.sort((a, b) => Number(Boolean(b.seen)) - Number(Boolean(a.seen)) || distanceM(this.pos, a) - distanceM(this.pos, b));
      goal = open.find((c) => c.seen) ?? open[this.index % Math.max(1, Math.min(open.length, 2))] ?? open[0] ?? null;
      // Caza del zorro: sin verlo, cada cazador va a un punto distinto alrededor de la pista (lo rodean).
      if (goal && !goal.seen && this.sim.mode === 'fox_hunt') {
        const a = (this.index * 2 * Math.PI) / 9;
        const ring = offsetM(goal, Math.cos(a) * 70, Math.sin(a) * 70);
        if (distanceM(this.pos, ring) > 12 && this.#inside(ring, 10)) goal = { ...goal, ...ring, approach: true };
      }
    }
    if (!goal) {
      if (!this.target || distanceM(this.pos, this.target) < 5) this.target = this.#randomPoint(0, 300);
      return;
    }
    this.target = goal;
    const close = !goal.approach && distanceM(this.pos, goal) < (goal.key === 'guiado' ? 6 : goal.seen ? 12 : 10);
    if (goal.approach && distanceM(this.pos, goal) < 12) this.searched.add(goal.key); // punto del cerco alcanzado
    if (close && !waiting && now >= this.nextClaimAt && !snap.pendingClaimByMe) {
      this.nextClaimAt = now + 8_000;
      this.claimedAt.set(goal.runnerId, now);
      const runner = this.sim.nameOf(goal.runnerId);
      void this.command({ type: 'claim_tag', runnerId: goal.runnerId }, `Reclama la captura de ${runner}`).then((r) => {
        this.sim.note(this.name, 'acción', `Reclama la captura de ${runner}: ${r.ok ? 'el servidor la valida y espera su confirmación' : `rechazada por el motor (${r.error})`}`);
        // Pista revisada: aunque la reclamación siga pendiente (o caduque sin respuesta), no insiste en ella.
        if (goal.key !== 'guiado' && !goal.seen && r.error !== 'already_pending') this.searched.add(goal.key);
        if (r.ok && this.guided === goal.runnerId) this.guided = null;
      });
    }
  }
}

/** Una simulación: un servidor real propio, 10 participantes y el registro de lo que pasa. */
export class Simulation {
  // `names`: los 10 participantes (por defecto AVATAR_01…10). `game`: radio, duración y zona dinámica (simConfig).
  constructor({ port = 0, host = '127.0.0.1', routes, seed = Date.now() % 1_000_000, clock = new SimClock(), tickMs = TICK_MS, names = NAMES, game = {} } = {}) {
    this.names = names;
    this.game = game;
    this.port = port;
    this.host = host;
    this.routes = routes;
    this.seed = seed;
    this.clock = clock;
    this.tickMs = tickMs;
    this.random = mulberry32(seed);
    this.server = null;
    this.avatars = [];
    this.mode = null;
    this.code = null;
    this.phase = 'sin_partida';
    this.log = [];
    this.errors = [];
    this.seenEvents = new Set();
    this.runNo = 0;
    this.busy = null;
    this.timer = null;
    this.human = null;
    this.inflight = new Set(); // comandos de los bots aún sin respuesta del servidor
  }

  get wsUrl() {
    return `${this.server.url.replace('http', 'ws')}/ws`;
  }

  async open() {
    this.server = await startServer({
      port: this.port,
      host: this.host,
      routes: this.routes,
      // Una sala cancelada se borra en 2 s (en el juego, 60 s): al reiniciar no queda nada.
      hub: { now: () => this.clock.now(), rateNow: () => Date.now(), closedRoomGraceMs: 2_000 },
    });
    this.port = Number(new URL(this.server.url).port);
    this.timer = setInterval(() => this.#tick(), this.tickMs);
    this.lastTickAt = this.clock.now();
    return this;
  }

  // ------------------------------------------------------------------ registro

  note(who, kind, text) {
    this.log.push({ at: this.clock.now(), real: Date.now(), who, kind, text });
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
  }

  error(text) {
    this.errors.push({ real: Date.now(), text });
    if (this.errors.length > 50) this.errors.shift();
    this.note('', 'error', text);
  }

  nameOf(id) {
    return this.avatars.find((a) => a.id === id)?.name ?? (id ? '¿?' : '—');
  }

  avatarById(id) {
    return this.avatars.find((a) => a.id === id) ?? null;
  }

  avatar(name) {
    const a = this.avatars.find((x) => x.name === name);
    if (!a) throw new Error(`No existe ${name}`);
    return a;
  }

  connStatus(avatar, conn, status) {
    if (status === 'closed' && conn.replaced) {
      if (avatar.control === 'interfaz' && conn === avatar.extra) {
        this.note(avatar.name, 'conexión', 'La interfaz ha recuperado la sesión: la otra pestaña queda cerrada (4001)');
        avatar.extra = null;
      } else if (avatar.control === 'bot' && conn === avatar.conn) {
        this.note(avatar.name, 'conexión', 'Sesión abierta en otra pestaña: el servidor cierra esta (4001)');
      } else if (conn === avatar.oldConn) {
        this.note(avatar.name, 'conexión', 'Pestaña anterior cerrada por el servidor (4001): sigue la nueva');
        avatar.oldConn = null;
      }
    }
  }

  /** Une los eventos que recibe cada participante (cada uno los suyos, ya filtrados por el servidor). */
  observe(avatar, e) {
    const key = `${e.type}|${e.at}|${JSON.stringify(e.data)}`;
    if (this.seenEvents.has(key)) return;
    this.seenEvents.add(key);
    const text = this.describe(e, avatar);
    if (text) this.note(text.who ?? '', 'evento', text.text);
  }

  describe(e, recipient = null) {
    const d = e.data ?? {};
    const n = (id) => this.nameOf(id);
    switch (e.type) {
      case 'countdown_started':
        return { text: 'Cuenta atrás' };
      case 'head_start_started':
        return { text: 'Empieza la huida' };
      case 'hunt_started':
        return { text: 'Empieza la persecución' };
      case 'tag_claimed':
        return { who: n(d.hunterId), text: `${n(d.hunterId)} reclama la captura de ${recipient?.name ?? '¿?'}` }; // solo lo recibe el fugitivo
      case 'tag_claim_resolved':
        return { text: `Reclamación ${d.claimId}: ${d.result === 'confirmed' ? 'confirmada' : d.result === 'rejected' ? 'rechazada por el fugitivo' : d.result === 'expired' ? 'caducada' : d.result}` };
      case 'runner_captured':
        // Una autodeclaración puede no tener autor (el motor guarda hunterId=null): «sin autor conocido».
        return d.converted
          ? { who: n(d.runnerId), text: `${n(d.runnerId)} infectado ${d.hunterId ? `por ${n(d.hunterId)}` : '(sin autor conocido)'}: ahora caza` }
          : { who: n(d.runnerId), text: `${n(d.runnerId)} capturado${d.hunterId ? ` por ${n(d.hunterId)}` : ' (sin autor conocido)'}` };
      case 'role_changed':
        return { who: recipient?.name ?? '', text: `${recipient?.name ?? '¿?'} recibe su rol nuevo: ${d.team === 'hunter' ? 'cazador' : d.team} (solo él lo recibe)` };
      case 'ping_sent':
        return { text: `Pista n.º ${d.pingNo ?? ''}`.trim() };
      // El motor envía `runnerId` (engine.ts, plazo «exposure» y evaluateZone/convert).
      case 'runner_exposed':
        return { who: n(d.runnerId), text: `${n(d.runnerId)} expuesto: lleva 30 s fuera de la zona` };
      case 'runner_unexposed':
        return { who: n(d.runnerId), text: `${n(d.runnerId)} deja de estar expuesto` };
      case 'player_presence':
        return { who: n(d.playerId), text: d.away ? `${n(d.playerId)} sin conexión (30 s sin señal)` : `${n(d.playerId)} ha vuelto` };
      case 'player_left':
        return { who: n(d.playerId), text: d.reason === 'timeout' ? `${n(d.playerId)} queda fuera: 5 min sin señal` : `${n(d.playerId)} abandona` };
      case 'player_connection':
        return { who: n(d.playerId), text: `${n(d.playerId)} ${d.connected ? 'conectado' : 'desconectado (socket cerrado)'}` };
      case 'host_changed':
        return { text: `Nuevo anfitrión: ${n(d.hostId)}` };
      case 'game_finished':
        return { text: `Fin de la partida: ${this.outcomeText(d.outcome ?? d)}` };
      case 'rematch_offered':
        return { text: `Revancha: partida n.º ${d.gameNo ?? ''}${d.swapRoles ? ' (con cambio de equipos)' : ' (sorteo nuevo)'}` };
      case 'countdown_aborted':
        return { text: `Cuenta atrás cancelada (${d.reason ?? ''})` };
      case 'room_closed':
        return { text: `Sala cerrada (${d.reason ?? ''})` };
      case 'zone_exit_warning':
      case 'zone_reentered':
      case 'start_zone_warning':
      case 'start_zone_returned':
      case 'player_updated':
      case 'player_joined':
      case 'config_updated':
      case 'role_revealed':
      case 'ping':
        return null; // no cambian lo que se observa en el panel (o se repiten)
      default:
        return { text: e.type };
    }
  }

  outcomeText(o) {
    if (!o || !o.cause) return 'sin resultado';
    const mode = this.room()?.config?.mode ?? this.mode;
    const runnersWin = mode === 'fox_hunt' ? 'gana el zorro' : mode === 'infection' ? 'ganan los supervivientes' : 'ganan los fugitivos';
    const winner = o.winner === 'hunter' ? 'ganan los cazadores' : o.winner === 'runner' ? runnersWin : 'sin ganador';
    return `${winner} (${o.cause})`;
  }

  // ------------------------------------------------------------------ ciclo

  #tick() {
    try {
      const now = this.clock.now();
      const dt = Math.max(0, Math.min(now - (this.lastTickAt ?? now), 30_000));
      this.lastTickAt = now;
      this.#step(now, dt);
    } catch (e) {
      this.error(`Fallo del simulador: ${e.message}`);
    }
  }

  #step(now, dt) {
    if (!this.server) return;
    if (!this.clock.paused) {
      for (const a of this.avatars) a.decide(now);
      for (const a of this.avatars) a.move(now, dt);
    }
    // Con el tiempo acelerado, la aplicación real no daría señal lo bastante a menudo (ping cada 10 s
    // reales): el simulador la da por quien tiene el socket abierto y NO está suspendido.
    if (this.clock.speed > 1 && !this.clock.paused) this.server.hub.keepAliveConnected(this.silent());
    this.server.pump();
  }

  /** Participantes que no dan señal de vida aunque su socket siga abierto (pestaña suspendida). */
  silent() {
    return new Set(this.avatars.filter((a) => a.frozen && a.id).map((a) => a.id));
  }

  // ------------------------------------------------------------------ partida

  room() {
    return this.code ? this.server.hub.roomStateByCode(this.code) : undefined;
  }

  /** Crea la sala con 10 participantes, la configura con el modo y empieza. `human`: quién juega desde la interfaz. */
  // `beforeStart`: se espera justo antes de que el anfitrión pulse «Empezar» (sala completa, todos listos).
  async start(mode, { human = null, teamPrefs = {}, beforeStart = null } = {}) {
    if (!MODES.includes(mode)) throw new Error('Modo desconocido');
    if (this.busy) throw new Error('La simulación está ocupada');
    this.busy = 'iniciando';
    try {
      if (this.avatars.length) await this.#reset();
      this.runNo++;
      this.mode = mode;
      this.random = mulberry32(this.seed + this.runNo);
      this.note('', 'sistema', `Simulación n.º ${this.runNo}: ${TEXT[mode]} con ${this.names.length} participantes`);
      this.avatars = this.names.map((name, i) => new Avatar(this, name, i));
      await this.#until(() => this.avatars.every((a) => a.conn.status === 'open'), 'conexiones abiertas');
      const host = this.avatars[0];
      const { code } = await host.conn.create(host.name);
      this.code = code;
      for (const a of this.avatars.slice(1)) await a.conn.join(code, a.name);
      await this.#until(() => this.avatars.every((a) => a.snap?.players.length === this.names.length), 'todos en la sala');
      const conf = await host.command({ type: 'configure', config: simConfig(mode, this.game) }, 'Configura la partida');
      if (!conf.ok) throw new Error(`El motor rechaza la configuración: ${conf.error}`);
      for (const a of this.avatars) {
        const r = await a.command({ type: 'set_ready', ready: true }, 'Listo');
        if (!r.ok) throw new Error(`${a.name} no puede marcar «listo»: ${r.error}`);
      }
      // Preferencias de equipo como las marcaría cada jugador en la sala (las respeta o no el motor).
      for (const [name, pref] of Object.entries(teamPrefs)) {
        const r = await this.avatar(name).command({ type: 'set_team_pref', pref }, 'Prefiere equipo');
        if (!r.ok) throw new Error(`${name} no puede elegir equipo: ${r.error}`);
      }
      if (human) this.prepareHuman(human);
      if (beforeStart) await beforeStart();
      const r = await host.command({ type: 'start' }, 'Empieza la partida');
      if (!r.ok) throw new Error(`El motor no deja empezar: ${r.error}${r.detail ? ` (${r.detail})` : ''}`);
      this.note(host.name, 'acción', 'El anfitrión empieza la partida');
      await this.#until(() => this.room()?.phase !== 'LOBBY', 'cuenta atrás');
      const st = this.room();
      const teams = st.playerOrder.map((id) => `${this.nameOf(id)}=${st.players[id].team === 'hunter' ? 'C' : 'F'}`).join(' ');
      this.note('', 'sistema', `Roles asignados por el motor (C cazador, F fugitivo${mode === 'fox_hunt' ? '/zorro' : ''}): ${teams}`);
    } catch (e) {
      this.error(`No se pudo iniciar: ${e.message}`);
      throw e;
    } finally {
      this.busy = null;
    }
  }

  /**
   * Revancha real por comandos, como en la app: el anfitrión la ofrece ({type:'rematch', swapRoles}), los
   * demás se unen ({type:'join_rematch'}), todos marcan «listo» y el anfitrión empieza. El motor hace el
   * sorteo nuevo y limpia el estado de la partida anterior. No se une quien está sin conexión, con la
   * pestaña suspendida o en la interfaz (ese se une desde la app): al empezar, el motor lo deja fuera.
   */
  async rematch({ swapRoles = false } = {}) {
    if (this.busy) throw new Error('La simulación está ocupada');
    const st0 = this.room();
    if (st0?.phase !== 'FINISHED') throw new Error('La revancha solo se ofrece con la partida terminada');
    const host = this.avatarById(st0.hostId);
    if (!host || host.control !== 'bot' || host.offline || host.frozen) throw new Error('El anfitrión no lo maneja el simulador ahora mismo');
    this.busy = 'revancha';
    try {
      const offer = await host.command({ type: 'rematch', swapRoles }, 'Ofrece la revancha');
      if (!offer.ok) throw new Error(`El motor rechaza la revancha: ${offer.error}`);
      this.note(host.name, 'acción', `El anfitrión ofrece la revancha${swapRoles ? ' con cambio de equipos' : ' (sorteo nuevo)'}`);
      const bots = this.avatars.filter((a) => a.control === 'bot' && !a.offline && !a.frozen && a.conn.status === 'open');
      await this.#until(() => bots.every((a) => a.snap?.phase === 'LOBBY'), 'la sala de la revancha');
      for (const a of bots) {
        if (a === host || this.room().players[a.id]?.status !== 'invited') continue;
        const r = await a.command({ type: 'join_rematch' }, 'Se une a la revancha');
        if (!r.ok) throw new Error(`${a.name} no puede unirse a la revancha: ${r.error}`);
      }
      for (const a of bots) {
        if (this.room().players[a.id]?.status !== 'lobby') continue;
        const r = await a.command({ type: 'set_ready', ready: true }, 'Listo');
        if (!r.ok) throw new Error(`${a.name} no puede marcar «listo»: ${r.error}`);
      }
      for (const a of this.avatars) a.resetForRematch();
      const r = await host.command({ type: 'start' }, 'Empieza la revancha');
      if (!r.ok) throw new Error(`El motor no deja empezar la revancha: ${r.error}${r.detail ? ` (${r.detail})` : ''}`);
      this.runNo++;
      await this.#until(() => this.room()?.phase !== 'LOBBY', 'cuenta atrás de la revancha');
      const st = this.room();
      const teams = st.playerOrder
        .filter((id) => st.players[id].status === 'active')
        .map((id) => `${this.nameOf(id)}=${st.players[id].team === 'hunter' ? 'C' : 'F'}`)
        .join(' ');
      this.note('', 'sistema', `Revancha (simulación n.º ${this.runNo}, partida n.º ${st.gameNo}): roles del sorteo nuevo: ${teams}`);
      return { ok: true, gameNo: st.gameNo };
    } catch (e) {
      this.error(`No se pudo jugar la revancha: ${e.message}`);
      throw e;
    } finally {
      this.busy = null;
    }
  }

  /** La interfaz real va a tomar la sesión de `name`: el bot deja de decidir por él (su GPS sigue simulado). */
  prepareHuman(name) {
    if (name === this.names[0]) throw new Error('El anfitrión lo maneja el simulador (lo necesita para empezar y terminar)');
    for (const a of this.avatars) if (a.control === 'interfaz' && a.name !== name) a.takeBack();
    const a = this.avatar(name);
    a.control = 'interfaz';
    this.human = name;
    this.note(name, 'sistema', `${name} pasa a la interfaz real del juego (GPS simulado)`);
    return a;
  }

  /** Sesión para la interfaz real (solo en este ordenador; nunca se escribe en el registro). */
  sessionFor(name) {
    const a = this.avatar(name);
    if (a.control !== 'interfaz') return null;
    const raw = a.storage.getItem('outrun.session');
    return raw ? JSON.parse(raw) : null;
  }

  /** Destino del GPS simulado de quien juega desde la interfaz (clic en el mapa del panel). */
  steer(lat, lng) {
    if (!this.human) throw new Error('Nadie juega desde la interfaz');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || distanceM({ lat, lng }, CENTER) > (this.game.radiusM ?? ZONE_RADIUS_M) * 1.5) throw new Error('Destino fuera del área de la simulación');
    const a = this.avatar(this.human);
    a.manualTarget = { lat, lng };
    this.note(a.name, 'acción', `Destino nuevo a ${Math.round(distanceM(a.pos, a.manualTarget))} m`);
  }

  releaseHuman() {
    if (!this.human) return;
    const a = this.avatar(this.human);
    a.takeBack();
    this.note(a.name, 'sistema', `${a.name} vuelve a manejarlo el bot (la interfaz queda «abierta en otra pestaña»)`);
    this.human = null;
  }

  async #until(fn, what, ms = 8_000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return;
      await sleep(20);
    }
    throw new Error(`tiempo agotado esperando: ${what}`);
  }

  /** Cierra todas las conexiones y arranca un servidor nuevo: no queda ninguna sala ni sesión anterior. */
  async reset() {
    const outer = this.busy;
    this.busy = 'reiniciando';
    try {
      await this.#reset();
    } finally {
      this.busy = outer;
    }
  }

  async #reset() {
    for (const a of this.avatars) a.close();
    this.avatars = [];
    this.code = null;
    this.mode = null;
    this.human = null;
    this.seenEvents.clear();
    clearInterval(this.timer);
    await this.server.close();
    this.clock = new SimClock();
    this.server = null;
    await this.open();
    this.note('', 'sistema', 'Simulación reiniciada: servidor nuevo, sin salas ni conexiones anteriores');
  }

  async close() {
    clearInterval(this.timer);
    for (const a of this.avatars) a.close();
    await this.server?.close();
    this.server = null;
  }

  // ------------------------------------------------------------------ controles del panel

  pause() {
    this.clock.pause();
    this.note('', 'sistema', 'Pausa: el reloj del servidor se detiene');
  }

  resume() {
    this.clock.resume();
    this.lastTickAt = this.clock.now();
    this.note('', 'sistema', 'Reanudada');
  }

  setSpeed(speed) {
    this.clock.setSpeed(speed);
    this.note('', 'sistema', speed === 1 ? 'Tiempo real' : `Tiempo acelerado ×${speed}`);
  }

  /** Adelanta el reloj a pasos de 5 s: los bots se mueven y envían su lectura en cada paso; los plazos vencen en orden. */
  async advance(ms) {
    if (this.busy) throw new Error('La simulación está ocupada');
    this.busy = 'avanzando';
    try {
      this.note('', 'sistema', `Avance de ${Math.round(ms / 1_000)} s de juego`);
      let left = ms;
      while (left > 0) {
        const step = Math.min(JUMP_STEP_MS, left);
        left -= step;
        this.clock.advance(step);
        const now = this.clock.now();
        this.lastTickAt = now;
        for (const a of this.avatars) a.decide(now);
        for (const a of this.avatars) a.move(now, step);
        // Que el servidor reciba las lecturas y los comandos de este paso antes de vencer los plazos (si
        // no, llegarían con el reloj ya adelantado: lecturas «antiguas» y reclamaciones sin respuesta).
        await this.settle();
        this.server.hub.keepAliveConnected(this.silent());
        this.server.pump();
        await this.settle(); // y que los eventos de los plazos lleguen a los bots antes del paso siguiente
      }
    } finally {
      this.busy = null;
    }
  }

  async settle() {
    await sleep(25);
    if (this.inflight.size) await Promise.race([Promise.allSettled([...this.inflight]), sleep(300)]);
    await sleep(5);
  }

  disconnect(name) {
    const a = this.avatar(name);
    if (a.control === 'interfaz') throw new Error('Quien juega desde la interfaz se desconecta desde el navegador (modo sin conexión de las herramientas de desarrollo)');
    a.disconnect();
    this.note(name, 'acción', 'Desconexión forzada: se cierra su socket y no reconecta');
  }

  freeze(name) {
    const a = this.avatar(name);
    if (a.control === 'interfaz') throw new Error('La pestaña de la interfaz no se puede congelar desde aquí');
    a.frozen = true;
    this.note(name, 'acción', 'Pestaña suspendida: el socket sigue abierto, pero la app no envía nada');
  }

  restore(name) {
    const a = this.avatar(name);
    a.restore();
    this.note(name, 'acción', 'Conexión restaurada: la app vuelve y reanuda su sesión');
  }

  duplicate(name) {
    const a = this.avatar(name);
    a.duplicate();
    this.note(name, 'acción', a.control === 'interfaz' ? 'Misma sesión abierta en otra pestaña: la interfaz debe mostrar «Jugar en esta pestaña»' : 'Misma sesión abierta en otra pestaña');
  }

  /** Captura válida: un cazador va hasta el fugitivo (conoce su posición real solo para esta prueba) y la reclama al llegar. */
  validCapture(hunterName, runnerName) {
    const st = this.room();
    if (st?.phase !== 'ACTIVE') throw new Error('Solo durante la persecución');
    const now = this.clock.now();
    const canTag = (p) => p.team === 'hunter' && p.status === 'active' && !(p.canTagFrom && now < p.canTagFrom);
    const hunter = hunterName ? this.avatar(hunterName) : this.avatars.find((a) => a.control === 'bot' && !a.offline && !a.frozen && canTag(st.players[a.id]));
    if (!hunter || !canTag(st.players[hunter.id])) throw new Error('No hay ningún cazador bot que pueda capturar ahora');
    const runners = this.avatars.filter((a) => st.players[a.id]?.team === 'runner' && st.players[a.id]?.status === 'active');
    const runner = runnerName ? this.avatar(runnerName) : runners.sort((x, y) => distanceM(hunter.pos, x.pos) - distanceM(hunter.pos, y.pos))[0];
    if (!runner) throw new Error('No quedan fugitivos activos');
    hunter.guided = runner.id;
    this.note(hunter.name, 'acción', `Encuentro guiado: va hacia ${runner.name} (${Math.round(distanceM(hunter.pos, runner.pos))} m) y reclamará al llegar`);
    return { hunter: hunter.name, runner: runner.name };
  }

  /** Captura inválida: un cazador reclama a un fugitivo lejano; el motor debe rechazarla. */
  async invalidCapture() {
    const st = this.room();
    if (st?.phase !== 'ACTIVE') throw new Error('Solo durante la persecución');
    const hunter = this.avatars.find((a) => a.control === 'bot' && !a.offline && !a.frozen && st.players[a.id]?.team === 'hunter' && st.players[a.id]?.status === 'active');
    const runners = this.avatars.filter((a) => st.players[a.id]?.team === 'runner' && st.players[a.id]?.status === 'active');
    if (!hunter || !runners.length) throw new Error('No hay cazador o fugitivo disponible');
    const far = runners.sort((x, y) => distanceM(hunter.pos, y.pos) - distanceM(hunter.pos, x.pos))[0];
    const d = Math.round(distanceM(hunter.pos, far.pos));
    const r = await hunter.conn.command({ type: 'claim_tag', runnerId: far.id });
    this.note(hunter.name, 'acción', `Reclamación a ${far.name} a ${d} m: ${r.ok ? 'ACEPTADA (inesperado)' : `rechazada por el motor (${r.error})`}`);
    return { hunter: hunter.name, runner: far.name, distanceM: d, result: r };
  }

  async finish() {
    const host = this.avatars[0];
    const st = this.room();
    const hostId = st?.hostId;
    const a = this.avatarById(hostId) ?? host;
    if (a.control === 'interfaz') throw new Error('El anfitrión está en la interfaz: termina la partida desde ella');
    const r = await a.command({ type: 'end_game' }, 'Termina la partida');
    this.note(a.name, 'acción', `El anfitrión termina la partida: ${r.ok ? 'aceptado (sin ganador)' : `rechazado (${r.error})`}`);
    return r;
  }

  // ------------------------------------------------------------------ estado para el panel

  state(viewer = null) {
    const st = this.room();
    const now = this.clock.now();
    const players = st ? st.players : {};
    const viewerAvatar = viewer ? this.avatars.find((a) => a.name === viewer) : null;
    const filtered = st && viewerAvatar?.id ? visiblePositions(st, viewerAvatar.id, now) : null;
    return {
      tool: 'Simulador local de THE OUTRUN (herramienta de desarrollo)',
      server: this.server ? { url: this.server.url, stats: this.server.hub.stats() } : null,
      clock: { ...this.clock.info(), assisted: this.clock.speed > 1 },
      busy: this.busy,
      run: st
        ? {
            no: this.runNo,
            mode: this.mode,
            modeName: TEXT[this.mode],
            phase: st.phase,
            rulesVersion: st.rulesVersion ?? null,
            countdownEnd: st.countdownEnd,
            headStartEnd: st.headStartEnd,
            activeStart: st.activeStart,
            gameEnd: st.gameEnd,
            nextPingAt: st.nextPingAt,
            pingCount: st.pingCount,
            outcome: st.outcome,
            outcomeText: st.outcome ? this.outcomeText(st.outcome) : null,
            captures: (st.captures ?? []).map((c) => ({ runner: this.nameOf(c.runnerId), hunter: c.hunterId ? this.nameOf(c.hunterId) : null, atOffsetMs: c.atOffsetMs, converted: Boolean(c.converted), via: c.via ?? null })),
            claims: Object.values(st.claims ?? {}).map((c) => ({ id: c.id, hunter: this.nameOf(c.hunterId), runner: this.nameOf(c.runnerId), expiresAt: c.expiresAt })),
            host: this.nameOf(st.hostId),
            zone: { center: st.config?.zone?.[0]?.center ?? CENTER, radiusM: st.config?.zone?.[0]?.radiusM ?? ZONE_RADIUS_M },
          }
        : null,
      human: this.human,
      avatars: this.avatars.map((a) => {
        const p = a.id ? players[a.id] : null;
        return {
          name: a.name,
          id: a.id ? a.id.slice(0, 6) : null,
          host: st ? st.hostId === a.id : a.index === 0,
          control: a.control,
          team: p?.team ?? null,
          status: p?.status ?? null,
          leftReason: p?.leftReason ?? null,
          engineConnected: p?.connected ?? null,
          away: p?.away ?? false,
          lastSeenAgoMs: p?.lastSeenAt ? Math.max(0, now - p.lastSeenAt) : null,
          link: a.offline ? 'desconectado' : a.frozen ? 'suspendida' : a.conn.replaced ? 'reemplazada' : a.conn.status,
          extraTab: Boolean(a.extra),
          canTagFrom: p?.canTagFrom ?? null,
          convertedAt: p?.convertedAt ?? null,
          pos: a.pos,
          target: a.target ? { lat: a.target.lat, lng: a.target.lng } : null,
          action: a.lastAction,
        };
      }),
      view: viewerAvatar ? { viewer: viewerAvatar.name, positions: (filtered ?? []).map((p) => ({ ...p, name: this.nameOf(p.playerId) })) } : null,
      lastPing: st?.lastPing ? { pingNo: st.lastPing.pingNo, at: st.lastPing.at, entries: (st.lastPing.entries ?? []).map((e) => ({ runner: this.nameOf(e.runnerId), position: e.position ?? null })) } : null,
      log: this.log.slice(-200),
      errors: this.errors.slice(-20),
    };
  }
}
