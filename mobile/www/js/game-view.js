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

// Modos jugables (D-057). Las reglas las aplica el motor (engine/src/modes.ts); aquí solo se explican.
// Solo se listan los que ya se pueden jugar: nada de «Próximamente».
export const MODES = Object.freeze({
  classic: Object.freeze({
    id: 'classic',
    name: 'Clásico',
    minPlayers: 2,
    line: 'Equipos fijos. Los cazadores siguen las pistas; a los fugitivos les basta con que uno siga libre al final.',
  }),
  infection: Object.freeze({
    id: 'infection',
    name: 'Infección',
    minPlayers: 4,
    line: 'Cada fugitivo capturado se convierte en cazador. Si caen todos, ganan los cazadores; si alguien sigue libre al final, ganan los supervivientes.',
  }),
  fox_hunt: Object.freeze({
    id: 'fox_hunt',
    name: 'Caza del zorro',
    minPlayers: 3,
    line: 'Un zorro contra todos. El zorro ve a los cazadores en directo; ellos reciben su posición exacta en cada pista. Si lo atrapan, ganan; si aguanta hasta el final, gana el zorro.',
  }),
});
/** Nombre del rol según el modo (en la Caza del zorro, el fugitivo es el zorro). */
export const teamName = (team, config) => (team === 'runner' && config?.mode === 'fox_hunt' ? 'ZORRO' : TEAM_TEXT[team]);
export const modeInfo = (config) => MODES[config?.mode] ?? MODES.classic;

// Errores del servidor y del motor en palabras del jugador (ninguno revela datos de otros).
export const ERROR_TEXT = Object.freeze({
  offline: 'Sin conexión con el servidor. Reintentando…',
  no_response: 'No hay respuesta del servidor. Revisa la conexión y vuelve a intentarlo.',
  not_found: 'No existe ninguna sala con ese código.',
  invalid_code: 'El código tiene 6 letras o números (sin 0, O, 1, I ni L).',
  rate_limited: 'Demasiados intentos seguidos. Espera unos segundos.',
  bad_session: 'La sesión ya no es válida. Vuelve a entrar en la sala.',
  removed: 'Ya no estás en la sala.',
  replaced: 'La partida está abierta en otra pestaña o ventana: esta se ha desconectado.',
  stale_action: 'Sin conexión cuando lo pulsaste: no se ha enviado. Si sigue haciendo falta, vuelve a pulsarlo.',
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
  tag_cooldown: 'Acabas de convertirte en cazador: aún no puedes capturar.',
  busy: 'Espera: aún se está enviando la acción anterior.',
  room_expiring: 'La sala está a punto de caducar: crea una sala nueva para jugar.',
});

// Motivos concretos de una configuración rechazada (el servidor indica qué campo falla).
const CONFIG_DETAIL_TEXT = Object.freeze({
  pingIntervalMs: 'Las pistas tienen que llegar antes de que acabe la persecución: elige un intervalo de pistas menor que la duración.',
});

// Errores que dependen del modo de juego (el motor da el modo como detalle).
const MODE_DETAIL_TEXT = Object.freeze({
  not_enough_players: Object.freeze({ infection: 'Infección necesita al menos 4 jugadores.', fox_hunt: 'La caza del zorro necesita al menos 3 jugadores.' }),
  teams_unbalanced: Object.freeze({
    infection: 'En Infección empieza 1 cazador por cada 4 jugadores (al menos 1): revisa los roles asignados a mano.',
    fox_hunt: 'En la caza del zorro hay exactamente un zorro: revisa los roles asignados a mano.',
  }),
});
export const errorText = (code, detail) =>
  (code === 'invalid_config' && CONFIG_DETAIL_TEXT[detail]) || MODE_DETAIL_TEXT[code]?.[detail] || ERROR_TEXT[code] || `Error: ${code}`;

// «forbidden» no siempre es cosa del anfitrión: el motor también lo da a quien no está en la sala de
// espera (p. ej., «Estoy listo») o no está invitado a la revancha. Se explica según la acción rechazada.
const HOST_COMMANDS = new Set(['configure', 'assign_team', 'start', 'abort', 'kick', 'end_game', 'rematch', 'new_code']);
const FORBIDDEN_BY_COMMAND = Object.freeze({
  set_ready: 'Ahora no puedes marcarte como listo: no estás en la sala de espera.',
  set_team_pref: 'Ahora no puedes elegir rol: no estás en la sala de espera.',
  join_rematch: 'No estás invitado a esta revancha.',
});
/** Texto de un rechazo a una acción concreta (`cmdType`, p. ej. 'start'). */
export function commandErrorText(code, detail, cmdType) {
  if (code === 'forbidden' && cmdType && !HOST_COMMANDS.has(cmdType)) return FORBIDDEN_BY_COMMAND[cmdType] ?? 'No puedes hacer eso.';
  return errorText(code, detail);
}

