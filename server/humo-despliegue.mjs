// Prueba de humo de un despliegue (local o público): página, /health, configuración del mapa y una partida
// corta con jugadores reales del protocolo (net.js), como varios móviles distintos. No toca ninguna sala ajena:
// crea la suya y la cierra al terminar.
// Uso: node server/humo-despliegue.mjs https://the-outrun.onrender.com
import assert from 'node:assert/strict';
import { offsetM } from '../engine/src/geo.ts';
import { GameConnection } from '../mobile/www/js/net.js';

const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const wsUrl = `${base.replace(/^http/, 'ws')}/ws`;
const CENTER = { lat: 40.4153, lng: -3.6845 }; // punto de referencia de las pruebas (no es la ubicación de nadie)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ✔' : '  ✖'} ${name}${detail ? ` · ${detail}` : ''}`);
};
const until = async (fn, what, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(100);
  }
  throw new Error(`tiempo agotado: ${what}`);
};
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const players = [];
const join = (name) => {
  const storage = memory();
  const conn = new GameConnection({ url: wsUrl, storage });
  const events = [];
  conn.on('event', (e) => events.push(e));
  conn.start();
  const p = { name, conn, storage, events, get snap() { return this.conn.snapshot; }, get id() { return this.conn.playerId; } };
  players.push(p);
  return p;
};

try {
  // ---------------------------------------------------------------- HTTP
  const t0 = Date.now();
  const health = await fetch(`${base}/health`).then((r) => r.json());
  check('/health responde', health.ok === true, `${Date.now() - t0} ms · ${JSON.stringify(health)}`);
  const page = await fetch(`${base}/`);
  const html = await page.text();
  check('la página principal carga', page.ok && html.includes('js/app.js'), `HTTP ${page.status}`);
  const app = await fetch(`${base}/js/app.js`).then((r) => r.text());
  check('sirve el cliente con zona dinámica y radios 50–1.000 m', app.includes('dynamicZone: true') && app.includes('[50, 100, 250, 500, 1000]'));
  for (const f of ['vendor/maplibre-gl/maplibre-gl.js', 'vendor/maplibre-gl/maplibre-gl-worker.js', 'vendor/capacitor-core.js']) {
    const r = await fetch(`${base}/${f}`);
    check(`sirve ${f}`, r.ok, `HTTP ${r.status}`);
  }
  const map = await fetch(`${base}/mapa.config.json`).then((r) => r.json());
  check('configuración del mapa presente', map.proveedor === 'maptiler' || map.proveedor === 'ninguno', `proveedor ${map.proveedor}${map.clave ? ` (clave de ${map.clave.length} caracteres)` : ''}`);

  // ---------------------------------------------------------------- partida
  const [ana, beto, caro] = ['Prueba A', 'Prueba B', 'Prueba C'].map(join);
  await until(() => players.every((p) => p.conn.status === 'open'), 'conexiones WebSocket');
  check('3 conexiones WebSocket abiertas', true, wsUrl.replace(/\/\/[^/]+/, '//…'));
  const { code } = await ana.conn.create(ana.name);
  for (const p of [beto, caro]) await p.conn.join(code, p.name);
  await until(() => players.every((p) => p.snap?.players.length === 3), 'los tres en la sala');
  check('crear sala y unirse desde 3 clientes distintos', true, `código de ${code.length} caracteres`);
  const config = {
    mode: 'classic', durationMs: 10 * 60_000, headStartMs: 2 * 60_000, pingIntervalMs: 2 * 60_000,
    zone: [{ fromOffsetMs: 0, center: CENTER, radiusM: 250 }], dynamicZone: true, meetingPoint: CENTER, safetyChecklistConfirmed: true,
  };
  const conf = await ana.conn.command({ type: 'configure', config });
  await until(() => caro.snap?.config?.zone?.[0]?.radiusM === 250, 'configuración en todos');
  check('el servidor acepta 250 m con zona dinámica y todos la reciben', conf.ok && caro.snap.config.dynamicZone === true);
  check('el servidor rechaza un radio fuera de rango (30 m)', (await ana.conn.command({ type: 'configure', config: { ...config, zone: [{ ...config.zone[0], radiusM: 30 }] } })).error === 'invalid_config');
  await ana.conn.command({ type: 'configure', config });
  await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  for (const p of [beto, caro]) await p.conn.command({ type: 'set_team_pref', pref: 'runner' });
  for (const p of players) assert.equal((await p.conn.command({ type: 'set_ready', ready: true })).ok, true);
  const started = await ana.conn.command({ type: 'start' });
  check('empieza la partida', started.ok, started.error ?? '');
  await until(() => players.every((p) => p.snap?.phase === 'COUNTDOWN'), 'cuenta atrás');
  check('todos ven la cuenta atrás y el plan de zona', players.every((p) => p.snap.zonePlan?.length === 2));
  await until(() => players.every((p) => p.snap?.phase === 'HEAD_START'), 'huida', 15_000);
  const roles = players.map((p) => p.snap.players.find((x) => x.id === p.id)?.team);
  check('cada uno ve su rol (1 cazadora, 2 fugitivos)', roles.join() === 'hunter,runner,runner', roles.join());
  check('la cazadora no ve el equipo de los fugitivos', ana.snap.players.filter((x) => x.id !== ana.id).every((x) => x.team === null));
  // Sincronización: los fugitivos son compañeros y se ven entre sí.
  const at = (p, north, east) => {
    const q = offsetM(CENTER, north, east);
    return p.conn.sendLocation({ lat: q.lat, lng: q.lng, accuracyM: 8, ageMs: 0 });
  };
  const seen = [];
  caro.conn.on('positions', (m) => seen.push(m));
  for (let i = 0; i < 3; i++) {
    at(ana, 0, 0);
    at(beto, 40 + i, 20);
    at(caro, -30, 10 + i);
    await sleep(2_000);
  }
  await until(() => seen.some((m) => (m.positions ?? []).some((x) => x.playerId === beto.id && x.lat !== null)), 'posiciones del compañero', 15_000);
  check('sincronización: un fugitivo recibe la posición de su compañero', true);
  check('privacidad: el fugitivo no recibe la posición de la cazadora', !seen.some((m) => (m.positions ?? []).some((x) => x.playerId === ana.id)));
  // Desconexión y reconexión con la misma sesión.
  beto.conn.close();
  await sleep(1_500);
  const beto2 = new GameConnection({ url: wsUrl, storage: beto.storage });
  beto2.start();
  await until(() => beto2.status === 'open' && beto2.snapshot?.phase === 'HEAD_START', 'reconexión de B');
  check('desconexión y reconexión: vuelve con la misma identidad y rol', beto2.playerId === beto.id && beto2.snapshot.players.find((x) => x.id === beto.id)?.team === 'runner');
  beto.conn = beto2;
  // Cierre: la anfitriona termina la partida (sin ganador) y todos lo reciben.
  const end = await ana.conn.command({ type: 'end_game' });
  await until(() => players.every((p) => p.snap?.phase === 'FINISHED'), 'final');
  check('terminar la partida: todos ven el final', end.ok);
} catch (e) {
  check(`la prueba se completa (${e.message})`, false);
} finally {
  for (const p of players) p.conn.close();
  await sleep(300);
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones contra ${base}`);
process.exit(failed ? 1 : 0);
