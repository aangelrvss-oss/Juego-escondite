// Partida de 5 jugadores para VERLA en una ventana de Google Chrome y grabarla. Herramienta de QA, no
// forma parte del juego.
//
// Qué es real: la interfaz (la que sirve el servidor), el servidor del juego que ya está en marcha (no se
// arranca otro), el motor y las reglas, el protocolo, el tiempo (sin acelerar) y la cartografía configurada
// en mobile/www/mapa.config.json (MapTiler, si hay clave). Los cinco jugadores son navegadores reales que
// usan la interfaz: ALEX en una ventana VISIBLE de Google Chrome; CARLA, MARCOS, LUCÍA y DIEGO en Chromium
// sin ventana.
// Qué es SIMULADO: el GPS de cada navegador (coordenadas sintéticas alrededor del punto de referencia de
// las pruebas, no la ubicación de nadie, que se mueven como si los jugadores caminaran) y las decisiones de
// los jugadores (este guion pulsa los botones). Un rótulo en pantalla lo indica.
//
// La grabación es la de la PÁGINA de cada jugador (Playwright), no del escritorio.
// Uso (en mobile/, con el servidor ya arrancado): node e2e/partida-visible.mjs <carpeta> [http://127.0.0.1:8787]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { offsetM } from '../../engine/src/geo.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = resolve(process.argv[2] ?? 'partida-visible');
const base = (process.argv[3] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
mkdirSync(join(out, 'capturas'), { recursive: true });
const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor (no es la ubicación de nadie)
const LABEL = 'PRUEBA EN ORDENADOR · jugadores y GPS simulados · tiempo real';
const ACC = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (url) => url.replace(/([?&]key=)[^&#]+/gi, '$1***'); // la clave nunca va a los registros

// ------------------------------------------------------------------ servidor ya arrancado
const health = await fetch(`${base}/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
if (!health.ok) {
  console.log(`El servidor no responde en ${base}/health: ${JSON.stringify(health)}. Arráncalo con .\\server\\iniciar-servidor.ps1`);
  process.exit(2);
}

const started = Date.now();
const log = [];
const note = (what, data = {}) => {
  const t = Math.round((Date.now() - started) / 100) / 10;
  log.push({ t, what, ...data });
  console.log(`${t.toFixed(1).padStart(6)} s · ${what}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''}`);
};
note('servidor existente', { base, health });

// ------------------------------------------------------------------ navegadores
const visible = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-position=40,20', '--window-size=420,880'] });
const hidden = await chromium.launch();
const pos = { ALEX: [0, 2], CARLA: [3, 4], MARCOS: [-3, -2], LUCÍA: [4, -3], DIEGO: [-4, 3] };
const NAMES = Object.keys(pos);
const players = {};
const maptiler = [];
const problems = [];

async function makePlayer(name, { browser, record }) {
  const p0 = offsetM(CENTER, ...pos[name]);
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
    permissions: ['geolocation'],
    geolocation: { latitude: p0.lat, longitude: p0.lng, accuracy: ACC },
    ...(record ? { recordVideo: { dir: join(out, `tmp-${name}`), size: { width: 720, height: 1480 } } } : {}),
  });
  await context.addInitScript((label) => {
    addEventListener('DOMContentLoaded', () => {
      const b = document.createElement('div');
      b.textContent = label;
      b.setAttribute('aria-hidden', 'true');
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:2px 6px;font:700 10px system-ui;color:#0a0b0d;background:rgba(255,214,0,.9);text-align:center;pointer-events:none';
      document.body.append(b);
    });
  }, LABEL);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(redact(m.text())));
  if (name === 'ALEX') {
    page.on('response', (r) => {
      if (!/maptiler\.com/i.test(r.url())) return;
      const u = new URL(r.url());
      const kind = /style\.json/.test(u.pathname) ? 'estilo' : /\.pbf|tiles/.test(u.pathname) ? 'teselas' : /fonts|glyphs/.test(u.pathname) ? 'tipografías' : /sprite/.test(u.pathname) ? 'iconos' : 'otro';
      maptiler.push({ t: Math.round((Date.now() - started) / 1000), kind, status: r.status(), host: u.host, path: redact(u.pathname) });
    });
    page.on('requestfailed', (r) => /maptiler\.com/i.test(r.url()) && maptiler.push({ t: Math.round((Date.now() - started) / 1000), kind: 'fallida', status: 0, error: r.failure()?.errorText, path: redact(new URL(r.url()).pathname) }));
  }
  // Cada segundo, la posición con un ruido de ±0,3 m (como un GPS real). Necesario en la EMULACIÓN: con la
  // posición fija, Chrome devuelve siempre la hora de la primera lectura y un jugador quieto pasaría a
  // «Lectura antigua» por culpa del entorno de prueba, no del juego (comprobado el 28/10).
  let tick = 0;
  const gps = setInterval(() => {
    const [n, e] = pos[name];
    const p = offsetM(CENTER, n + (tick++ % 2 ? 0.3 : -0.3), e);
    context.setGeolocation({ latitude: p.lat, longitude: p.lng, accuracy: ACC }).catch(() => {});
  }, 1_000);
  players[name] = { name, context, page, errors, gps };
  return players[name];
}

/** Camina por `points` (metros norte/este) a `mps` metros por segundo, en tiempo real. */
async function walk(name, points, mps) {
  for (const target of points) {
    for (;;) {
      const [n, e] = pos[name];
      const d = Math.hypot(target[0] - n, target[1] - e);
      const step = mps * 0.25;
      if (d <= step) {
        pos[name] = [...target];
        break;
      }
      pos[name] = [n + ((target[0] - n) / d) * step, e + ((target[1] - e) / d) * step];
      await sleep(250);
    }
  }
}

let shotNo = 0;
async function shot(label, who = 'ALEX') {
  const file = `${String(++shotNo).padStart(2, '0')}-${who}-${label}.png`;
  await players[who].page.screenshot({ path: join(out, 'capturas', file) });
  return file;
}
const visibleEl = (page, sel) => page.waitForSelector(sel, { timeout: 30_000 });
const scrollTo = (page, sel) =>
  page.waitForFunction((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
  }, sel, { timeout: 15_000 });
const toastsOf = (page) => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent));
const timerOf = (page) => page.evaluate(() => document.querySelector('.hud .timer')?.textContent ?? null);

const result = { ok: false };
try {
  for (const name of NAMES) await makePlayer(name, name === 'ALEX' ? { browser: visible, record: true } : { browser: hidden, record: name === 'CARLA' });
  const alex = players.ALEX.page;

  // ---------------------------------------------------------------- A. entrada y sala
  await alex.goto(base);
  await visibleEl(alex, '#f-name');
  await sleep(2_500);
  note('aplicación cargada', { captura: await shot('inicio') });
  await alex.locator('#f-name').pressSequentially('ALEX', { delay: 150 });
  if (await alex.locator('#f-adult').count()) await alex.locator('#f-adult').check();
  await alex.locator('[data-act=create]').tap();
  await visibleEl(alex, '[data-act=center]');
  const code = (await alex.locator('.code').first().textContent()).trim();
  note('sala creada', { codigo: 'oculto en el registro' });
  await alex.locator('[data-act=center]').tap();
  await visibleEl(alex, '#c-radius');
  await sleep(800);
  await alex.locator('#c-radius').selectOption('250'); // 300 m ya no está en el selector (1/11/2026)
  await sleep(500);
  await alex.locator('#c-duration').selectOption('10');
  await sleep(500);
  await alex.locator('#c-ping').selectOption('2');
  await sleep(500);
  await alex.locator('#c-safety').check();
  await sleep(1_000);
  note('configuración: zona de 300 m, 10 min de persecución, 2 min de huida, pistas cada 2 min', { captura: await shot('configuracion') });

  for (const name of NAMES.slice(1)) {
    const page = players[name].page;
    await page.goto(`${base}/?sala=${code}`);
    await visibleEl(page, '#f-name');
    await page.locator('#f-name').fill(name);
    if (await page.locator('#f-adult').count()) await page.locator('#f-adult').check();
    await page.locator('[data-act=join]').tap();
    await page.waitForFunction(() => !!document.querySelector('.code-card'), null, { timeout: 15_000 });
    await sleep(1_200);
  }
  await alex.waitForFunction(() => document.querySelectorAll('.player').length === 5, null, { timeout: 15_000 });
  await scrollTo(alex, '.players');
  await sleep(1_500);
  note('cinco jugadores en la sala', { captura: await shot('sala-5-jugadores') });

  // Roles: asignación manual del anfitrión (función real de la sala; los demás no la ven).
  const ids = Object.fromEntries(await alex.evaluate(() => [...document.querySelectorAll('[data-assign]')].map((s) => [s.getAttribute('aria-label').replace('Rol de ', ''), s.dataset.assign])));
  const roles = { ALEX: 'hunter', MARCOS: 'hunter', CARLA: 'runner', LUCÍA: 'runner', DIEGO: 'runner' };
  for (const [name, role] of Object.entries(roles)) {
    await alex.locator(`[data-assign="${ids[name]}"]`).selectOption(role);
    await sleep(600);
  }
  note('roles asignados por el anfitrión', roles);
  for (const name of NAMES) {
    const page = players[name].page;
    await scrollTo(page, '[data-act=ready]');
    await page.locator('[data-act=ready]').tap();
    await page.waitForFunction(() => document.querySelector('[data-act=ready]')?.textContent.includes('No estoy listo'), null, { timeout: 20_000 });
    await sleep(500);
  }
  await scrollTo(alex, '[data-act=start]');
  await sleep(1_500);
  note('todos listos (GPS comprobado en cada navegador)', { captura: await shot('todos-listos') });

  // ---------------------------------------------------------------- B. inicio
  await alex.locator('[data-act=start]').tap();
  await visibleEl(alex, '.countdown');
  note('cuenta atrás', { captura: await shot('cuenta-atras') });
  await alex.waitForSelector('.overlay.reveal', { timeout: 20_000 });
  const revealed = {};
  for (const name of NAMES) revealed[name] = await players[name].page.evaluate(() => document.querySelector('.overlay.reveal .role')?.textContent ?? null);
  note('rol revelado en cada pantalla (cada uno solo el suyo)', { revealed, captura: await shot('rol') });
  await sleep(3_000);
  for (const name of NAMES) await players[name].page.locator('.overlay.reveal').tap().catch(() => {});

  // ---------------------------------------------------------------- mapa
  const mapState = await alex.waitForFunction(() => {
    const host = document.getElementById('map-host');
    if (host?.querySelector('.map-fallback')) return { real: false, motivo: host.querySelector('.map-note')?.textContent };
    if (host?.querySelector('canvas.maplibregl-canvas') && host.querySelector('.map-status')?.hidden) return { real: true, atribucion: host.querySelector('.maplibregl-ctrl-attrib')?.textContent?.trim() ?? null };
    return false;
  }, null, { timeout: 30_000 }).then((h) => h.jsonValue()).catch(() => ({ real: false, motivo: 'el mapa no terminó de cargar en 30 s' }));
  await sleep(2_500);
  note('mapa en la huida', { ...mapState, captura: await shot('huida-mapa') });

  // ---------------------------------------------------------------- C. huida (2 min reales): los fugitivos se alejan
  const flee = [
    walk('CARLA', [[0, 60], [90, 60], [150, 70]], 1.8),
    walk('LUCÍA', [[0, -60], [-60, -60], [-110, -140]], 1.8),
    walk('DIEGO', [[-60, 0], [-120, 40], [-160, 120]], 1.8),
  ];
  await sleep(30_000);
  note('huida: ALEX ve a su compañero MARCOS, no a los fugitivos', { captura: await shot('huida-companero') });
  const syncA = await timerOf(alex);
  const syncC = await timerOf(players.CARLA.page);
  note('sincronización del reloj ALEX / CARLA', { alex: syncA, carla: syncC });
  await Promise.all(flee);
  await alex.waitForFunction(() => document.querySelector('.hud .label')?.textContent.toLowerCase().includes('persecución'), null, { timeout: 150_000 });
  note('empieza la persecución', { avisos: await toastsOf(alex), captura: await shot('persecucion') });

  // Corte de red del navegador de ALEX (10 s) y vuelta.
  await players.ALEX.context.setOffline(true);
  const offlineSeen = await alex.waitForSelector('.conn-notice', { timeout: 15_000 }).then(() => true, () => false);
  note('ALEX sin red', { avisoVisible: offlineSeen, captura: await shot('sin-conexion') });
  await sleep(6_000);
  await players.ALEX.context.setOffline(false);
  const back = await alex.waitForFunction(() => !document.querySelector('.conn-notice'), null, { timeout: 40_000 }).then(() => true, () => false);
  note('ALEX recupera la red', { reconectado: back });
  if (!back) problems.push('ALEX no se reconectó en 40 s tras volver la red');

  // Patrulla de los cazadores hasta la primera pista (2 min después del inicio de la persecución).
  const patrol = [walk('ALEX', [[40, 30], [80, 50]], 1.2), walk('MARCOS', [[-40, 10], [-80, 40]], 1.2)];
  await alex.waitForSelector('.pings', { timeout: 200_000 });
  note('primera pista', { avisos: await toastsOf(alex), captura: await shot('pista') });
  await Promise.all(patrol);

  // ---------------------------------------------------------------- D. capturas
  // Un intento lejos (LUCÍA a unos 250 m): lo rechaza el servidor por distancia.
  await scrollTo(alex, `[data-claim="${ids['LUCÍA']}"]`);
  await alex.locator(`[data-claim="${ids['LUCÍA']}"]`).tap();
  await alex.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /cerca|precisi|antigua|recient/i.test(t.textContent)), null, { timeout: 10_000 }).catch(() => {});
  note('reclamación lejos de LUCÍA', { avisos: await toastsOf(alex), captura: await shot('reclamacion-lejos') });
  await alex.evaluate(() => scrollTo({ top: 0 }));

  // ALEX alcanza a CARLA (quieta) y reclama; CARLA confirma en su pantalla.
  await walk('ALEX', [[150, 62]], 3);
  await sleep(6_000); // lecturas recientes de las dos
  note('ALEX junto a CARLA', { captura: await shot('junto-a-carla') });
  await scrollTo(alex, `[data-claim="${ids.CARLA}"]`);
  await alex.locator(`[data-claim="${ids.CARLA}"]`).tap();
  const carlaAsked = await players.CARLA.page.waitForSelector('[data-respond=yes]', { timeout: 15_000 }).then(() => true, () => false);
  note('reclamación a CARLA', { carlaLaRecibe: carlaAsked, avisosAlex: await toastsOf(alex), captura: await shot('reclamacion-carla') });
  if (carlaAsked) {
    await shot('reclamacion-recibida', 'CARLA');
    await sleep(3_000);
    await players.CARLA.page.locator('[data-respond=yes]').tap();
    await alex.waitForFunction(() => /Capturas: 1/.test(document.body.textContent), null, { timeout: 15_000 });
    await sleep(1_200);
    const toasts = await toastsOf(alex);
    note('CARLA confirma: captura', { avisosAlex: toasts, captura: await shot('captura-carla') });
    if (toasts.filter((t) => t.startsWith('Captura')).length > 1) problems.push(`avisos de captura duplicados: ${toasts.join(' | ')}`);
  } else problems.push('CARLA no recibió la reclamación');

  // MARCOS alcanza a DIEGO; DIEGO confirma.
  await walk('MARCOS', [[-160, 112]], 3);
  await sleep(6_000);
  const pm = players.MARCOS.page;
  await scrollTo(pm, `[data-claim="${ids.DIEGO}"]`);
  await pm.locator(`[data-claim="${ids.DIEGO}"]`).tap();
  const diegoAsked = await players.DIEGO.page.waitForSelector('[data-respond=yes]', { timeout: 15_000 }).then(() => true, () => false);
  if (diegoAsked) {
    await sleep(2_000);
    await players.DIEGO.page.locator('[data-respond=yes]').tap();
    await alex.waitForFunction(() => /Capturas: 2/.test(document.body.textContent), null, { timeout: 15_000 });
    note('MARCOS captura a DIEGO (visto por ALEX)', { avisosAlex: await toastsOf(alex), captura: await shot('captura-diego') });
  } else problems.push('DIEGO no recibió la reclamación de MARCOS');

  // Un capturado ya no aparece en el mapa de su compañera LUCÍA.
  await sleep(8_000);
  const lucMarkers = await players['LUCÍA'].page.evaluate(() => [...document.querySelectorAll('#map-host .mk-label, .radar text')].map((l) => l.textContent));
  const stale = lucMarkers.filter((l) => /^(CARLA|DIEGO)/.test(l));
  note('mapa de LUCÍA tras las capturas', { marcadores: lucMarkers, capturadosVisibles: stale });
  if (stale.length) problems.push(`LUCÍA sigue viendo a capturados: ${stale.join(', ')}`);

  // ALEX va a por LUCÍA: primero ella rechaza; después confirma. Fin por captura de todos.
  await walk('ALEX', [[60, 0], [-60, -60], [-108, -136]], 3);
  await sleep(6_000);
  await scrollTo(alex, `[data-claim="${ids['LUCÍA']}"]`);
  await alex.locator(`[data-claim="${ids['LUCÍA']}"]`).tap();
  const lucAsked = await players['LUCÍA'].page.waitForSelector('[data-respond=no]', { timeout: 15_000 }).then(() => true, () => false);
  if (lucAsked) {
    await sleep(2_000);
    await players['LUCÍA'].page.locator('[data-respond=no]').tap();
    await alex.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('rechazada')), null, { timeout: 10_000 }).catch(() => {});
    note('LUCÍA rechaza la reclamación', { avisosAlex: await toastsOf(alex), captura: await shot('rechazo-lucia') });
    await sleep(4_000); // límite del servidor: una reclamación cada 3 s por cazador
    await scrollTo(alex, `[data-claim="${ids['LUCÍA']}"]`);
    await alex.locator(`[data-claim="${ids['LUCÍA']}"]`).tap();
    await players['LUCÍA'].page.waitForSelector('[data-respond=yes]', { timeout: 15_000 });
    await sleep(2_000);
    await players['LUCÍA'].page.locator('[data-respond=yes]').tap();
  } else problems.push('LUCÍA no recibió la reclamación');

  // ---------------------------------------------------------------- E. final
  await alex.waitForSelector('[aria-label="Mission Report"]', { timeout: 30_000 });
  await sleep(2_500);
  const report = await alex.evaluate(() => document.querySelector('[aria-label="Mission Report"]')?.innerText);
  const reportCarla = await players.CARLA.page.evaluate(() => document.querySelector('[aria-label="Mission Report"]')?.innerText);
  note('Mission Report', { igualEnAlexYCarla: report === reportCarla, captura: await shot('mission-report') });
  if (report !== reportCarla) problems.push('el Mission Report difiere entre ALEX y CARLA');
  await alex.locator('[data-act=rematch]').scrollIntoViewIfNeeded().catch(() => {});
  await sleep(3_000);
  note('final: revancha disponible', { captura: await shot('final') });
  result.ok = true;
  result.report = report;
} catch (e) {
  note('LA PARTIDA NO SE COMPLETÓ', { error: e.message.split('\n')[0] });
  await shot('error').catch(() => {});
} finally {
  for (const p of Object.values(players)) clearInterval(p.gps);
  const videos = {};
  for (const name of ['ALEX', 'CARLA']) {
    const p = players[name];
    if (!p) continue;
    const v = p.page.video();
    await p.context.close();
    if (v) {
      const file = join(out, `partida-${name}.webm`);
      await v.saveAs(file);
      videos[name] = file;
    }
  }
  for (const p of Object.values(players)) await p.context.close().catch(() => {});
  await visible.close();
  await hidden.close();
  const errors = Object.fromEntries(Object.entries(players).map(([n, p]) => [n, p.errors]));
  const summary = {
    ok: result.ok,
    duracionS: Math.round((Date.now() - started) / 1000),
    servidor: base,
    videos,
    maptiler: {
      peticiones: maptiler.length,
      porTipo: maptiler.reduce((m, r) => ((m[`${r.kind} ${r.status}`] = (m[`${r.kind} ${r.status}`] ?? 0) + 1), m), {}),
      fallidas: maptiler.filter((r) => r.status === 0 || r.status >= 400).slice(0, 20),
    },
    erroresDePagina: errors,
    problemas: problems,
    hitos: log,
  };
  writeFileSync(join(out, 'registro-partida.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nResultado: ${result.ok ? 'partida completa' : 'INCOMPLETA'} · problemas: ${problems.length} · MapTiler: ${JSON.stringify(summary.maptiler.porTipo)}`);
}