const FOX_WIN_TEXT = Object.freeze({ all_captured: 'Zorro atrapado', runners_abandoned: 'El zorro abandonó o se quedó sin conexión' });

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
  convertTagDelayMs: 60_000, // MODES.infection.convertTagDelayMs
  zonePhaseMs: 300_000, // DYNAMIC_ZONE.phaseMs
  zoneShrink: 0.15, // DYNAMIC_ZONE.shrink
  zoneMinRadiusM: 50, // DYNAMIC_ZONE.minRadiusM
});

/**
 * Zona en un instante, con el plan que manda el servidor (snap.zonePlan) y la hora del servidor `now`:
 * la misma cuenta que engine/src/zone.ts (zoneInPlan), así que todos los móviles ven el mismo círculo.
 * Entre dos puntos clave encoge y se desplaza en línea recta (sin saltos). Sin plan, la zona fija de la
 * configuración. Devuelve también el destino de la fase en curso y cuándo se alcanza (null si ya no cambia).
 */
export function zoneNow(snap, now) {
  const fixed = snap?.config?.zone?.[0];
  const plan = Array.isArray(snap?.zonePlan) && snap.zonePlan.length > 0 ? snap.zonePlan : null;
  if (!plan) return fixed ? { center: fixed.center, radiusM: fixed.radiusM, target: null } : null;
  const start = snap.activeStart;
  const offset = start === null || start === undefined ? Number.NEGATIVE_INFINITY : now - start;
  const lerp = (a, b, t) => a + (b - a) * t;
  let zone = null;
  let target = null;
  if (offset <= plan[0].fromOffsetMs) zone = { center: plan[0].center, radiusM: plan[0].radiusM };
  for (let i = 1; !zone && i < plan.length; i++) {
    const a = plan[i - 1];
    const b = plan[i];
    if (offset >= b.fromOffsetMs) continue;
    const t = (offset - a.fromOffsetMs) / (b.fromOffsetMs - a.fromOffsetMs);
    zone = { center: { lat: lerp(a.center.lat, b.center.lat, t), lng: lerp(a.center.lng, b.center.lng, t) }, radiusM: lerp(a.radiusM, b.radiusM, t) };
    // Destino: el siguiente punto clave que cambia la zona (la primera fase solo mantiene la inicial).
    if (b.radiusM !== a.radiusM || b.center.lat !== a.center.lat || b.center.lng !== a.center.lng) target = { radiusM: b.radiusM, at: start + b.fromOffsetMs };
  }
  if (!zone) {
    const last = plan[plan.length - 1];
    zone = { center: last.center, radiusM: last.radiusM };
  }
  return { ...zone, target };
}

/**
 * Línea de la zona dinámica bajo el reloj: cómo de grande es ahora, hasta dónde se cierra y cuándo. null
 * sin zona dinámica o fuera de la persecución. Solo números: sin coordenadas.
 */
export function zoneLine(snap, now) {
  if (snap?.phase !== 'ACTIVE' || !snap.config?.dynamicZone) return null;
  const z = zoneNow(snap, now);
  if (!z) return null;
  const r = Math.round(z.radiusM);
  if (z.target) return { text: `Zona ${r} m · se cierra hasta ${Math.round(z.target.radiusM)} m`, leftMs: Math.max(0, z.target.at - now), closing: true };
  // Antes del primer cambio, o tras el último (radio mínimo o fin del plan).
  const firstChange = snap.activeStart + RULES.zonePhaseMs;
  if (now < firstChange && (snap.zonePlan?.length ?? 0) > 1) return { text: `Zona ${r} m · empieza a cerrarse en`, leftMs: firstChange - now, closing: false };
  return { text: `Zona ${r} m · ya no cambia`, leftMs: null, closing: false };
}

// Juego nocturno (AC-B3, USER_FLOWS F5.6): de 21:00 a 7:00, hora local del móvil. HIPÓTESIS (D-038):
// el horario no está aprobado; la alternativa prevista es la puesta y la salida del sol.
export const NIGHT = Object.freeze({ fromHour: 21, toHour: 7 });

/** Aviso de juego nocturno para la sala de espera, o null de día. Solo avisa: no impide empezar. */
export function nightNotice(date) {
  const h = date.getHours();
  if (h < NIGHT.fromHour && h >= NIGHT.toHour) return null;
  return 'Es de noche. Si jugáis ahora: zona bien iluminada y conocida, ropa visible, nada de calzadas ni atajos oscuros, el móvil con batería y alguien que sepa dónde estáis.';
}

