// DEMO VISUAL: lógica de una partida SIMULADA del modo Clásico.
// NO es el motor validado de S0 (engine/) ni lo sustituye. No usa GPS ni red.
// Todos los valores numéricos son EXPERIMENTALES (D-038). Coordenadas en metros
// respecto al centro del mapa: el mapa no depende de ningún proveedor.

export const APP_NAME = 'Rastro'; // nombre provisional, sustituible

export const EXPERIMENTAL = Object.freeze({
  minPlayers: 2,
  maxPlayers: 20,
  ratios: { pocos: 1 / 5, equilibrado: 1 / 3, muchos: 1 / 2 },
  durationsMin: [10, 20, 30],
  zoneRadiiM: [250, 400, 600],
  countdownS: 3,
  headStartS: 120,
  pingEveryS: 180,
  botUpdateEveryS: 5,
  demoSpeeds: [5, 10, 30],
  defaultSpeed: 10,
  walkMps: 1.4,
  botRunnerMps: 1.2,
  botHunterMps: 1.8,
  captureRadiusM: 15,
  botTagRadiusM: 8,
  claimResponseS: 4,
  incomingTimeoutS: 30,
  botConfirmProbability: 0.75,
  disputeResolveAfterS: 60,
  reclaimCooldownS: 60,
  resolutionWindowS: 120,
  outsideGraceS: 30,
  spectatorDelayS: 60,
  scan: { uses: 2, radiusM: 100, cooldownS: 120 },
  dynamicZone: { firstChangeAt: 0.4, secondChangeAt: 0.7, shrink: 0.7, warnS: 60 },
});

/**
 * Comportamiento de los BOTS de la demo. No son reglas del juego ni parámetros de partida (D-038):
 * solo sirven para que la simulación se parezca más a una partida. No afectan al jugador.
 */
export const BOT_BEHAVIOR = Object.freeze({
  relocateAfterPingProbability: 0.5, // tras una pista que le incluye, cambia de escondite (a veces)
  relocateMinM: 60, // cambio corto y controlado, siempre caminando
  relocateMaxM: 160,
});

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const BOT_NAMES = [
  'Lucía', 'Mateo', 'Sofía', 'Hugo', 'Martina', 'Leo', 'Valeria', 'Daniel', 'Paula', 'Álvaro',
  'Carmen', 'Pablo', 'Irene', 'Diego', 'Noa', 'Marcos', 'Elena', 'Adrián', 'Julia', 'Bruno',
];

// ------------------------------------------------------------------ utilidades

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function hashCode(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function stepToward(from, to, meters) {
  const d = dist(from, to);
  if (d <= meters || d === 0) return { x: to.x, y: to.y };
  return { x: from.x + ((to.x - from.x) * meters) / d, y: from.y + ((to.y - from.y) * meters) / d };
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ sala

export function isValidCode(code) {
  return typeof code === 'string' && code.length === 6 && [...code].every((c) => CODE_ALPHABET.includes(c));
}

export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/\s+/g, '');
}

function codeFromSeed(seed) {
  const random = mulberry32(seed);
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** Cazadores objetivo para n jugadores (HIPÓTESIS D-031: aún por definir y probar). */
export function huntersTarget(n, ratioKey) {
  const ratio = EXPERIMENTAL.ratios[ratioKey] ?? EXPERIMENTAL.ratios.equilibrado;
  return clamp(Math.round(n * ratio), 1, Math.max(1, Math.floor(n / 2)));
}

export function defaultSettings() {
  return {
    players: 8,
    assignment: 'auto',
    ratio: 'equilibrado',
    durationMin: 20,
    zoneRadiusM: 400,
    dynamicZone: true,
  };
}

function buildPlayers(n, random, selfIsHost) {
  const names = shuffle(BOT_NAMES, random).slice(0, n - 1);
  const players = [{ id: 'me', name: 'Tú', isSelf: true, isHost: selfIsHost, team: null, ready: false }];
  names.forEach((name, i) => {
    players.push({ id: `b${i + 1}`, name, isSelf: false, isHost: !selfIsHost && i === 0, team: null, ready: false });
  });
  return players;
}

export function createRoom(settings, seed = Date.now()) {
  const s = { ...defaultSettings(), ...settings };
  s.players = clamp(Math.round(s.players), EXPERIMENTAL.minPlayers, EXPERIMENTAL.maxPlayers);
  const random = mulberry32(seed);
  return {
    code: codeFromSeed(seed),
    seed,
    drawSeed: seed,
    drawCount: 0,
    round: 1,
    settings: s,
    players: buildPlayers(s.players, random, true),
    joined: false,
    history: [],
  };
}

export function joinRoom(rawCode) {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) {
    return { ok: false, error: 'Código no válido: deben ser 6 caracteres sin O, 0, I, 1 ni L.' };
  }
  const seed = hashCode(code);
  const random = mulberry32(seed);
  const settings = { ...defaultSettings(), players: 4 + Math.floor(random() * 7) };
  const room = createRoom(settings, seed);
  room.code = code;
  room.players = buildPlayers(settings.players, mulberry32(seed + 1), false);
  room.joined = true;
  // En una sala ajena el anfitrión simulado ya ha sorteado los equipos.
  drawTeams(room);
  return { ok: true, room };
}

