// Textos y cálculos de la interfaz de partida (puros, sin DOM: se prueban en Node).

export const PHASE_TEXT = Object.freeze({
  LOBBY: 'Sala de espera',
  COUNTDOWN: 'Preparados',
  HEAD_START: 'Huida',
  ACTIVE: 'Persecución',
  FINISHED: 'Final',
  CANCELLED: 'Sala cerrada',
});

export const TEAM_TEXT = Object.freeze({ hunter: 'CAZADOR', runner: 'FUGITIVO' });

// Errores del servidor y del motor en palabras del jugador (ninguno revela datos de otros).
export const ERROR_TEXT = Object.freeze({
  offline: 'Sin conexión con el servidor. Reintentando…',
  not_found: 'No existe ninguna sala con ese código.',
  invalid_code: 'El código tiene 6 letras o números (sin 0, O, 1, I ni L).',
  rate_limited: 'Demasiados intentos seguidos. Espera unos segundos.',
  bad_session: 'La sesión ya no es válida. Vuelve a entrar en la sala.',
  removed: 'Ya no estás en la sala.',
  replaced: 'Has abierto esta partida en otro sitio: esta pantalla se ha desconectado.',
  room_closed: 'La sala está cerrada.',
  server_full: 'El servidor está lleno ahora mismo.',
  too_many_rooms: 'Desde esta conexión ya hay demasiadas salas abiertas. Cierra alguna o únete a una existente.',
  already_in_room: 'Ya estás en una sala.',
  bad_message: 'El servidor no entendió el mensaje.',
  no_session: 'No estás en ninguna sala.',
  invalid_command: 'Acción no válida.',
  forbidden: 'Solo el anfitrión puede hacer eso.',
  wrong_phase: 'Ahora no se puede hacer eso.',
  unknown_player: 'Ese jugador ya no está en la sala.',
  room_full: 'La sala está llena (máximo 20).',
  game_in_progress: 'La partida ya ha empezado: no se puede entrar.',
  already_joined: 'Este móvil ya está en la sala.',
  invalid_name: 'El nombre debe tener entre 2 y 20 caracteres.',
  invalid_config: 'Configuración no válida.',
  config_missing: 'Falta configurar la partida (zona incluida).',
  safety_not_confirmed: 'Confirma la lista de seguridad antes de empezar.',
  not_enough_players: 'Hacen falta al menos 2 jugadores.',
  players_not_ready: 'Todos tienen que estar conectados y listos.',
  teams_unbalanced: 'Con las preferencias actuales no hay cazadores y fugitivos.',
  not_sharing: 'Tu ubicación no está activa en la partida.',
  invalid_sample: 'Lectura de ubicación no válida.',
  not_a_hunter: 'Solo los cazadores pueden reclamar capturas.',
  not_a_runner: 'Solo los fugitivos pueden declararse capturados.',
  target_not_active: 'Ese jugador no está libre.',
  already_pending: 'Ya hay una reclamación pendiente.',
  already_captured: 'Ese fugitivo ya está capturado.',
  your_location_stale: 'Tu ubicación es antigua. Espera a tener señal.',
  target_location_stale: 'No hay una ubicación reciente del fugitivo: no se puede validar.',
  accuracy_too_low: 'La precisión del GPS no es suficiente para validar la captura.',
  your_location_unstable: 'Tu GPS acaba de dar un salto. Espera a la siguiente lectura y vuelve a intentarlo.',
  target_location_unstable: 'La ubicación del fugitivo aún no es estable. Inténtalo en unos segundos.',
  hunter_outside_zone: 'Estás fuera de la zona: no puedes reclamar capturas.',
  not_close_enough: 'No estáis lo bastante cerca para validar la captura.',
  claim_not_found: 'Esa reclamación ya no está activa.',
  rematch_window_closed: 'La revancha ya no está disponible.',
});

export const errorText = (code) => ERROR_TEXT[code] ?? `Error: ${code}`;

export const WIN_TEXT = Object.freeze({
  time_up: 'Se acabó el tiempo',
  all_captured: 'Todos los fugitivos capturados',
  runners_abandoned: 'Los fugitivos abandonaron',
  hunters_abandoned: 'Los cazadores abandonaron',
  ended_by_host: 'El anfitrión terminó la partida',
});

