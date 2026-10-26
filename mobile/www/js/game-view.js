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
  rate_limited: 'Demasiados intentos seguidos. Espera unos segundos.',
  bad_session: 'La sesión ya no es válida. Vuelve a entrar en la sala.',
  removed: 'Ya no estás en la sala.',
  replaced: 'Has abierto esta partida en otro sitio: esta pantalla se ha desconectado.',
  room_closed: 'La sala está cerrada.',
  server_full: 'El servidor está lleno ahora mismo.',
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

/** Comprobaciones previas al inicio, en el orden en que las exige el motor (para el anfitrión). */
export function startBlockers(snap) {
  const out = [];
  if (!snap.config) out.push('Fija la zona de juego.');
  else if (!snap.config.safetyChecklistConfirmed) out.push('Confirma la lista de seguridad.');
  const lobby = snap.players.filter((p) => p.status === 'lobby');
  if (lobby.length < 2) out.push('Hacen falta al menos 2 jugadores.');
  const waiting = lobby.filter((p) => !p.ready || !p.connected);
  if (waiting.length > 0) out.push(`Esperando a: ${waiting.map((p) => p.name).join(', ')}.`);
  return out;
}