export function teamCounts(room) {
  const hunters = room.players.filter((p) => p.team === 'hunter').length;
  const runners = room.players.filter((p) => p.team === 'runner').length;
  return { hunters, runners, unassigned: room.players.length - hunters - runners, target: huntersTarget(room.players.length, room.settings.ratio) };
}

/** Sorteo reproducible: misma sala y mismo número de sorteo, mismo reparto. */
export function drawTeams(room) {
  room.drawCount++;
  const random = mulberry32(room.drawSeed + room.drawCount * 7919);
  const order = shuffle(room.players.map((p) => p.id), random);
  const k = huntersTarget(room.players.length, room.settings.ratio);
  for (const p of room.players) p.team = order.indexOf(p.id) < k ? 'hunter' : 'runner';
  return room;
}

export function setTeam(room, playerId, team) {
  const p = room.players.find((x) => x.id === playerId);
  if (!p || !['hunter', 'runner'].includes(team)) return false;
  p.team = team;
  return true;
}

export function setReady(room, playerId, ready) {
  const p = room.players.find((x) => x.id === playerId);
  if (p) p.ready = ready;
}

export function botsReady(room) {
  for (const p of room.players) if (!p.isSelf) p.ready = true;
}

/** Errores (bloquean el inicio) y avisos (no bloquean). */
export function validateLobby(room) {
  const issues = [];
  const { hunters, runners, unassigned, target } = teamCounts(room);
  if (unassigned > 0) {
    issues.push({ level: 'error', code: 'unassigned', message: room.settings.assignment === 'auto' ? 'Falta sortear los equipos.' : `Hay ${unassigned} jugador(es) sin equipo.` });
  }
  if (unassigned === 0 && hunters < 1) issues.push({ level: 'error', code: 'no_hunters', message: 'Hace falta al menos 1 cazador.' });
  if (unassigned === 0 && runners < 1) issues.push({ level: 'error', code: 'no_runners', message: 'Hace falta al menos 1 fugitivo.' });
  const notReady = room.players.filter((p) => !p.ready).length;
  if (notReady > 0) issues.push({ level: 'error', code: 'not_ready', message: `${notReady} jugador(es) sin confirmar «listo».` });
  if (unassigned === 0 && hunters >= 1 && runners >= 1 && hunters !== target) {
    issues.push({ level: 'warning', code: 'ratio', message: `La proporción elegida sugiere ${target} cazador(es); hay ${hunters}. (Proporción experimental)` });
  }
  return issues;
}

export const canStart = (room) => validateLobby(room).every((i) => i.level !== 'error');

// ------------------------------------------------------------------ partida

function zoneSchedule(settings, random) {
  const r0 = settings.zoneRadiusM;
  const zones = [{ at: 0, center: { x: 0, y: 0 }, r: r0 }];
  if (!settings.dynamicZone) return zones;
  const total = settings.durationMin * 60;
  let prev = zones[0];
  for (const frac of [EXPERIMENTAL.dynamicZone.firstChangeAt, EXPERIMENTAL.dynamicZone.secondChangeAt]) {
    const r = Math.round(prev.r * EXPERIMENTAL.dynamicZone.shrink);
    // Contención: la zona nueva queda dentro de la anterior (recomendación D-032, no regla aprobada).
    const maxShift = prev.r - r;
    const angle = random() * Math.PI * 2;
    const shift = maxShift * (0.3 + random() * 0.6);
    const center = { x: prev.center.x + Math.cos(angle) * shift, y: prev.center.y + Math.sin(angle) * shift };
    // Los cambios se cuentan desde el inicio de la caza (t = ventaja).
    prev = { at: EXPERIMENTAL.headStartS + Math.round(total * frac), center, r };
    zones.push(prev);
  }
  return zones;
}

export function zoneAt(game, t) {
  let current = game.zones[0];
  for (const z of game.zones) if (z.at <= t) current = z;
  return current;
}

export function nextZoneChange(game, t) {
  // La zona inicial no es un "cambio": durante la cuenta atrás no hay nada que anunciar.
  return game.zones.slice(1).find((z) => z.at > t) ?? null;
}

function randomPointIn(center, radius, random) {
  const a = random() * Math.PI * 2;
  const d = Math.sqrt(random()) * radius;
  return { x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d };
}

export function startGame(room) {
  if (!canStart(room)) throw new Error('La sala no está lista');
  const seed = room.seed + room.round * 104729;
  const random = mulberry32(seed);
  const settings = room.settings;
  const zones = zoneSchedule(settings, random);
  const players = room.players.map((p) => {
    // Los cazadores empiezan en el punto de encuentro; los fugitivos, repartidos.
    const pos = p.team === 'hunter' ? randomPointIn({ x: 0, y: 0 }, 25, random) : randomPointIn({ x: 0, y: 0 }, 60, random);
    return {
      id: p.id, name: p.name, isSelf: p.isSelf, team: p.team, status: 'active',
      pos, target: null, lastUpdate: 0, history: [{ t: 0, pos: { ...pos } }],
      outsideSince: null, exposed: false, wanderTarget: null,
    };
  });
  return {
    seed,
    random,
    round: room.round,
    settings,
    zones,
    phase: 'countdown',
    t: -EXPERIMENTAL.countdownS, // segundos de juego; 0 = empieza la ventaja
    headStartS: EXPERIMENTAL.headStartS,
    durationS: settings.durationMin * 60,
    players,
    pings: [],
    nextPingAt: null,
    claims: [],
    captures: [],
    incoming: null,
    scan: { left: EXPERIMENTAL.scan.uses, readyAt: 0, last: null },
    events: [],
    resolutionEndsAt: null,
    outcome: null,
    endedReason: null,
  };
}