/** Normas de captura de la tarjeta del rol (AC-B4, USER_FLOWS F6.2: tres líneas como mucho). */
export const CAPTURE_NORMS = 'Captura: toque suave, nunca en la calzada.';

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
  const infection = config.mode === 'infection';
  const fox = config.mode === 'fox_hunt';
  const objective = infection
    ? 'Los cazadores ganan si infectan a todos antes del final (los convertidos ganan con ellos). Los supervivientes ganan si al acabar el tiempo queda alguno libre.'
    : fox
      ? 'Los cazadores ganan si atrapan al zorro antes del final. El zorro gana si aguanta libre hasta que se acabe el tiempo.'
      : 'Los cazadores ganan si capturan a todos los fugitivos antes del final. Los fugitivos ganan si al acabar el tiempo queda alguno libre.';
  const roles = fox
    ? `Un zorro (por sorteo o elegido por el anfitrión) y el resto cazadores. Cada uno descubre su rol al terminar la cuenta atrás de ${seconds(RULES.countdownMs)}; desde ese momento todos saben quién es el zorro.`
    : `${infection ? 'Empieza 1 cazador por cada 4 jugadores (al menos 1). ' : ''}Se revelan a cada uno, en privado, al terminar la cuenta atrás de ${seconds(RULES.countdownMs)}. Solo ves tu rol y el de tus compañeros (si el anfitrión asigna los roles a mano, él los conoce).`;
  return [
    { title: 'Modo', text: `${modeInfo(config).name}. ${modeInfo(config).line}` },
    { title: 'Objetivo', text: objective },
    { title: 'Roles', text: roles },
    { title: 'Tiempo', text: `${minutes(config.headStartMs)} de huida (los cazadores esperan en el punto de encuentro) y ${minutes(config.durationMs)} de persecución. Manda la hora del servidor.` },
    { title: 'Zona', text: `Círculo de ${radius} m alrededor del punto de encuentro.${config.dynamicZone ? ` Cada ${minutes(RULES.zonePhaseMs)} de persecución se cierra poco a poco (un ${Math.round(RULES.zoneShrink * 100)} % menos de radio en cada fase, nunca por debajo de ${RULES.zoneMinRadiusM} m) y su centro se desplaza un poco, siempre dentro de la zona anterior.` : ''} ${fox ? 'El zorro, si pasa' : 'Un fugitivo que pase'} más de ${seconds(RULES.outOfZoneGraceMs)} fuera queda visible para los cazadores hasta que vuelva. Un cazador fuera de la zona no puede capturar.` },
    fox
      ? { title: 'Pistas', text: `Cada ${minutes(config.pingIntervalMs)}, los cazadores reciben la posición exacta del zorro (la última conocida, con su antigüedad). El zorro, en cambio, ve a los cazadores en directo todo el rato; los cazadores se ven entre sí.` }
      : { title: 'Pistas', text: `Cada ${minutes(config.pingIntervalMs)}, los cazadores reciben la última posición conocida de cada fugitivo, con su antigüedad.` },
    { title: 'Captura', text: `Toque suave. El cazador la reclama en la app: el servidor exige lecturas de los dos de hace ${seconds(RULES.tagMaxAgeMs)} o menos, con ±${RULES.tagMaxAccuracyM} m o mejor, cerca y sin saltos del GPS. El fugitivo confirma en ${seconds(RULES.tagConfirmMs)}; sin respuesta no hay captura. También puede declararse capturado.` },
    infection
      ? { title: 'Infectados', text: `Quien es capturado se convierte al momento en cazador: deja de ver a los fugitivos, ve a los cazadores, recibe las pistas siguientes y puede capturar pasados ${seconds(RULES.convertTagDelayMs)}.` }
      : fox
        ? { title: 'Captura del zorro', text: 'Si los cazadores atrapan al zorro, la partida termina en ese momento.' }
        : { title: 'Capturados', text: `Quien es capturado deja de jugar y ve a los demás con ${seconds(RULES.spectatorDelayMs)} de retraso.` },
    // Prohibiciones explícitas del Plan Maestro §4.5.
    { title: 'Seguridad', text: 'Nada de calzadas, vías, propiedades privadas, zonas restringidas ni edificios abandonados. Cruza solo por pasos seguros y no saltes vallas ni barreras. No mires el móvil mientras corres. Mayores de 18. Puedes abandonar la partida cuando quieras.' },
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
  const infection = snap.config?.mode === 'infection';
  const fox = snap.config?.mode === 'fox_hunt';
  const highlights = [];
  if (infection) {
    // Contagio: todas las infecciones, agrupadas por quién infectó (solo con datos oficiales de las capturas).
    const groups = contagionGroups(captures);
    if (groups.length) {
      highlights.push(`Contagio: ${groups.map((g) => `${g.hunterId ? nameOf(g.hunterId) : 'Sin autor conocido'} → ${g.victims.map(nameOf).join(', ')}`).join(' · ')}`);
    }
    if (o.cause === 'all_captured' && captures.length > 0) {
      const last = captures[captures.length - 1];
      highlights.push(`Último superviviente: ${nameOf(last.runnerId)}, hasta los ${clock(last.atOffsetMs)}`);
    }
    if (o.cause === 'time_up' && o.winner === 'runner') highlights.push('Los supervivientes resistieron hasta el final');
  } else if (fox) {
    if (o.cause === 'all_captured' && captures.length > 0) {
      const c = captures[0];
      highlights.push(`${nameOf(c.runnerId)} cayó a los ${clock(c.atOffsetMs)}${c.hunterId ? `, atrapado por ${nameOf(c.hunterId)}` : ''}`);
    }
    if (o.cause === 'time_up' && o.winner === 'runner') highlights.push('El zorro aguantó hasta el final');
  } else {
    if (captures.length > 0) highlights.push(`Primera captura: ${nameOf(captures[0].runnerId)} a los ${clock(captures[0].atOffsetMs)}`);
    if (o.cause === 'all_captured' && captures.length > 0) {
      const last = captures[captures.length - 1];
      highlights.push(`Captura decisiva: ${nameOf(last.runnerId)}${last.hunterId ? ` por ${nameOf(last.hunterId)}` : ''} a los ${clock(last.atOffsetMs)}`);
    }
    if (o.cause === 'time_up' && o.winner === 'runner') highlights.push('Los fugitivos aguantaron hasta el final');
  }
  if (ranking.length > 0 && ranking[0][1] >= 2 && (ranking.length === 1 || ranking[1][1] < ranking[0][1])) {
    highlights.push(`${infection ? 'Más infecciones' : 'Más capturas'}: ${nameOf(ranking[0][0])} (${ranking[0][1]})`);
  }
  const winnerText = { hunter: 'Ganan los cazadores', runner: infection ? 'Ganan los supervivientes' : fox ? 'Gana el zorro' : 'Ganan los fugitivos' };
  return {
    mode: modeInfo(snap.config).name,
    winner: o.winner ? winnerText[o.winner] : 'Sin ganador',
    cause: (infection && o.cause === 'all_captured' ? 'Todos infectados' : fox ? FOX_WIN_TEXT[o.cause] ?? WIN_TEXT[o.cause] : WIN_TEXT[o.cause]) ?? '',
    durationMs: duration,
    timeToVictoryMs: o.cause === 'all_captured' && captures.length > 0 ? captures[captures.length - 1].atOffsetMs : null,
    captureCount: captures.length,
    selfDeclared: captures.filter((c) => c.via === 'self').length,
    hunterRanking: ranking.map(([id, n]) => ({ name: nameOf(id), captures: n })),
    captures: captures.map((c) => ({ runner: nameOf(c.runnerId), hunter: c.hunterId ? nameOf(c.hunterId) : null, atMs: c.atOffsetMs, via: c.via, converted: c.converted === true })),
    highlights,
    rulesVersion: snap.rulesVersion ?? null, // con qué reglas se jugó (Plan §8.3)
  };
}

