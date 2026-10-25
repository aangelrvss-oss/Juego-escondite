// Pruebas de la lógica SIMULADA de la demo visual (demo/src/sim.js).
// No prueban el motor de S0 ni nada real: GPS, red y proximidad son ficticios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim.js';

function readyRoom(settings = {}, seed = 12345) {
  const room = S.createRoom(settings, seed);
  S.drawTeams(room);
  S.botsReady(room);
  S.setReady(room, 'me', true);
  return room;
}

function roomWithSelfAs(team, settings = {}, seed = 12345) {
  const room = readyRoom(settings, seed);
  S.setTeam(room, 'me', team);
  // Mantener al menos un jugador en cada equipo.
  const other = team === 'hunter' ? 'runner' : 'hunter';
  if (!room.players.some((p) => !p.isSelf && p.team === other)) S.setTeam(room, room.players[1].id, other);
  return room;
}

function runToEnd(game, maxS = 4 * 3600) {
  let elapsed = 0;
  while (game.phase !== 'finished' && elapsed < maxS) {
    S.stepGame(game, 10);
    elapsed += 10;
  }
  return game;
}

test('proporción de cazadores: siempre entre 1 y la mitad de los jugadores', () => {
  for (let n = S.EXPERIMENTAL.minPlayers; n <= S.EXPERIMENTAL.maxPlayers; n++) {
    for (const key of Object.keys(S.EXPERIMENTAL.ratios)) {
      const k = S.huntersTarget(n, key);
      assert.ok(k >= 1 && k <= Math.max(1, Math.floor(n / 2)), `n=${n} ${key} → ${k}`);
    }
  }
  assert.equal(S.huntersTarget(9, 'equilibrado'), 3);
});

test('códigos: alfabeto sin ambiguos, normalización y error claro', () => {
  const room = S.createRoom({}, 99);
  assert.ok(S.isValidCode(room.code));
  for (const bad of ['O', '0', 'I', '1', 'L']) assert.ok(!S.CODE_ALPHABET.includes(bad));
  assert.equal(S.normalizeCode(' ab c d2 3 '), 'ABCD23');
  const bad = S.joinRoom('AB01');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /6 caracteres/);
  const ok = S.joinRoom('hk7 m2q');
  assert.equal(ok.ok, true);
  assert.equal(ok.room.code, 'HK7M2Q');
  assert.equal(ok.room.joined, true);
  assert.ok(!ok.room.players.find((p) => p.isSelf).isHost, 'al unirse, el anfitrión es otro');
  assert.deepEqual(S.joinRoom('HK7M2Q').room.players.map((p) => p.team), ok.room.players.map((p) => p.team), 'mismo código → misma sala');
});

test('número de jugadores acotado a los límites experimentales', () => {
  assert.equal(S.createRoom({ players: 1 }, 1).players.length, S.EXPERIMENTAL.minPlayers);
  assert.equal(S.createRoom({ players: 99 }, 1).players.length, S.EXPERIMENTAL.maxPlayers);
});

test('sorteo reproducible y con la proporción pedida', () => {
  const a = S.drawTeams(S.createRoom({ players: 12, ratio: 'muchos' }, 7));
  const b = S.drawTeams(S.createRoom({ players: 12, ratio: 'muchos' }, 7));
  assert.deepEqual(a.players.map((p) => p.team), b.players.map((p) => p.team));
  assert.equal(S.teamCounts(a).hunters, S.huntersTarget(12, 'muchos'));
  const before = a.players.map((p) => p.team).join();
  const draws = new Set([before]);
  for (let i = 0; i < 5; i++) draws.add(S.drawTeams(a).players.map((p) => p.team).join());
  assert.ok(draws.size > 1, 'resortear cambia el reparto');
});

test('validación de la sala de espera: errores bloquean, avisos no', () => {
  const room = S.createRoom({ players: 6, assignment: 'manual' }, 3);
  let codes = S.validateLobby(room).map((i) => i.code);
  assert.ok(codes.includes('unassigned') && codes.includes('not_ready'));
  assert.equal(S.canStart(room), false);
  for (const p of room.players) S.setTeam(room, p.id, 'runner');
  codes = S.validateLobby(room).map((i) => i.code);
  assert.ok(codes.includes('no_hunters'));
  S.setTeam(room, 'b1', 'hunter');
  S.botsReady(room);
  S.setReady(room, 'me', true);
  const issues = S.validateLobby(room);
  assert.equal(S.canStart(room), true);
  assert.deepEqual(issues.map((i) => i.level), ['warning'], 'solo queda el aviso de proporción (1 de 2 sugeridos)');
  assert.throws(() => S.startGame(S.createRoom({}, 4)), /no está lista/);
});

test('fases: cuenta atrás → ventaja → caza, con tiempo de juego', () => {
  const game = S.startGame(readyRoom());
  assert.equal(game.phase, 'countdown');
  S.stepGame(game, S.EXPERIMENTAL.countdownS);
  assert.equal(game.phase, 'headstart');
  S.stepGame(game, S.EXPERIMENTAL.headStartS);
  assert.equal(game.phase, 'hunt');
  assert.equal(game.nextPingAt, S.EXPERIMENTAL.headStartS + S.EXPERIMENTAL.pingEveryS);
});

test('la misma semilla produce la misma partida', () => {
  const a = runToEnd(S.startGame(readyRoom({ players: 10 }, 555)));
  const b = runToEnd(S.startGame(readyRoom({ players: 10 }, 555)));
  assert.equal(a.phase, 'finished');
  assert.deepEqual(S.summary(a), S.summary(b));
  assert.deepEqual(a.events, b.events);
});

test('zona dinámica: cada zona nueva queda contenida en la anterior; sin zona dinámica hay una sola', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const game = S.startGame(readyRoom({ dynamicZone: true }, seed));
    assert.equal(game.zones.length, 3);
    for (let i = 1; i < game.zones.length; i++) {
      const prev = game.zones[i - 1];
      const z = game.zones[i];
      assert.ok(z.r < prev.r && S.dist(z.center, prev.center) + z.r <= prev.r + 1e-9);
      assert.ok(z.at > prev.at && z.at > game.headStartS && z.at < game.headStartS + game.durationS, 'los cambios ocurren durante la caza');
    }
  }
  assert.equal(S.startGame(readyRoom({ dynamicZone: false })).zones.length, 1);
  const g = S.startGame(readyRoom({ dynamicZone: true }));
  assert.equal(S.nextZoneChange(g, g.t), g.zones[1], 'en la cuenta atrás el próximo cambio es el primero real, no la zona inicial');
  assert.equal(S.nextZoneChange(S.startGame(readyRoom({ dynamicZone: false })), -3), null);
});

test('el jugador cazador no se mueve durante la ventaja', () => {
  const game = S.startGame(roomWithSelfAs('hunter'));
  S.stepGame(game, 5);
  const me = S.self(game);
  const start = { ...me.pos };
  me.target = { x: 200, y: 0 };
  S.stepGame(game, 20);
  assert.deepEqual(me.pos, start);
});