// Reglas que aplica el motor (engine/src/constants.ts). La interfaz no las decide: solo las explica.
// Una prueba comprueba que coinciden con las del motor (mobile/test/briefing.test.mjs).
export const RULES = Object.freeze({
  countdownMs: 5_000, // TIMING.countdownMs
  tagMaxAgeMs: 15_000, // TAG.maxAgeMs
  tagMaxAccuracyM: 30, // TAG.maxAccuracyM
  tagConfirmMs: 30_000, // TIMING.tagConfirmMs
  outOfZoneGraceMs: 30_000, // TIMING.outOfZoneGraceMs
  spectatorDelayMs: 60_000, // TIMING.spectatorDelayMs
});

const minutes = (ms) => `${Math.round(ms / 60_000)} min`;
const seconds = (ms) => `${Math.round(ms / 1_000)} s`;

/**
 * Briefing común de la partida (Plan Maestro §2.1 paso 5, §3.3 y §7): objetivo, zona, tiempos, cómo se
 * captura, qué ve cada uno y límites de seguridad. Se genera con la configuración de la sala y las
 * reglas del motor, para no esconder ninguna regla que cambie la estrategia. null sin configuración.
 */
export function briefing(config) {
  if (!config) return null;
  const radius = config.zone?.[0]?.radiusM;
  return [
    { title: 'Objetivo', text: 'Los cazadores ganan si capturan a todos los fugitivos antes del final. Los fugitivos ganan si al acabar el tiempo queda alguno libre.' },
    { title: 'Roles', text: `Se revelan a cada uno, en privado, al terminar la cuenta atrás de ${seconds(RULES.countdownMs)}. Solo ves tu rol y el de tus compañeros (si el anfitrión asigna los roles a mano, él los conoce).` },
    { title: 'Tiempo', text: `${minutes(config.headStartMs)} de huida (los cazadores esperan en el punto de encuentro) y ${minutes(config.durationMs)} de persecución. Manda la hora del servidor.` },
    { title: 'Zona', text: `Círculo de ${radius} m alrededor del punto de encuentro. Un fugitivo que pase más de ${seconds(RULES.outOfZoneGraceMs)} fuera queda visible para los cazadores hasta que vuelva. Un cazador fuera de la zona no puede capturar.` },
    { title: 'Pistas', text: `Cada ${minutes(config.pingIntervalMs)}, los cazadores reciben la última posición conocida de cada fugitivo, con su antigüedad.` },
    { title: 'Captura', text: `Toque suave. El cazador la reclama en la app: el servidor exige lecturas de los dos de hace ${seconds(RULES.tagMaxAgeMs)} o menos, con ±${RULES.tagMaxAccuracyM} m o mejor, cerca y sin saltos del GPS. El fugitivo confirma en ${seconds(RULES.tagConfirmMs)}; sin respuesta no hay captura. También puede declararse capturado.` },
    { title: 'Capturados', text: `Quien es capturado deja de jugar y ve a los demás con ${seconds(RULES.spectatorDelayMs)} de retraso.` },
    { title: 'Seguridad', text: 'Nada de calzadas, vías ni propiedades privadas. No mires el móvil mientras corres. Mayores de 18. Puedes abandonar la partida cuando quieras.' },
  ];
}

/**
 * Mission Report (Plan Maestro §4.4), solo con datos oficiales de la instantánea del servidor:
 * resultado, tiempo, estadísticas y momentos destacados verificables (capturas registradas por el
 * motor). No revela el equipo de nadie que no lo haya revelado ya la partida (un capturado era
 * fugitivo; quien captura era cazador) y no lleva coordenadas.
 * `nameOf(id)` da el nombre a mostrar. Devuelve null si la partida no ha terminado.
 */
