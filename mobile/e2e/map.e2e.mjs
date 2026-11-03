// Mapa real en un navegador real: Chrome (o Edge) instalado en el equipo, manejado por su protocolo de
// depuración (CDP) sin dependencias. Una partida de verdad contra el servidor real (en memoria, en
// 127.0.0.1 y un puerto libre) con Ana y Beto como clientes del juego en Node y Caro en el navegador,
// en una pantalla de 360×740.
// SIMULADO: el GPS del navegador (fijado por CDP), el reloj del servidor y la CARTOGRAFÍA: el navegador
// recibe un estilo local sin calles (solo fondo) en lugar del proveedor, porque aquí no hay clave. Se
// comprueba el ciclo de vida del mapa, no que MapTiler devuelva calles. Cualquier otra petición a
// Internet se bloquea y se cuenta como fallo.
// Uso (con `npm run vendor` hecho): node e2e/map.e2e.mjs [carpeta-de-capturas]   ·   CHROME=<ruta> para elegir el navegador.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../../server/main.ts';
import { gameConfig, player, settle, waitFor } from '../../server/test/helpers.mjs';

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor
const STYLE_URL = 'https://estilo.prueba/style.json';
// Una fuente con atribución, como las del proveedor, para comprobar que se ve sin plegar.
const STYLE = {
  version: 8,
  sources: { prueba: { type: 'geojson', attribution: '© Atribución de prueba', data: { type: 'FeatureCollection', features: [] } } },
  layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#15171b' } }, { id: 'prueba', type: 'line', source: 'prueba' }],
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  ✔' : '  ✖'} ${name}${ok || !detail ? '' : ` → ${detail}`}`);
};

// ------------------------------------------------------------------ Chrome por CDP

const browserPath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!browserPath) {
  console.log('No hay Chrome ni Edge: prueba omitida.');
  process.exit(0);
}
const profile = mkdtempSync(join(tmpdir(), 'outrun-mapa-'));
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

