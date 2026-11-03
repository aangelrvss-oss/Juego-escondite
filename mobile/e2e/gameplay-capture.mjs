// Grabación de una partida simulada vista por una jugadora (Ana, anfitriona y cazadora) para auditar la
// experiencia visual. NO es una prueba de producto ni una demo promocional.
//
// Qué es real: la interfaz (mobile/www) en Chromium a 360×740, el servidor del juego (en memoria, en
// 127.0.0.1 y un puerto libre), el motor, el protocolo y las reglas de visibilidad. Los otros tres
// jugadores (Bruno, Carla y Diego) son clientes del juego en Node que usan el mismo protocolo que un móvil:
// la página de Ana solo ve lo que el servidor le envía.
// Qué es SIMULADO: el GPS (coordenadas sintéticas alrededor del punto de referencia de las pruebas, no la
// ubicación de nadie), el paso del tiempo del servidor (acelerado en la huida y hasta la primera pista) y la
// CARTOGRAFÍA: un estilo de prueba con calles y manzanas sintéticas, sin nombres, que no corresponden a
// ningún lugar real. Un rótulo en pantalla lo indica durante toda la grabación.
//
// Uso (en mobile/, con `npm install` y `npm run vendor` hechos):
//   node e2e/gameplay-capture.mjs <carpeta-de-salida>
// Deja: gameplay-auditoria.webm, gameplay-resumen.webm, hitos.json, HITOS.md y capturas/*.png.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../../server/main.ts';
import { player as botPlayer, waitFor } from '../../server/test/helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'gameplay-salida');
const shotsDir = join(out, 'capturas');
mkdirSync(shotsDir, { recursive: true });

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor (no es la ubicación de nadie)
const STYLE_URL = 'https://mapa-de-prueba.invalid/style.json';
const LABEL = 'SIMULACIÓN · mapa de prueba con calles sintéticas · no es cartografía real';

// ------------------------------------------------------------------ cartografía sintética
const ll = ([north, east]) => {
  const p = offsetM(CENTER, north, east);
  return [p.lng, p.lat];
};
const STEP = 90; // una calle cada 90 m
const lines = [];
for (let k = -5; k <= 5; k++) {
  lines.push([ll([k * STEP, -480]), ll([k * STEP, 480])]); // calles este-oeste
  lines.push([ll([-480, k * STEP]), ll([480, k * STEP])]); // calles norte-sur
}
const avenue = [ll([-450, -450]), ll([450, 450])]; // una avenida en diagonal
const blocks = [];
for (let i = -5; i < 5; i++) {
  for (let j = -5; j < 5; j++) {
    const [n0, e0] = [i * STEP + 11, j * STEP + 11];
    const [n1, e1] = [(i + 1) * STEP - 11, (j + 1) * STEP - 11];
    blocks.push({ type: 'Feature', properties: { park: i === 1 && j === -2 }, geometry: { type: 'Polygon', coordinates: [[ll([n0, e0]), ll([n0, e1]), ll([n1, e1]), ll([n1, e0]), ll([n0, e0])]] } });
  }
}
const STYLE = {
  version: 8,
  sources: {
    blocks: { type: 'geojson', data: { type: 'FeatureCollection', features: blocks } },
    streets: { type: 'geojson', data: { type: 'FeatureCollection', features: lines.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) } },
    avenue: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: avenue } } },
  },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#0e1013' } },
    { id: 'manzanas', type: 'fill', source: 'blocks', filter: ['!', ['get', 'park']], paint: { 'fill-color': '#1a1d22' } },
    { id: 'parque', type: 'fill', source: 'blocks', filter: ['get', 'park'], paint: { 'fill-color': '#14231a' } },
    { id: 'calles', type: 'line', source: 'streets', paint: { 'line-color': '#2f343c', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 14] } },
    { id: 'avenida', type: 'line', source: 'avenue', paint: { 'line-color': '#3a4049', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 24] } },
  ],
};