export const self = (game) => game.players.find((p) => p.isSelf);
const active = (game, team) => game.players.filter((p) => p.team === team && p.status === 'active');
const huntStart = (game) => game.headStartS;
const huntEnd = (game) => game.headStartS + game.durationS;

function emit(game, type, text, extra = {}) {
  game.events.push({ t: game.t, type, text, ...extra });
}

/** Avanza la simulación dtS segundos de juego, en pasos de 1 s (determinista). */
export function stepGame(game, dtS) {
  let remaining = dtS;
  while (remaining > 0 && game.phase !== 'finished') {
    const step = Math.min(1, remaining);
    remaining -= step;
    tick(game, step);
  }
  return game;
}

function tick(game, dt) {
  game.t += dt;
  const t = game.t;
  if (game.phase === 'countdown' && t >= 0) {
    game.phase = 'headstart';
    emit(game, 'phase', 'Empieza la ventaja: los fugitivos se esconden.');
  }
  if (game.phase === 'headstart' && t >= huntStart(game)) {
    game.phase = 'hunt';
    game.nextPingAt = huntStart(game) + EXPERIMENTAL.pingEveryS;
    emit(game, 'phase', '¡Empieza la caza!');
  }
  if (game.phase === 'countdown') return;

  moveAll(game, dt);
  if (game.phase === 'hunt' || game.phase === 'resolving') updateZoneState(game);

  if (game.phase === 'hunt') {
    zoneWarnings(game);
    if (game.nextPingAt !== null && t >= game.nextPingAt) doPing(game);
    botCaptures(game);
    processClaims(game);
    processIncoming(game);
    if (active(game, 'runner').length === 0) return finish(game, 'all_captured');
    if (t >= huntEnd(game)) {
      if (game.claims.some(isOpen)) {
        game.phase = 'resolving';
        game.resolutionEndsAt = t + EXPERIMENTAL.resolutionWindowS;
        emit(game, 'resolving', 'Tiempo. Hay disputas abiertas: ventana de resolución.');
      } else {
        return finish(game, 'time_up');
      }
    }
  } else if (game.phase === 'resolving') {
    processClaims(game);
    if (!game.claims.some(isOpen) || t >= game.resolutionEndsAt) {
      for (const c of game.claims) {
        if (isOpen(c)) {
          close(game, c, 'default_no_capture');
          emit(game, 'dispute', `Disputa ${c.hunterName} → ${c.runnerName}: regla predeterminada, no hay captura (propuesta D-035).`);
        }
      }
      return finish(game, active(game, 'runner').length === 0 ? 'all_captured' : 'time_up');
    }
  }
}

function moveAll(game, dt) {
  const t = game.t;
  const zone = zoneAt(game, t);
  const upcoming = nextZoneChange(game, t);
  const assignment = game.phase === 'hunt' ? huntAssignment(game) : null;
  for (const p of game.players) {
    if (p.status !== 'active') continue;
    if (p.isSelf) {
      // Los cazadores esperan en el punto de encuentro durante la ventaja.
      if (p.team === 'hunter' && game.phase === 'headstart') p.target = null;
      if (p.target) p.pos = stepToward(p.pos, p.target, EXPERIMENTAL.walkMps * dt);
      if (p.target && dist(p.pos, p.target) < 0.5) p.target = null;
    } else if (p.team === 'runner') {
      p.pos = stepToward(p.pos, runnerHideSpot(game, p, zone, upcoming), EXPERIMENTAL.botRunnerMps * dt);
    } else if (game.phase === 'hunt') {
      const target = hunterTarget(game, p, zone, assignment);
      p.pos = stepToward(p.pos, target, EXPERIMENTAL.botHunterMps * dt);
    }
    // Muestra "enviada" cada botUpdateEveryS: es lo que ven los demás (también para el jugador).
    if (t - p.lastUpdate >= EXPERIMENTAL.botUpdateEveryS) {
      p.lastUpdate = t;
      p.history.push({ t, pos: { ...p.pos } });
      if (p.history.length > 40) p.history.shift();
    }
  }
}

/**
 * Fugitivo bot: camina hasta un escondite dentro de la zona y se queda quieto. Solo cambia de sitio
 * (caminando y a poca distancia) cuando la zona anunciada deja fuera su escondite o, a veces, cuando
 * una pista acaba de incluir su posición (los fugitivos reciben ese aviso en la app).
 * Solo usa información que un fugitivo conoce: su posición, la zona y los avisos de pista.
 * Nunca la posición de los cazadores. Cada bot tiene su propio generador con semilla, así que su
 * conducta no depende de lo que hagan los demás.
 */