export function missionReport(snap, nameOf = (id) => id) {
  if (!snap || snap.phase !== 'FINISHED' || !snap.outcome) return null;
  const o = snap.outcome;
  const captures = [...(snap.captures ?? [])].sort((a, b) => a.atOffsetMs - b.atOffsetMs);
  const duration = snap.activeStart !== null && snap.activeStart !== undefined && snap.finishedAt !== null && snap.finishedAt !== undefined
    ? Math.max(0, snap.finishedAt - snap.activeStart)
    : null; // terminó antes de empezar la persecución
  const byHunter = new Map();
  for (const c of captures) if (c.hunterId) byHunter.set(c.hunterId, (byHunter.get(c.hunterId) ?? 0) + 1);
  const ranking = [...byHunter.entries()].sort((a, b) => b[1] - a[1]);
  const highlights = [];
  if (captures.length > 0) highlights.push(`Primera captura: ${nameOf(captures[0].runnerId)} a los ${clock(captures[0].atOffsetMs)}`);
  if (o.cause === 'all_captured' && captures.length > 0) {
    const last = captures[captures.length - 1];
    highlights.push(`Captura decisiva: ${nameOf(last.runnerId)}${last.hunterId ? ` por ${nameOf(last.hunterId)}` : ''} a los ${clock(last.atOffsetMs)}`);
  }
  if (o.cause === 'time_up' && o.winner === 'runner') highlights.push('Los fugitivos aguantaron hasta el final');
  if (ranking.length > 0 && ranking[0][1] >= 2 && (ranking.length === 1 || ranking[1][1] < ranking[0][1])) {
    highlights.push(`Más capturas: ${nameOf(ranking[0][0])} (${ranking[0][1]})`);
  }
  return {
    winner: o.winner ? `Ganan los ${o.winner === 'hunter' ? 'cazadores' : 'fugitivos'}` : 'Sin ganador',
    cause: WIN_TEXT[o.cause] ?? '',
    durationMs: duration,
    timeToVictoryMs: o.cause === 'all_captured' && captures.length > 0 ? captures[captures.length - 1].atOffsetMs : null,
    captureCount: captures.length,
    selfDeclared: captures.filter((c) => c.via === 'self').length,
    hunterRanking: ranking.map(([id, n]) => ({ name: nameOf(id), captures: n })),
    captures: captures.map((c) => ({ runner: nameOf(c.runnerId), hunter: c.hunterId ? nameOf(c.hunterId) : null, atMs: c.atOffsetMs, via: c.via })),
    highlights,
    rulesVersion: snap.rulesVersion ?? null, // con qué reglas se jugó (Plan §8.3)
  };
}

/** mm:ss (o h:mm:ss) de un intervalo en ms; nunca negativo. */
export function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** «hace 12 s», «hace 3 min»: la antigüedad real de una lectura. */
export function ago(ms) {
  if (ms === null || ms === undefined) return 'sin datos';
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
}

/** Fin de la fase en curso (hora del servidor) o null. */
export function phaseDeadline(snap) {
  if (!snap) return null;
  if (snap.phase === 'COUNTDOWN') return snap.countdownEnd;
  if (snap.phase === 'HEAD_START') return snap.headStartEnd;
  if (snap.phase === 'ACTIVE') return snap.gameEnd;
  return null;
}

export function me(snap, myId) {
  return snap?.players.find((p) => p.id === myId) ?? null;
}

/** Jugadores que este jugador puede elegir como rivales: todos los activos que no son compañeros. */
export function rivals(snap, myId) {
  const self = me(snap, myId);
  if (!self?.team) return [];
  return snap.players.filter((p) => p.id !== myId && p.status === 'active' && p.team !== self.team);
}

/** Estado de la propia lectura para la barra de GPS (mismos umbrales experimentales que el motor). */
export function gpsStatus(reading, nowPerf) {
  if (!reading) return { text: 'Sin ubicación', tone: 'danger' };
  const age = reading.ageMs + (nowPerf - reading.at);
  if (age > 120_000) return { text: `Sin señal (${ago(age)})`, tone: 'danger' };
  if (age > 15_000) return { text: `Lectura antigua (${ago(age)})`, tone: 'warn' };
  if (reading.accuracyM > 50) return { text: `Imprecisa · ±${Math.round(reading.accuracyM)} m`, tone: 'warn' };
  return { text: `GPS ±${Math.round(reading.accuracyM)} m`, tone: 'ok' };
}

// Códigos de sala: mismo alfabeto y longitud que el servidor (server/hub.ts, sin 0/O ni 1/I/L).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const INVITE_PARAM = 'sala';