// ------------------------------------------------------------------ servidor y reloj
const clock = { t: Date.UTC(2026, 9, 28, 17, 0, 0), speed: 1 };
const server = await startServer({ hub: { now: () => clock.t } });
const base = server.url;
const ticker = setInterval(() => {
  clock.t += 200 * clock.speed;
  server.pump();
  // Con el reloj acelerado, el ping de cada 10 s de la página llegaría tarde: las páginas abiertas
  // cuentan como vivas (periodo de gracia, D-057).
  server.hub.keepAliveConnected();
}, 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ jugadores y movimiento (metros, tiempo del servidor)
const pos = { Ana: [0, 3], Bruno: [-4, -2], Carla: [2, 6], Diego: [-3, 4] };
const ACC = 6;
/** Camina por `points` a `mps` metros por segundo DEL SERVIDOR (se acelera con el reloj). */
async function walk(name, points, mps) {
  for (const target of points) {
    for (;;) {
      const [n, e] = pos[name];
      const d = Math.hypot(target[0] - n, target[1] - e);
      const step = mps * 0.2 * clock.speed; // por cada tic de 200 ms
      if (d <= step) {
        pos[name] = [...target];
        break;
      }
      pos[name] = [n + ((target[0] - n) / d) * step, e + ((target[1] - e) / d) * step];
      await sleep(200);
    }
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
  permissions: ['geolocation'],
  geolocation: { latitude: offsetM(CENTER, ...pos.Ana).lat, longitude: offsetM(CENTER, ...pos.Ana).lng, accuracy: ACC },
  recordVideo: { dir: join(out, 'tmp-video'), size: { width: 720, height: 1480 } },
});
const external = [];
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.endsWith('/mapa.config.json')) return route.fulfill({ json: { estiloUrl: STYLE_URL } });
  if (url === STYLE_URL) return route.fulfill({ json: STYLE });
  if (url.startsWith(base)) return route.continue();
  external.push(url.replace(/([?&]key=)[^&#]+/gi, "$1***")); // una clave nunca se registra
  return route.abort('blockedbyclient');
});
// Rótulo de simulación (lo añade la grabación, no es parte del producto).
await context.addInitScript((label) => {
  addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.textContent = label;
    b.setAttribute('aria-hidden', 'true');
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:3px 6px;font:700 10px system-ui;color:#0a0b0d;background:rgba(255,214,0,.92);text-align:center;pointer-events:none';
    document.body.append(b);
  });
}, LABEL);

const page = await context.newPage();
// La interfaz se reconstruye entera 4 veces por segundo: un elemento localizado puede quedar desconectado
// antes de desplazarse a él. Se busca y se desplaza en una sola operación dentro de la página.
const scrollTo = (selector) =>
  page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      return true;
    },
    selector,
    { timeout: 10_000 },
  );
const started = Date.now();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const milestones = [];
const checks = []; // comprobaciones medidas durante la grabación (fallan la ejecución si no se cumplen)
let shotNo = 0;
async function milestone(label, { shot = true } = {}) {
  const t = (Date.now() - started) / 1000;
  const file = shot ? `${String(++shotNo).padStart(2, '0')}-${label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png` : null;
  if (file) await page.screenshot({ path: join(shotsDir, file) });
  milestones.push({ t: Math.round(t * 10) / 10, label, captura: file });
  console.log(`${t.toFixed(1).padStart(6)} s · ${label}`);
}
// La posición de Ana sigue a `pos.Ana` (como el GPS de un móvil que se mueve).
const anaGps = setInterval(() => {
  const p = offsetM(CENTER, ...pos.Ana);
  context.setGeolocation({ latitude: p.lat, longitude: p.lng, accuracy: ACC }).catch(() => {});
}, 500);

