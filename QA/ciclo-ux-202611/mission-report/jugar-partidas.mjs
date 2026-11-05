// Mission Report · instantáneas FINISHED reales. Juega partidas cortas contra un servidor PROPIO (no el del
// puerto 8787 ni el del túnel) con clientes reales del protocolo (net.js), una sala por caso, y guarda la
// instantánea final que recibe cada jugador en instantaneas/<caso>.json. Comprueba además que, tras
// reconectar con la sesión guardada, la instantánea da el mismo informe (missionReport).
// Uso: PORT=8823 MAX_ROOMS_PER_IP=20 node server/main.ts   (en otra consola)
//      node QA/ciclo-ux-202611/mission-report/jugar-partidas.mjs [http://127.0.0.1:8823] [--rapido]
// Con --rapido solo se juegan los casos que terminan antes de los 10 min mínimos de persecución.
import { writeFileSync } from 'node:fs';
import { GameConnection } from '../../../mobile/www/js/net.js';
import { missionReport } from '../../../mobile/www/js/game-view.js';

const base = (process.argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:8823').replace(/\/$/, '');
const quick = process.argv.includes('--rapido');
const wsUrl = `${base.replace(/^http/, 'ws')}/ws`;
const CENTER = { lat: 40.4153, lng: -3.6845 }; // punto de referencia de las pruebas (no es la ubicación de nadie)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(100);
  }
  throw new Error(`tiempo agotado: ${what}`);
};
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const out = new URL('./instantaneas/', import.meta.url);
const all = [];

function player(name) {
  const storage = memory();
  const conn = new GameConnection({ url: wsUrl, storage });
  conn.start();
  const p = { name, conn, storage, get snap() { return this.conn.snapshot; }, get id() { return this.conn.playerId; } };
  all.push(p);
  return p;
}

/** Sala con `names`, modo y equipos pedidos; devuelve los jugadores ya en la persecución, con su rol. */
async function game(mode, names, prefs) {
  const ps = names.map(player);
  await until(() => ps.every((p) => p.conn.status === 'open'), 'conexiones');
  const { code } = await ps[0].conn.create(ps[0].name);
  for (const p of ps.slice(1)) await p.conn.join(code, p.name);
  await until(() => ps.every((p) => p.snap?.players.length === ps.length), 'todos en la sala');
  const config = { mode, durationMs: 10 * 60_000, headStartMs: 2 * 60_000, pingIntervalMs: 2 * 60_000, zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 250 }], dynamicZone: false, meetingPoint: CENTER, safetyChecklistConfirmed: true };
  const conf = await ps[0].conn.command({ type: 'configure', config });
  if (!conf.ok) throw new Error(`configure: ${conf.error}`);
  for (const [i, p] of ps.entries()) await p.conn.command({ type: 'set_team_pref', pref: prefs[i] });
  for (const p of ps) await p.conn.command({ type: 'set_ready', ready: true });
  const st = await ps[0].conn.command({ type: 'start' });
  if (!st.ok) throw new Error(`start ${mode}: ${st.error} ${st.detail ?? ''}`);
  await until(() => ps.every((p) => p.snap?.phase === 'ACTIVE'), 'persecución', 3 * 60_000);
  for (const p of ps) p.team = p.snap.players.find((x) => x.id === p.id)?.team;
  return ps;
}

async function save(caso, ps) {
  await until(() => ps.every((p) => p.snap?.phase === 'FINISHED'), `final de ${caso}`, 13 * 60_000);
  const nameOf = (id) => ps[0].snap.players.find((x) => x.id === id)?.name ?? 'Alguien';
  const reports = ps.map((p) => JSON.stringify(missionReport(p.snap, nameOf)));
  const same = reports.every((r) => r === reports[0]);
  // Reconexión del último jugador con su sesión guardada: misma instantánea → mismo informe.
  const last = ps.at(-1);
  last.conn.close();
  const again = new GameConnection({ url: wsUrl, storage: last.storage });
  all.push({ conn: again });
  again.start();
  await until(() => again.snapshot?.phase === 'FINISHED', 'instantánea tras reconectar');
  const sameAfter = JSON.stringify(missionReport(again.snapshot, nameOf)) === reports[0];
  const data = Object.fromEntries(ps.map((p) => [p.name, { myId: p.id, snap: p === last ? again.snapshot : p.snap }]));
  writeFileSync(new URL(`${caso}.json`, out), `${JSON.stringify(data, null, 1)}\n`);
  console.log(`${same && sameAfter ? '✔' : '✖'} ${caso}: ${ps[0].snap.outcome.cause} · ${ps[0].snap.captures.length} capturas · mismo informe para todos: ${same} · tras reconectar: ${sameAfter}`);
  return same && sameAfter;
}

