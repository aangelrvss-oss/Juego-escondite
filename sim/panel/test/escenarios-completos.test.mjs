// Escenarios completos con 10 participantes (C20 del ciclo de validación del 30/10/2026): para Clásico,
// Infección y Caza del zorro, una partida entera y su revancha con el servidor, el motor y net.js reales
// (bots, GPS y reloj simulados). Versión en el repositorio del script del coordinador
// QA/ciclo-20261030-validacion-modos/reproducciones/coordinador/escenarios-10.mjs.
//
// Todo se comprueba con lo que RECIBE cada cliente por la red:
// - posiciones: cada elemento, contra la regla del modo y con el estado EXACTO con el que el servidor las
//   calculó (se registra un resumen del estado en el instante de cada envío periódico, el `at` del mensaje);
// - pistas: solo a cazadores; en el zorro, una sola entrada que es el zorro;
// - equipos visibles en las instantáneas según el modo (ninguno en la cuenta atrás);
// - un único game_finished por cliente y resultado coherente con el estado;
// - Infección: todo infectado es cazador y nadie captura durante su espera;
// - revancha sin restos (reclamaciones, capturas, esperas, resultado);
// - la captura inválida se rechaza: se identifica EXACTAMENTE esa reclamación (la respuesta a ese comando
//   y que no exista ninguna reclamación ni captura de esa pareja), no «el último rechazo del registro».
//
// Lenta (unos minutos): va aparte de test:sim-panel, en `npm run test:sim-escenarios`.
// No se fija ningún código de rechazo concreto (V-02, sondeo, pendiente de decisión).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TAG } from '../../../engine/src/constants.ts';
import { MODES } from '../../../engine/src/modes.ts';
import { Simulation } from '../simulacion.mjs';