const bots = {};
let botSend = null;
try {
  // ---------------------------------------------------------------- 1. pantalla inicial
  await page.goto(base);
  await page.waitForSelector('#f-name');
  await sleep(2_500);
  await milestone('Pantalla inicial');
  await page.locator('#f-name').pressSequentially('Ana', { delay: 180 });
  await page.locator('#f-adult').check();
  await sleep(800);
  await page.locator('[data-act=create]').tap();

  // ---------------------------------------------------------------- 2. configuración
  await page.waitForSelector('[data-act=center]');
  const code = (await page.locator('.code').first().textContent()).trim();
  await sleep(1_500);
  await milestone('Sala creada: configuración del anfitrión');
  await page.locator('[data-act=center]').tap();
  await page.waitForSelector('#c-radius');
  await sleep(1_200);
  await page.locator('#c-radius').selectOption('500'); // 400 m ya no está en el selector (1/11/2026)
  await sleep(700);
  await page.locator('#c-duration').selectOption('10');
  await sleep(700);
  await page.locator('#c-ping').selectOption('2');
  await sleep(700);
  await page.locator('#c-safety').check();
  await sleep(1_000);
  await milestone('Configuración: zona de 400 m, 10 min, pistas cada 2 min');

  // ---------------------------------------------------------------- 3. sala con varios jugadores
  const t = { wsUrl: `${base.replace('http', 'ws')}/ws` };
  for (const name of ['Bruno', 'Carla', 'Diego']) {
    bots[name] = botPlayer(t, name);
    await waitFor(() => bots[name].conn.status === 'open', `${name} conectado`);
    await bots[name].conn.join(code, name);
    await sleep(1_300);
  }
  await bots.Bruno.conn.command({ type: 'set_team_pref', pref: 'hunter' });
  await bots.Carla.conn.command({ type: 'set_team_pref', pref: 'runner' });
  await bots.Diego.conn.command({ type: 'set_team_pref', pref: 'runner' });
  const ids = Object.fromEntries(bots.Bruno.snap.players.map((p) => [p.name, p.id]));
  await scrollTo('.players');
  await sleep(1_000);
  await page.locator(`[data-assign="${ids.Ana}"]`).selectOption('hunter');
  await sleep(1_000);
  botSend = setInterval(() => {
    for (const [name, bot] of Object.entries(bots)) bot.at(pos[name][0], { east: pos[name][1], acc: ACC });
  }, 1_000);
  for (const name of ['Bruno', 'Carla', 'Diego']) {
    await bots[name].conn.command({ type: 'set_ready', ready: true });
    await sleep(700);
  }
  await milestone('Sala de espera con cuatro jugadores');
  await page.locator('[data-act=ready]').tap();
  await page.waitForFunction(() => document.querySelector('[data-act=ready]')?.textContent.includes('No estoy listo'));
  await sleep(1_500);
  await scrollTo('[data-act=start]');
  await sleep(1_000);
  await milestone('Todos listos: el anfitrión puede empezar');

  // ---------------------------------------------------------------- 4. inicio: cuenta atrás y rol
  await page.locator('[data-act=start]').tap();
  await page.waitForSelector('.countdown');
  await sleep(1_500);
  await milestone('Cuenta atrás');
  await page.waitForSelector('.overlay.reveal', { timeout: 15_000 });
  await sleep(1_000);
  await milestone('Rol revelado: CAZADOR');
  await sleep(2_500);
  await page.locator('.overlay.reveal').tap();

  // ---------------------------------------------------------------- 5-6. huida: mapa y movimiento
  await page.waitForSelector('#map-host .map-canvas');
  await page.waitForFunction(() => document.querySelector('#map-host .map-status')?.hidden === true, null, { timeout: 20_000 });
  await sleep(2_500);
  await milestone('Huida: mapa con la zona; los fugitivos no se ven');
  clock.speed = 10; // la huida (2 min) dura unos 12 s
  const flee = [
    walk('Carla', [[0, 90], [0, 180], [90, 180], [178, 180]], 3),
    walk('Diego', [[-90, 0], [-180, 0], [-270, 0], [-270, -90], [-270, -178]], 3),
    walk('Bruno', [[-12, -4]], 1),
  ];
  await sleep(6_000);
  await milestone('Huida: el compañero cazador (Bruno) aparece en el mapa');
  await Promise.all(flee);
  await page.waitForFunction(() => document.querySelector('.hud .label')?.textContent.toLowerCase().includes('persecución'), null, { timeout: 30_000 });
  clock.speed = 1;
  await sleep(2_500);
  await milestone('Persecución');

  // ---------------------------------------------------------------- conexión perdida y recuperada
  await context.setOffline(true);
  server.hub.connections.get(ids.Ana)?.transport.close(1001, 'grabación: corte de red');
  await page.waitForSelector('.conn-notice', { timeout: 10_000 });
  await sleep(2_500);
  await milestone('Sin conexión: aviso y posiciones congeladas');
  await sleep(2_500);
  await context.setOffline(false);
  await page.waitForFunction(() => !document.querySelector('.conn-notice'), null, { timeout: 20_000 });
  await sleep(2_000);
  await milestone('Conexión recuperada');

  // ---------------------------------------------------------------- 7. patrulla hasta la primera pista
  clock.speed = 6;
  const patrol = [walk('Ana', [[0, 45], [0, 90]], 2), walk('Bruno', [[-45, -4], [-90, 0]], 2)];
  await page.waitForSelector('.pings', { timeout: 60_000 });
  clock.speed = 1;
  await Promise.all(patrol);
  await sleep(2_000);
  await milestone('Primera pista: posiciones de los fugitivos en el mapa');
  // Comprobaciones medidas en la pantalla de la cazadora (sin desplazar): la acción se ve y no tapa el mapa.
  const view = await page.evaluate(() => {
    const dock = document.querySelector('.dock')?.getBoundingClientRect();
    const covered = [...document.querySelectorAll('#map-host .map-btn')].filter((b) => {
      const r = b.getBoundingClientRect();
      if (r.bottom > innerHeight) return false;
      return !b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }).length;
    return { dockVisible: !!dock && dock.top >= 0 && dock.bottom <= innerHeight, mapButtonsCovered: covered };
  });
  checks.push({ comprobación: 'cazadora: acción visible sin desplazar y botones del mapa sin tapar', ok: view.dockVisible && view.mapButtonsCovered === 0, detalle: view });
  await scrollTo('.pings');
  await sleep(3_500);
  await milestone('Lista de la última pista');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(1_500);

  // ---------------------------------------------------------------- 10-11a. un intento lejos: rechazado
  await scrollTo(`[data-claim="${ids.Diego}"]`);
  await sleep(1_500);
  await page.locator(`[data-claim="${ids.Diego}"]`).tap();
  await page.waitForSelector('.toast', { timeout: 10_000 });
  await sleep(1_000);
  await milestone('Reclamación lejos de Diego: el servidor la rechaza');
  await sleep(2_000);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));

  // ---------------------------------------------------------------- 9. aproximación a Carla
  clock.speed = 2;
  await walk('Ana', [[0, 180], [172, 180]], 3.5);
  clock.speed = 1;
  await sleep(4_000); // lecturas frescas de las dos
  await milestone('Ana llega junto a Carla');

  // ---------------------------------------------------------------- 10-11b. captura confirmada
  await scrollTo(`[data-claim="${ids.Carla}"]`);
  await sleep(1_500);
  await page.locator(`[data-claim="${ids.Carla}"]`).tap();
  await page.waitForFunction(() => document.body.textContent.includes('confirme'), null, { timeout: 10_000 });
  await sleep(1_000);
  await milestone('Reclamación enviada: esperando a que Carla confirme');
  await waitFor(() => bots.Carla.snap?.pendingClaimForMe, 'reclamación en el móvil de Carla');
  await sleep(3_000);
  await bots.Carla.conn.command({ type: 'respond_tag', claimId: bots.Carla.snap.pendingClaimForMe.claimId, accept: true });
  await page.waitForFunction(() => /Capturas: 1/.test(document.body.textContent), null, { timeout: 10_000 });
  await sleep(1_500);
  await milestone('Carla confirma: captura');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(2_000);

  // ---------------------------------------------------------------- Bruno alcanza a Diego: fin
  clock.speed = 4;
  await walk('Bruno', [[-180, 0], [-270, 0], [-270, -90], [-270, -172]], 3);
  clock.speed = 1;
  await sleep(4_000);
  const claim = await bots.Bruno.conn.command({ type: 'claim_tag', runnerId: ids.Diego });
  if (!claim.ok) throw new Error(`Bruno no pudo reclamar: ${claim.error}`);
  await sleep(2_500);
  await bots.Diego.conn.command({ type: 'respond_tag', claimId: claim.data.claimId, accept: true });

  // ---------------------------------------------------------------- 12. resultado
  await page.waitForSelector('[aria-label="Mission Report"]', { timeout: 15_000 });
  await sleep(2_500);
  await milestone('Mission Report: ganan los cazadores');
  await scrollTo('[data-act=share-report]');
  await sleep(3_500);
  await milestone('Final: revancha disponible para el anfitrión');
  await sleep(1_500);
} finally {
  clearInterval(anaGps);
  clearInterval(botSend);
  clearInterval(ticker);
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(join(out, 'gameplay-auditoria.webm'));
  for (const b of Object.values(bots)) b.conn.close();
  await server.close();
}