/**
 * Infección: todas las infecciones, agrupadas por quién infectó: [{ hunterId, victims }] en el orden de la
 * primera infección de cada grupo (y las víctimas, en orden). Las autodeclaradas sin autor (p. ej., quien
 * nombró a un convertido aún en su espera) van en un grupo con hunterId null. Ninguna se queda fuera.
 */
export function contagionGroups(captures) {
  const groups = new Map();
  for (const c of [...captures].sort((a, b) => (a.atOffsetMs ?? 0) - (b.atOffsetMs ?? 0))) {
    if (!c.converted) continue;
    const key = c.hunterId ?? null;
    if (!groups.has(key)) groups.set(key, { hunterId: key, victims: [] });
    groups.get(key).victims.push(c.runnerId);
  }
  return [...groups.values()];
}

/**
 * Participantes del Mission Report, iguales para todos los que lo miran. Al terminar, el servidor da el
 * equipo de todos (y conserva a quien jugó y salió): con eso se dice de qué equipo era cada uno y qué
 * pasó con él (capturado y cuándo, libre al final, salió), sin cifras nuevas. Si una instantánea antigua
 * no trae el equipo, `team` queda en null.
 */
export function reportParticipants(snap, nameOf = (id) => id) {
  if (!snap || snap.phase !== 'FINISHED') return [];
  const captures = snap.captures ?? [];
  const byId = new Map(snap.players.map((p) => [p.id, p]));
  const ids = snap.players.filter((p) => p.status === 'active' || p.status === 'captured' || p.status === 'left').map((p) => p.id);
  for (const c of captures) for (const id of [c.runnerId, c.hunterId]) if (id && !ids.includes(id)) ids.push(id);
  return ids.map((id) => {
    const p = byId.get(id);
    const caught = captures.find((c) => c.runnerId === id);
    const made = captures.filter((c) => c.hunterId === id).length;
    const team = p?.team ?? (caught ? 'runner' : made > 0 ? 'hunter' : null);
    // Quien salió de la sala después del final no abandonó la partida.
    const left = p?.status === 'left' && p.leftReason !== 'after_end';
    const verb = caught?.converted ? 'Infectado' : 'Captura';
    // D-057: quien pasa 5 min sin conexión queda fuera como si abandonara; el informe dice por qué.
    const leftText = p?.leftReason === 'timeout' ? 'Sin conexión' : 'Abandonó';
    let detail = '';
    if (caught) detail = `${verb} a los ${clock(caught.atOffsetMs)}${caught.converted && made > 0 ? ` · ${made} ${made === 1 ? 'captura' : 'capturas'}` : ''}`;
    else if (made > 0) detail = `${made} ${made === 1 ? 'captura' : 'capturas'}`;
    else if (left) detail = leftText;
    else if (team === 'runner') {
      // «Escapó» solo si ganó el zorro (no si terminó sin ganador).
      const foxEscaped = snap.config?.mode === 'fox_hunt' && snap.outcome?.winner === 'runner';
      detail = foxEscaped ? 'Escapó' : snap.config?.mode === 'infection' ? 'Superviviente' : 'Libre al final';
    }
    if (left && detail !== leftText) detail += ` · ${leftText.toLowerCase()}`;
    return { id, name: nameOf(id), team, caught: Boolean(caught), captures: made, left, detail };
  });
}