function runnerHideSpot(game, p, zone, upcoming) {
  p.rng ??= mulberry32((game.seed ^ hashCode(p.id)) >>> 0);
  const safe = upcoming && upcoming.at - game.t <= EXPERIMENTAL.dynamicZone.warnS ? upcoming : zone;
  const fits = (spot) => dist(spot, safe.center) <= safe.r * 0.85;
  if (!p.hideSpot || !fits(p.hideSpot)) {
    p.hideSpot = randomPointIn(safe.center, safe.r * 0.8, p.rng);
  }
  const ping = game.pings.at(-1);
  if (ping && ping.n !== p.lastPingSeen) {
    p.lastPingSeen = ping.n;
    if (ping.entries.some((e) => e.id === p.id) && p.rng() < BOT_BEHAVIOR.relocateAfterPingProbability) {
      for (let i = 0; i < 8; i++) {
        const a = p.rng() * Math.PI * 2;
        const d = BOT_BEHAVIOR.relocateMinM + p.rng() * (BOT_BEHAVIOR.relocateMaxM - BOT_BEHAVIOR.relocateMinM);
        const spot = { x: p.pos.x + Math.cos(a) * d, y: p.pos.y + Math.sin(a) * d };
        if (fits(spot)) {
          p.hideSpot = spot;
          break;
        }
      }
    }
  }
  return p.hideSpot;
}

/**
 * Reparto de la búsqueda entre cazadores bot por una convención sencilla: «va quien esté más cerca».
 * Cada bot puede calcular este mismo reparto por su cuenta con lo que su equipo ve en la app:
 * la última pista (posiciones con su antigüedad), los fugitivos expuestos fuera de zona y la posición
 * de sus compañeros cazadores (cada equipo ve a los suyos). No usa la posición real de fugitivos
 * ocultos ni intercambia mensajes. El jugador no entra en el reparto: los bots no presuponen qué hará.
 * Cada fugitivo cuenta una sola vez (si está expuesto, con su posición en directo). Si hay más bots
 * que objetivos, los que sobran van al objetivo más cercano. Desempates fijos: reproducible.
 */
function huntAssignment(game) {
  const ping = game.pings.at(-1);
  const byRunner = new Map();
  const isActive = (id) => game.players.find((p) => p.id === id)?.status === 'active';
  if (ping) for (const e of ping.entries) if (isActive(e.id)) byRunner.set(e.id, e.pos);
  for (const r of active(game, 'runner')) if (r.exposed) byRunner.set(r.id, r.pos);
  const targets = [...byRunner].map(([id, pos]) => ({ id, pos }));
  const bots = active(game, 'hunter').filter((h) => !h.isSelf);
  const assignment = new Map();
  if (targets.length === 0) return assignment;
  const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pairs = [];
  for (const h of bots) for (const tg of targets) pairs.push({ h, tg, d: dist(h.pos, tg.pos) });
  pairs.sort((a, b) => a.d - b.d || byId(a.h.id, b.h.id) || byId(a.tg.id, b.tg.id));
  const taken = new Set();
  for (const { h, tg } of pairs) {
    if (assignment.has(h.id) || taken.has(tg.id)) continue;
    assignment.set(h.id, tg);
    taken.add(tg.id);
  }
  for (const { h, tg } of pairs) if (!assignment.has(h.id)) assignment.set(h.id, tg);
  return assignment;
}

function hunterTarget(game, hunter, zone, assignment) {
  const target = assignment?.get(hunter.id);
  if (!target) {
    // Sin pistas: patrullan dentro de la zona.
    hunter.chaseId = null;
    if (!hunter.wanderTarget || dist(hunter.pos, hunter.wanderTarget) < 3) hunter.wanderTarget = randomPointIn(zone.center, zone.r * 0.6, game.random);
    return hunter.wanderTarget;
  }
  if (hunter.chaseId !== target.id) {
    hunter.chaseId = target.id;
    hunter.wanderTarget = null;
  }
  // Al llegar a la pista, buscan alrededor con pasos deterministas.
  if (dist(hunter.pos, target.pos) < 10) {
    if (!hunter.wanderTarget || dist(hunter.pos, hunter.wanderTarget) < 3) hunter.wanderTarget = randomPointIn(target.pos, 80, game.random);
    return hunter.wanderTarget;
  }
  return target.pos;
}

function updateZoneState(game) {
  const zone = zoneAt(game, game.t);
  for (const p of game.players) {
    if (p.status !== 'active') continue;
    const outside = dist(p.pos, zone.center) > zone.r;
    if (outside && p.outsideSince === null) {
      p.outsideSince = game.t;
      if (p.isSelf) emit(game, 'zone', 'Estás fuera de la zona. Vuelve con calma: no hace falta correr.');
    } else if (!outside && p.outsideSince !== null) {
      p.outsideSince = null;
      if (p.exposed) emit(game, 'zone', `${p.isSelf ? 'Has vuelto' : `${p.name} ha vuelto`} a la zona.`);
      p.exposed = false;
    }
    if (p.team === 'runner' && p.outsideSince !== null && !p.exposed && game.t - p.outsideSince >= EXPERIMENTAL.outsideGraceS) {
      p.exposed = true;
      emit(game, 'zone', p.isSelf ? `Llevas ${EXPERIMENTAL.outsideGraceS} s fuera: los cazadores te ven.` : `${p.name} lleva ${EXPERIMENTAL.outsideGraceS} s fuera de la zona.`);
    }
  }
}

function zoneWarnings(game) {
  const upcoming = nextZoneChange(game, game.t);
  if (!upcoming) return;
  const warnAt = upcoming.at - EXPERIMENTAL.dynamicZone.warnS;
  if (game.t >= warnAt && !upcoming.warned) {
    upcoming.warned = true;
    emit(game, 'zone', `La zona cambiará en ${formatClock(EXPERIMENTAL.dynamicZone.warnS)}. Muévete con calma hacia la zona marcada.`);
  }
  const previous = game.zones.filter((z) => z.at <= game.t).at(-1);
  if (previous && previous.at > 0 && !previous.announced && game.t >= previous.at) {
    previous.announced = true;
    emit(game, 'zone', 'La zona ha cambiado.');
  }
}