// ------------------------------------------------------------------ hitos
const duration = (Date.now() - started) / 1000;
writeFileSync(join(out, 'hitos.json'), `${JSON.stringify({ duracionAproxS: Math.round(duration), milestones, comprobaciones: checks, peticionesExternasBloqueadas: external, erroresDePagina: errors }, null, 2)}\n`);
writeFileSync(
  join(out, 'HITOS.md'),
  `# Hitos de gameplay-auditoria.webm\n\n${LABEL}.\nTiempos aproximados desde el inicio del vídeo (±0,5 s).\n\n| Tiempo | Hito | Captura |\n|---|---|---|\n${milestones
    .map((m) => `| ${Math.floor(m.t / 60)}:${String(Math.floor(m.t % 60)).padStart(2, '0')} | ${m.label} | ${m.captura ? `capturas/${m.captura}` : ''} |`)
    .join('\n')}\n\nPeticiones externas bloqueadas: ${external.length}. Errores de página: ${errors.length}.\n`,
);

// ------------------------------------------------------------------ versión breve: tramos del mismo vídeo
// El ffmpeg de Playwright no puede unir tramos: se reproducen en Chromium los tramos elegidos del vídeo de
// auditoría y se graba esa reproducción. Sin efectos ni textos añadidos.
const pick = (label, before, after) => {
  const m = milestones.find((x) => x.label.startsWith(label));
  return m ? [Math.max(0, m.t - before), m.t + after] : null;
};
const segments = [
  pick('Pantalla inicial', 1, 2),
  pick('Sala de espera', 1, 3),
  pick('Rol revelado', 0.5, 3),
  pick('Huida: el compañero', 2, 3),
  pick('Primera pista', 0.5, 5),
  pick('Reclamación lejos', 1, 3),
  pick('Ana llega', 4, 1),
  pick('Reclamación enviada', 0.5, 6),
  pick('Mission Report', 0.5, 5),
].filter(Boolean);
copyFileSync(join(out, 'gameplay-auditoria.webm'), join(out, 'tmp-fuente.webm'));
writeFileSync(
  join(out, 'tmp-reproductor.html'),
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;height:100%}video{width:100vw;height:100vh;object-fit:contain;display:block}</style>
<video id="v" src="tmp-fuente.webm" muted playsinline preload="auto"></video>
<script>
const v = document.getElementById('v');
const segs = ${JSON.stringify(segments)};
window.done = false;
(async () => {
  await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true })));
  for (const [a, b] of segs) {
    v.currentTime = a;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
    await v.play();
    await new Promise((r) => { const tick = () => (v.currentTime >= b || v.ended ? r() : requestAnimationFrame(tick)); tick(); });
    v.pause();
  }
  window.done = true;
})();
</script>`,
);
const ctx2 = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, recordVideo: { dir: join(out, 'tmp-video2'), size: { width: 720, height: 1480 } } });
const p2 = await ctx2.newPage();
await p2.goto(pathToFileURL(join(out, 'tmp-reproductor.html')).href);
await p2.waitForFunction(() => window.done === true, null, { timeout: 180_000, polling: 250 });
const v2 = p2.video();
await ctx2.close();
await v2.saveAs(join(out, 'gameplay-resumen.webm'));
await browser.close();
writeFileSync(join(out, 'resumen-tramos.json'), `${JSON.stringify(segments.map(([a, b]) => ({ desde: a, hasta: b })), null, 2)}\n`);
for (const tmp of ['tmp-video', 'tmp-video2', 'tmp-fuente.webm', 'tmp-reproductor.html']) rmSync(join(out, tmp), { recursive: true, force: true });
console.log(`\nVídeo de auditoría: ${join(out, 'gameplay-auditoria.webm')} (~${Math.round(duration)} s)`);
console.log(`Resumen: ${join(out, 'gameplay-resumen.webm')} (${segments.length} tramos, ~${Math.round(segments.reduce((s, [a, b]) => s + b - a, 0))} s)`);
console.log(`Errores de página: ${errors.length} · peticiones externas bloqueadas: ${external.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
for (const c of checks) console.log(`${c.ok ? '✔' : '✖'} ${c.comprobación} ${JSON.stringify(c.detalle)}`);
if (checks.some((c) => !c.ok)) process.exitCode = 1;
