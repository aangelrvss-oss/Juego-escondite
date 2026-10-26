// Conexión de juego con el servidor de THE OUTRUN (protocolo: server/protocol.ts). Único módulo de la
// interfaz que usa la red. Sin dependencias y sin nada específico de Android: lo usan la app, el
// navegador y las pruebas en Node (WebSocket nativo).
//
// Garantías hacia la interfaz:
// - los eventos llegan en orden y sin duplicados (seq por destinatario); ante un hueco se reanuda;
// - tras una desconexión se reconecta solo y recupera la sesión (playerId + secreto guardados);
// - un comando enviado durante un corte se reenvía con el mismo id (el servidor no lo repite);
// - serverNow() da la hora del servidor estimada con ping/pong (mitad del tiempo de ida y vuelta).

const SESSION_KEY = 'outrun.session';
const INSTALL_KEY = 'outrun.installId';
const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000];
const PING_EVERY_MS = 10_000;
// Una conexión puede morir sin cerrarse (cambio de antena, túnel caído). Si en DEAD_AFTER_MS no ha
// llegado nada del servidor, se le pregunta una vez más (ping) y solo si tampoco responde en PROBE_MS
// se da por muerta y se reconecta. La sonda evita falsos cortes cuando el sistema retrasa los
// temporizadores (pantalla bloqueada, página en segundo plano): un temporizador que despierta tarde
// ve un silencio largo aunque los mensajes hayan seguido llegando o la conexión siga viva.
const DEAD_AFTER_MS = 25_000;
const PROBE_MS = 5_000;

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('outrun.probe', '1');
    s.removeItem('outrun.probe');
    return s;
  } catch {
    return memoryStorage();
  }
}

