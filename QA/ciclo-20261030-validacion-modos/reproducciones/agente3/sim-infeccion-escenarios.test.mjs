// AGENTE 3 · Escenarios de Infección con el simulador de 10 participantes (servidor y motor reales,
// bots con net.js real, reloj SimClock). NO EJECUTADO por el agente.
// Uso (desde la raíz del repo): node --test "C:/Users/aange/AppData/Local/Temp/claude/C--Users-aange/e108e3b2-532d-48d6-89f2-6b46f764d244/scratchpad/agente3/sim-infeccion-escenarios.test.mjs"
// Con 10 jugadores Infección empieza con 2 cazadores (floor(10/4)). Este archivo NO cubre otros tamaños:
// para n = 4…20 ver motor-infeccion-casos.test.ts.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { NAMES, Simulation } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/sim/panel/simulacion.mjs';
import { visiblePositions } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/engine/src/view.ts';
import { contagionChains } from 'file:///C:/Users/aange/Projects/Juego-escondite-recuperacion/mobile/www/js/game-view.js';

const sims = [];
after(async () => {
  for (const s of sims) await s.close();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sim(seed = 11) {
  const s = await new Simulation({ seed }).open();
  sims.push(s);
  await s.start('infection');
  await s.advance(5_000 + 2 * 60_000 + 5_000); // cuenta atrás + huida → persecución
  assert.equal(s.room().phase, 'ACTIVE');
  return s;
}
const st = (s) => s.room();
const P = (s, name) => st(s).players[s.avatar(name).id];
const namesWhere = (s, f) => NAMES.filter((n) => f(P(s, n)));
async function until(s, fn, maxMs, step = 5_000) {
  for (let t = 0; t < maxMs && !fn(); t += step) await s.advance(step);
  return fn();
}
async function waitReal(fn, what, ms = 5_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(20);
  }
  throw new Error(`tiempo agotado: ${what}`);
}

describe('SIM-INF · 10 participantes', () => {
  it('SIM-INF-01 partida completa con bots: 2 cazadores iniciales, toda captura convierte, ningún convertido captura en su espera, final coherente', async () => {
    const s = await sim(11);
    // Antes de que nadie capture: 2 cazadores exactos.
    assert.equal(namesWhere(s, (p) => p.team === 'hunter').length, 2);
    const initial = new Set(namesWhere(s, (p) => p.team === 'hunter').map((n) => s.avatar(n).id));
    assert.ok(await until(s, () => st(s).phase === 'FINISHED', 25 * 60_000, 60_000), `termina (${st(s).phase})`);
    const room = st(s);
    const caps = room.captures;
    assert.ok(caps.every((c) => c.converted));
    // Regla de los 60 s: nadie convertido figura como autor de una captura antes de convertedAt+60 s.
    const convertedAt = new Map(caps.map((c) => [c.runnerId, c.atOffsetMs]));
    for (const c of caps) {
      if (!c.hunterId || initial.has(c.hunterId)) continue;
      assert.ok(c.atOffsetMs >= convertedAt.get(c.hunterId) + 60_000, `captura de ${s.nameOf(c.hunterId)} en su espera`);
    }
    for (const p of Object.values(room.players)) if (p.convertedAt) assert.equal(p.canTagFrom - p.convertedAt, 60_000);
    const o = room.outcome;
    if (o.cause === 'all_captured') assert.ok(Object.values(room.players).filter((p) => p.status === 'active').every((p) => p.team === 'hunter'));
    if (o.cause === 'time_up') assert.equal(o.winner, Object.values(room.players).some((p) => p.team === 'runner' && p.status === 'active') ? 'runner' : 'hunter');
    // Cadena: anotar para el informe (no falla). A3-3: solo la 1.ª rama de cada cazador inicial.
    const chained = new Set(contagionChains(caps).flat());
    const missing = caps.filter((c) => !chained.has(c.runnerId)).map((c) => s.nameOf(c.runnerId));
    console.log(`SIM-INF-01 resultado=${JSON.stringify(o)} capturas=${caps.length} fuera_de_cadena=${missing.join(',') || '—'}`);
    assert.deepEqual(s.errors, []);
  });

  it('SIM-INF-02 conversión guiada: rol, espera, visibilidad filtrada por el servidor y reclamación en la espera rechazada', async () => {
    const s = await sim(12);
    const { hunter, runner } = s.validCapture();
    assert.ok(await until(s, () => P(s, runner).team === 'hunter', 6 * 60_000), 'convertido');
    const conv = s.avatar(runner);
    assert.equal(P(s, runner).status, 'active');
    // Solo él recibió role_changed (registro del panel: «recibe su rol nuevo … (solo él lo recibe)»).
    assert.ok(s.log.some((l) => l.who === runner && /rol nuevo/.test(l.text)));
    // Vista autorizada: el convertido solo ve cazadores; ningún fugitivo lo ve.
    const now = s.clock.now();
    const sees = visiblePositions(st(s), conv.id, now).map((v) => st(s).players[v.playerId].team);
    assert.ok(sees.every((t) => t === 'hunter'), `ve: ${sees}`);
    for (const n of namesWhere(s, (p) => p.team === 'runner' && p.status === 'active')) {
      assert.ok(!visiblePositions(st(s), s.avatar(n).id, now).some((v) => v.playerId === conv.id), `${n} aún ve al convertido`);
    }
    // Snapshot: canTagFrom en el futuro y sin la última pista anterior.
    await waitReal(() => conv.snap?.canTagFrom > 0, 'canTagFrom en la vista');
    assert.equal(conv.snap.lastPing === null || conv.snap.lastPing.pingNo > (P(s, runner).pingsBeforeConversion ?? 0), true);
    // Reclamación dentro de la espera: tag_cooldown (aunque esté lejos, la espera se comprueba antes).
    const target = namesWhere(s, (p) => p.team === 'runner' && p.status === 'active')[0];
    if (target) {
      const r = await conv.command({ type: 'claim_tag', runnerId: s.avatar(target).id });
      assert.equal(r.error, 'tag_cooldown');
    }
    console.log(`SIM-INF-02 ${hunter} infectó a ${runner}`);
  });

  it('SIM-INF-03 «Me han pillado» atribuido a un convertido en su espera → sin autor; pasado 1 min → con autor', async () => {
    const s = await sim(13);
    const { runner } = s.validCapture();
    assert.ok(await until(s, () => P(s, runner).team === 'hunter', 6 * 60_000));
    const conv = s.avatar(runner);
    const [a, b] = namesWhere(s, (p) => p.team === 'runner' && p.status === 'active');
    await s.avatar(a).command({ type: 'self_tag', hunterId: conv.id });
    assert.equal(st(s).captures.at(-1).hunterId, null);
    await s.advance(65_000);
    if (b && P(s, b).team === 'runner' && st(s).phase === 'ACTIVE') {
      await s.avatar(b).command({ type: 'self_tag', hunterId: conv.id });
      assert.equal(st(s).captures.at(-1).hunterId, conv.id);
    }
  });

  it('SIM-INF-04 dos cazadores reclaman al mismo fugitivo a la vez: una reclamación válida y un already_pending; una sola conversión', async () => {
    const s = await sim(14);
    s.pause(); // que los bots no se muevan mientras se colocan
    const [h1, h2] = namesWhere(s, (p) => p.team === 'hunter' && !(p.canTagFrom > s.clock.now()));
    const r = namesWhere(s, (p) => p.team === 'runner' && p.status === 'active')[0];
    const R = s.avatar(r);
    for (const [n, dn] of [[h1, 2], [h2, -2], [r, 0]]) {
      const a = s.avatar(n);
      a.pos = { lat: R.pos.lat + dn / 110_540, lng: R.pos.lng };
      a.conn.sendLocation({ lat: a.pos.lat, lng: a.pos.lng, accuracyM: 6, ageMs: 0 });
    }
    await s.settle();
    const res = await Promise.all([h1, h2].map((n) => s.avatar(n).command({ type: 'claim_tag', runnerId: R.id })));
    s.resume();
    assert.deepEqual(res.map((x) => x.ok).sort(), [false, true]);
    assert.equal(res.find((x) => !x.ok).error, 'already_pending');
    await waitReal(() => P(s, r).team === 'hunter', 'el bot confirma');
    assert.equal(st(s).captures.filter((c) => c.runnerId === R.id).length, 1);
  });

  it('SIM-INF-05 convertido desconectado: sin conexión a 30 s, sigue cazador, vuelve antes de 5 min; otro convertido queda fuera a los 5 min', async () => {
    const s = await sim(15);
    const one = s.validCapture().runner;
    assert.ok(await until(s, () => P(s, one).team === 'hunter', 6 * 60_000));
    s.disconnect(one);
    await s.advance(35_000);
    assert.equal(P(s, one).away, true);
    assert.equal(P(s, one).team, 'hunter');
    s.restore(one);
    await waitReal(() => P(s, one).away === false, 'vuelve');
    assert.equal(P(s, one).status, 'active');
    if (st(s).phase !== 'ACTIVE') return;
    const two = s.validCapture().runner;
    assert.ok(await until(s, () => P(s, two).team === 'hunter' || st(s).phase !== 'ACTIVE', 6 * 60_000));
    if (st(s).phase !== 'ACTIVE') return;
    s.disconnect(two);
    await s.advance(5 * 60_000 + 10_000);
    if (st(s).phase === 'ACTIVE') {
      assert.equal(P(s, two).status, 'left');
      assert.equal(P(s, two).leftReason, 'timeout');
    }
  });

  it('SIM-INF-06 último fugitivo sin conexión 5 min → sin ganador (runners_abandoned)', async () => {
    const s = await sim(16);
    const hunter = namesWhere(s, (p) => p.team === 'hunter')[0];
    const runners = namesWhere(s, (p) => p.team === 'runner' && p.status === 'active');
    const last = runners.pop();
    for (const n of runners) await s.avatar(n).command({ type: 'self_tag', hunterId: s.avatar(hunter).id });
    assert.equal(st(s).phase, 'ACTIVE');
    s.disconnect(last);
    await s.advance(5 * 60_000 + 10_000);
    assert.deepEqual(st(s).outcome, { winner: null, cause: 'runners_abandoned' });
  });

  it('SIM-INF-07 todos se declaran infectados → ganan los cazadores («Todos infectados»), con la cadena', async () => {
    const s = await sim(17);
    const hunter = namesWhere(s, (p) => p.team === 'hunter')[0];
    for (const n of namesWhere(s, (p) => p.team === 'runner' && p.status === 'active')) await s.avatar(n).command({ type: 'self_tag', hunterId: s.avatar(hunter).id });
    assert.deepEqual(st(s).outcome, { winner: 'hunter', cause: 'all_captured' });
    assert.equal(st(s).captures.length, 8);
  });

  it('SIM-INF-08 los dos cazadores iniciales se van; queda un convertido en su espera → la partida sigue; si se va él → hunters_abandoned', async () => {
    const s = await sim(18);
    const conv = s.validCapture().runner;
    assert.ok(await until(s, () => P(s, conv).team === 'hunter', 6 * 60_000));
    for (const n of namesWhere(s, (p) => p.team === 'hunter' && !p.convertedAt)) {
      if (n === NAMES[0]) await s.avatar(n).command({ type: 'leave' });
      else s.disconnect(n);
    }
    await s.advance(5 * 60_000 + 10_000); // el anfitrión ya salió; el otro inicial queda fuera
    if (st(s).phase === 'ACTIVE') {
      const hunters = namesWhere(s, (p) => p.team === 'hunter' && p.status === 'active');
      assert.ok(hunters.length >= 1);
      for (const n of hunters) s.disconnect(n);
      await s.advance(5 * 60_000 + 10_000);
      assert.deepEqual(st(s).outcome, { winner: null, cause: 'hunters_abandoned' });
    }
  });

  it('SIM-INF-09 revancha tras Infección: estado de conversión y espera; sorteo nuevo con 2 cazadores', async () => {
    const s = await sim(19);
    const hunter = namesWhere(s, (p) => p.team === 'hunter')[0];
    for (const n of namesWhere(s, (p) => p.team === 'runner' && p.status === 'active')) await s.avatar(n).command({ type: 'self_tag', hunterId: s.avatar(hunter).id });
    assert.equal(st(s).phase, 'FINISHED');
    const host = s.avatarById(st(s).hostId);
    assert.equal((await host.command({ type: 'rematch', swapRoles: false })).ok, true);
    // [A3-5] En la sala de la revancha los convertidos conservan convertedAt/canTagFrom (el panel muestra «· infectado»).
    const leftovers = NAMES.filter((n) => P(s, n).convertedAt != null);
    console.log(`SIM-INF-09 restos de conversión en LOBBY: ${leftovers.length}`);
    for (const a of s.avatars) if (a !== host) await a.command({ type: 'join_rematch' });
    for (const a of s.avatars) await a.command({ type: 'set_ready', ready: true });
    assert.equal((await host.command({ type: 'start' })).ok, true);
    assert.equal(st(s).config.mode, 'infection');
    assert.equal(namesWhere(s, (p) => p.team === 'hunter').length, 2);
    assert.ok(NAMES.every((n) => P(s, n).canTagFrom == null && P(s, n).convertedAt == null));
    assert.equal(st(s).captures.length, 0);
  });

  it('SIM-INF-10 tiempo agotado con supervivientes → ganan los supervivientes', async () => {
    const s = await sim(20);
    for (const n of NAMES) if (P(s, n).team === 'hunter') s.freeze(n); // cazadores quietos, sin capturar
    await s.advance(4 * 60_000); // sin señal 4 min: no llegan a quedar fuera
    for (const n of NAMES) s.restore(n);
    assert.ok(await until(s, () => st(s).phase === 'FINISHED', 20 * 60_000, 60_000));
    const o = st(s).outcome;
    if (Object.values(st(s).players).some((p) => p.team === 'runner' && p.status === 'active')) assert.deepEqual(o, { winner: 'runner', cause: 'time_up' });
  });
});