function doPing(game) {
  const entries = active(game, 'runner').map((r) => {
    const last = r.history.at(-1);
    return { id: r.id, name: r.name, pos: { ...last.pos }, measuredAt: last.t };
  });
  game.pings.push({ n: game.pings.length + 1, t: game.t, entries });
  game.nextPingAt = game.t + EXPERIMENTAL.pingEveryS;
  emit(game, 'ping', `Pista #${game.pings.length}: ${entries.length} fugitivo(s) marcados.`);
}

// ------------------------------------------------------------------ capturas (simuladas)

function capture(game, runner, hunter, via) {
  runner.status = 'captured';
  game.captures.push({ runnerId: runner.id, runnerName: runner.name, hunterId: hunter?.id ?? null, hunterName: hunter?.name ?? '—', t: game.t - huntStart(game), via });
  let text;
  if (via === 'autodeclarada') text = runner.isSelf ? 'Has declarado tu captura.' : `${runner.name} declara su captura.`;
  else if (runner.isSelf) text = `${hunter.name} te ha capturado.`;
  else text = `${hunter.isSelf ? 'Has capturado' : `${hunter.name} ha capturado`} a ${runner.name}.`;
  emit(game, 'capture', text);
}

const isOpen = (c) => c.state === 'pending' || c.state === 'disputed';

function close(game, c, state) {
  c.state = state;
  c.closedAt = game.t;
}

/** Tras cerrar una reclamación sin captura, la misma pareja espera antes de reclamar otra vez. */
function inCooldown(game, hunterId, runnerId) {
  return game.claims.some((c) => c.hunterId === hunterId && c.runnerId === runnerId && c.closedAt !== undefined && game.t - c.closedAt < EXPERIMENTAL.reclaimCooldownS);
}

/** D-033: un cazador fuera de la zona no puede capturar. */
const canHunterClaim = (p) => p.team === 'hunter' && p.status === 'active' && p.outsideSince === null;

function botCaptures(game) {
  for (const h of active(game, 'hunter')) {
    if (h.isSelf || !canHunterClaim(h) || game.claims.some((c) => c.hunterId === h.id && isOpen(c))) continue;
    for (const r of active(game, 'runner')) {
      if (dist(h.pos, r.pos) > EXPERIMENTAL.botTagRadiusM) continue;
      if (game.claims.some((c) => c.runnerId === r.id && isOpen(c)) || inCooldown(game, h.id, r.id)) continue;
      if (r.isSelf) {
        if (!game.incoming && !inCooldown(game, h.id, 'me')) {
          game.incoming = { hunterId: h.id, hunterName: h.name, since: game.t };
          emit(game, 'incoming', `${h.name} dice que te ha pillado.`);
        }
      } else {
        game.claims.push({ id: `c${game.claims.length + 1}`, hunterId: h.id, hunterName: h.name, runnerId: r.id, runnerName: r.name, state: 'pending', since: game.t, answerAt: game.t + EXPERIMENTAL.claimResponseS });
      }
      break;
    }
  }
}

function processClaims(game) {
  for (const c of game.claims) {
    const runner = game.players.find((p) => p.id === c.runnerId);
    const hunter = game.players.find((p) => p.id === c.hunterId);
    if (c.state === 'pending' && game.t >= c.answerAt) {
      // Responde un fugitivo simulado (bot).
      if (game.random() < EXPERIMENTAL.botConfirmProbability) {
        close(game, c, 'confirmed');
        capture(game, runner, hunter, 'confirmada');
      } else {
        c.state = 'disputed';
        c.disputedAt = game.t;
        emit(game, 'dispute', `${c.runnerName} disputa ${c.hunterIsSelf ? 'tu reclamación' : `la captura de ${c.hunterName}`}. Queda pendiente.`);
      }
    } else if (c.state === 'disputed' && !c.botDecided && game.t - c.disputedAt >= EXPERIMENTAL.disputeResolveAfterS) {
      // Autoridad = los implicados (propuesta D-035). Un bot solo decide por sí mismo:
      c.botDecided = true;
      const coin = game.random() < 0.5;
      if (c.hunterIsSelf) {
        // El fugitivo bot puede aceptar; si no, decides tú (retirar) o se aplica la regla al final.
        if (coin) {
          close(game, c, 'accepted');
          capture(game, runner, hunter, 'aceptada tras disputa');
        }
      } else if (c.runnerId === 'me') {
        // El cazador bot puede retirar; aceptar la captura solo puedes hacerlo tú.
        if (coin) {
          close(game, c, 'withdrawn');
          emit(game, 'dispute', `${c.hunterName} retira su reclamación sobre ti.`);
        }
      } else if (coin) {
        close(game, c, 'accepted');
        capture(game, runner, hunter, 'aceptada tras disputa');
      } else {
        close(game, c, 'withdrawn');
        emit(game, 'dispute', `${c.hunterName} retira la reclamación sobre ${c.runnerName}.`);
      }
    }
  }
}

