// Puente entre la interfaz y el módulo nativo de ubicación «OutrunLocation».
// Contrato: mobile/contract/location-bridge.json (Android hoy, iOS después, mismo contrato).
// Este archivo valida y normaliza todo lo que llega del módulo nativo: la interfaz nunca recibe una
// lectura incompleta como si fuera válida. No contiene reglas del juego.

export const PLUGIN_NAME = 'OutrunLocation';

// Intervalo solicitado al sistema: parámetro EXPERIMENTAL (D-038), ajustable para las pruebas.
export const INTERVAL = Object.freeze({ minMs: 1_000, maxMs: 60_000, defaultMs: 5_000 });

// Envío nativo al servidor de la partida (opcional, solo en partida): límites del contrato.
export const UPLOAD = Object.freeze({ scheme: 'https', maxUrlLength: 512, maxPlayerIdLength: 64, maxSecretLength: 128 });
export const UPLOAD_ERRORS = Object.freeze(['network', 'rejected', 'unauthorized', 'ended']);

export const PERMISSION_LOCATION = Object.freeze(['precise', 'approximate', 'denied', 'denied_permanently', 'prompt']);
export const PERMISSION_NOTIFICATIONS = Object.freeze(['granted', 'denied', 'prompt', 'not_required']);

export class BridgeError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (isNum(v) ? v : null);
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

/** Devuelve una lectura válida y normalizada, o null si no cumple el contrato. */
export function normalizeReading(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { lat, lng } = raw;
  if (!isNum(lat) || !isNum(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (!isNum(raw.ageMs) || raw.ageMs < 0 || !isNum(raw.receivedAt) || !isNum(raw.measuredAt)) return null;
  if (typeof raw.sessionId !== 'string' || raw.sessionId.length === 0) return null;
  const accuracyM = numOrNull(raw.accuracyM);
  return {
    sessionId: raw.sessionId,
    lat,
    lng,
    accuracyM: accuracyM !== null && accuracyM >= 0 ? accuracyM : null,
    ageMs: raw.ageMs,
    receivedAt: raw.receivedAt,
    measuredAt: raw.measuredAt,
    provider: strOrNull(raw.provider) ?? 'desconocido',
    isMock: raw.isMock === true,
    speedMps: numOrNull(raw.speedMps),
  };
}

export function normalizeStatus(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    running: r.running === true,
    sessionId: strOrNull(r.sessionId),
    intervalMs: isNum(r.intervalMs) ? r.intervalMs : INTERVAL.defaultMs,
    fixes: isNum(r.fixes) ? r.fixes : 0,
    gaps: isNum(r.gaps) ? r.gaps : 0,
    gapOpen: r.gapOpen === true,
    provider: strOrNull(r.provider),
    lastError: strOrNull(r.lastError),
    message: strOrNull(r.message),
    uploading: r.uploading === true,
    uploaded: isNum(r.uploaded) ? r.uploaded : 0,
    uploadError: UPLOAD_ERRORS.includes(r.uploadError) ? r.uploadError : null,
  };
}

export function normalizePermissions(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    location: PERMISSION_LOCATION.includes(r.location) ? r.location : 'prompt',
    notifications: PERMISSION_NOTIFICATIONS.includes(r.notifications) ? r.notifications : 'prompt',
  };
}

export function normalizeProvider(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    locationEnabled: r.locationEnabled === true,
    provider: strOrNull(r.provider),
    fusedAvailable: r.fusedAvailable === true,
    gpsEnabled: r.gpsEnabled === true,
  };
}

export function validInterval(ms) {
  return Number.isInteger(ms) && ms >= INTERVAL.minMs && ms <= INTERVAL.maxMs;
}

const textUpTo = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Destino del envío nativo: solo HTTPS, sin credenciales en la URL, y una sesión con forma válida. */
export function validUpload(upload) {
  if (!upload || typeof upload !== 'object') return false;
  const { url, playerId, secret } = upload;
  if (!textUpTo(url, UPLOAD.maxUrlLength) || !textUpTo(playerId, UPLOAD.maxPlayerIdLength) || !textUpTo(secret, UPLOAD.maxSecretLength)) return false;
  try {
    const u = new URL(url);
    return u.protocol === `${UPLOAD.scheme}:` && u.hostname.length > 0 && !u.username && !u.password;
  } catch {
    return false;
  }
}

const errorCodeOf = (e) => (e && typeof e.code === 'string' ? e.code : 'native_error');

/**
 * Crea el puente sobre un módulo nativo con la forma de un plugin de Capacitor. Sin módulo nativo
 * (p. ej., en un navegador), todas las operaciones fallan con «unavailable».
 */
export function createLocationBridge(plugin) {
  const call = async (method, args) => {
    if (!plugin) throw new BridgeError('unavailable', 'El módulo de ubicación solo existe en la app Android.');
    try {
      return await plugin[method](args);
    } catch (e) {
      throw new BridgeError(errorCodeOf(e), e && e.message);
    }
  };
  return {
    available: Boolean(plugin),
    async checkPermissions() {
      return normalizePermissions(await call('checkPermissions'));
    },
    async requestPermissions() {
      return normalizePermissions(await call('requestPermissions'));
    },
    async providerStatus() {
      return normalizeProvider(await call('getProviderStatus'));
    },
    /** Sin `upload`, la sesión no envía nada a la red (diagnóstico). Con `upload`, envía al servidor. */
    async start(intervalMs = INTERVAL.defaultMs, upload = null) {
      if (!validInterval(intervalMs)) throw new BridgeError('invalid_interval', `Intervalo fuera de ${INTERVAL.minMs}–${INTERVAL.maxMs} ms`);
      if (upload !== null && !validUpload(upload)) throw new BridgeError('invalid_upload', 'Destino de envío no válido (solo HTTPS)');
      const args = upload === null ? { intervalMs } : { intervalMs, upload: { url: upload.url, playerId: upload.playerId, secret: upload.secret } };
      return normalizeStatus(await call('startSession', args));
    },
    async stop() {
      return normalizeStatus(await call('stopSession'));
    },
    async status() {
      return normalizeStatus(await call('getStatus'));
    },
    async exportSession() {
      const r = await call('exportSession');
      return { saved: r && r.saved === true, name: strOrNull(r && r.name) };
    },
    /** Escucha lecturas válidas. Las inválidas se descartan y se notifican aparte (onInvalid). */
    async onReading(listener, onInvalid = () => {}) {
      if (!plugin) return { remove: async () => {} };
      return plugin.addListener('reading', (raw) => {
        const reading = normalizeReading(raw);
        if (reading) listener(reading);
        else onInvalid(raw);
      });
    },
    async onStatus(listener) {
      if (!plugin) return { remove: async () => {} };
      return plugin.addListener('status', (raw) => listener(normalizeStatus(raw)));
    },
  };
}

/**
 * Módulo nativo real, solo dentro de la app (Capacitor): `{ plugin }`, con `plugin` a null en un
 * navegador. Va envuelto a propósito: el proxy de `registerPlugin` responde a cualquier propiedad,
 * también a «then», y devolverlo tal cual desde una función async deja la promesa sin resolverse
 * nunca. `loadCore` permite probarlo con el runtime real de Capacitor fuera del WebView.
 */
export async function nativePlugin(loadCore = () => import('../vendor/capacitor-core.js')) {
  const { Capacitor, registerPlugin } = await loadCore();
  return { plugin: Capacitor.isNativePlatform() ? registerPlugin(PLUGIN_NAME) : null };
}