/**
 * Resultado personal, fuera del informe común: usa solo el equipo propio, que cada jugador ya conoce.
 * null si este jugador no jugó la partida.
 */
export function personalResult(snap, myId, nameOf = (id) => id) {
  const self = me(snap, myId);
  if (!snap?.outcome || !self?.team) return null;
  // Quien quedó fuera durante la partida no la acabó: lo mismo que dice el informe común (D-057).
  if (self.status === 'left' && self.leftReason !== 'after_end') {
    return self.leftReason === 'timeout'
      ? { title: 'Quedaste fuera', tone: 'none', detail: 'Pasaste más de 5 min sin conexión y la partida siguió sin ti.' }
      : { title: 'Quedaste fuera', tone: 'none', detail: 'Abandonaste la partida antes del final.' };
  }
  const winner = snap.outcome.winner;
  // El zorro juega solo: gana o pierde él, no «su equipo».
  const alone = snap.config?.mode === 'fox_hunt' && self.team === 'runner';
  const title = winner === null ? 'Sin ganador' : winner === self.team ? (alone ? 'Ganas' : 'Tu equipo gana') : alone ? 'Pierdes' : 'Tu equipo pierde';
  const tone = winner === null ? 'none' : winner === self.team ? 'win' : 'lose';
  const captures = snap.captures ?? [];
  let detail;
  const infectedMe = captures.find((x) => x.runnerId === myId && x.converted);
  if (infectedMe) {
    // Infección: acabó cazando (y gana o pierde con los cazadores, D-057).
    const n = captures.filter((x) => x.hunterId === myId).length;
    const by = infectedMe.hunterId ? `Te infectó ${nameOf(infectedMe.hunterId)}` : 'Te declaraste infectado';
    detail = `${by} a los ${clock(infectedMe.atOffsetMs)}; después ${n === 0 ? 'no infectaste a nadie' : `infectaste a ${n}`}`;
  } else if (self.team === 'runner') {
    const c = captures.find((x) => x.runnerId === myId);
    if (!c) detail = 'Seguías libre al final';
    else if (c.via === 'self' && !c.hunterId) detail = `Declaraste tu captura a los ${clock(c.atOffsetMs)}`;
    else detail = `Te capturó ${nameOf(c.hunterId)} a los ${clock(c.atOffsetMs)}`;
  } else {
    const n = captures.filter((x) => x.hunterId === myId).length;
    detail = n === 0 ? 'No hiciste ninguna captura' : `Hiciste ${n} ${n === 1 ? 'captura' : 'capturas'}`;
  }
  return { title, tone, detail };
}

/**
 * Próxima pista (USER_FLOWS F8: «próxima pista en X» en la barra de los dos roles). El servidor ya da
 * `nextPingAt` a todos; aquí solo se explica según el rol. null fuera de la persecución.
 * `progress`: fracción del intervalo que falta (1 → recién enviada, 0 → a punto de llegar).
 */