function processIncoming(game) {
  if (game.incoming && game.t - game.incoming.since >= EXPERIMENTAL.incomingTimeoutS) {
    const { hunterId, hunterName, since } = game.incoming;
    game.claims.push({ id: `c${game.claims.length + 1}`, hunterId, hunterName, runnerId: 'me', runnerName: 'Tú', state: 'timeout', since, closedAt: game.t });
    emit(game, 'dispute', 'No respondiste a tiempo: no hay captura (regla propuesta).');
    game.incoming = null;
  }
}

/** Fugitivos a los que el jugador (cazador) puede reclamar: proximidad SIMULADA, no validada. */
export function claimableRunners(game) {
  const me = self(game);
  if (game.phase !== 'hunt' || !canHunterClaim(me)) return [];
  return active(game, 'runner')
    .filter((r) => dist(me.pos, r.pos) <= EXPERIMENTAL.captureRadiusM)
    .filter((r) => !game.claims.some((c) => c.runnerId === r.id && isOpen(c)) && !inCooldown(game, me.id, r.id));
}

export function claimCapture(game, runnerId) {
  const me = self(game);
  if (me.team === 'hunter' && me.outsideSince !== null) return { ok: false, error: 'Estás fuera de la zona: no puedes capturar hasta volver.' };
  const target = claimableRunners(game).find((r) => r.id === runnerId);
  if (!target) return { ok: false, error: 'Ese fugitivo no está lo bastante cerca (proximidad simulada).' };
  if (game.claims.some((c) => c.hunterIsSelf && isOpen(c))) {
    return { ok: false, error: 'Ya tienes una reclamación abierta.' };
  }
  const claim = { id: `c${game.claims.length + 1}`, hunterId: me.id, hunterName: 'Tú', hunterIsSelf: true, runnerId: target.id, runnerName: target.name, state: 'pending', since: game.t, answerAt: game.t + EXPERIMENTAL.claimResponseS };
  game.claims.push(claim);
  emit(game, 'claim', `Reclamación enviada a ${target.name}. Esperando su confirmación.`);
  return { ok: true, claim };
}

export function withdrawClaim(game, claimId) {
  const c = game.claims.find((x) => x.id === claimId && x.hunterIsSelf && x.state === 'disputed');
  if (!c) return false;
  close(game, c, 'withdrawn');
  emit(game, 'dispute', `Has retirado la reclamación sobre ${c.runnerName}.`);
  return true;
}

export function respondIncoming(game, accept) {
  if (!game.incoming) return false;
  const hunter = game.players.find((p) => p.id === game.incoming.hunterId);
  const me = self(game);
  if (accept) {
    game.claims.push({ id: `c${game.claims.length + 1}`, hunterId: hunter.id, hunterName: hunter.name, runnerId: me.id, runnerName: 'Tú', state: 'confirmed', since: game.t, closedAt: game.t });
    capture(game, me, hunter, 'confirmada');
  } else {
    game.claims.push({ id: `c${game.claims.length + 1}`, hunterId: hunter.id, hunterName: hunter.name, runnerId: me.id, runnerName: 'Tú', state: 'disputed', since: game.t, disputedAt: game.t });
    emit(game, 'dispute', `Has disputado la captura de ${hunter.name}. Sigues en juego; queda pendiente.`);
  }
  game.incoming = null;
  return true;
}

/** El fugitivo acepta una captura que había disputado (autoridad: el propio fugitivo). */
export function acceptOwnDispute(game, claimId) {
  const c = game.claims.find((x) => x.id === claimId && x.runnerId === 'me' && x.state === 'disputed');
  if (!c) return false;
  close(game, c, 'accepted');
  capture(game, self(game), game.players.find((p) => p.id === c.hunterId), 'aceptada tras disputa');
  return true;
}

export function selfTag(game) {
  const me = self(game);
  if (game.phase !== 'hunt' || me.team !== 'runner' || me.status !== 'active') return false;
  const nearest = active(game, 'hunter').sort((a, b) => dist(me.pos, a.pos) - dist(me.pos, b.pos))[0];
  capture(game, me, nearest ?? null, 'autodeclarada');
  return true;
}

// ------------------------------------------------------------------ guía del siguiente paso

/**
 * Una sola indicación para el jugador, por orden de prioridad: lo que pide respuesta, lo que
 * le impide jugar y, por último, el objetivo normal de su rol. Solo describe el estado: no cambia
 * reglas ni revela nada que el jugador no pueda ver (un fugitivo nunca recibe datos de cazadores).
 * Los textos invitan a moverse con calma (seguridad).
 * tone: 'act' (requiere respuesta) · 'wait' · 'danger' · 'zone' · 'go' · 'info' · 'muted'
 */