test('visibilidad: un fugitivo nunca ve cazadores; un cazador no ve fugitivos durante la ventaja', () => {
  for (const seed of [11, 22, 33]) {
    const game = S.startGame(roomWithSelfAs('runner', { players: 10 }, seed));
    while (game.phase !== 'finished' && S.self(game).status === 'active') {
      for (const v of S.visibleFor(game)) assert.equal(v.team, 'runner', `semilla ${seed}: vio a ${v.name}`);
      S.stepGame(game, 5);
    }
  }
  const game = S.startGame(roomWithSelfAs('hunter', { players: 10 }));
  S.stepGame(game, S.EXPERIMENTAL.countdownS + 60);
  assert.equal(game.phase, 'headstart');
  assert.ok(S.visibleFor(game).every((v) => v.team === 'hunter'));
});

test('pistas: los cazadores ven la última posición con su antigüedad real', () => {
  const game = S.startGame(roomWithSelfAs('hunter', { players: 10 }));
  S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + S.EXPERIMENTAL.pingEveryS + 30);
  assert.ok(game.pings.length >= 1);
  const pings = S.visibleFor(game).filter((v) => v.kind === 'ping');
  assert.ok(pings.length > 0);
  for (const p of pings) assert.ok(p.age >= 30, `antigüedad ${p.age}`);
});

test('fuera de zona: el fugitivo se expone tras el margen; el cazador no se expone pero no puede capturar (D-033)', () => {
  const game = S.startGame(roomWithSelfAs('hunter', { players: 6 }));
  S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
  const runner = game.players.find((p) => p.team === 'runner');
  const me = S.self(game);
  const far = { x: game.settings.zoneRadiusM + 200, y: 0 };
  // Teletransporte de prueba: ambos fuera, a 5 m.
  runner.pos = { ...far }; runner.wanderTarget = { ...far };
  me.pos = { x: far.x + 5, y: 0 };
  S.stepGame(game, 1);
  assert.ok(runner.outsideSince !== null && !runner.exposed);
  S.stepGame(game, S.EXPERIMENTAL.outsideGraceS);
  assert.ok(runner.exposed, 'el fugitivo queda expuesto');
  assert.equal(me.exposed, false, 'el cazador nunca se expone');
  me.pos = { x: runner.pos.x + 3, y: runner.pos.y };
  assert.ok(me.outsideSince !== null);
  assert.equal(S.claimableRunners(game).length, 0);
  assert.match(S.claimCapture(game, runner.id).error, /fuera de la zona/);
  // Tampoco un cazador simulado fuera de la zona.
  const bot = game.players.find((p) => p.team === 'hunter' && !p.isSelf);
  bot.pos = { x: runner.pos.x + 2, y: runner.pos.y };
  bot.outsideSince = game.t;
  me.pos = { x: 0, y: 0 };
  const before = game.claims.length;
  S.stepGame(game, 1);
  assert.equal(game.claims.length, before, 'el cazador fuera de la zona no reclama');
});

test('captura reclamada por el jugador: pendiente y luego confirmada o disputada, nunca eliminación directa', () => {
  let confirmed = 0;
  let disputed = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const game = S.startGame(roomWithSelfAs('hunter', { players: 6, durationMin: 30 }, seed));
    S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
    const me = S.self(game);
    const runner = game.players.find((p) => p.team === 'runner' && p.status === 'active');
    me.pos = { ...runner.pos };
    const res = S.claimCapture(game, runner.id);
    assert.equal(res.ok, true);
    assert.equal(res.claim.state, 'pending');
    assert.equal(runner.status, 'active', 'pendiente no elimina');
    assert.equal(S.claimCapture(game, runner.id).ok, false, 'no se duplica');
    S.stepGame(game, S.EXPERIMENTAL.claimResponseS);
    if (res.claim.state === 'confirmed') {
      confirmed++;
      assert.equal(runner.status, 'captured');
    } else {
      disputed++;
      assert.equal(res.claim.state, 'disputed');
      assert.equal(runner.status, 'active', 'disputada no elimina');
      if (S.withdrawClaim(game, res.claim.id)) assert.equal(res.claim.state, 'withdrawn');
    }
  }
  assert.ok(confirmed > 0 && disputed > 0, `confirmadas ${confirmed}, disputadas ${disputed}`);
});

test('captura recibida por el jugador: disputar no elimina; aceptar después sí; sin respuesta no hay captura', () => {
  const setup = () => {
    const game = S.startGame(roomWithSelfAs('runner', { players: 6 }));
    S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
    const hunter = game.players.find((p) => p.team === 'hunter');
    game.incoming = { hunterId: hunter.id, hunterName: hunter.name, since: game.t };
    return game;
  };
  let game = setup();
  assert.equal(S.respondIncoming(game, false), true);
  const claim = game.claims.at(-1);
  assert.equal(claim.state, 'disputed');
  assert.equal(S.self(game).status, 'active');
  assert.equal(S.acceptOwnDispute(game, claim.id), true);
  assert.equal(S.self(game).status, 'captured');

  game = setup();
  S.respondIncoming(game, true);
  assert.equal(S.self(game).status, 'captured');

  game = setup();
  S.stepGame(game, S.EXPERIMENTAL.incomingTimeoutS);
  assert.equal(game.incoming, null);
  assert.equal(game.claims.at(-1).state, 'timeout');
  assert.equal(S.self(game).status, 'active');
});

test('una disputa sobre el jugador nunca la resuelve un bot capturándolo', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const game = S.startGame(roomWithSelfAs('runner', { players: 6, durationMin: 10 }, seed));
    S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
    const hunter = game.players.find((p) => p.team === 'hunter');
    game.incoming = { hunterId: hunter.id, hunterName: hunter.name, since: game.t };
    S.respondIncoming(game, false);
    // A partir de aquí, el jugador rechaza cualquier otra reclamación.
    while (game.phase !== 'finished') {
      if (game.incoming) S.respondIncoming(game, false);
      S.stepGame(game, 5);
    }
    assert.notEqual(S.self(game).status, 'captured', `semilla ${seed}`);
    for (const c of game.claims.filter((x) => x.runnerId === 'me')) assert.notEqual(c.state, 'accepted');
  }
});

test('disputas abiertas al acabar el tiempo: ventana de resolución y regla predeterminada sin captura', () => {
  // El jugador es el único cazador y no se mueve: nadie más puede capturar.
  const room = roomWithSelfAs('hunter', { players: 4, durationMin: 10 });
  for (const p of room.players) if (!p.isSelf) S.setTeam(room, p.id, 'runner');
  const game = S.startGame(room);
  S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
  const runner = game.players.find((p) => p.team === 'runner');
  game.claims.push({ id: 'cx', hunterId: 'me', hunterName: 'Tú', hunterIsSelf: true, runnerId: runner.id, runnerName: runner.name, state: 'disputed', since: game.t, disputedAt: game.t, botDecided: true });
  while (game.phase === 'hunt') S.stepGame(game, 10);
  assert.equal(game.phase, 'resolving');
  assert.equal(runner.status, 'active', 'la disputa no elimina');
  runToEnd(game);
  assert.equal(game.phase, 'finished');
  assert.equal(game.claims.find((c) => c.id === 'cx').state, 'default_no_capture');
  assert.equal(runner.status, 'active');
  assert.equal(game.outcome.winner, 'runner');
  assert.ok(!game.claims.some((c) => c.state === 'pending' || c.state === 'disputed'), 'ninguna disputa queda abierta al final');
});