export function pingCountdown(snap, team, now) {
  if (snap?.phase !== 'ACTIVE' || (team !== 'hunter' && team !== 'runner')) return null;
  if (snap.nextPingAt === null || snap.nextPingAt === undefined) {
    return { text: team === 'hunter' ? 'No quedan más pistas en esta partida' : 'Ya no se enviarán más pistas', leftMs: null, imminent: false, progress: 0 };
  }
  const leftMs = Math.max(0, snap.nextPingAt - now);
  return {
    text: team === 'hunter' ? 'Próxima pista en' : 'Los cazadores reciben tu posición en',
    leftMs,
    imminent: leftMs <= 60_000,
    progress: Math.min(1, leftMs / (snap.config?.pingIntervalMs || 1)),
  };
}

/** Aviso de «Pista en 1 min» al fugitivo (USER_FLOWS F8): una vez por pista, al bajar de 60 s. */
export const PING_WARNING_MS = 60_000;

/**
 * Texto para compartir el Mission Report (Plan Maestro §4.4, «Compartir»: sin ubicación sensible ni
 * datos no autorizados). Solo usa lo que ya muestra el informe: nunca coordenadas ni equipos ocultos.
 */
export function reportShareText(report) {
  if (!report) return null;
  const lines = [`THE OUTRUN · Mission Report${report.mode ? ` · ${report.mode}` : ''}`, `${report.winner} — ${report.cause}`];
  const stats = [];
  if (report.durationMs !== null) stats.push(`persecución ${clock(report.durationMs)}`);
  const infection = report.mode === MODES.infection.name;
  stats.push(`${report.captureCount} ${infection ? (report.captureCount === 1 ? 'infectado' : 'infectados') : report.captureCount === 1 ? 'captura' : 'capturas'}`);
  if (report.timeToVictoryMs !== null) stats.push(`victoria a los ${clock(report.timeToVictoryMs)}`);
  lines.push(stats.join(' · '));
  for (const h of report.highlights) lines.push(`• ${h}`);
  lines.push('RUN. HIDE. STAY AHEAD.');
  return lines.join('\n');
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

/** Antigüedad (hora del servidor) desde la que un evento repetido al reanudar ya no se anuncia. */
export const STALE_EVENT_MS = 15_000;

/**
 * ¿Es un evento repetido de hace rato (p. ej. al recargar la página en mitad de la partida)? Entonces
 * solo actualiza el estado, sin tarjetas, mensajes ni vibraciones. Lo que sigue vigente sí se anuncia:
 * la reclamación de captura que aún espera respuesta y la revelación del rol durante la huida.
 */
export function isStaleEvent(e, snap) {
  if (!(e?.ageMs > STALE_EVENT_MS)) return false;
  if (e.type === 'tag_claimed') return snap?.pendingClaimForMe?.claimId !== e.data?.claimId;
  if (e.type === 'role_revealed') return snap?.phase !== 'HEAD_START';
  return true;
}

/**
 * Infección: conversión propia aún sin tarjeta. El evento `role_changed` puede llegar viejo (reconexión,
 * recarga) o perderse; la instantánea dice igual que me infectaron. `seenKey` es la clave de la última
 * tarjeta ya mostrada en este móvil: así no se repite. null si no hay nada que mostrar.
 */
export function pendingConversion(snap, myId, seenKey) {
  if (snap?.phase !== 'ACTIVE' && snap?.phase !== 'HEAD_START') return null;
  const self = me(snap, myId);
  if (self?.team !== 'hunter' || self.status !== 'active') return null;
  if (!(snap.captures ?? []).some((c) => c.runnerId === myId && c.converted)) return null;
  const key = `${snap.roomId}:${snap.gameNo}`;
  return key === seenKey ? null : { key, team: 'hunter' };
}

/** Texto de la tarjeta de conversión con la espera real que da el servidor (`canTagFrom`, hora del servidor). */
export function conversionText(canTagFrom, now) {
  const wait = canTagFrom ? canTagFrom - now : 0;
  return `Ya no ves a los fugitivos: ves a los cazadores y recibirás las próximas pistas. ${wait > 0 ? `Podrás capturar dentro de ${clock(wait)}.` : 'Ya puedes capturar.'}`;
}

/** ¿Se dibuja la tarjeta del rol (o de la conversión)? Solo mientras dura y con la partida en juego. */
export function revealOpen(reveal, snap, nowPerf) {
  return Boolean(reveal && nowPerf < reveal.until && (snap?.phase === 'HEAD_START' || snap?.phase === 'ACTIVE'));
}

/**
 * Hoja abierta tras una instantánea: «¿Quién te ha pillado?» solo vale en la persecución. El motor borra las
 * reclamaciones al terminar sin avisar (`tag_claim_resolved`), y la hoja no debe reabrirse en la revancha.
 */
export function sheetAfterSnapshot(sheet, snap) {
  return sheet === 'selftag' && snap?.phase !== 'ACTIVE' ? null : sheet;
}

/** Aviso al volver a la sala desde la cuenta atrás (`countdown_aborted`): por qué y qué hacer. */
export function countdownAbortText(reason) {
  const why = reason === 'aborted_by_host'
    ? 'El anfitrión ha cancelado el inicio.'
    : reason === 'team_empty'
      ? 'Se ha cancelado el inicio: alguien ha salido y faltan jugadores.'
      : 'Se ha cancelado el inicio.';
  return `${why} Vuelve a pulsar «Estoy listo» para empezar otra vez.`;
}

/**
 * Caza del zorro: «El zorro es X» para un cazador desde que termina la cuenta atrás (los roles son públicos:
 * el servidor ya da el equipo del zorro a todos). null para el zorro, en otros modos o sin ese dato.
 */
export function foxLine(snap, myId, nameOf = (id) => id) {
  if (snap?.config?.mode !== 'fox_hunt' || (snap.phase !== 'HEAD_START' && snap.phase !== 'ACTIVE')) return null;
  if (me(snap, myId)?.team !== 'hunter') return null;
  const fox = snap.players.find((p) => p.id !== myId && p.team === 'runner');
  return fox ? `El zorro es ${nameOf(fox.id)}` : null;
}

/**
 * Panel de pistas de un cazador que aún no tiene ninguna. Un convertido no recibe la pista anterior a su
 * conversión: entonces no es «la primera», sino la próxima. null si no quedan pistas.
 */
export function pingWaitText(snap) {
  if (snap?.nextPingAt === null || snap?.nextPingAt === undefined) return null;
  const interval = snap.config?.pingIntervalMs;
  const first = !interval || snap.activeStart === null || snap.activeStart === undefined || snap.nextPingAt - snap.activeStart <= interval;
  const whom = snap.config?.mode === 'fox_hunt' ? 'el zorro' : 'cada fugitivo';
  return `La ${first ? 'primera' : 'próxima'} pista llega sola cuando el contador de arriba llegue a 0:00: verás en el mapa dónde estaba ${whom}.`;
}

/** Explicación de los roles para el anfitrión en la sala (en la Caza del zorro, los roles son públicos). */
export function lobbyRolesHint(config) {
  if (config?.mode === 'fox_hunt') {
    return 'Roles: «Sorteo» elige al zorro al empezar. Si lo asignas tú, solo tú lo sabes hasta que termine la cuenta atrás; desde ahí, todos sabrán quién es el zorro.';
  }
  return 'Roles: «Sorteo» los reparte el servidor en secreto al empezar. Si asignas uno, solo tú lo ves; cada jugador descubre el suyo al terminar la cuenta atrás.';
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

/** Una posición recibida deja de ser «actual» a los 15 s (mismo umbral experimental que el motor). */
export const POSITION_CURRENT_MS = 15_000;

/**
 * Lo que se dibuja en el mapa (o en el radar de reserva). Se construye SOLO con lo que el servidor ha
 * autorizado a este jugador: `positions` (compañeros, fugitivos expuestos o, como espectador, todos
 * con retraso) y, para un cazador, la última pista. No añade a nadie más. Cada punto lleva un `id`
 * estable para que el mapa mueva su marcador en vez de crear otro. Una posición pasa a «desactualizada»
 * si el servidor no la daba por actual o si ha envejecido aquí (p. ej., sin conexión) más de 15 s.
 * `now` es la hora del servidor; `positionsAt`, la del último envío de posiciones.
 */
export function mapModel({ snap, team, positions = [], positionsAt = 0, ping = null, reading = null, now, nameOf = (id) => id }) {
  // La zona de este instante (zona dinámica: la del plan del servidor a la hora del servidor).
  const zone = zoneNow(snap, now);
  if (!zone) return null;
  const dots = [];
  // La lista local es la del último envío (cada 5 s): no se pinta a quien ya no está en la partida ni, como
  // compañero, a quien la vista actual ya no da como de tu equipo (p. ej., tras convertirte en Infección).
  const listed = Array.isArray(snap.players) ? new Map(snap.players.map((x) => [x.id, x])) : null;
  for (const p of positions) {
    if (p.lat === null || p.lng === null || p.lat === undefined || p.lng === undefined) continue;
    if (listed) {
      const who = listed.get(p.playerId);
      if (!who || who.status === 'left') continue;
      if (p.reason === 'teammate' && who.team !== team) continue;
      if ((p.reason === 'exposed' || p.reason === 'hunter_seen') && who.status !== 'active') continue;
    }
    const kind = p.reason === 'teammate' ? 'mate' : p.reason === 'exposed' || p.reason === 'hunter_seen' ? 'exposed' : 'spectator';
    // Solo se colorea lo que se sabe: compañeros (tu equipo), expuestos (siempre fugitivos) y, en la
    // caza del zorro, los cazadores que ve el zorro.
    const dotTeam = kind === 'mate' ? team : p.reason === 'hunter_seen' ? 'hunter' : kind === 'exposed' ? 'runner' : 'x';
    const ageMs = p.ageMs === null || p.ageMs === undefined ? null : p.ageMs + Math.max(0, now - positionsAt);
    dots.push({
      id: p.playerId,
      lat: p.lat,
      lng: p.lng,
      label: `${nameOf(p.playerId)}${ageMs === null ? '' : ` · ${ago(ageMs)}`}`,
      kind,
      team: dotTeam,
      stale: p.availability !== 'CURRENT' || (ageMs !== null && ageMs > POSITION_CURRENT_MS),
    });
  }
  if (team === 'hunter' && ping) {
    for (const e of ping.entries ?? []) {
      if (!e.position) continue;
      dots.push({ id: `ping:${e.runnerId}`, ...e.position, label: `${nameOf(e.runnerId)} · ${ago(e.ageMs + (now - ping.at))}`, kind: 'ping', team: 'runner', stale: true });
    }
  }
  const mine = reading ? { lat: reading.lat, lng: reading.lng, accuracyM: reading.accuracyM } : null;
  return { center: zone.center, radiusM: zone.radiusM, meeting: snap.config.meetingPoint ?? null, me: mine, myTeam: team, dots };
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
  const mode = modeInfo(snap.config);
  if (lobby.length < mode.minPlayers) out.push(mode.minPlayers > 2 ? `${mode.name} necesita al menos ${mode.minPlayers} jugadores.` : 'Hacen falta al menos 2 jugadores.');
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
export function sharingStatus(tracking, uploading, denied = false) {
  // Con el permiso retirado no se envía nada, aunque el seguimiento siga «activo» en la página.
  if (denied) return { on: false, text: 'No se comparte tu ubicación: falta el permiso' };
  if (!tracking) return { on: false, text: 'No se comparte tu ubicación' };
  return {
    on: true,
    text: uploading
      ? 'Compartiendo tu ubicación con el servidor de la partida (también con la pantalla bloqueada)'
      : 'Compartiendo tu ubicación con el servidor de la partida',
  };
}

/**
 * Pantalla durante la partida en el navegador. Con la pantalla apagada, el navegador deja de dar y de
 * enviar la ubicación (server/README.md, «Limitaciones»), así que se pide mantenerla encendida
 * (Screen Wake Lock) y, si no se puede, se avisa. En la app no hace falta: el servicio nativo envía
 * con la pantalla bloqueada. null si no hay nada que mostrar.
 */
export function screenNotice({ app, held }) {
  if (app) return null;
  if (held) return { warn: false, text: 'La pantalla se mantiene encendida durante la partida: con ella apagada, el navegador no envía tu ubicación.' };
  return { warn: true, text: 'Mantén la pantalla encendida: con ella apagada, el navegador deja de enviar tu ubicación.' };
}

/**
 * Aviso fijo cuando falta el permiso de ubicación durante la partida (AC-D9; Plan Maestro §4.1: «si se
 * deniega, la app no debe fingir que puede validar ubicación»). null si no hay nada que avisar.
 */
export function locationDeniedNotice(denied) {
  if (!denied) return null;
  return 'Falta el permiso de ubicación. Sin él, el servidor no sabe dónde estás y no puede validar capturas contigo. Actívalo en los ajustes del navegador o del móvil y pulsa «Reintentar».';
}

/**
 * Aviso visible cuando se pierde la conexión con el servidor (Plan Maestro §7, incidencia: «qué ocurre
 * y cómo recuperarse»; no dejar al jugador sin contexto). null si no hay nada que avisar.
 */
export function connectionNotice(status, phase) {
  // Sin «vuelve al inicio»: eso borraría la sesión, y a mitad de partida ya no se puede volver a entrar.
  if (status === 'closed') return 'Desconectado del servidor. Recarga la página para volver a la partida.';
  if (status !== 'reconnecting' && status !== 'connecting') return null;
  if (phase === 'COUNTDOWN' || phase === 'HEAD_START' || phase === 'ACTIVE') {
    return 'Sin conexión con el servidor. La partida sigue: el servidor manda en el tiempo y en las capturas. Reconectando…';
  }
  return phase ? 'Sin conexión con el servidor. Reconectando…' : null;
}