export function nextStep(game) {
  const me = self(game);
  const t = game.t;
  const isOpen = (c) => c.state === 'pending' || c.state === 'disputed';
  if (game.phase === 'finished') return { tone: 'muted', text: 'Ronda terminada.' };
  if (game.phase === 'countdown') {
    return me.team === 'hunter'
      ? { tone: 'info', text: 'Eres cazador: captura a todos los fugitivos antes de que acabe el tiempo.' }
      : { tone: 'info', text: 'Eres fugitivo: que no te capturen hasta que acabe el tiempo.' };
  }
  if (me.status === 'captured') {
    return { tone: 'muted', text: `Te han capturado. Sigues la partida como espectador (posiciones con ${EXPERIMENTAL.spectatorDelayS} s de retraso).` };
  }
  if (game.incoming) {
    const left = formatClock(EXPERIMENTAL.incomingTimeoutS - (t - game.incoming.since));
    return { tone: 'act', text: `${game.incoming.hunterName} dice que te ha pillado: responde (${left}).` };
  }
  // Fuera de zona es un peligro inmediato: va antes que las reclamaciones que solo esperan.
  if (me.outsideSince !== null) {
    if (me.team === 'hunter') return { tone: 'danger', text: 'Estás fuera de la zona: vuelve con calma para poder capturar.' };
    if (me.exposed) return { tone: 'danger', text: 'Estás fuera de la zona y los cazadores te ven. Vuelve con calma.' };
    const left = formatClock(EXPERIMENTAL.outsideGraceS - (t - me.outsideSince));
    return { tone: 'danger', text: `Estás fuera de la zona: vuelve con calma. Serás visible en ${left}.` };
  }
  const mine = game.claims.find((c) => c.hunterIsSelf && isOpen(c));
  if (mine) {
    return mine.state === 'pending'
      ? { tone: 'wait', text: `Esperando a que ${mine.runnerName} confirme tu captura. Sigue en juego hasta entonces.` }
      : { tone: 'act', text: `${mine.runnerName} disputa tu captura: sigue en juego. Puedes retirarla o esperar a que se resuelva.` };
  }
  const against = game.claims.find((c) => c.runnerId === 'me' && c.state === 'disputed');
  if (against) {
    return { tone: 'act', text: `Disputa abierta con ${against.hunterName}: sigues en juego mientras no se resuelva.` };
  }
  if (game.phase === 'resolving') {
    return { tone: 'danger', text: `Tiempo agotado. Quedan ${formatClock(game.resolutionEndsAt - t)} para resolver las disputas abiertas.` };
  }
  if (game.phase === 'headstart') {
    const left = formatClock(game.headStartS - t);
    return me.team === 'hunter'
      ? { tone: 'wait', text: `Espera en el punto de encuentro. Sales en ${left}.` }
      : { tone: 'go', text: `Aléjate caminando y escóndete dentro de la zona. Los cazadores salen en ${left}.` };
  }
  const upcoming = nextZoneChange(game, t);
  if (upcoming && upcoming.at - t <= EXPERIMENTAL.dynamicZone.warnS) {
    return { tone: 'zone', text: `La zona cambia en ${formatClock(upcoming.at - t)}: ve caminando hacia la zona marcada.` };
  }
  const nextPing = game.nextPingAt !== null ? formatClock(game.nextPingAt - t) : null;
  if (me.team === 'hunter') {
    const reach = claimableRunners(game);
    if (reach.length === 1) return { tone: 'go', text: `${reach[0].name} está a tu alcance: puedes reclamar la captura.` };
    if (reach.length > 1) return { tone: 'go', text: `${reach.length} fugitivos a tu alcance: puedes reclamar una captura.` };
    const ping = game.pings.at(-1);
    if (ping) return { tone: 'info', text: `Busca a partir de la última pista (de hace ${formatClock(t - ping.t)}). Próxima en ${nextPing}.` };
    return { tone: 'info', text: `Patrulla la zona. Primera pista en ${nextPing}.` };
  }
  return { tone: 'info', text: `Sigue escondido dentro de la zona. Próxima pista a los cazadores en ${nextPing}.` };
}

// ------------------------------------------------------------------ rastro propio del fugitivo

/**
 * Qué posición propia recibieron los cazadores en la ÚLTIMA pista, y cuándo. Solo para un
 * fugitivo activo; en cualquier otro caso, null. Devuelve un objeto nuevo con datos propios:
 * nunca entradas de otros jugadores, datos de cazadores ni referencias a la pista interna.
 *   { status: 'none', nextPingIn }                      sin pistas todavía (nextPingIn: s o null)
 *   { status: 'unavailable', pingN, sentAt }            la pista no trae posición propia
 *   { status: 'sent', pingN, sentAt, measuredAt, pos, ageNow, exposedLive }
 * Tiempos en segundos de juego (game.t). ageNow se mide desde la medición, no desde el envío.
 * exposedLive: además, los cazadores le ven en directo por estar fuera de la zona (regla actual).
 */
export function ownTrail(game) {
  const me = self(game);
  if (!me || me.team !== 'runner' || me.status !== 'active') return null;
  const ping = game.pings.at(-1);
  if (!ping) {
    // Mismo calendario que tick(): la primera pista llega al empezar la caza + pingEveryS.
    const nextAt = game.nextPingAt ?? huntStart(game) + EXPERIMENTAL.pingEveryS;
    const more = game.phase !== 'resolving' && game.phase !== 'finished' && nextAt < huntEnd(game);
    return { status: 'none', nextPingIn: more ? Math.max(0, nextAt - game.t) : null };
  }
  const entry = ping.entries.find((e) => e.id === me.id);
  if (!entry || !entry.pos) return { status: 'unavailable', pingN: ping.n, sentAt: ping.t };
  return {
    status: 'sent',
    pingN: ping.n,
    sentAt: ping.t,
    measuredAt: entry.measuredAt,
    pos: { x: entry.pos.x, y: entry.pos.y },
    ageNow: game.t - entry.measuredAt,
    exposedLive: me.exposed === true,
  };
}

// ------------------------------------------------------------------ escáner (pista aproximada, D-034)

