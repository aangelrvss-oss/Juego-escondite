// Auditoría de producción: una partida completa en TIEMPO REAL contra el servidor público (sin acelerar nada).
// 3 clientes del protocolo (net.js): Ana cazadora, Beto y Caro fugitivos. GPS sintético alrededor del punto de
// referencia de las pruebas, con movimientos a paso de persona (sin saltos). Comprueba capturas (rechazo lejos,
// validación cerca, confirmación), la fase 1 de la zona a los 5:00 y el final por captura de todos.
import { pathToFileURL } from 'node:url';
const REPO = new URL('../../../', import.meta.url).href; // raíz del repositorio
const { offsetM, distanceM } = await import(new URL('engine/src/geo.ts', REPO).href);
const { zoneNow } = await import(new URL('mobile/www/js/game-view.js', REPO).href);
const { GameConnection } = await import(new URL('mobile/www/js/net.js', REPO).href);

const base = (process.argv[2] ?? 'https://the-outrun.onrender.com').replace(/\/$/, '');
const wsUrl = `${base.replace(/^http/, 'ws')}/ws`;
const CENTER = { lat: 40.4153, lng: -3.6845 };
const MIN = 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const ts = () => `[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)} s]`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ts()} ${ok ? '✔' : '✖'} ${name}${detail ? ` · ${detail}` : ''}`);
};
const until = async (fn, what, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(200);
  }
  throw new Error(`tiempo agotado: ${what}`);
};
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const make = (name, north, east) => {
  const conn = new GameConnection({ url: wsUrl, storage: memory() });
  const p = { name, conn, events: [], pos: offsetM(CENTER, north, east), get snap() { return this.conn.snapshot; }, get id() { return this.conn.playerId; } };
  conn.on('event', (e) => p.events.push(e));
  conn.start();
  return p;
};
const ana = make('Prueba Ana', 0, 0);
const beto = make('Prueba Beto', 8, 0);
const caro = make('Prueba Caro', -90, 30);
const all = [ana, beto, caro];
// GPS: cada 3 s, como un móvil con la pantalla encendida.
let gps = setInterval(() => {
  for (const p of all) if (p.conn.status === 'open') p.conn.sendLocation({ lat: p.pos.lat, lng: p.pos.lng, accuracyM: 6, ageMs: 0 });
}, 3_000);
/** Camina hacia `to` a `mps` m/s (pasos cada 3 s, sin saltos). */
const walk = async (p, to, mps = 1.5) => {
  for (;;) {
    const d = distanceM(p.pos, to);
    if (d < 1) return;
    const step = Math.min(d, mps * 3);
    p.pos = { lat: p.pos.lat + ((to.lat - p.pos.lat) * step) / d, lng: p.pos.lng + ((to.lng - p.pos.lng) * step) / d };
    await sleep(3_000);
  }
};
const respondWhenAsked = (runner) => {
  runner.conn.on('event', (e) => {
    if (e.type === 'tag_claimed' && e.data?.claimId) setTimeout(() => runner.conn.command({ type: 'respond_tag', claimId: e.data.claimId, accept: true }), 1_500);
  });
};

try {
  await until(() => all.every((p) => p.conn.status === 'open'), 'conexiones', 90_000);
  const { code } = await ana.conn.create(ana.name);
  for (const p of [beto, caro]) await p.conn.join(code, p.name);
  await until(() => all.every((p) => p.snap?.players.length === 3), 'sala');
  const config = { mode: 'classic', durationMs: 10 * MIN, headStartMs: 2 * MIN, pingIntervalMs: 2 * MIN, zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 250 }], dynamicZone: true, meetingPoint: CENTER, safetyChecklistConfirmed: true };
  check('configurar Clásico, 250 m, zona dinámica, 10 min', (await ana.conn.command({ type: 'configure', config })).ok);
  await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  for (const p of [beto, caro]) await p.conn.command({ type: 'set_team_pref', pref: 'runner' });
  for (const p of all) await p.conn.command({ type: 'set_ready', ready: true });
  check('empezar', (await ana.conn.command({ type: 'start' })).ok);
  respondWhenAsked(beto);
  respondWhenAsked(caro);
  await until(() => all.every((p) => p.snap?.phase === 'HEAD_START'), 'huida', 20_000);
  const roles = all.map((p) => p.snap.players.find((x) => x.id === p.id)?.team).join();
  check('roles: Ana cazadora, Beto y Caro fugitivos', roles === 'hunter,runner,runner', roles);
  console.log(`${ts()} … huida de 2 min en tiempo real`);
  await until(() => all.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución', 3 * MIN);
  const start = ana.snap.activeStart;
  check('empieza la persecución para todos a la vez', all.every((p) => p.snap.activeStart === start));
  await sleep(6_000); // lecturas recientes de todos tras el inicio

  // ---------------------------------------------------------------- capturas
  const far = await ana.conn.command({ type: 'claim_tag', runnerId: caro.id });
  check('captura a ~95 m: el servidor la rechaza', !far.ok && far.error === 'not_close_enough', far.error ?? 'aceptada (inesperado)');
  await sleep(3_500); // el servidor admite una reclamación cada 3 s por jugador (RATE.claimMinIntervalMs)
  const near = await ana.conn.command({ type: 'claim_tag', runnerId: beto.id });
  check('captura a 8 m: el servidor la valida y pide confirmación', near.ok, near.error ?? '');
  await until(() => ana.snap.players.find((x) => x.id === beto.id)?.status === 'captured', 'Beto capturado tras confirmar', 20_000);
  check('Beto confirma y queda capturado (lo ven los tres)', all.every((p) => p.snap.players.find((x) => x.id === beto.id)?.status === 'captured'));
  check('la captura queda registrada por el servidor', ana.snap.captures.some((c) => c.runnerId === beto.id && c.via === 'claim'));

  // ---------------------------------------------------------------- zona dinámica (fase 1 a los 5:00)
  console.log(`${ts()} … esperando la fase 1 de la zona (5:00 de persecución, tiempo real)`);
  await until(() => all.every((p) => p.events.some((e) => e.type === 'zone_phase')), 'fase 1 de la zona', 6 * MIN);
  const ev = all.map((p) => p.events.find((e) => e.type === 'zone_phase'));
  check('fase 1 a los 5:00 exactos de persecución, para los tres', ev.every((e) => e.at - start === 5 * MIN), ev.map((e) => `${(e.at - start) / 1000} s`).join(', '));
  check('aviso de fase con el destino (213 m)', ev.every((e) => e.data.radiusM === 213 && e.data.phase === 1), JSON.stringify(ev[0].data));
  await sleep(2_000);
  const plans = all.map((p) => JSON.stringify(p.snap.zonePlan));
  check('los tres reciben el mismo plan de zona (con el destino de la fase)', plans.every((x) => x === plans[0]) && ana.snap.zonePlan.length === 3);
  const now = ana.conn.serverNow();
  const circles = all.map((p) => zoneNow(p.snap, now));
  check('los tres calculan el mismo círculo a la misma hora', circles.every((c) => JSON.stringify(c) === JSON.stringify(circles[0])), `${circles[0].radiusM.toFixed(1)} m`);

  // ---------------------------------------------------------------- final: Ana va a por Caro andando
  console.log(`${ts()} … Ana camina hasta Caro (~95 m a 1,5 m/s)`);
  await walk(ana, offsetM(caro.pos, 4, 0));
  await sleep(4_000);
  const last = await ana.conn.command({ type: 'claim_tag', runnerId: caro.id });
  check('captura de Caro tras acercarse andando', last.ok, last.error ?? '');
  await until(() => all.every((p) => p.snap?.phase === 'FINISHED'), 'final', 30_000);
  check('la partida termina para todos: ganan los cazadores (todos capturados)', all.every((p) => p.snap.outcome?.winner === 'hunter' && p.snap.outcome?.cause === 'all_captured'), JSON.stringify(ana.snap.outcome));
  check('un único aviso de final por cliente', all.every((p) => p.events.filter((e) => e.type === 'game_finished').length === 1));
} catch (e) {
  check(`la partida se completa (${e.message})`, false);
} finally {
  clearInterval(gps);
  for (const p of all) p.conn.close();
  await sleep(500);
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones · partida completa contra ${base} · ${Math.round((Date.now() - T0) / 1000)} s`);
process.exit(failed ? 1 : 0);