const SEED = 7;
const MINUTE = 60_000;
const LIVE = new Set(['HEAD_START', 'ACTIVE']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resumen del estado que decide quién puede recibir qué. */
function summary(st) {
  return {
    phase: st.phase,
    players: Object.fromEntries(st.playerOrder.map((id) => [id, { team: st.players[id].team, status: st.players[id].status, exposed: Boolean(st.players[id].exposed) }])),
  };
}

/** ¿Puede `me` recibir la posición de `o` con este motivo? (GAME_STATE_MACHINE §6.4, D-057 §3) */
function positionAllowed(mode, phase, me, o, reason) {
  if (!LIVE.has(phase) || !o || o.status !== 'active') return false;
  if (me.status === 'captured') return reason === 'spectator_delayed';
  if (me.status !== 'active') return false;
  if (reason === 'teammate') return o.team === me.team;
  if (reason === 'exposed') return phase === 'ACTIVE' && me.team === 'hunter' && o.team === 'runner' && o.exposed;
  if (reason === 'hunter_seen') return mode === 'fox_hunt' && me.team === 'runner' && o.team === 'hunter';
  return false;
}

/** Observador: escucha a cada cliente y anota cualquier incumplimiento. */
class Observer {
  constructor(s, mode) {
    this.s = s;
    this.mode = mode;
    this.problems = [];
    this.closed = false;
    this.atBroadcast = new Map(); // at → resumen del estado con el que se calcularon las posiciones
    this.finished = new Map(); // nombre → game_finished recibidos en la partida actual
    this.counts = { positionsMsgs: 0, positionsItems: 0, pings: 0 };
    const hub = s.server.hub;
    assert.equal(typeof hub.broadcastPositions, 'function', 'el hub ya no tiene broadcastPositions: hay que adaptar la prueba');
    const original = hub.broadcastPositions.bind(hub);
    hub.broadcastPositions = (now) => {
      // Con el hub de este servidor (no `s.room()`): el temporizador del servidor puede despertar mientras se
      // cierra la simulación, cuando `s.server` ya es null.
      const st = s.code ? hub.roomStateByCode(s.code) : undefined;
      if (st && !this.closed) this.atBroadcast.set(now, summary(st));
      if (this.atBroadcast.size > 2_000) this.atBroadcast.delete(this.atBroadcast.keys().next().value);
      return original(now);
    };
  }

  bad(text) {
    this.problems.push(text);
  }

  hook() {
    for (const a of this.s.avatars) {
      if (a.__observed === a.conn) continue;
      a.__observed = a.conn;
      const conn = a.conn;
      conn.on('positions', (msg) => {
        if (conn !== a.conn || this.closed) return;
        this.counts.positionsMsgs++;
        const sum = this.atBroadcast.get(msg.at);
        if (!sum) return this.bad(`${a.name}: posiciones con at=${msg.at} sin envío registrado`);
        const me = sum.players[a.id];
        for (const v of msg.positions ?? []) {
          this.counts.positionsItems++;
          const o = sum.players[v.playerId];
          if (!me || !positionAllowed(this.mode, sum.phase, me, o, v.reason)) {
            this.bad(`${sum.phase} ${a.name}(${me?.team}/${me?.status}) recibe la posición de ${this.s.nameOf(v.playerId)}(${o?.team}/${o?.status}, exp=${o?.exposed}) con motivo ${v.reason}`);
          }
        }
      });
      conn.on('event', (e) => {
        if (conn !== a.conn || this.closed) return; // al cerrar llegan avisos de conexión: ya no se observa
        const st = this.s.room();
        if (e.type === 'ping') {
          this.counts.pings++;
          const me = st?.players[a.id];
          if (me?.team !== 'hunter' || me.status !== 'active') this.bad(`${a.name}(${me?.team}/${me?.status}) recibe una pista`);
          const entries = e.data?.ping?.entries ?? [];
          for (const en of entries) {
            const r = st?.players[en.runnerId];
            const wasRunner = r?.team === 'runner' || (this.mode === 'infection' && r?.convertedAt != null && r.convertedAt >= e.at);
            if (!wasRunner) this.bad(`pista para ${a.name} con una entrada que no es fugitivo: ${this.s.nameOf(en.runnerId)}`);
          }
          if (this.mode === 'fox_hunt') {
            const fox = st.playerOrder.find((id) => st.players[id].team === 'runner');
            if (entries.length !== 1 || entries[0].runnerId !== fox) this.bad(`pista del zorro para ${a.name}: ${entries.map((x) => this.s.nameOf(x.runnerId))}`);
          }
        }
        if (e.type === 'game_finished') this.finished.set(a.name, (this.finished.get(a.name) ?? 0) + 1);
      });
    }
  }

  /** Equipos que muestra la instantánea de cada cliente, contra la regla del modo y el estado. */
  checkSnapshots(label) {
    const st = this.s.room();
    for (const a of this.s.avatars) {
      const snap = a.snap;
      if (!snap || snap.phase !== st.phase) continue; // instantánea aún en camino
      const me = st.players[a.id];
      for (const p of snap.players) {
        if (p.team == null) continue;
        const real = st.players[p.id];
        if (p.team !== real.team) this.bad(`${label} ${a.name} ve a ${this.s.nameOf(p.id)} como ${p.team} (es ${real.team})`);
        const allowed =
          snap.phase === 'FINISHED' ||
          (snap.phase !== 'COUNTDOWN' && snap.phase !== 'LOBBY' && (p.id === a.id || (this.mode === 'fox_hunt' && LIVE.has(snap.phase)) || real.team === me.team));
        if (!allowed) this.bad(`${label} ${snap.phase} ${a.name}(${me.team}) ve el equipo de ${this.s.nameOf(p.id)} (${p.team})`);
      }
    }
  }
}

/** Reclamación de una pareja lejana: debe rechazarse y no dejar ni reclamación ni captura de esa pareja. */
async function tryInvalidCapture(s, obs, label) {
  const st0 = s.room();
  const claimsBefore = new Set(Object.keys(st0.claims));
  const capturesBefore = st0.captures.length;
  let r;
  try {
    r = await s.invalidCapture();
  } catch {
    return null; // no hay cazador o fugitivo disponible ahora
  }
  // Solo es una captura «inválida» si de verdad están lejos (con el radio máximo de captura, 40 m, de margen).
  if (!(r.distanceM > 2 * TAG.maxRadiusM)) return null;
  const hunterId = s.avatar(r.hunter).id;
  const runnerId = s.avatar(r.runner).id;
  if (r.result?.ok !== false) obs.bad(`${label}: la reclamación de ${r.hunter} a ${r.runner} a ${r.distanceM} m NO se rechaza: ${JSON.stringify(r.result)}`);
  await s.settle();
  const st = s.room();
  const newClaim = Object.values(st.claims).find((c) => !claimsBefore.has(c.id) && c.hunterId === hunterId && c.runnerId === runnerId);
  if (newClaim) obs.bad(`${label}: queda la reclamación ${newClaim.id} de ${r.hunter} a ${r.runner}`);
  const newCapture = st.captures.slice(capturesBefore).find((c) => c.hunterId === hunterId && c.runnerId === runnerId);
  if (newCapture) obs.bad(`${label}: ${r.runner} queda capturado por ${r.hunter} tras la reclamación inválida`);
  return r;
}

async function playGame(s, obs, mode, label) {
  obs.hook();
  obs.finished.clear();
  const S0 = s.room();
  assert.equal(S0.phase, 'COUNTDOWN', label);
  const active = S0.playerOrder.filter((id) => S0.players[id].status === 'active');
  assert.equal(active.length, 10, `${label}: participantes`);
  const hunters = active.filter((id) => S0.players[id].team === 'hunter').length;
  assert.equal(hunters, MODES[mode].hunters(active.length), `${label}: cazadores del sorteo`);
  // Cuenta atrás: nadie conoce ningún equipo (tampoco el propio, D-042).
  await s.settle();
  for (const a of s.avatars) {
    if (a.snap?.phase !== 'COUNTDOWN') continue;
    for (const p of a.snap.players) if (p.team != null) obs.bad(`${label} COUNTDOWN ${a.name} ve el equipo de ${s.nameOf(p.id)}`);
  }
  await s.advance(5_000);
  obs.checkSnapshots(label);
  if (mode === 'fox_hunt') {
    // Identidad: tras la cuenta atrás todos los clientes saben quién es el zorro.
    const st = s.room();
    const fox = st.playerOrder.find((id) => st.players[id].team === 'runner');
    for (const a of s.avatars) {
      const seen = a.snap?.players.find((p) => p.id === fox)?.team;
      if (seen !== 'runner') obs.bad(`${label}: ${a.name} no sabe que el zorro es ${s.nameOf(fox)} (ve ${seen})`);
    }
  }
  await s.advance(2 * MINUTE + 5_000);
  let validTried = 0;
  let invalid = null;
  for (let t = 0; t < 26 * MINUTE && s.room().phase !== 'FINISHED'; t += 30_000) {
    obs.checkSnapshots(label);
    if (s.room().phase === 'ACTIVE' && invalid === null) invalid = await tryInvalidCapture(s, obs, label);
    // Capturas guiadas cada 2 min (tras probar la inválida, para que en el zorro la partida no acabe antes).
    if (s.room().phase === 'ACTIVE' && (invalid !== null || t >= 5 * MINUTE) && t % (2 * MINUTE) === 0 && validTried < 6) {
      try {
        s.validCapture();
        validTried++;
      } catch {
        // ningún cazador puede capturar ahora mismo
      }
    }
    await s.advance(30_000);
  }
  if (invalid === null) obs.bad(`${label}: no se pudo probar ninguna reclamación lejana`);

  const F = s.room();
  assert.equal(F.phase, 'FINISHED', `${label}: no terminó`);
  const runnersFree = F.playerOrder.filter((id) => F.players[id].team === 'runner' && F.players[id].status === 'active');
  if (F.outcome?.cause === 'all_captured' && (F.outcome.winner !== 'hunter' || runnersFree.length)) obs.bad(`${label}: all_captured incoherente`);
  if (F.outcome?.cause === 'time_up' && (F.outcome.winner !== 'runner' || !runnersFree.length)) obs.bad(`${label}: time_up incoherente`);
  if (!['all_captured', 'time_up'].includes(F.outcome?.cause)) obs.bad(`${label}: final inesperado ${JSON.stringify(F.outcome)}`);
  if (mode === 'fox_hunt' && F.captures.length > 1) obs.bad(`${label}: más de una captura en el zorro`);
  if (mode === 'classic') {
    for (const c of F.captures) if (F.players[c.runnerId].status !== 'captured') obs.bad(`${label}: ${s.nameOf(c.runnerId)} capturado pero no consta como capturado`);
  }
  if (mode === 'infection') {
    for (const c of F.captures) {
      if (F.players[c.runnerId].team !== 'hunter' || F.players[c.runnerId].status !== 'active') obs.bad(`${label}: infectado ${s.nameOf(c.runnerId)} no es cazador activo`);
      const h = c.hunterId ? F.players[c.hunterId] : null;
      const at = F.activeStart + c.atOffsetMs;
      if (h?.convertedAt != null && h.canTagFrom != null && at < h.canTagFrom) obs.bad(`${label}: ${s.nameOf(c.hunterId)} capturó durante su espera`);
    }
  }
  await sleep(300); // que no llegue un segundo final
  for (const a of s.avatars) {
    const n = obs.finished.get(a.name) ?? 0;
    if (n !== 1) obs.bad(`${label}: ${a.name} recibe ${n} game_finished`);
    if (JSON.stringify(a.snap?.outcome) !== JSON.stringify(F.outcome)) obs.bad(`${label}: ${a.name} ve el resultado ${JSON.stringify(a.snap?.outcome)}`);
    if (a.snap?.captures?.length !== F.captures.length) obs.bad(`${label}: ${a.name} ve ${a.snap?.captures?.length} capturas (hay ${F.captures.length})`);
  }
  obs.checkSnapshots(`${label} (informe)`);
  return { outcome: F.outcome, captures: F.captures.length, invalid };
}

/** Revancha por comandos, como en la app: el anfitrión la ofrece, los demás se unen, todos «listo» y empieza. */
async function rematch(s, obs) {
  const st0 = s.room();
  const host = s.avatarById(st0.hostId);
  const offer = await host.command({ type: 'rematch', swapRoles: false });
  assert.ok(offer.ok, JSON.stringify(offer));
  for (let i = 0; i < 200 && !s.avatars.every((a) => a.snap?.phase === 'LOBBY'); i++) await sleep(20);
  for (const a of s.avatars) {
    if (a === host) continue;
    const r = await a.command({ type: 'join_rematch' });
    if (!r.ok) obs.bad(`${a.name} join_rematch: ${r.error}`);
  }
  await s.settle();
  const L = s.room();
  assert.equal(L.phase, 'LOBBY');
  if (Object.keys(L.claims).length) obs.bad('sala de la revancha con reclamaciones heredadas');
  if (L.captures.length) obs.bad('sala de la revancha con capturas heredadas');
  if (L.outcome) obs.bad('sala de la revancha con resultado heredado');
  // La espera de Infección (canTagFrom/convertedAt) sigue en el estado interno de la sala hasta que empieza
  // la revancha (el motor la borra en `start`); lo que importa es que no llegue a nadie (V-27): se comprueba
  // en las instantáneas de abajo y, ya empezada, en el estado.
  for (const a of s.avatars) {
    const snap = a.snap;
    if (snap.captures.length || snap.outcome || snap.lastPing || snap.pendingClaimForMe || snap.pendingClaimByMe || snap.canTagFrom != null) {
      obs.bad(`revancha: la instantánea de ${a.name} conserva restos de la partida anterior`);
    }
  }
  for (const a of s.avatars) {
    const r = await a.command({ type: 'set_ready', ready: true });
    if (!r.ok) obs.bad(`${a.name} listo: ${r.error}`);
  }
  for (const a of s.avatars) a.resetForRematch?.(); // los bots olvidan la partida anterior (si el simulador lo ofrece)
  const start = await host.command({ type: 'start' });
  assert.ok(start.ok, `la revancha no empieza: ${JSON.stringify(start)}`);
  for (let i = 0; i < 200 && s.room().phase === 'LOBBY'; i++) await sleep(20);
  const R = s.room();
  assert.equal(R.gameNo, st0.gameNo + 1);
  if (Object.keys(R.claims).length || R.captures.length || R.outcome) obs.bad('la revancha empieza con restos de la partida anterior');
  if (R.playerOrder.some((id) => R.players[id].canTagFrom != null)) obs.bad('la revancha empieza con una espera heredada');
}

describe('Escenarios completos con 10 participantes: partida + revancha (C20)', () => {
  for (const mode of ['classic', 'infection', 'fox_hunt']) {
    it(`${mode} (semilla ${SEED}): lo que recibe cada cliente cumple las reglas del modo`, { timeout: 300_000 }, async () => {
      const s = await new Simulation({ seed: SEED }).open();
      const obs = new Observer(s, mode);
      try {
        await s.start(mode);
        const g1 = await playGame(s, obs, mode, 'partida 1');
        await rematch(s, obs);
        const g2 = await playGame(s, obs, mode, 'revancha');
        const info = `${mode}: ${JSON.stringify({ g1, g2, ...obs.counts })}`;
        console.log(info);
        assert.ok(obs.counts.positionsItems > 0, 'nadie recibió ninguna posición');
        assert.deepEqual(obs.problems.slice(0, 20), [], `${obs.problems.length} problema(s)`);
      } finally {
        obs.closed = true;
        await s.close();
      }
    });
  }
});