/** Código normalizado (mayúsculas, sin espacios) o null si no puede ser un código de sala. */
export function normalizeCode(text) {
  const code = String(text ?? '').replace(/\s+/g, '').toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

/**
 * Enlace de invitación: la dirección web del servidor con el código como único parámetro. No lleva
 * datos de sesión ni nombres: solo lo mismo que el código que se comparte de palabra.
 * `serverWsUrl` es la URL del WebSocket (wss://host/ws); null si no se puede formar un enlace.
 */
export function inviteLink(serverWsUrl, code) {
  const valid = normalizeCode(code);
  if (!valid) return null;
  let url;
  try {
    url = new URL(serverWsUrl);
  } catch {
    return null;
  }
  if (url.protocol === 'wss:') url.protocol = 'https:';
  else if (url.protocol === 'ws:') url.protocol = 'http:';
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return `${url.origin}/?${INVITE_PARAM}=${valid}`;
}

/** Código de una URL de invitación http(s), o null si no trae uno válido. */
export function codeFromLink(href) {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return normalizeCode(url.searchParams.get(INVITE_PARAM));
  } catch {
    return null;
  }
}

/**
 * Motivo, en palabras del jugador, por el que la comprobación de GPS al pulsar «Estoy listo» no ha
 * salido bien (Plan Maestro §2.1 paso 4 y §4.1: explicar por qué se pide la ubicación y no fingir que
 * se puede validar sin ella).
 */
export function gpsCheckError(code) {
  if (code === 'permission_missing') {
    return 'Para jugar hace falta permitir la ubicación: el servidor la usa para validar capturas y la zona, y solo durante la partida. Actívala y vuelve a pulsar «Estoy listo».';
  }
  if (code === 'timeout') return 'Todavía no hay una posición GPS fiable. Sal al aire libre, espera unos segundos y vuelve a pulsar «Estoy listo».';
  return 'No se pudo activar la ubicación de este móvil. Revisa que esté encendida y vuelve a intentarlo.';
}

/**
 * Qué impide empezar, en el orden en que lo exige el motor. Lo ven todos (Plan Maestro §7, sala de
 * espera: es un error «no indicar quién está desconectado o qué impide empezar»). Al anfitrión se le
 * dice qué hacer; a los demás, qué falta. Los desconectados se nombran aparte de los que no están listos.
 */
export function startBlockers(snap, { forHost = true } = {}) {
  const out = [];
  if (!snap.config) out.push(forHost ? 'Fija la zona de juego.' : 'El anfitrión aún no ha fijado la zona de juego.');
  else if (!snap.config.safetyChecklistConfirmed) out.push(forHost ? 'Confirma la lista de seguridad.' : 'El anfitrión aún no ha confirmado la lista de seguridad.');
  const lobby = snap.players.filter((p) => p.status === 'lobby');
  if (lobby.length < 2) out.push('Hacen falta al menos 2 jugadores.');
  const offline = lobby.filter((p) => !p.connected);
  if (offline.length > 0) out.push(`Sin conexión: ${offline.map((p) => p.name).join(', ')}.`);
  const notReady = lobby.filter((p) => p.connected && !p.ready);
  if (notReady.length > 0) out.push(`Falta que estén listos: ${notReady.map((p) => p.name).join(', ')}.`);
  return out;
}

/**
 * Indicador de si este móvil está compartiendo su ubicación (Plan Maestro §4.5: «la app debe mostrar
 * cuándo comparte la ubicación»). `tracking`: la ubicación está activa para la partida; `uploading`:
 * el servicio nativo la envía también con la pantalla bloqueada.
 */
export function sharingStatus(tracking, uploading) {
  if (!tracking) return { on: false, text: 'No se comparte tu ubicación' };
  return {
    on: true,
    text: uploading
      ? 'Compartiendo tu ubicación con el servidor de la partida (también con la pantalla bloqueada)'
      : 'Compartiendo tu ubicación con el servidor de la partida',
  };
}

/**
 * Aviso visible cuando se pierde la conexión con el servidor (Plan Maestro §7, incidencia: «qué ocurre
 * y cómo recuperarse»; no dejar al jugador sin contexto). null si no hay nada que avisar.
 */
export function connectionNotice(status, phase) {
  if (status === 'closed') return 'Desconectado del servidor. Vuelve al inicio y entra otra vez en la sala.';
  if (status !== 'reconnecting' && status !== 'connecting') return null;
  if (phase === 'COUNTDOWN' || phase === 'HEAD_START' || phase === 'ACTIVE') {
    return 'Sin conexión con el servidor. La partida sigue: el servidor manda en el tiempo y en las capturas. Reconectando…';
  }
  return phase ? 'Sin conexión con el servidor. Reconectando…' : null;
}