test('muchas partidas: todas terminan, sin disputas abiertas y con un resultado coherente', () => {
  const winners = { hunter: 0, runner: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const game = runToEnd(S.startGame(readyRoom({ players: 4 + (seed % 12), durationMin: 10 }, seed)));
    assert.equal(game.phase, 'finished', `semilla ${seed}`);
    assert.ok(game.t <= game.headStartS + game.durationS + S.EXPERIMENTAL.resolutionWindowS + 1);
    assert.ok(!game.claims.some((c) => c.state === 'pending' || c.state === 'disputed'));
    const sum = S.summary(game);
    winners[sum.outcome.winner]++;
    assert.equal(sum.outcome.winner === 'runner', sum.survivors.length > 0);
    const capturedIds = game.captures.map((c) => c.runnerId);
    assert.equal(new Set(capturedIds).size, capturedIds.length, 'nadie se captura dos veces');
  }
  assert.ok(winners.hunter + winners.runner === 40);
});

test('escáner: solo cazadores, usos limitados, recarga y solo un recuento aproximado', () => {
  const game = S.startGame(roomWithSelfAs('hunter', { players: 8 }));
  assert.equal(S.scan(game).ok, false, 'no durante la ventaja');
  S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
  const first = S.scan(game);
  assert.equal(first.ok, true);
  assert.deepEqual(Object.keys(first).sort(), ['count', 'ok'], 'sin coordenadas');
  assert.match(S.scan(game).error, /recargando/);
  S.stepGame(game, S.EXPERIMENTAL.scan.cooldownS);
  assert.equal(game.phase, 'hunt');
  assert.equal(S.scan(game).ok, true);
  S.stepGame(game, S.EXPERIMENTAL.scan.cooldownS);
  assert.match(S.scan(game).error, /usos/);
  const runnerGame = S.startGame(roomWithSelfAs('runner'));
  S.stepGame(runnerGame, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
  assert.match(S.scan(runnerGame).error, /cazadores/);
});

test('autodeclaración del fugitivo y final por el anfitrión sin ganador', () => {
  const game = S.startGame(roomWithSelfAs('runner'));
  assert.equal(S.selfTag(game), false, 'no antes de la caza');
  S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
  assert.equal(S.selfTag(game), true);
  assert.equal(S.self(game).status, 'captured');
  const spect = S.visibleFor(game);
  assert.ok(spect.every((v) => v.kind === 'spectator' && v.age >= 0));
  S.endGame(game);
  assert.equal(game.outcome.winner, null);
});

test('siguiente ronda: sorteo nuevo, primeros capturados como cazadores y modo manual intacto', () => {
  const room = readyRoom({ players: 9 }, 77);
  const game = runToEnd(S.startGame(room));
  S.nextRound(room, game, 'redraw');
  assert.equal(room.round, 2);
  assert.equal(room.history.length, 1);
  assert.equal(S.teamCounts(room).hunters, S.huntersTarget(9, room.settings.ratio));
  assert.equal(room.players.find((p) => p.isSelf).ready, false);

  const room2 = readyRoom({ players: 9 }, 78);
  const g2 = S.startGame(room2);
  S.stepGame(g2, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
  const firstRunner = g2.players.find((p) => p.team === 'runner' && !p.isSelf);
  g2.captures.push({ runnerId: firstRunner.id, runnerName: firstRunner.name, t: 1 });
  S.endGame(g2);
  S.nextRound(room2, g2, 'first_captured');
  assert.equal(room2.players.find((p) => p.id === firstRunner.id).team, 'hunter');
  assert.equal(room2.lastPolicy, 'first_captured');
  assert.equal(S.teamCounts(room2).hunters, S.huntersTarget(9, room2.settings.ratio));

  const manual = S.createRoom({ players: 4, assignment: 'manual' }, 5);
  for (const p of manual.players) S.setTeam(manual, p.id, p.id === 'b1' ? 'hunter' : 'runner');
  const teams = manual.players.map((p) => p.team).join();
  S.botsReady(manual); S.setReady(manual, 'me', true);
  S.nextRound(manual, runToEnd(S.startGame(manual)), 'redraw');
  assert.equal(manual.players.map((p) => p.team).join(), teams);
});

test('formato de reloj', () => {
  assert.equal(S.formatClock(0), '0:00');
  assert.equal(S.formatClock(61.2), '1:02');
  assert.equal(S.formatClock(-5), '0:00');
});

// ------------------------------------------------------------------ guía del siguiente paso

const TONES = new Set(['act', 'wait', 'danger', 'zone', 'go', 'info', 'muted']);
const toHunt = (game) => S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);

test('siguiente paso: sin rol en la cuenta atrás (D-042) y objetivo del rol en la huida', () => {
  const hunter = S.startGame(roomWithSelfAs('hunter'));
  const runner = S.startGame(roomWithSelfAs('runner'));
  for (const g of [hunter, runner]) {
    assert.match(S.nextStep(g).text, /tu rol se revela al terminar la cuenta atrás/);
    assert.doesNotMatch(S.nextStep(g).text, /cazador|fugitivo/i);
  }
  S.stepGame(hunter, S.EXPERIMENTAL.countdownS + 10);
  S.stepGame(runner, S.EXPERIMENTAL.countdownS + 10);
  assert.deepEqual([S.nextStep(hunter).tone, S.nextStep(runner).tone], ['wait', 'go']);
  assert.match(S.nextStep(hunter).text, /punto de encuentro/);
  assert.match(S.nextStep(runner).text, /caminando/);
});

test('siguiente paso: lo que exige respuesta va primero', () => {
  const game = S.startGame(roomWithSelfAs('runner', { players: 6 }));
  toHunt(game);
  const me = S.self(game);
  me.pos = { x: game.settings.zoneRadiusM + 100, y: 0 };
  S.stepGame(game, 1);
  assert.equal(S.nextStep(game).tone, 'danger', 'fuera de zona');
  const hunter = game.players.find((p) => p.team === 'hunter');
  game.incoming = { hunterId: hunter.id, hunterName: hunter.name, since: game.t };
  assert.equal(S.nextStep(game).tone, 'act');
  assert.match(S.nextStep(game).text, /responde/);
  S.respondIncoming(game, false);
  // Fuera de zona (peligro inmediato) va antes que una disputa que solo espera.
  assert.equal(S.nextStep(game).tone, 'danger');
  assert.match(S.nextStep(game).text, /fuera de la zona/);
  me.pos = { x: 0, y: 0 };
  S.stepGame(game, 1);
  assert.match(S.nextStep(game).text, /Disputa abierta.*sigues en juego/);
  assert.doesNotMatch(S.nextStep(game).text, /árbitro|anfitrión decide/, 'no presupone quién arbitra');
});

test('siguiente paso: reclamación propia pendiente y disputada', () => {
  const game = S.startGame(roomWithSelfAs('hunter', { players: 6 }));
  toHunt(game);
  const runner = game.players.find((p) => p.team === 'runner');
  game.claims.push({ id: 'cx', hunterId: 'me', hunterName: 'Tú', hunterIsSelf: true, runnerId: runner.id, runnerName: runner.name, state: 'pending', since: game.t, answerAt: game.t + 99 });
  assert.equal(S.nextStep(game).tone, 'wait');
  game.claims.at(-1).state = 'disputed';
  assert.equal(S.nextStep(game).tone, 'act');
  assert.match(S.nextStep(game).text, /retirarla o esperar/);
});

test('siguiente paso del cazador: patrulla, última pista, alcance y fuera de zona', () => {
  const game = S.startGame(roomWithSelfAs('hunter', { players: 6, dynamicZone: false }));
  toHunt(game);
  const me = S.self(game);
  me.pos = { x: 0, y: 0 };
  const spread = () => game.players.filter((p) => p.team === 'runner').forEach((r, i) => { r.pos = { x: 120 + i * 60, y: 150 }; });
  spread();
  assert.match(S.nextStep(game).text, /Primera pista en/);
  S.stepGame(game, S.EXPERIMENTAL.pingEveryS);
  me.pos = { x: 0, y: 0 };
  spread();
  assert.match(S.nextStep(game).text, /última pista/);
  const runner = game.players.find((p) => p.team === 'runner' && p.status === 'active');
  me.pos = { x: runner.pos.x + 3, y: runner.pos.y };
  assert.equal(S.nextStep(game).tone, 'go');
  assert.match(S.nextStep(game).text, new RegExp(`${runner.name} está a tu alcance`));
  me.pos = { x: game.settings.zoneRadiusM + 100, y: 0 };
  S.stepGame(game, 1);
  assert.match(S.nextStep(game).text, /fuera de la zona.*para poder capturar/);
});

test('siguiente paso del fugitivo: no depende de dónde estén los cazadores', () => {
  const game = S.startGame(roomWithSelfAs('runner', { players: 8, dynamicZone: false }));
  toHunt(game);
  const before = S.nextStep(game);
  for (const h of game.players.filter((p) => p.team === 'hunter')) h.pos = { x: S.self(game).pos.x + 2, y: S.self(game).pos.y };
  assert.deepEqual(S.nextStep(game), before);
});

test('siguiente paso: siempre hay una indicación válida a lo largo de partidas completas', () => {
  for (let seed = 1; seed <= 12; seed++) {
    for (const team of ['hunter', 'runner']) {
      const game = S.startGame(roomWithSelfAs(team, { players: 4 + (seed % 8), durationMin: 10 }, seed));
      while (game.phase !== 'finished') {
        const step = S.nextStep(game);
        assert.ok(TONES.has(step.tone) && step.text.length > 0, `${seed}/${team}: ${JSON.stringify(step)}`);
        assert.doesNotMatch(step.text, /corre|deprisa|rápido/i, 'no incita a correr');
        if (game.incoming) S.respondIncoming(game, false);
        S.stepGame(game, 15);
      }
      assert.equal(S.nextStep(game).text, 'Ronda terminada.');
    }
  }
});

// ------------------------------------------------------------------ bots fugitivos: esconderse

const botRunners = (game) => game.players.filter((p) => p.team === 'runner' && !p.isSelf);

test('bots fugitivos: llegan a un escondite dentro de la zona y se quedan quietos sin pistas ni cambios de zona', () => {
  let stillChecked = 0;
  for (const seed of [3, 7, 11]) {
    const game = S.startGame(roomWithSelfAs('hunter', { players: 8, zoneRadiusM: 250, dynamicZone: false }, seed));
    S.stepGame(game, S.EXPERIMENTAL.countdownS + 240); // antes de la primera pista (ventaja + 3 min)
    const zone = S.zoneAt(game, game.t);
    const hidden = botRunners(game).filter((p) => p.status === 'active' && p.hideSpot && S.dist(p.pos, p.hideSpot) < 0.5);
    const before = hidden.map((p) => ({ ...p.pos }));
    for (const p of hidden) assert.ok(S.dist(p.hideSpot, zone.center) <= zone.r, 'escondite dentro de la zona');
    S.stepGame(game, 50);
    assert.equal(game.pings.length, 0);
    hidden.forEach((p, i) => {
      if (p.status === 'active') { assert.deepEqual(p.pos, before[i], `${p.name} no se mueve sin motivo`); stillChecked++; }
    });
  }
  assert.ok(stillChecked > 0);
});

test('bots fugitivos: su conducta no depende de dónde estén los cazadores', () => {
  const setup = () => {
    const game = S.startGame(roomWithSelfAs('hunter', { players: 8, dynamicZone: false }, 21));
    S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + 1);
    return game;
  };
  const a = setup();
  const b = setup();
  // Los cazadores (bots y jugador) se colocan en sitios distintos en A y en B.
  for (const h of a.players.filter((p) => p.team === 'hunter')) h.pos = { x: -380, y: 0 };
  for (const h of b.players.filter((p) => p.team === 'hunter')) h.pos = { x: 0, y: -380 };
  // Incluye la primera pista y la posible recolocación posterior.
  S.stepGame(a, S.EXPERIMENTAL.pingEveryS + 60);
  S.stepGame(b, S.EXPERIMENTAL.pingEveryS + 60);
  assert.ok(a.pings.length >= 1 && b.pings.length >= 1);
  botRunners(a).forEach((r, i) => {
    const rb = botRunners(b)[i];
    if (r.status === 'active' && rb.status === 'active') assert.deepEqual(r.pos, rb.pos, r.name);
  });
});