export function scan(game) {
  const me = self(game);
  if (game.phase !== 'hunt') return { ok: false, error: 'El escáner solo funciona durante la caza.' };
  if (me.team !== 'hunter' || me.status !== 'active') return { ok: false, error: 'Solo los cazadores pueden usar el escáner.' };
  if (game.scan.left <= 0) return { ok: false, error: 'No te quedan usos del escáner.' };
  if (game.t < game.scan.readyAt) return { ok: false, error: `Escáner recargando: ${formatClock(game.scan.readyAt - game.t)}.` };
  const count = active(game, 'runner').filter((r) => dist(me.pos, r.pos) <= EXPERIMENTAL.scan.radiusM).length;
  game.scan.left--;
  game.scan.readyAt = game.t + EXPERIMENTAL.scan.cooldownS;
  game.scan.last = { t: game.t, count, at: { ...me.pos } };
  emit(game, 'scan', `Escáner: ${count} fugitivo(s) a menos de ${EXPERIMENTAL.scan.radiusM} m (aproximado).`);
  return { ok: true, count };
}

// ------------------------------------------------------------------ vista del jugador

/** Lo que ve el jugador según las reglas (S0 §6.4): nunca más de lo que le corresponde. */
export function visibleFor(game) {
  const me = self(game);
  const out = [];
  if (game.phase === 'countdown') return out;
  if (me.status === 'captured') {
    const asOf = game.t - EXPERIMENTAL.spectatorDelayS;
    for (const p of game.players) {
      if (p.isSelf || p.status !== 'active') continue;
      const h = [...p.history].reverse().find((x) => x.t <= asOf) ?? p.history[0];
      out.push({ id: p.id, name: p.name, team: p.team, pos: h.pos, age: game.t - h.t, kind: 'spectator' });
    }
    return out;
  }
  for (const p of game.players) {
    if (p.isSelf || p.status !== 'active') continue;
    if (p.team === me.team) {
      const last = p.history.at(-1);
      out.push({ id: p.id, name: p.name, team: p.team, pos: last.pos, age: game.t - last.t, kind: 'teammate' });
    } else if (me.team === 'hunter' && game.phase !== 'headstart' && p.exposed) {
      out.push({ id: p.id, name: p.name, team: p.team, pos: p.pos, age: 0, kind: 'exposed' });
    }
  }
  if (me.team === 'hunter') {
    const ping = game.pings.at(-1);
    if (ping) {
      for (const e of ping.entries) {
        if (out.some((o) => o.id === e.id)) continue;
        out.push({ id: e.id, name: e.name, team: 'runner', pos: e.pos, age: game.t - e.measuredAt, kind: 'ping' });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ final y rondas

export function endGame(game) {
  if (game.phase === 'finished') return;
  finish(game, 'ended_by_host');
}

function finish(game, reason) {
  game.phase = 'finished';
  game.endedReason = reason;
  game.incoming = null;
  const survivors = active(game, 'runner');
  game.outcome = reason === 'ended_by_host'
    ? { winner: null, title: 'Partida terminada por el anfitrión', subtitle: 'Sin ganador.' }
    : survivors.length > 0
      ? { winner: 'runner', title: '¡Ganan los fugitivos!', subtitle: `${survivors.length} superviviente(s) al acabar el tiempo.` }
      : { winner: 'hunter', title: '¡Ganan los cazadores!', subtitle: 'Todos los fugitivos han sido capturados.' };
  emit(game, 'finish', game.outcome.title);
}

export function summary(game) {
  return {
    outcome: game.outcome,
    survivors: active(game, 'runner').map((p) => p.name),
    captures: game.captures.map((c) => ({ ...c, clock: formatClock(c.t) })),
    disputes: game.claims.filter((c) => c.disputedAt !== undefined || c.state === 'timeout'),
    hunters: game.players.filter((p) => p.team === 'hunter').map((p) => p.name),
    huntSeconds: Math.max(0, Math.min(game.t, huntEnd(game)) - huntStart(game)),
  };
}

/**
 * Siguiente ronda (D-037): 'redraw' (sorteo nuevo) o 'first_captured' (los primeros capturados
 * empiezan cazando). 'keep' solo vuelve a la sala con los mismos equipos (no es una política de D-037).
 */
export function nextRound(room, game, policy) {
  room.round++;
  room.history.push({ round: room.round - 1, outcome: game.outcome?.title, captures: game.captures.length });
  for (const p of room.players) p.ready = p.isSelf ? false : true;
  room.lastPolicy = policy;
  if (policy === 'keep' || room.settings.assignment === 'manual') return room;
  const k = huntersTarget(room.players.length, room.settings.ratio);
  if (policy === 'first_captured' && game.captures.length > 0) {
    const first = game.captures.map((c) => c.runnerId).filter((id, i, all) => all.indexOf(id) === i).slice(0, k);
    const rest = shuffle(room.players.filter((p) => !first.includes(p.id)).map((p) => p.id), mulberry32(room.seed + room.round));
    const hunters = new Set([...first, ...rest.slice(0, k - first.length)]);
    for (const p of room.players) p.team = hunters.has(p.id) ? 'hunter' : 'runner';
    room.lastPolicy = 'first_captured';
  } else {
    drawTeams(room);
    room.lastPolicy = policy === 'first_captured' ? 'redraw_fallback' : 'redraw';
  }
  return room;
}