const randomToken = () => {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Dirección del envío nativo de ubicación (POST /api/loc) para un servidor wss://. null si la
 * conexión no es segura: el módulo nativo solo envía por HTTPS.
 */
export function uploadUrl(wsUrl) {
  try {
    const url = new URL(wsUrl);
    return url.protocol === 'wss:' ? `https://${url.host}/api/loc` : null;
  } catch {
    return null;
  }
}

/** Convierte lo que escribe el usuario (host, http(s) o ws(s)) en la URL del WebSocket. */
export function toWsUrl(input) {
  let text = String(input ?? '').trim();
  if (!text) return null;
  if (!/^[a-z]+:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws';
  return url.toString();
}

export class GameConnection {
  constructor({ url, storage = defaultStorage(), WebSocketImpl = globalThis.WebSocket, now = () => Date.now() } = {}) {
    this.url = url;
    this.storage = storage;
    this.WebSocketImpl = WebSocketImpl;
    this.now = now;
    this.status = 'idle'; // idle | connecting | open | reconnecting | closed
    this.session = this.#loadSession();
    this.snapshot = null;
    this.lastSeq = 0;
    this.offsetMs = 0;
    this.rttMs = null;
    this.code = this.session?.code ?? null;
    this.listeners = new Map();
    this.pending = new Map(); // id → { cmd, resolve }
    this.waiting = null; // create/join en curso: { resolve, reject }
    this.attempt = 0;
    this.socket = null;
    this.timers = new Set();
    this.clockSamples = [];
    this.lastHeardAt = 0;
    this.pingTimer = undefined;
    this.probeSentAt = null; // sonda pendiente tras un silencio largo
    // Al reanudar, el servidor repite los eventos perdidos y luego manda la instantánea. Se retienen
    // hasta entonces para entregarlos con su antigüedad según la hora del servidor (`ageMs`): así la
    // interfaz distingue lo que acaba de pasar de lo que pasó hace minutos (p. ej. tras recargar).
    this.replay = null;
  }

  get installId() {
    let id = this.storage.getItem(INSTALL_KEY);
    if (!id) {
      id = randomToken();
      this.storage.setItem(INSTALL_KEY, id);
    }
    return id;
  }

  get playerId() {
    return this.session?.playerId ?? null;
  }

  serverNow() {
    return this.now() + this.offsetMs;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  #emit(type, payload) {
    for (const fn of this.listeners.get(type) ?? []) fn(payload);
  }

  #setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.#emit('status', status);
  }

  #loadSession() {
    try {
      const s = JSON.parse(this.storage.getItem(SESSION_KEY) ?? 'null');
      return s && typeof s.playerId === 'string' && typeof s.secret === 'string' ? s : null;
    } catch {
      return null;
    }
  }

  #saveSession(session) {
    this.session = session;
    if (session) this.storage.setItem(SESSION_KEY, JSON.stringify(session));
    else this.storage.removeItem(SESSION_KEY);
  }

  #timer(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  #clearTimer(t) {
    if (t === undefined) return;
    clearTimeout(t);
    this.timers.delete(t);
  }

  /** Abre la conexión. Si hay una sesión guardada, la reanuda. */
  start() {
    if (this.status === 'connecting' || this.status === 'open') return;
    this.#open();
  }

  #open() {
    this.#setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let socket;
    try {
      socket = new this.WebSocketImpl(this.url);
    } catch {
      this.#scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.lastHeardAt = this.now();
      this.probeSentAt = null;
      this.#setStatus('open');
      this.#ping();
      if (this.session) this.#raw({ t: 'resume', playerId: this.session.playerId, secret: this.session.secret, lastSeq: this.lastSeq });
    };
    socket.onmessage = (ev) => this.#onMessage(ev.data);
    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.status === 'closed') return;
      if (ev?.code === 4001) {
        // La misma sesión se abrió en otro sitio: no se pelea por ella reconectando en bucle.
        this.#setStatus('closed');
        this.#emit('error', 'replaced');
        return;
      }
      if (ev?.code === 4000) {
        // La sala ya no existe en el servidor.
        this.#setStatus('closed');
        this.#saveSession(null);
        this.#emit('session_lost', 'room_closed');
        return;
      }
      this.#scheduleReconnect();
    };
    socket.onerror = () => {};
  }

  #scheduleReconnect() {
    this.#setStatus('reconnecting');
    const base = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt++;
    this.#timer(() => {
      if (this.status !== 'closed') this.#open();
    }, base + Math.floor(Math.random() * 250));
  }

  #raw(msg) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  #ping() {
    if (this.status !== 'open') return;
    this.#clearTimer(this.pingTimer);
    const now = this.now();
    if (this.probeSentAt !== null && this.lastHeardAt < this.probeSentAt) {
      // Ni respuesta a la sonda: la conexión está muerta.
      this.probeSentAt = null;
      const dead = this.socket;
      this.socket = null;
      dead?.close();
      this.#scheduleReconnect();
      return;
    }
    this.probeSentAt = now - this.lastHeardAt > DEAD_AFTER_MS ? now : null;
    this.#raw({ t: 'ping', c: now });
    // Un solo temporizador de ping: cada reconexión sustituye al anterior, nunca se acumulan.
    this.pingTimer = this.#timer(() => this.#ping(), this.probeSentAt === null ? PING_EVERY_MS : PROBE_MS);
  }

  #onMessage(text) {
    this.lastHeardAt = this.now();
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'pong': {
        const t = this.now();
        const rtt = Math.max(0, t - msg.c);
        // Se usa la muestra con menor ida y vuelta de las últimas: es la menos afectada por colas.
        this.clockSamples = [...this.clockSamples, { rtt, offset: msg.s + rtt / 2 - t }].slice(-5);
        const best = this.clockSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        this.rttMs = best.rtt;
        this.offsetMs = best.offset;
        this.#emit('clock', { offsetMs: this.offsetMs, rttMs: this.rttMs });
        return;
      }
      case 'welcome':
        this.code = msg.code;
        if (msg.secret) {
          this.#saveSession({ playerId: msg.playerId, secret: msg.secret, code: msg.code });
          this.lastSeq = 0;
        }
        // Sin secreto es una reanudación: lo que llegue antes de la instantánea es repetido.
        if (!msg.secret) this.replay ??= [];
        this.waiting?.resolve({ playerId: msg.playerId, code: msg.code });
        this.waiting = null;
        // Comandos enviados durante el corte: mismo id, el servidor devuelve la respuesta guardada.
        for (const [id, p] of this.pending) this.#raw({ t: 'cmd', id, cmd: p.cmd });
        this.#emit('welcome', { playerId: msg.playerId, code: msg.code });
        return;
      case 'snapshot': {
        if (msg.seq < this.lastSeq) return;
        // La instantánea trae la hora del servidor: si el desfase estimado se ha quedado atrás más de
        // 1 s (ping perdidos, móvil suspendido), se corrige aquí sin esperar al siguiente ping.
        const candidate = msg.snapshot.serverNow + (this.rttMs ?? 0) / 2 - this.now();
        if (Math.abs(candidate - this.offsetMs) > 1_000) this.offsetMs = candidate;
        this.lastSeq = msg.seq;
        this.snapshot = msg.snapshot;
        this.#emit('snapshot', msg.snapshot);
        const replayed = this.replay ?? [];
        this.replay = null;
        for (const e of replayed) this.#emit('event', { ...e, ageMs: Math.max(0, msg.snapshot.serverNow - e.at) });
        return;
      }
      case 'event':
        if (msg.seq <= this.lastSeq) return; // duplicado
        if (msg.seq !== this.lastSeq + 1) {
          // Hueco: no se aplica fuera de orden; se reanuda desde lo último aplicado.
          if (this.session) this.#raw({ t: 'resume', playerId: this.session.playerId, secret: this.session.secret, lastSeq: this.lastSeq });
          return;
        }
        this.lastSeq = msg.seq;
        if (this.replay) this.replay.push({ type: msg.type, at: msg.at, data: msg.data });
        else this.#emit('event', { type: msg.type, at: msg.at, data: msg.data, ageMs: 0 });
        return;
      case 'positions':
        this.#emit('positions', msg);
        return;
      case 'code':
        // El anfitrión ha cambiado el código: el anterior ya no sirve para entrar.
        if (typeof msg.code !== 'string') return;
        this.code = msg.code;
        if (this.session) this.#saveSession({ ...this.session, code: msg.code });
        this.#emit('code', msg.code);
        return;
      case 'result': {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        p.resolve(msg.result);
        return;
      }
      case 'error':
        if (msg.error === 'bad_session' || msg.error === 'removed') {
          this.#saveSession(null);
          this.snapshot = null;
          this.lastSeq = 0;
          this.replay = null;
          this.#emit('session_lost', msg.error);
        }
        if (this.waiting) {
          this.waiting.reject(new Error(msg.error));
          this.waiting = null;
          return;
        }
        this.#emit('error', msg.error);
        return;
    }
  }

  #enter(msg) {
    return new Promise((resolve, reject) => {
      if (this.waiting) return reject(new Error('busy'));
      if (!this.#raw(msg)) return reject(new Error('offline'));
      this.waiting = { resolve, reject };
    });
  }

  create(name) {
    return this.#enter({ t: 'create', name, installId: this.installId });
  }

  join(code, name) {
    return this.#enter({ t: 'join', code, name, installId: this.installId });
  }

  /** Envía un comando del motor. Resuelve con el resultado del servidor (nunca rechaza). */
  command(cmd) {
    const id = randomToken();
    return new Promise((resolve) => {
      this.pending.set(id, { cmd, resolve });
      this.#raw({ t: 'cmd', id, cmd });
    });
  }

  /** Lectura de ubicación: la antigüedad se mide al enviar, nunca con la hora de pared del móvil. */
  sendLocation({ lat, lng, accuracyM, ageMs, isMock }) {
    return this.#raw({ t: 'loc', lat, lng, acc: accuracyM, age: Math.max(0, Math.round(ageMs)), ...(isMock === undefined ? {} : { mock: isMock }) });
  }

  /** Olvida la sesión y cierra (al salir de la sala). */
  forget() {
    this.#saveSession(null);
    this.snapshot = null;
    this.lastSeq = 0;
    this.replay = null;
    this.code = null;
    this.close();
  }

  close() {
    this.#setStatus('closed');
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const p of this.pending.values()) p.resolve({ ok: false, error: 'offline' });
    this.pending.clear();
    const s = this.socket;
    this.socket = null;
    s?.close();
  }
}