test('bots fugitivos: tras una pista que les incluye, a veces cambian de escondite, caminando y a poca distancia', () => {
  let moved = 0;
  let stayed = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const game = S.startGame(roomWithSelfAs('hunter', { players: 8, dynamicZone: false }, seed));
    S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + S.EXPERIMENTAL.pingEveryS - 1);
    const spots = new Map(botRunners(game).map((p) => [p.id, p.hideSpot && { ...p.hideSpot }]));
    const pos = new Map(botRunners(game).map((p) => [p.id, { ...p.pos }]));
    S.stepGame(game, 2);
    assert.equal(game.pings.length, 1);
    for (const p of botRunners(game).filter((x) => x.status === 'active')) {
      const before = spots.get(p.id);
      if (before && (before.x !== p.hideSpot.x || before.y !== p.hideSpot.y)) {
        moved++;
        assert.ok(S.dist(pos.get(p.id), p.hideSpot) <= S.BOT_BEHAVIOR.relocateMaxM + 3, 'cambio corto');
      } else stayed++;
    }
  }
  assert.ok(moved > 0 && stayed > 0, `cambian ${moved}, se quedan ${stayed}`);
});

// ------------------------------------------------------------------ bots cazadores: reparto de la búsqueda

const botHunters = (game) => game.players.filter((p) => p.team === 'hunter' && !p.isSelf && p.status === 'active');
const toFirstPing = (game) => S.stepGame(game, S.EXPERIMENTAL.countdownS + S.EXPERIMENTAL.headStartS + S.EXPERIMENTAL.pingEveryS + 1);

