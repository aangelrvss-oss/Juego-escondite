// Zona dinámica en un navegador real (ciclo del 1/11/2026): Chrome (o Edge) por su protocolo de depuración,
// servidor real en 127.0.0.1 con el reloj controlado por la prueba. Caro organiza desde el navegador (elige
// el radio en el selector) y juega como fugitiva; Ana y Beto son clientes del juego en Node.
// Se lee el círculo que dibuja MapLibre (la fuente GeoJSON de la zona) y se compara con la zona que
// calcula el servidor a esa hora; se guardan capturas de cada momento.
// SIMULADO: el GPS del navegador (CDP), el reloj del servidor y la CARTOGRAFÍA (estilo local sin calles, como
// en map.e2e.mjs: aquí no se usa ninguna clave). No es un móvil. Cualquier otra petición a Internet se bloquea.
// Uso: node mobile/e2e/zona.e2e.mjs [carpeta-de-capturas]   ·   CHROME=<ruta> para elegir el navegador.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distanceM, offsetM } from '../../engine/src/geo.ts';
import { zoneInPlan } from '../../engine/src/zone.ts';
import { startServer } from '../../server/main.ts';
import { player, settle, waitFor } from '../../server/test/helpers.mjs';

const CENTER = { lat: 40.4153, lng: -3.6845 };
const STYLE_URL = 'https://estilo.prueba/style.json';
const STYLE = {
  version: 8,
  sources: { prueba: { type: 'geojson', attribution: '© Atribución de prueba', data: { type: 'FeatureCollection', features: [] } } },
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#15171b' } }, { id: 'prueba', type: 'line', source: 'prueba' }],
};
const MIN = 60_000;
const P = 5 * MIN;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  ✔' : '  ✖'} ${name}${detail ? ` · ${detail}` : ''}`);
};

// ------------------------------------------------------------------ Chrome por CDP (como map.e2e.mjs)