const selfTag = (p, hunter) => p.conn.command({ type: 'self_tag', ...(hunter ? { hunterId: hunter.id } : {}) });
const role = (ps, team) => ps.filter((p) => p.team === team);

const cases = {
  // Clásico: todos capturados (dos por la misma cazadora, uno autodeclarado sin autor).
  async 'clasico-todos-capturados'() {
    const ps = await game('classic', ['Ana', 'Beto', 'Caro', 'Dani', 'Eva'], ['hunter', 'hunter', 'runner', 'runner', 'runner']);
    const [h1] = role(ps, 'hunter');
    const [r1, r2, r3] = role(ps, 'runner');
    await sleep(15_000);
    await selfTag(r1, h1);
    await sleep(20_000);
    await selfTag(r2);
    await sleep(15_000);
    await selfTag(r3, h1);
    return save('clasico-todos-capturados', ps);
  },
  // Clásico: el anfitrión termina la partida tras una captura.
  async 'clasico-anfitrion'() {
    const ps = await game('classic', ['Hugo', 'Inés', 'Juan'], ['hunter', 'runner', 'runner']);
    await sleep(20_000);
    await selfTag(role(ps, 'runner')[0], role(ps, 'hunter')[0]);
    await sleep(10_000);
    await ps[0].conn.command({ type: 'end_game' });
    return save('clasico-anfitrion', ps);
  },
  // Infección: todos infectados (el segundo nombra a un convertido aún en su espera: sin autor).
  async 'infeccion-todos'() {
    const ps = await game('infection', ['Lola', 'Mario', 'Nora', 'Óscar'], ['random', 'random', 'random', 'random']);
    const [h] = role(ps, 'hunter');
    const [r1, r2, r3] = role(ps, 'runner');
    await sleep(10_000);
    await selfTag(r1, h);
    await sleep(15_000);
    await selfTag(r2, h);
    await sleep(15_000);
    await selfTag(r3, r1);
    return save('infeccion-todos', ps);
  },
  // Caza del zorro: zorro atrapado.
  async 'zorro-atrapado'() {
    const ps = await game('fox_hunt', ['Pablo', 'Rosa', 'Sara'], ['hunter', 'hunter', 'runner']);
    await sleep(25_000);
    await selfTag(role(ps, 'runner')[0], role(ps, 'hunter')[1]);
    return save('zorro-atrapado', ps);
  },
  // Caza del zorro: el zorro abandona.
  async 'zorro-abandona'() {
    const ps = await game('fox_hunt', ['Tomás', 'Úrsula', 'Vera'], ['hunter', 'hunter', 'runner']);
    await sleep(12_000);
    await role(ps, 'runner')[0].conn.command({ type: 'leave' });
    return save('zorro-abandona', ps.filter((p) => p.team !== 'runner'));
  },
  // Clásico: se acaba el tiempo con un fugitivo libre (10 min de persecución).
  async 'clasico-tiempo'() {
    const ps = await game('classic', ['Walter', 'Ximena', 'Yago'], ['hunter', 'runner', 'runner']);
    await sleep(70_000);
    await selfTag(role(ps, 'runner')[0], role(ps, 'hunter')[0]);
    return save('clasico-tiempo', ps);
  },
  // Infección: se acaba el tiempo con supervivientes.
  async 'infeccion-tiempo'() {
    const ps = await game('infection', ['Zoe', 'Abel', 'Bea', 'Ciro'], ['random', 'random', 'random', 'random']);
    await sleep(40_000);
    await selfTag(role(ps, 'runner')[0], role(ps, 'hunter')[0]);
    return save('infeccion-tiempo', ps);
  },
};

const chosen = Object.entries(cases).filter(([k]) => !quick || !k.endsWith('-tiempo'));
let ok = 0;
try {
  const results = await Promise.allSettled(chosen.map(([, fn]) => fn()));
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled' && r.value) ok++;
    else if (r.status === 'rejected') console.log(`✖ ${chosen[i][0]}: ${r.reason.message}`);
  }
} finally {
  for (const p of all) p.conn.close();
  await sleep(300);
}
console.log(`\n${ok}/${chosen.length} casos contra ${base}`);
process.exit(ok === chosen.length ? 0 : 1);