test('bots cazadores: el reparto es reproducible con la misma semilla', () => {
  const trace = (seed) => {
    const game = S.startGame(roomWithSelfAs('runner', { players: 10 }, seed));
    toFirstPing(game);
    const out = [];
    for (let i = 0; i < 60; i++) {
      if (game.incoming) S.respondIncoming(game, false);
      S.stepGame(game, 2);
      out.push(botHunters(game).map((h) => `${h.id}:${h.chaseId}`).join(','));
    }
    return out;
  };
  assert.deepEqual(trace(41), trace(41));
});

test('bots cazadores: con varias pistas no convergen todos en la misma', () => {
  let checked = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const game = S.startGame(roomWithSelfAs('runner', { players: 10, dynamicZone: false }, seed));
    toFirstPing(game);
    const hunters = botHunters(game);
    const targets = game.pings.at(-1).entries.filter((e) => game.players.find((p) => p.id === e.id).status === 'active');
    if (hunters.length < 2 || targets.length < hunters.length) continue;
    const ids = hunters.map((h) => h.chaseId);
    assert.ok(ids.every(Boolean), `semilla ${seed}: todos tienen objetivo`);
    assert.equal(new Set(ids).size, ids.length, `semilla ${seed}: ${ids.join(',')}`);
    checked++;
  }
  assert.ok(checked >= 5, `casos comprobados: ${checked}`);
});

test('bots cazadores: no usan la posición real de fugitivos ocultos (solo pistas y expuestos)', () => {
  const setup = () => {
    const game = S.startGame(roomWithSelfAs('hunter', { players: 8, dynamicZone: false }, 33));
    toFirstPing(game);
    return game;
  };
  const a = setup();
  const b = setup();
  // En B, un fugitivo no expuesto se mueve a otro punto dentro de la zona: no es información de los cazadores.
  const hidden = b.players.find((p) => p.team === 'runner' && !p.isSelf && p.status === 'active' && !p.exposed);
  const far = botHunters(b).every((h) => S.dist(h.pos, { x: 0, y: 300 }) > 60);
  assert.ok(hidden && far);
  hidden.pos = { x: 0, y: 300 };
  hidden.hideSpot = { x: 0, y: 300 };
  for (let i = 0; i < 20; i++) {
    S.stepGame(a, 1);
    S.stepGame(b, 1);
    if (a.captures.length || b.captures.length || a.claims.length || b.claims.length) break;
    assert.deepEqual(botHunters(b).map((h) => [h.chaseId, h.pos]), botHunters(a).map((h) => [h.chaseId, h.pos]), `t=${b.t}`);
  }
});

// ------------------------------------------------------------------ rastro propio del fugitivo (ownTrail)

const runnerGame = (seed = 12345, settings = {}) => S.startGame(roomWithSelfAs('runner', { players: 8, dynamicZone: false, ...settings }, seed));
const ownEntry = (game) => game.pings.at(-1).entries.find((e) => e.id === S.self(game).id);

test('rastro: antes de la primera pista, «none» con la cuenta atrás del calendario existente', () => {
  const game = runnerGame();
  assert.deepEqual(S.ownTrail(game), { status: 'none', nextPingIn: S.EXPERIMENTAL.headStartS + S.EXPERIMENTAL.pingEveryS - game.t });
  S.stepGame(game, S.EXPERIMENTAL.countdownS + 30);
  assert.equal(game.phase, 'headstart');
  assert.deepEqual(S.ownTrail(game), { status: 'none', nextPingIn: S.EXPERIMENTAL.headStartS + S.EXPERIMENTAL.pingEveryS - game.t });
  S.stepGame(game, S.EXPERIMENTAL.headStartS);
  assert.equal(game.phase, 'hunt');
  assert.equal(S.ownTrail(game).nextPingIn, game.nextPingAt - game.t);
  assert.equal(S.self(game).id, 'me', 'el identificador propio en la demo es «me»');
});

test('rastro: tras una pista, los datos son los de la última entrada propia', () => {
  const game = runnerGame();
  toFirstPing(game);
  const ping = game.pings.at(-1);
  const entry = ownEntry(game);
  const trail = S.ownTrail(game);
  assert.equal(trail.status, 'sent');
  assert.equal(trail.pingN, ping.n);
  assert.equal(trail.sentAt, ping.t);
  assert.equal(trail.measuredAt, entry.measuredAt);
  assert.deepEqual(trail.pos, entry.pos);
  assert.notEqual(trail.pos, entry.pos, 'objeto nuevo, no la referencia interna');
  trail.pos.x += 999;
  assert.notEqual(ownEntry(game).pos.x, trail.pos.x, 'modificar el resultado no altera la pista');
  S.stepGame(game, S.EXPERIMENTAL.pingEveryS);
  assert.equal(S.ownTrail(game).pingN, game.pings.at(-1).n, 'siempre la última pista');
});

test('rastro: la antigüedad se mide desde la medición, no desde el envío', () => {
  const game = runnerGame();
  toFirstPing(game);
  const trail = S.ownTrail(game);
  assert.equal(trail.ageNow, game.t - trail.measuredAt);
  assert.ok(trail.measuredAt <= trail.sentAt);
  assert.ok(trail.ageNow >= game.t - trail.sentAt);
  S.stepGame(game, 10);
  const later = S.ownTrail(game);
  assert.equal(later.ageNow, trail.ageNow + 10);
  assert.equal(later.sentAt, trail.sentAt);
});

test('rastro: al moverse, la posición comunicada sigue siendo la histórica', () => {
  const game = runnerGame();
  toFirstPing(game);
  const sent = { ...S.ownTrail(game).pos };
  const me = S.self(game);
  me.target = { x: me.pos.x + 60, y: me.pos.y };
  S.stepGame(game, 30);
  const trail = S.ownTrail(game);
  assert.deepEqual(trail.pos, sent);
  assert.ok(S.dist(me.pos, trail.pos) > 20, 'la actual difiere de la comunicada');
});

test('rastro: no contiene identificadores, nombres ni posiciones de otros jugadores', () => {
  const game = runnerGame(77, { players: 10 });
  toFirstPing(game);
  const trail = S.ownTrail(game);
  assert.deepEqual(Object.keys(trail).sort(), ['ageNow', 'exposedLive', 'measuredAt', 'pingN', 'pos', 'sentAt', 'status']);
  assert.deepEqual(Object.keys(trail.pos).sort(), ['x', 'y']);
  const json = JSON.stringify(trail);
  const others = game.players.filter((p) => !p.isSelf);
  for (const p of others) {
    assert.ok(!json.includes(`"${p.id}"`) && !json.includes(p.name), `menciona a ${p.name}`);
    assert.ok(!json.includes(String(p.pos.x)), `posición de ${p.name}`);
  }
  for (const e of game.pings.at(-1).entries.filter((x) => x.id !== 'me')) assert.ok(!json.includes(String(e.pos.x)), `entrada de ${e.name}`);
});

