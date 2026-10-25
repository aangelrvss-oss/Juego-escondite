// Evaluador de los BOTS de la demo (no es una prueba ni representa partidas humanas reales).
// El jugador simulado no interviene: como cazador se queda quieto y nunca reclama; como fugitivo
// se queda quieto y acepta cualquier reclamación. Así se mide solo el comportamiento de los bots.
// Uso: node demo/eval/bots.mjs [número de semillas, por defecto 60]
import * as S from '../src/sim.js';

const N = Number(process.argv[2] ?? 60);
const SEEDS = Array.from({ length: N }, (_, i) => 1000 + i * 37);

function play(seed, selfTeam, durationMin) {
  const room = S.createRoom({ players: 8, durationMin, zoneRadiusM: 400, ratio: 'equilibrado', dynamicZone: true }, seed);
  S.drawTeams(room);
  S.botsReady(room);
  S.setReady(room, 'me', true);
  S.setTeam(room, 'me', selfTeam);
  if (!room.players.some((p) => !p.isSelf && p.team === 'hunter')) room.players.find((p) => !p.isSelf).team = 'hunter';
  if (!room.players.some((p) => p.team === 'runner')) room.players.find((p) => !p.isSelf && p.team === 'hunter').team = 'runner';
  const g = S.startGame(room);
  // Distancia media recorrida por los fugitivos bot durante la caza (¿se esconden o deambulan?).
  let walked = 0;
  let samples = 0;
  const last = new Map();
  while (g.phase !== 'finished') {
    if (g.incoming) S.respondIncoming(g, true);
    S.stepGame(g, 1);
    if (g.phase === 'hunt') {
      for (const p of g.players.filter((x) => x.team === 'runner' && !x.isSelf && x.status === 'active')) {
        if (last.has(p.id)) { walked += S.dist(last.get(p.id), p.pos); samples++; }
        last.set(p.id, { ...p.pos });
      }
    }
  }
  return { winner: g.outcome.winner, caps: g.captures.length, first: g.captures[0]?.t ?? null, events: g.events.length, runnerMovingShare: samples ? walked / samples / S.EXPERIMENTAL.botRunnerMps : 0 };
}

function report(label, selfTeam, durationMin) {
  const rs = SEEDS.map((s) => play(s, selfTeam, durationMin));
  const pct = (f) => `${Math.round((100 * rs.filter(f).length) / rs.length)} %`;
  const firsts = rs.filter((r) => r.first !== null).map((r) => r.first);
  console.log(label, {
    ganaCazador: pct((r) => r.winner === 'hunter'),
    capturasMedia: (rs.reduce((a, r) => a + r.caps, 0) / rs.length).toFixed(2),
    rondasSinCaptura: pct((r) => r.caps === 0),
    primeraCapturaMin: firsts.length ? (firsts.reduce((a, b) => a + b, 0) / firsts.length / 60).toFixed(1) : '—',
    fugitivosBotEnMovimiento: `${Math.round((100 * rs.reduce((a, r) => a + r.runnerMovingShare, 0)) / rs.length)} % del tiempo de caza`,
  });
}

// Reproducibilidad: la misma semilla da exactamente la misma partida.
const a = play(SEEDS[0], 'hunter', 20);
const b = play(SEEDS[0], 'hunter', 20);
console.log('misma semilla, mismo resultado:', JSON.stringify(a) === JSON.stringify(b));
console.log(`semillas: ${N} · 8 jugadores · zona 400 m dinámica · parámetros EXPERIMENTAL sin cambios`);
report('jugador cazador quieto, 20 min', 'hunter', 20);
report('jugador fugitivo quieto, 20 min', 'runner', 20);