const browserPath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!browserPath) {
  console.log('No hay Chrome ni Edge: prueba omitida.');
  process.exit(0);
}
const profile = mkdtempSync(join(tmpdir(), 'outrun-zona-'));
const chrome = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let portFile = '';
await waitFor(() => existsSync(join(profile, 'DevToolsActivePort')) && (portFile = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8')).includes('\n'), 'Chrome arrancado', 20_000);
const [port, path] = portFile.trim().split('\n');
const cdp = new WebSocket(`ws://127.0.0.1:${port}${path}`);
await new Promise((ok, ko) => ((cdp.onopen = ok), (cdp.onerror = ko)));
let seq = 0;
const pending = new Map();
const handlers = [];
cdp.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, ko } = pending.get(msg.id);
    pending.delete(msg.id);
    return msg.error ? ko(new Error(msg.error.message)) : ok(msg.result);
  }
  for (const h of handlers) h(msg);
};
const send = (method, params = {}, sessionId) =>
  new Promise((ok, ko) => {
    const id = ++seq;
    pending.set(id, { ok, ko });
    cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const clock = { t: Date.UTC(2026, 10, 1, 17, 0, 0) };
const server = await startServer({ hub: { now: () => clock.t } }); // sirve mobile/www
const base = server.url;
const advance = async (ms) => {
  for (const end = clock.t + ms; clock.t < end; ) {
    clock.t = Math.min(end, clock.t + 20_000);
    server.pump();
    server.hub.keepAliveConnected();
  }
  await settle(60);
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const Pg = (method, params) => send(method, params, sessionId);
const exceptions = [];
const external = [];
// Solo para la prueba: MapLibre se sirve envuelto para poder leer qué círculo dibuja (la fuente GeoJSON).
const LIB = `${base}/vendor/maplibre-gl/maplibre-gl.js`;
const WRAPPER = `export * from './maplibre-gl.js?real';
import { Map as RealMap } from './maplibre-gl.js?real';
export class Map extends RealMap { constructor(...a) { super(...a); (globalThis.__outrunMaps ??= []).push(this); } }`;
handlers.push(async (msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = msg.params;
  const answer = (method, params) => Pg(method, { requestId, ...params }).catch(() => {});
  const fulfil = (body, type = 'application/json') => answer('Fetch.fulfillRequest', { responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(body).toString('base64') });
  // Nunca se usa la configuración local (puede llevar una clave real): estilo de prueba.
  if (request.url === `${base}/mapa.config.json`) return fulfil(JSON.stringify({ estiloUrl: STYLE_URL }));
  if (request.url === STYLE_URL) return fulfil(JSON.stringify(STYLE));
  if (request.url === LIB) return fulfil(WRAPPER, 'text/javascript');
  if (request.url.startsWith(base) || request.url.startsWith(base.replace('http', 'ws'))) return answer('Fetch.continueRequest');
  external.push(request.url.replace(/([?&]key=)[^&#]+/gi, '$1***'));
  return answer('Fetch.failRequest', { errorReason: 'BlockedByClient' });
});
await Pg('Runtime.enable');
await Pg('Page.enable');
await Pg('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
await Pg('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await Pg('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Browser.grantPermissions', { origin: base, permissions: ['geolocation'] });
const caroAt = async (north, east = 0) => {
  const p = offsetM(CENTER, north, east);
  await Pg('Emulation.setGeolocationOverride', { latitude: p.lat, longitude: p.lng, accuracy: 6 });
};
await caroAt(0);
const evaluate = async (expression) => {
  const r = await Pg('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });
const shot = async (label) => {
  if (!shots) return;
  const { data } = await Pg('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shots, `${label}.png`), Buffer.from(data, 'base64'));
};
const until = async (expression, what, timeoutMs = 10_000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await evaluate(expression)) return true;
    await settle(100);
  }
  throw new Error(`tiempo agotado: ${what}`);
};

/** Círculo que dibuja el mapa: centro (media del anillo) y radio (distancia media), y cuántas zonas hay. */
const drawnZone = () =>
  evaluate(`(() => {
    const m = (globalThis.__outrunMaps ?? []).at(-1);
    const src = m?.getSource('outrun-zone');
    if (!src) return null;
    const fs = src.serialize().data.features;
    if (fs.length !== 1) return { count: fs.length };
    const ring = fs[0].geometry.coordinates[0].slice(0, -1);
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    return { count: 1, lat, lng, ring, maps: document.querySelectorAll('#map-host canvas.maplibregl-canvas').length };
  })()`);
/** Zona que manda el servidor a la hora de la prueba. */
const serverZone = (code) => {
  const st = server.hub.roomStateByCode(code);
  return zoneInPlan(st.zonePlan, clock.t - st.activeStart);
};
/** Compara el círculo dibujado con el del servidor (la página puede ir unos segundos por delante). */
const compare = async (code, label, tolM) => {
  const d = await drawnZone();
  const z = serverZone(code);
  if (!d || d.count !== 1) return check(`${label}: una sola zona en el mapa`, false, JSON.stringify(d));
  const radii = d.ring.map(([lng, lat]) => distanceM({ lat: d.lat, lng: d.lng }, { lat, lng }));
  const r = radii.reduce((s, x) => s + x, 0) / radii.length;
  const dc = distanceM({ lat: d.lat, lng: d.lng }, z.center);
  check(`${label}: el mapa dibuja el círculo del servidor`, Math.abs(r - z.radiusM) <= tolM && dc <= tolM && d.maps === 1, `mapa ${r.toFixed(1)} m, servidor ${z.radiusM.toFixed(1)} m, centros a ${dc.toFixed(2)} m, ${d.maps} mapa(s)`);
  return { r, center: { lat: d.lat, lng: d.lng } };
};
const fitZone = async () => {
  await evaluate(`[...document.querySelectorAll('#map-host .map-btn')].find((b) => b.textContent === 'Ver zona')?.click()`);
  await settle(1_200);
};
const reload = async () => {
  await Pg('Page.reload');
  await until(`!!document.querySelector('.hud')`, 'partida tras recargar', 15_000);
  await evaluate(`document.querySelector('[data-act=dismiss-reveal]')?.click()`);
  await until(`!!document.querySelector('#map-host canvas.maplibregl-canvas') && document.querySelector('#map-host .map-status').hidden && !!globalThis.__outrunMaps?.at(-1)?.getSource('outrun-zone')`, 'mapa cargado', 20_000);
  await settle(600);
};
const zoneText = () => evaluate(`document.querySelector('.zone-line')?.textContent.replace(/\\s+/g, ' ').trim() ?? ''`);

let ana;
let beto;
try {
  // ---------------------------------------------------------------- Caro organiza desde el navegador
  await Pg('Page.navigate', { url: base });
  await until(`!!document.getElementById('f-name')`, 'pantalla de inicio');
  await evaluate(`(() => { document.getElementById('f-name').value = 'Caro'; const a = document.getElementById('f-adult'); if (a) { a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true })); } document.querySelector('[data-act=create]').click(); })()`);
  await until(`!!document.getElementById('c-radius')`, 'configuración de la sala');
  const options = await evaluate(`[...document.querySelectorAll('#c-radius option')].map((o) => o.textContent)`);
  check('el selector ofrece 50, 100, 250, 500 y 1.000 m', JSON.stringify(options) === JSON.stringify(['50 m', '100 m', '250 m', '500 m', '1.000 m']), options.join(' | '));
  const code = await evaluate(`JSON.parse(localStorage.getItem('outrun.session')).code`);
  const t = { wsUrl: `${base.replace('http', 'ws')}/ws` };
  ana = player(t, 'Ana');
  beto = player(t, 'Beto');
  await waitFor(() => ana.conn.status === 'open' && beto.conn.status === 'open', 'clientes conectados');
  await ana.conn.join(code, 'Ana');
  await beto.conn.join(code, 'Beto');
  await waitFor(() => ana.snap?.players.length === 3, 'los tres en la sala');
  await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  await beto.conn.command({ type: 'set_team_pref', pref: 'runner' });
  await evaluate(`document.querySelector('[data-act=center]').click()`);
  await until(`document.querySelector('[data-act=center]')?.textContent.includes('Volver')`, 'zona centrada');
  const pick = (id, value) => evaluate(`(() => { const s = document.getElementById('${id}'); s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await pick('c-radius', '100');
  await waitFor(() => ana.snap?.config?.zone[0].radiusM === 100, 'radio de 100 m en el servidor');
  await pick('c-duration', '20');
  await evaluate(`(() => { const c = document.getElementById('c-safety'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(() => ana.snap?.config?.safetyChecklistConfirmed === true && ana.snap.config.durationMs === 20 * MIN, 'configuración completa');
  check('el servidor y los demás jugadores reciben 100 m y la zona dinámica', ana.snap.config.zone[0].radiusM === 100 && beto.snap.config.zone[0].radiusM === 100 && ana.snap.config.dynamicZone === true);
  const selfId = await evaluate(`JSON.parse(localStorage.getItem('outrun.session')).playerId`);
  await evaluate(`(() => { const s = document.querySelector('[data-assign="${selfId}"]'); if (s) { s.value = 'runner'; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  await until(`document.querySelector('.rules')?.textContent.includes('Cada 5 min')`, 'reglas de la zona dinámica');
  check('las reglas de la sala explican la zona dinámica', await evaluate(`/se cierra poco a poco.*15 %.*50 m/.test(document.querySelector('.rules').textContent)`));
  await shot('z0-sala-100m');
  await evaluate(`document.querySelector('[data-act=ready]').click()`);
  await waitFor(() => ana.snap.players.find((p) => p.name === 'Caro')?.ready, 'Caro lista (con su GPS)', 15_000);
  for (const p of [ana, beto]) await p.conn.command({ type: 'set_ready', ready: true });
  await until(`!!document.querySelector('[data-act=start]:not([disabled])')`, 'botón Empezar');
  await evaluate(`document.querySelector('[data-act=start]').click()`);
  await waitFor(() => ana.snap?.phase === 'COUNTDOWN', 'cuenta atrás');
  await advance(5_000);
  await advance(2 * MIN);
  await waitFor(() => ana.snap?.phase === 'ACTIVE', 'persecución');
  ana.at(30, { east: 5 });
  beto.at(-20, { east: 10 });
  await reload();

  // ---------------------------------------------------------------- 1. primeros 5 min: la zona configurada
  await fitZone();
  await compare(code, 'inicio (100 m)', 1);
  const z0 = await zoneText();
  check('bajo el reloj: tamaño y cuánto falta para que empiece a cerrarse', /^Zona 100 m · empieza a cerrarse en \d:\d\d$/.test(z0), z0);
  await shot('z1-inicio-100m');

  // ---------------------------------------------------------------- 2. fase 1 (5–10 min): encoge y se desplaza
  await advance(P);
  await until(`[...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('La zona se cierra'))`, 'aviso de la fase 1', 10_000)
    .then(() => check('al empezar la fase 1, aviso «La zona se cierra»', true))
    .catch(() => check('al empezar la fase 1, aviso «La zona se cierra»', false));
  await advance(150_000);
  await reload();
  await fitZone();
  const mid1 = await compare(code, 'mitad de la fase 1', 1.5);
  const z1 = await zoneText();
  check('bajo el reloj: «se cierra hasta 85 m» y el tiempo que falta', /^Zona 9\d m · se cierra hasta 85 m \d:\d\d$/.test(z1), z1);
  await shot('z2-fase1-mitad');
  await advance(150_000);
  await reload();
  await fitZone();
  const end1 = await compare(code, 'final de la fase 1', 1.5);
  check('a los 10 min, 85 m; el centro se ha desplazado', end1 && Math.abs(end1.r - 85) < 1.5 && distanceM(end1.center, CENTER) > 1, end1 ? `${end1.r.toFixed(1)} m, centro a ${distanceM(end1.center, CENTER).toFixed(1)} m del inicial` : '');
  check('el desplazamiento es progresivo (a mitad de fase, a mitad de camino)', mid1 && end1 && Math.abs(distanceM(mid1.center, CENTER) - distanceM(end1.center, CENTER) / 2) < 1.5);
  await shot('z3-fase1-final-85m');

  // ---------------------------------------------------------------- 3. reconexión en la fase 2
  await advance(150_000);
  const caroId = ana.snap.players.find((p) => p.name === 'Caro').id;
  server.hub.connections.get(caroId)?.transport.close(1001, 'prueba: corte de red');
  await settle(1_500);
  await until(`document.querySelector('.hud') && document.querySelector('.net')?.textContent !== undefined`, 'la página sigue');
  await reload();
  await fitZone();
  await compare(code, 'fase 2 tras reconectar', 1.5);
  check('tras reconectar y recargar: un solo mapa y una sola zona', (await drawnZone())?.count === 1);
  await shot('z4-fase2-tras-reconectar');

  // ---------------------------------------------------------------- 4. al final (20 min): ya no cambia
  await advance(P + 149_000); // de 12:30 a 19:59
  await waitFor(() => ana.snap?.phase === 'ACTIVE', 'sigue la persecución');
  await reload();
  await fitZone();
  await compare(code, 'casi al final (19:59)', 1.5);
  await shot('z5-final-de-la-partida');
  await advance(2_000);
  await waitFor(() => ana.snap?.phase === 'FINISHED', 'final');

  // ---------------------------------------------------------------- 5. revancha con 50 m: zona fija
  await until(`!!document.querySelector('[data-act=rematch]')`, 'botón Revancha', 15_000);
  await evaluate(`document.querySelector('[data-act=rematch]').click()`);
  await waitFor(() => ana.snap?.phase === 'LOBBY', 'revancha');
  for (const p of [ana, beto]) await p.conn.command({ type: 'join_rematch' });
  await until(`!!document.getElementById('c-radius')`, 'configuración de la revancha');
  await pick('c-radius', '50');
  await waitFor(() => ana.snap?.config?.zone[0].radiusM === 50, 'radio de 50 m en el servidor');
  await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  await beto.conn.command({ type: 'set_team_pref', pref: 'runner' });
  await evaluate(`(() => { const s = document.querySelector('[data-assign="${selfId}"]'); if (s) { s.value = 'runner'; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  await until(`!!document.querySelector('[data-act=ready]')`, 'botón Estoy listo');
  await evaluate(`document.querySelector('[data-act=ready]').click()`);
  await waitFor(() => ana.snap.players.find((p) => p.name === 'Caro')?.ready, 'Caro lista', 15_000);
  for (const p of [ana, beto]) await p.conn.command({ type: 'set_ready', ready: true });
  await until(`!!document.querySelector('[data-act=start]:not([disabled])')`, 'botón Empezar');
  await evaluate(`document.querySelector('[data-act=start]').click()`);
  await waitFor(() => ana.snap?.phase === 'COUNTDOWN' && ana.snap.gameNo === 2, 'cuenta atrás de la revancha');
  await advance(5_000 + 2 * MIN);
  await waitFor(() => ana.snap?.phase === 'ACTIVE', 'persecución de la revancha');
  await reload();
  await fitZone();
  await compare(code, 'revancha con 50 m', 0.5);
  const z50 = await zoneText();
  check('50 m: la zona no cambia en toda la partida y se dice', z50 === 'Zona 50 m · ya no cambia', z50);
  await shot('z6-revancha-50m');
  await advance(12 * MIN);
  await reload();
  await fitZone();
  await compare(code, 'revancha con 50 m a los 12 min', 0.5);
  check('ningún aviso de fase con 50 m', ana.eventsOf('zone_phase').filter((e) => e.at > server.hub.roomStateByCode(code).activeStart).length === 0);
  await shot('z7-revancha-50m-12min');
  const layout = await evaluate(`(() => { const h = document.getElementById('map-host').getBoundingClientRect(); return { page: document.documentElement.scrollWidth, view: innerWidth, map: Math.round(h.width), mapH: Math.round(h.height) }; })()`);
  check('a 360×740 nada desborda con la línea de zona', layout.page <= layout.view && layout.mapH >= 260, JSON.stringify(layout));
} catch (e) {
  check(`la prueba se completa (${e.message})`, false);
  console.log(`  (página: ${await evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400)`).catch(() => '?')})`);
} finally {
  check('ninguna petición a Internet fuera de la cartografía simulada', external.length === 0, external.slice(0, 5).join(', '));
  check('sin errores de JavaScript en la página', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));
  for (const p of [ana, beto]) p?.conn.close();
  cdp.close();
  chrome.kill();
  await server.close();
  await settle(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones de la zona dinámica en Chrome (${browserPath.split(/[\\/]/).pop()})`);
assert.ok(results.length > 0);
process.exit(failed ? 1 : 0);