test('rastro: cambiar solo las posiciones de los cazadores no altera el resultado', () => {
  const a = runnerGame(5);
  const b = runnerGame(5);
  toFirstPing(a);
  toFirstPing(b);
  for (const h of b.players.filter((p) => p.team === 'hunter')) h.pos = { x: -300, y: 250 };
  assert.deepEqual(S.ownTrail(b), S.ownTrail(a));
});

test('rastro: null para un cazador y para un fugitivo capturado', () => {
  const hunterGame = S.startGame(roomWithSelfAs('hunter', { players: 8 }));
  toFirstPing(hunterGame);
  assert.equal(S.ownTrail(hunterGame), null);
  const game = runnerGame();
  toFirstPing(game);
  assert.notEqual(S.ownTrail(game), null);
  S.selfTag(game);
  assert.equal(S.self(game).status, 'captured');
  assert.equal(S.ownTrail(game), null);
});

test('rastro: sin entrada propia o con posición nula, «unavailable»', () => {
  const game = runnerGame();
  toFirstPing(game);
  const ping = game.pings.at(-1);
  const original = ping.entries;
  ping.entries = original.map((e) => (e.id === 'me' ? { ...e, pos: null } : e));
  assert.deepEqual(S.ownTrail(game), { status: 'unavailable', pingN: ping.n, sentAt: ping.t });
  ping.entries = original.filter((e) => e.id !== 'me');
  assert.deepEqual(S.ownTrail(game), { status: 'unavailable', pingN: ping.n, sentAt: ping.t });
});

test('rastro: exposedLive refleja la exposición real fuera de la zona', () => {
  const game = runnerGame();
  toFirstPing(game);
  assert.equal(S.ownTrail(game).exposedLive, false);
  const me = S.self(game);
  me.pos = { x: game.settings.zoneRadiusM + 120, y: 0 };
  S.stepGame(game, 1);
  assert.equal(S.ownTrail(game).exposedLive, false, 'dentro del margen aún no está expuesto');
  S.stepGame(game, S.EXPERIMENTAL.outsideGraceS);
  assert.equal(me.exposed, true);
  assert.equal(S.ownTrail(game).exposedLive, true);
});

test('rastro: la antigüedad no disminuye entre instantes consecutivos', () => {
  const game = runnerGame();
  toFirstPing(game);
  let prev = S.ownTrail(game).ageNow;
  for (let i = 0; i < 60; i++) {
    S.stepGame(game, 1);
    const age = S.ownTrail(game).ageNow;
    assert.ok(age >= prev, `t=${game.t}: ${age} < ${prev}`);
    prev = age;
  }
});

test('rastro: reproducible y sin depender del reloj real', () => {
  const realNow = Date.now;
  const trace = () => {
    const game = runnerGame(31);
    const out = [];
    for (let i = 0; i < 12; i++) {
      S.stepGame(game, 30);
      if (game.incoming) S.respondIncoming(game, false);
      out.push(S.ownTrail(game));
    }
    return out;
  };
  try {
    Date.now = () => { throw new Error('ownTrail no debe usar el reloj real'); };
    const first = trace();
    const second = trace();
    assert.deepEqual(first, second);
    assert.ok(first.some((r) => r && r.status === 'sent'));
  } finally {
    Date.now = realNow;
  }
});

// ── Fase 2C.2: el rastro en la interfaz (funciones puras de ui.js; sin DOM) ──
const UI = await import('../src/ui.js');
const circles = (svg) => [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)" class="mk-trail"/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
const uiText = (game) => [UI.trailMarker(game, 1), UI.trailPanel(game), JSON.stringify(UI.trailBinds(game))].join('\n');
const agoText = (s) => (s < 60 ? `${Math.max(0, Math.floor(s))} s` : S.formatClock(s));

test('rastro en la interfaz: un fugitivo activo con pista válida ve un único marcador de tamaño fijo en pantalla', () => {
  const game = runnerGame();
  toFirstPing(game);
  const trail = S.ownTrail(game);
  assert.equal(trail.status, 'sent');
  const [mark, ...rest] = circles(UI.trailMarker(game, 1));
  assert.ok(mark, 'hay marcador');
  assert.equal(rest.length, 0, 'un solo marcador');
  assert.deepEqual({ x: mark.x, y: mark.y }, trail.pos);
  assert.equal(circles(UI.trailMarker(game, 2))[0].r, mark.r * 2, 'el radio escala con las unidades por píxel');
  assert.match(UI.trailMarker(game, 1), /stroke-dasharray/, 'discontinuo: no se confunde con el marcador actual');
  assert.match(UI.trailPanel(game), new RegExp(`Pista #${trail.pingN}: recibieron tu posición de hace`));
});

test('rastro en la interfaz: se dibuja la posición comunicada, no la actual', () => {
  const game = runnerGame();
  toFirstPing(game);
  const me = S.self(game);
  me.pos = { x: me.pos.x + 90, y: me.pos.y - 70 };
  S.stepGame(game, 5);
  const trail = S.ownTrail(game);
  const [mark] = circles(UI.trailMarker(game, 1));
  assert.deepEqual({ x: mark.x, y: mark.y }, trail.pos);
  assert.notDeepEqual({ x: mark.x, y: mark.y }, { x: me.pos.x, y: me.pos.y });
  assert.doesNotMatch(UI.trailMarker(game, 1), /<line|<path|<polyline/, 'sin línea hasta la posición actual');
});

test('rastro en la interfaz: sin pista válida no hay marcador', () => {
  const game = runnerGame();
  assert.equal(S.ownTrail(game).status, 'none');
  assert.equal(UI.trailMarker(game, 1), '');
  assert.match(UI.trailPanel(game), /Aún no han recibido ninguna pista/);
  toFirstPing(game);
  const ping = game.pings.at(-1);
  ping.entries = ping.entries.map((e) => (e.id === 'me' ? { ...e, pos: null } : e));
  assert.equal(S.ownTrail(game).status, 'unavailable');
  assert.equal(UI.trailMarker(game, 1), '');
  assert.match(UI.trailPanel(game), /no incluía una posición tuya disponible/);
  assert.deepEqual(UI.trailBinds(game), {});
});