const clock = { t: Date.UTC(2026, 9, 26, 17, 0, 0) };
const diag = []; // registro de diagnóstico del servidor (DIAG_FILE en memoria): se muestra si algo falla
const server = await startServer({ hub: { now: () => clock.t, diag: (r) => diag.push(r) } }); // sirve mobile/www
const base = server.url;
const advance = async (ms) => {
  // Como en la realidad (ping cada 10 s), quien tiene la página abierta da señales de vida durante el
  // salto: el periodo de gracia (D-057) solo afecta a quien está desconectado de verdad.
  for (const end = clock.t + ms; clock.t < end; ) {
    clock.t = Math.min(end, clock.t + 20_000);
    server.pump();
    server.hub.keepAliveConnected();
  }
  await settle(60);
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const P = (method, params) => send(method, params, sessionId);
const exceptions = [];
const consoleErrors = [];
const external = [];
let mapConfigured = false;
let styleStatus = 200; // 403 = el proveedor rechaza la clave
handlers.push(async (msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = msg.params;
  // Una petición que el navegador ya canceló (p. ej., la página cambió) no admite respuesta: se ignora.
  const answer = (method, params) => P(method, { requestId, ...params }).catch(() => {});
  const fulfil = (body, type = 'application/json') => answer('Fetch.fulfillRequest', { responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(body).toString('base64') });
  // Nunca se usa la configuración local (puede llevar una clave real): sin configurar o con el estilo de prueba.
  if (request.url === `${base}/mapa.config.json`) return fulfil(JSON.stringify(mapConfigured ? { estiloUrl: STYLE_URL } : { proveedor: 'ninguno' }));
  if (request.url === STYLE_URL && styleStatus !== 200) return answer('Fetch.fulfillRequest', { responseCode: styleStatus, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }], body: '' });
  if (request.url === STYLE_URL) return fulfil(JSON.stringify(STYLE));
  if (request.url.startsWith(base) || request.url.startsWith(base.replace('http', 'ws'))) return answer('Fetch.continueRequest');
  external.push(request.url.replace(/([?&]key=)[^&#]+/gi, '$1***')); // una clave nunca se imprime
  return answer('Fetch.failRequest', { errorReason: 'BlockedByClient' });
});
await P('Runtime.enable');
await P('Page.enable');
await P('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
await P('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await P('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Browser.grantPermissions', { origin: base, permissions: ['geolocation'] });
const caroAt = async (north, east = 0) => {
  const p = offsetM(CENTER, north, east);
  await P('Emulation.setGeolocationOverride', { latitude: p.lat, longitude: p.lng, accuracy: 6 });
};
await caroAt(0);
const evaluate = async (expression) => {
  const r = await P('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });
const shot = async (label) => {
  if (!shots) return;
  const { data } = await P('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(shots, `${label}.png`), Buffer.from(data, 'base64'));
};
const until = async (expression, what, timeoutMs = 8_000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await evaluate(expression)) return true;
    await settle(100);
  }
  throw new Error(`tiempo agotado: ${what}`);
};

let ana;
let beto;
try {
  // ---------------------------------------------------------------- sala con Ana y Beto (Node) y Caro (Chrome)
  const t = { wsUrl: `${base.replace('http', 'ws')}/ws` };
  ana = player(t, 'Ana');
  beto = player(t, 'Beto');
  await waitFor(() => ana.conn.status === 'open' && beto.conn.status === 'open', 'clientes conectados');
  const { code } = await ana.conn.create('Ana');
  await beto.conn.join(code, 'Beto');
  await P('Page.navigate', { url: `${base}/?sala=${code}` });
  await until(`!!document.getElementById('f-name')`, 'pantalla de inicio');
  check('el mapa no existe fuera de la partida', await evaluate(`document.getElementById('map-host').hidden && !document.querySelector('#map-host canvas')`));
  await evaluate(`(() => { document.getElementById('f-name').value = 'Caro'; const a = document.getElementById('f-adult'); if (a) { a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true })); } document.querySelector('[data-act=join]').click(); })()`);
  await waitFor(() => ana.snap?.players.length === 3, 'Caro en la sala');
  const caroId = ana.snap.players.find((p) => p.name === 'Caro').id;
  await ana.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  await beto.conn.command({ type: 'set_team_pref', pref: 'runner' });
  await ana.conn.command({ type: 'assign_team', targetId: caroId, pref: 'runner' });
  assert.equal((await ana.conn.command({ type: 'configure', config: gameConfig() })).ok, true);
  await until(`!!document.querySelector('[data-act=ready]')`, 'botón «Estoy listo»');
  await evaluate(`document.querySelector('[data-act=ready]').click()`);
  await waitFor(() => ana.snap.players.find((p) => p.id === caroId)?.ready, 'Caro lista (con su GPS)', 10_000);
  for (const p of [ana, beto]) await p.conn.command({ type: 'set_ready', ready: true });
  assert.equal((await ana.conn.command({ type: 'start' })).ok, true);
  await advance(5_000); // huida
  await until(`document.querySelector('.hud') !== null`, 'pantalla de partida');
  await evaluate(`document.querySelector('[data-act=dismiss-reveal]')?.click()`);
  ana.at(0, { east: 2 });
  beto.at(60, { east: 30 });
  await settle(100);
  await advance(5_000); // envío de posiciones

  // ---------------------------------------------------------------- 1. sin configuración: radar de reserva
  await until(`!!document.querySelector('#map-host .map-fallback .radar')`, 'radar de reserva');
  await shot('1-radar-de-reserva');
  check('sin mapa.config.json, la partida muestra el radar y explica por qué', await evaluate(`document.querySelector('#map-host .map-note').textContent.includes('sin configurar')`));

  // ---------------------------------------------------------------- 2. con configuración: mapa real
  mapConfigured = true;
  // ---------------------------------------------------------------- 1b. clave rechazada (403): radar y motivo
  styleStatus = 403;
  await evaluate(`document.querySelector('[data-act=retry-map]').click()`);
  await until(`document.querySelector('#map-host .map-note')?.textContent.includes('rechazado la clave')`, 'clave rechazada', 20_000);
  check('con la clave rechazada (403) vuelve el radar con el motivo y la partida sigue', await evaluate(`!!document.querySelector('#map-host .radar') && !!document.querySelector('.hud')`));
  await shot('1b-clave-rechazada');
  styleStatus = 200;
  await evaluate(`document.querySelector('[data-act=retry-map]').click()`);
  await until(`!!document.querySelector('#map-host canvas.maplibregl-canvas') && document.querySelector('#map-host .map-status').hidden`, 'mapa cargado', 20_000);
  check('«Reintentar el mapa» carga MapLibre con WebGL en el navegador', true);
  await until(`[...document.querySelectorAll('#map-host .mk-label')].some((l) => l.textContent.startsWith('Beto'))`, 'marcador de Beto');
  const labels = await evaluate(`[...document.querySelectorAll('#map-host .mk-label')].map((l) => l.textContent)`);
  check('se ve al compañero (Beto) y el punto de encuentro (marcador sin etiqueta, explicado en la leyenda)', labels.some((l) => l.startsWith('Beto')) && (await evaluate(`!!document.querySelector('#map-host .mk-meeting') && document.querySelector('.legend')?.textContent.includes('Encuentro')`)), labels.join(' | '));
  check('la cazadora (Ana) no aparece en el mapa de un fugitivo', !(await evaluate(`document.getElementById('map-host').textContent.includes('Ana')`)), labels.join(' | '));
  await shot('2-mapa-cargado');
  check('marcador propio con su círculo de precisión', await evaluate(`!!document.querySelector('#map-host .mk-me')`));
  await until(`document.querySelector('#map-host .maplibregl-ctrl-attrib')?.textContent.includes('Atribución de prueba')`, 'atribución', 10_000);
  const attrib = await evaluate(`(() => {
    const a = document.querySelector('#map-host .maplibregl-ctrl-attrib');
    const inner = a.querySelector('.maplibregl-ctrl-attrib-inner').getBoundingClientRect();
    const tools = document.querySelector('#map-host .map-tools').getBoundingClientRect();
    const overlap = !(inner.right <= tools.left || inner.left >= tools.right || inner.bottom <= tools.top || inner.top >= tools.bottom);
    return { compact: a.classList.contains('maplibregl-compact'), visible: inner.width > 0 && inner.height > 0, overlap };
  })()`);
  check('la atribución del proveedor se ve sin plegar y sin tapar los botones', !attrib.compact && attrib.visible && !attrib.overlap, JSON.stringify(attrib));
  check('«Mi posición» activo con una lectura válida', await evaluate(`!document.querySelector('#map-host .map-btn').disabled`));

  // ---------------------------------------------------------------- 3. el mapa no se reinicia y conserva el zoom
  await evaluate(`document.querySelector('#map-host canvas').dataset.probe = 'mismo'; document.querySelector('#map-host .mk-me').closest('.mk-wrap').dataset.probe = 'mismo'`);
  const gap = `(() => { const a = document.querySelector('#map-host .mk-me').getBoundingClientRect(); const b = document.querySelector('#map-host .mk-meeting').getBoundingClientRect(); return Math.hypot(a.x + a.width / 2 - b.x - b.width / 2, a.y + a.height / 2 - b.y - b.height / 2); })()`; // entre centros: los marcadores miden distinto
  await caroAt(25, 25);
  await settle(1_500);
  // Que el marcador propio haya llegado a su nueva posición antes de medir (si no, se mezclan movimiento y zoom).
  let before = await evaluate(gap);
  for (let i = 0; i < 12; i++) {
    await settle(500);
    const again = await evaluate(gap);
    if (Math.abs(again - before) < 0.05) break;
    before = again;
  }
  const box = await evaluate(`(() => { const r = document.getElementById('map-host').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await P('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -600 });
  await settle(1_500);
  const zoomed = await evaluate(gap);
  await settle(2_500);
  const later = await evaluate(gap);
  const under = await evaluate(`(() => { const e = document.elementFromPoint(${box.x}, ${box.y}); return (e ? e.tagName + '.' + e.className : 'nada') + ' · scrollY ' + scrollY + ' · alto ' + document.documentElement.scrollHeight; })()`);
  // Cuánto acerca un golpe de rueda depende del navegador y de la geometría de la página (en Chrome para
  // Windows el desplazamiento de la rueda es proporcional al tamaño del área); aquí basta con que acerque.
  check('la rueda (o el gesto) acerca el mapa', zoomed > before * 1.15, `${before.toFixed(1)} → ${zoomed.toFixed(1)} px (2,5 s después: ${later.toFixed(1)}) · bajo el punto: ${under}`);
  // Gestos táctiles reales (eventos touch del navegador): arrastrar con un dedo y pellizcar con dos.
  const meetingX = `document.querySelector('#map-host .mk-meeting').getBoundingClientRect().x`;
  const touch = (type, points) => P('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const x0 = await evaluate(meetingX);
  await touch('touchStart', [[box.x, box.y]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[box.x - 10 * i, box.y]]);
  await touch('touchEnd', []);
  await settle(800);
  const x1 = await evaluate(meetingX);
  check('arrastrar con un dedo desplaza el mapa', x0 - x1 > 50, `${x0.toFixed(0)} → ${x1.toFixed(0)} px`);
  const pinchBefore = await evaluate(gap);
  await touch('touchStart', [[box.x - 30, box.y], [box.x + 30, box.y]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[box.x - 30 - 8 * i, box.y], [box.x + 30 + 8 * i, box.y]]);
  await touch('touchEnd', []);
  await settle(1_000);
  const pinchAfter = await evaluate(gap);
  check('pellizcar con dos dedos acerca el mapa', pinchAfter > pinchBefore * 1.4, `${pinchBefore.toFixed(1)} → ${pinchAfter.toFixed(1)} px`);
  const zoomedTouch = pinchAfter;
  const betoBefore = await evaluate(`[...document.querySelectorAll('#map-host .mk-label')].find((l) => l.textContent.startsWith('Beto')).closest('.mk-wrap').style.transform`);
  for (let i = 1; i <= 4; i++) {
    beto.at(60 + 15 * i, { east: 30 });
    ana.at(i, { east: 2 });
    await settle(100);
    await advance(5_000);
  }
  await settle(1_200); // varios redibujados completos de la interfaz (cada 250 ms)
  const after = await evaluate(gap);
  const reference = zoomedTouch;
  await shot('3-mapa-con-zoom-tras-actualizaciones');
  check('tras los gestos, 4 envíos de posiciones y muchos redibujados, el zoom se conserva', Math.abs(after - reference) / reference < 0.03, `${reference.toFixed(1)} → ${after.toFixed(1)} px`);
  check('el mapa es el mismo (no se ha recreado)', await evaluate(`document.querySelector('#map-host canvas')?.dataset.probe === 'mismo' && document.querySelectorAll('#map-host canvas.maplibregl-canvas').length === 1`));
  check('el marcador propio es el mismo elemento', await evaluate(`document.querySelector('#map-host .mk-me').closest('.mk-wrap').dataset.probe === 'mismo'`));
  const betoAfter = await evaluate(`[...document.querySelectorAll('#map-host .mk-label')].find((l) => l.textContent.startsWith('Beto')).closest('.mk-wrap').style.transform`);
  check('el marcador de Beto se ha movido con sus nuevas posiciones', betoBefore !== betoAfter, `${betoBefore} → ${betoAfter}`);

  // ---------------------------------------------------------------- 4. pantalla pequeña
  const layout = await evaluate(`(() => { const h = document.getElementById('map-host').getBoundingClientRect(); return { page: document.documentElement.scrollWidth, view: innerWidth, map: h.width, mapH: h.height }; })()`);
  check('a 360×740 nada desborda en horizontal y el mapa cabe', layout.page <= layout.view && layout.map <= layout.view && layout.mapH >= 260, JSON.stringify(layout));
  const smallButtons = await evaluate(`[...document.querySelectorAll('#map-host button')].filter((b) => b.getBoundingClientRect().height < 44).length`);
  check('los botones del mapa miden al menos 44 px', smallButtons === 0, `${smallButtons} pequeños`);

  // ---------------------------------------------------------------- 5. pérdida de conexión
  await P('Network.enable');
  await P('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  server.hub.connections.get(caroId)?.transport.close(1001, 'prueba: corte de red');
  await until(`document.getElementById('map-host').classList.contains('is-offline')`, 'mapa sin conexión', 10_000);
  await shot('4-sin-conexion');
  check('sin conexión: el mapa lo indica y congela las posiciones', await evaluate(`!document.querySelector('#map-host .map-badge').hidden && document.querySelector('#map-host .map-badge').textContent.includes('Sin conexión')`));
  check('sin conexión: el mapa sigue siendo el mismo', await evaluate(`document.querySelector('#map-host canvas')?.dataset.probe === 'mismo'`));
  await P('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until(`!document.getElementById('map-host').classList.contains('is-offline')`, 'reconexión', 15_000);
  check('al reconectar desaparece el aviso y el mapa sigue', await evaluate(`document.querySelector('#map-host canvas')?.dataset.probe === 'mismo'`));

  // ---------------------------------------------------------------- 6. fases y captura siguen funcionando
  await advance(2 * 60_000); // persecución
  await caroAt(0);
  await until(`document.querySelector('.hud .label')?.textContent.length > 0 && document.querySelector('[data-act=selftag]') !== null`, 'persecución en el navegador');
  // Al empezar la persecución llega un aviso («¡Empieza la persecución!»): no debe tapar reloj ni rol.
  await until(`!!document.querySelector('.toast')`, 'aviso del inicio de la persecución', 5_000).catch(() => {});
  const toastOverlap = await evaluate(`(() => {
    const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const crit = [...document.querySelectorAll('.hud, .role-chip, .timer')].map((e) => e.getBoundingClientRect());
    const toasts = [...document.querySelectorAll('.toast')].map((e) => e.getBoundingClientRect());
    return { toasts: toasts.length, overlap: toasts.some((t) => crit.some((c) => hit(t, c))) };
  })()`);
  check('los avisos no tapan el reloj ni el rol', toastOverlap.toasts > 0 && !toastOverlap.overlap, JSON.stringify(toastOverlap));
  await evaluate(`scrollTo(0, 0)`);
  await settle(300);
  const dock = await evaluate(`(() => { const r = document.querySelector('[data-act=selftag]').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; })()`);
  check('la acción del rol se ve sin desplazarse (fija abajo) en 360×740', dock.top >= 0 && dock.bottom <= dock.vh, JSON.stringify(dock));
  const covered = await evaluate(`[...document.querySelectorAll('#map-host .map-btn, #map-host .maplibregl-ctrl-attrib-inner')].filter((b) => { const r = b.getBoundingClientRect(); if (r.bottom > innerHeight) return false; const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !b.contains(el); }).map((b) => b.textContent.trim())`);
  check('la acción fija no tapa los botones del mapa ni la atribución', covered.length === 0, covered.join(' | '));
  await shot('5a-persecucion-accion-fija-abajo');
  // La lectura del navegador tiene que haber llegado DESPUÉS del salto de 2 min del reloj simulado: si
  // no, el servidor la ve antigua (target_location_stale), como haría con un móvil sin GPS reciente.
  const caroFresh = () => {
    const last = server.hub.roomStateByCode(code)?.players[caroId]?.samples.at(-1);
    return last && clock.t - last.effectiveAt < 5_000;
  };
  // Sin lectura nueva del navegador, location.js pide una a los 8–10 s y app.js la envía en ≤ 5 s:
  // hasta ~15 s en el peor caso (en 1 de 10 ejecuciones con 12 s de margen no llegó a tiempo).
  await waitFor(caroFresh, 'lectura reciente de Caro en el servidor', 25_000);
  ana.at(0);
  await settle(200);
  const claim = await ana.conn.command({ type: 'claim_tag', runnerId: caroId });
  check('la cazadora puede reclamar con el GPS del navegador', claim.ok, JSON.stringify(claim));
  if (claim.ok) {
    await until(`!!document.querySelector('[data-respond=yes]')`, 'reclamación en el navegador');
    await shot('5-reclamacion-recibida-por-el-fugitivo');
    await evaluate(`document.querySelector('[data-respond=yes]').click()`);
    await waitFor(() => ana.snap.players.find((p) => p.id === caroId)?.status === 'captured', 'captura confirmada');
    await until(`document.querySelector('.callout')?.textContent.includes('capturado')`, 'Caro espectadora');
    check('la captura se confirma desde el navegador y el mapa sigue (sin recrearse)', await evaluate(`document.querySelector('#map-host canvas')?.dataset.probe === 'mismo'`));
  }

  // ---------------------------------------------------------------- 7. al terminar, el mapa se libera
  assert.equal((await ana.conn.command({ type: 'end_game' })).ok, true);
  await until(`!!document.querySelector('[aria-label="Mission Report"]')`, 'Mission Report');
  check('al terminar la partida el mapa se destruye y se oculta', await evaluate(`document.getElementById('map-host').hidden && !document.querySelector('#map-host canvas') && !document.querySelector('.maplibregl-marker')`));
} catch (e) {
  check(`la partida se completa (${e.message})`, false);
  const t0 = diag[0]?.at ?? 0;
  for (const r of diag.filter((r) => ['gps', 'ws_close', 'session', 'phase', 'error_sent'].includes(r.k)).slice(-14)) {
    const { k, at, room, game, ...rest } = r;
    console.log(`  (diag +${Math.round((at - t0) / 1000)} s ${k} ${JSON.stringify(rest)})`);
  }
  // ¿El navegador entrega una posición si se le pide directamente? Distingue «el navegador no da GPS»
  // (entorno) de «la interfaz no la está pidiendo o no la usa» (cliente).
  console.log(`  (navegador: ${await evaluate(`new Promise((ok) => navigator.geolocation.getCurrentPosition((p) => ok('entrega posición, antigüedad ' + Math.round((Date.now() - p.timestamp) / 1000) + ' s'), (e) => ok('error ' + e.code + ' ' + e.message), { maximumAge: 0, timeout: 8000 }))`).catch((e) => e.message)})`);
  console.log(`  (página: ${await evaluate(`JSON.stringify({ net: document.querySelector('.net')?.textContent, gps: document.querySelector('.gps')?.textContent, sharing: document.querySelector('.sharing')?.textContent })`).catch(() => '?')})`);
  console.log(`  (mapa: ${await evaluate(`document.getElementById('map-host').innerText.replace(/\s+/g, ' ').slice(0, 300)`).catch(() => '?')})`);
} finally {
  check('ninguna petición a Internet fuera de la cartografía simulada', external.length === 0, external.slice(0, 5).join(', '));
  check('sin errores de JavaScript en la página', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));
  if (consoleErrors.length) console.log(`  (consola: ${consoleErrors.slice(0, 3).join(' | ')})`);
  for (const p of [ana, beto]) p?.conn.close();
  cdp.close();
  chrome.kill();
  await server.close();
  await settle(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones del mapa en Chrome (${browserPath.split(/[\\/]/).pop()})`);
process.exit(failed ? 1 : 0);