test('rastro en la interfaz: ni cazadores ni fugitivos capturados lo ven', () => {
  const hunterGame = S.startGame(roomWithSelfAs('hunter', { players: 8 }));
  toFirstPing(hunterGame);
  assert.equal(UI.trailMarker(hunterGame, 1), '');
  assert.equal(UI.trailPanel(hunterGame), '');
  assert.deepEqual(UI.trailBinds(hunterGame), {});
  const game = runnerGame();
  toFirstPing(game);
  assert.notEqual(UI.trailMarker(game, 1), '');
  S.selfTag(game);
  assert.equal(UI.trailMarker(game, 1), '');
  assert.equal(UI.trailPanel(game), '');
  assert.deepEqual(UI.trailBinds(game), {});
});

test('rastro en la interfaz: nada sobre otros jugadores ni sobre los cazadores', () => {
  const a = runnerGame(77, { players: 10 });
  const b = runnerGame(77, { players: 10 });
  toFirstPing(a);
  toFirstPing(b);
  const text = uiText(a);
  for (const p of a.players.filter((p) => !p.isSelf)) {
    assert.ok(!text.includes(p.name), `no aparece «${p.name}»`);
    assert.ok(!text.includes(`"${p.id}"`), `no aparece el id ${p.id}`);
  }
  assert.doesNotMatch(text, /\bTú\b|\bAhora\b/);
  for (const h of b.players.filter((p) => p.team === 'hunter')) h.pos = { x: -300, y: 250 };
  assert.equal(uiText(b), text, 'mover a los cazadores no cambia nada de lo que se muestra');
});

test('rastro en la interfaz: la antigüedad se cuenta desde la medición y avanza con el tiempo simulado', () => {
  const game = runnerGame();
  toFirstPing(game);
  const ping = game.pings.at(-1);
  const entry = ping.entries.find((e) => e.id === 'me');
  entry.measuredAt = ping.t - 40;
  const expect = () => agoText(game.t - entry.measuredAt);
  assert.equal(UI.trailBinds(game).trailAge, expect());
  assert.ok(UI.trailMarker(game, 1).includes(`hace ${expect()}`));
  assert.match(UI.trailPanel(game), /Medida 40 s antes del envío/);
  S.stepGame(game, 30);
  assert.equal(UI.trailBinds(game).trailAge, expect());
  assert.ok(game.t - entry.measuredAt >= 60);
  assert.match(UI.trailBinds(game).trailAge, /^\d+:\d\d$/, 'a partir de un minuto, m:ss');
});

test('rastro en la interfaz: la cuenta atrás solo aparece si hay próxima pista', () => {
  const game = runnerGame();
  const trail = S.ownTrail(game);
  assert.equal(UI.trailBinds(game).trailNext, S.formatClock(trail.nextPingIn));
  assert.match(UI.trailPanel(game), /data-bind="trailNext"/);
  S.endGame(game);
  assert.deepEqual(S.ownTrail(game), { status: 'none', nextPingIn: null });
  assert.doesNotMatch(UI.trailPanel(game), /trailNext|Primera pista/);
  assert.deepEqual(UI.trailBinds(game), {});
});

test('rastro en la interfaz: el aviso de exposición solo aparece con exposedLive', () => {
  const game = runnerGame();
  toFirstPing(game);
  assert.doesNotMatch(UI.trailPanel(game), /en directo/);
  const me = S.self(game);
  me.pos = { x: game.settings.zoneRadiusM + 120, y: 0 };
  S.stepGame(game, 1);
  assert.equal(S.ownTrail(game).exposedLive, false);
  assert.doesNotMatch(UI.trailPanel(game), /en directo/, 'dentro del margen no hay aviso');
  S.stepGame(game, S.EXPERIMENTAL.outsideGraceS);
  assert.equal(S.ownTrail(game).exposedLive, true);
  assert.equal((UI.trailPanel(game).match(/en directo/g) || []).length, 1, 'un único aviso');
});

// ── Fase 2E: claridad en partida (funciones puras de ui.js) ──
const boxesOverlap = (a, b) => Math.min(a.x2, b.x2) > Math.max(a.x1, b.x1) && Math.min(a.y2, b.y2) > Math.max(a.y1, b.y1);
const U_360 = 2.8; // unidades por píxel aproximadas del mapa en 360×740 con zona de 400 m

test('aviso de pista: solo para un fugitivo activo cuya posición se ha enviado', () => {
  const game = runnerGame();
  assert.equal(UI.pingToast(game), null, 'sin pistas todavía');
  toFirstPing(game);
  assert.match(UI.pingToast(game), /acaban de recibir una pista con tu última posición/);
  S.selfTag(game);
  assert.equal(S.self(game).status, 'captured');
  assert.equal(UI.pingToast(game), null, 'un fugitivo capturado no recibe el aviso');
  const hunterGame = S.startGame(roomWithSelfAs('hunter', { players: 8 }));
  toFirstPing(hunterGame);
  assert.equal(UI.pingToast(hunterGame), null);
});

test('rastro en la interfaz: si coincide con «Tú», el anillo rodea el halo sin mover la posición', () => {
  const game = runnerGame();
  toFirstPing(game);
  const trail = S.ownTrail(game);
  const me = S.self(game);
  assert.ok(Math.hypot(trail.pos.x - me.pos.x, trail.pos.y - me.pos.y) < 1, 'el fugitivo no se ha movido desde la pista');
  for (const u of [1, U_360]) {
    const [mark] = circles(UI.trailMarker(game, u));
    assert.deepEqual({ x: mark.x, y: mark.y }, trail.pos);
    assert.ok(mark.r > 22 * u, `u=${u}: el anillo (${mark.r / u} px) queda fuera del halo de 22 px`);
  }
  me.pos = { x: me.pos.x + 150, y: me.pos.y };
  S.stepGame(game, 1);
  const [far] = circles(UI.trailMarker(game, 1));
  assert.equal(far.r, 12, 'lejos de «Tú» conserva su tamaño normal');
  assert.deepEqual(S.ownTrail(game), { ...trail, ageNow: trail.ageNow + 1 }, 'ownTrail no cambia por la representación');
});

test('pestaña de pistas: una sola cuenta atrás antes de la primera pista', () => {
  const game = runnerGame();
  toHunt(game);
  const countdowns = (html) => (html.match(/data-bind="(nextPing|trailNext)"/g) || []).length;
  assert.equal(countdowns(UI.cluesBody(game, S.self(game))), 1, 'fugitivo antes de la primera pista');
  toFirstPing(game);
  const after = UI.cluesBody(game, S.self(game));
  assert.equal(countdowns(after), 1, 'fugitivo tras la primera pista');
  assert.match(after, /data-bind="nextPing"/);
  const hunterGame = S.startGame(roomWithSelfAs('hunter', { players: 8 }));
  toHunt(hunterGame);
  assert.equal(countdowns(UI.cluesBody(hunterGame, S.self(hunterGame))), 1, 'cazador antes de la primera pista');
});

test('resolución: quien no está implicado sabe que solo tiene que esperar; los implicados no cambian', () => {
  const game = runnerGame();
  toHunt(game);
  const [h] = botHunters(game);
  const [r] = botRunners(game);
  game.claims.push({ id: 'cx', hunterId: h.id, hunterName: h.name, runnerId: r.id, runnerName: r.name, state: 'disputed', since: game.t, disputedAt: game.t, botDecided: true });
  game.phase = 'resolving';
  game.resolutionEndsAt = game.t + 90;
  const step = UI.stepFor(game);
  assert.equal(step.tone, 'wait');
  assert.match(step.text, /no tienes que hacer nada/);
  assert.match(step.text, /1:30/);
  // Implicado: su propia disputa manda (texto de S.nextStep sin tocar).
  game.claims.push({ id: 'cy', hunterId: h.id, hunterName: h.name, runnerId: 'me', runnerName: 'Tú', state: 'disputed', since: game.t, disputedAt: game.t, botDecided: true });
  assert.deepEqual(UI.stepFor(game), S.nextStep(game));
  game.claims.pop();
  // Fuera de zona: el peligro sigue mandando.
  S.self(game).outsideSince = game.t;
  assert.deepEqual(UI.stepFor(game), S.nextStep(game));
  assert.equal(UI.stepFor(game).tone, 'danger');
  // Fuera de la resolución, idéntico a S.nextStep.
  S.self(game).outsideSince = null;
  game.phase = 'hunt';
  assert.deepEqual(UI.stepFor(game), S.nextStep(game));
});

test('etiquetas del mapa: las pistas dicen «hace» y no se solapan aunque los fugitivos estén juntos (semilla fija)', () => {
  const game = S.startGame(roomWithSelfAs('hunter', { players: 10, dynamicZone: false }, 20261024));
  toFirstPing(game);
  const ping = game.pings.at(-1);
  assert.ok(ping.entries.length >= 4);
  // Caso difícil y reproducible: todas las pistas en un grupo de ~30 m, a unos 60 m de «Tú».
  const me = S.self(game);
  ping.entries.forEach((e, i) => { e.pos = { x: me.pos.x + 60 + (i % 2) * 6, y: me.pos.y + i * 6 }; });
  const { shapes, labels } = UI.mapScene(game, U_360);
  const clues = labels.filter((l) => l.prio <= 1);
  const youLabel = labels.find((l) => l.text === 'Tú');
  assert.ok(youLabel);
  for (const e of ping.entries) {
    const l = labels.find((x) => x.owner === e.id);
    assert.match(l.text, new RegExp(`^${e.name} · hace \\d+ s$`));
    assert.ok(shapes.some((sh) => sh.includes(`cx="${e.pos.x}" cy="${e.pos.y}"`)), 'el marcador sigue en su posición');
  }
  for (let i = 0; i < clues.length; i++) {
    for (let j = i + 1; j < clues.length; j++) assert.ok(!boxesOverlap(clues[i].box, clues[j].box), `${clues[i].text} / ${clues[j].text}`);
  }
  assert.deepEqual(UI.mapScene(game, U_360), { shapes, labels }, 'colocación determinista');
});

test('etiquetas del mapa: los compañeros se dibujan debajo de las pistas', () => {
  const game = S.startGame(roomWithSelfAs('hunter', { players: 10, dynamicZone: false }, 20261024));
  toFirstPing(game);
  const { shapes } = UI.mapScene(game, U_360);
  const lastTeammate = shapes.findLastIndex((sh) => sh.includes('class="mk-h"'));
  const firstClue = shapes.findIndex((sh) => sh.includes('class="mk-ping"'));
  assert.ok(lastTeammate >= 0 && firstClue >= 0);
  assert.ok(lastTeammate < firstClue);
});

test('etiquetas del mapa: evitan salirse de la parte visible del plano', () => {
  const u = 1;
  const view = { x1: -160, x2: 160, y1: -160, y2: 160 };
  const items = [{ owner: 'a', x: 150, y: 0, r: 10, text: 'Etiqueta larga · hace 12 s', tone: 'dim', prio: 1 }];
  const [inside] = UI.placeLabels(items, [], u, view);
  assert.ok(inside.box.x2 <= view.x2 && inside.box.x1 >= view.x1, 'se coloca dentro (a la izquierda del marcador)');
  const [free] = UI.placeLabels(items, [], u);
  assert.equal(free.y, items[0].y - 16, 'sin límites, la posición por defecto es encima');
});

// ── Secuencia de inicio de partida (D-042) ──
test('inicio: cuenta atrás de 5 s y tiempo de huida configurable (mínimo y por defecto 2 min)', () => {
  assert.equal(S.EXPERIMENTAL.countdownS, 5);
  assert.equal(S.defaultSettings().headStartMin, 2);
  assert.equal(S.headStartOf({ headStartMin: 1 }), 120, 'nunca por debajo de 2 min');
  assert.equal(S.headStartOf({}), 120);
  const game = S.startGame(readyRoom({ headStartMin: 3 }));
  assert.equal(game.t, -5);
  assert.equal(game.headStartS, 180);
  S.stepGame(game, 5);
  assert.equal(game.phase, 'headstart');
  S.stepGame(game, 179);
  assert.equal(game.phase, 'headstart');
  S.stepGame(game, 1);
  assert.equal(game.phase, 'hunt', 'la persecución empieza al acabar la huida elegida');
  assert.equal(game.nextPingAt, 180 + S.EXPERIMENTAL.pingEveryS);
});

test('inicio: con sorteo automático los equipos no existen en la sala; se sortean en secreto al empezar', () => {
  const room = S.createRoom({ players: 9, ratio: 'equilibrado' }, 21);
  S.botsReady(room);
  S.setReady(room, 'me', true);
  assert.ok(room.players.every((p) => p.team === null), 'nadie tiene equipo en la sala');
  assert.equal(S.canStart(room), true);
  const game = S.startGame(room);
  const hunters = game.players.filter((p) => p.team === 'hunter').length;
  assert.equal(hunters, S.huntersTarget(9, 'equilibrado'));
  assert.ok(game.players.every((p) => p.team === 'hunter' || p.team === 'runner'));
  const joined = S.joinRoom('HK7M2Q').room;
  assert.ok(joined.players.every((p) => p.team === null), 'al unirse tampoco se ven equipos');
  const manual = S.createRoom({ players: 4, assignment: 'manual' }, 5);
  assert.ok(S.validateLobby(manual).some((i) => i.code === 'unassigned'), 'en modo manual el anfitrión debe asignarlos');
});

test('inicio: durante la cuenta atrás la interfaz no revela el rol', () => {
  const game = S.startGame(roomWithSelfAs('hunter'));
  assert.equal(UI.roleHidden(game), true);
  const { shapes } = UI.mapScene(game, 1);
  assert.ok(shapes.some((sh) => sh.includes('mk-me-ring hidden-role')));
  assert.ok(!shapes.some((sh) => /mk-me-ring (hunter|runner)/.test(sh)));
  assert.doesNotMatch(UI.stepFor(game).text, /cazador|fugitivo/i);
  S.stepGame(game, S.EXPERIMENTAL.countdownS);
  assert.equal(UI.roleHidden(game), false);
  assert.ok(UI.mapScene(game, 1).shapes.some((sh) => sh.includes('mk-me-ring hunter')));
});
