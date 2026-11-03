// Conexión y presencia en el navegador real (Chromium de Playwright) contra el servidor real con el reloj
// controlado, a 360×740 (D-057, 30/10/2026). Comprueba y fotografía:
//   - captura rechazada: el cazador ve «Esperando…» (también tras recargar), el fugitivo pulsa «No» y los
//     dos ven «Captura rechazada»; el tercero no recibe nada;
//   - la misma partida abierta en otra pestaña: la anterior explica qué pasa y puede volver a jugar;
//   - «sin conexión» a los 30 s, «ha quedado fuera» a los 5 min y la pantalla de quien vuelve tarde;
//   - el Mission Report dice «Sin conexión» para quien quedó fuera, igual para todos.
// SIMULADO: GPS emulado, el reloj del servidor se adelanta (y se recarga la página para resincronizar) y
// el corte es cerrar la página, no un móvil sin cobertura. Sin MapTiler (radar de reserva).
// Uso (en mobile/): node e2e/conexion.e2e.mjs [carpeta-de-capturas]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { offsetM } from '../../engine/src/geo.ts';
import { startServer } from '../../server/main.ts';

const { chromium } = createRequire(import.meta.url)('playwright');
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });

const CENTER = { lat: 40.4153, lng: -3.6845 }; // fixture de las pruebas del motor
const clock = { t: Date.UTC(2026, 9, 30, 17, 0, 0) };
const server = await startServer({ hub: { now: () => clock.t } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Adelanta el reloj; las páginas abiertas dan señales de vida, como su ping real cada 10 s. */
const advance = async (ms) => {
  for (const end = clock.t + ms; clock.t < end; ) {
    clock.t = Math.min(end, clock.t + 20_000);
    server.pump();
    server.hub.keepAliveConnected();
  }
  await sleep(400);
};
let passed = 0;
const ok = (text) => console.log(`ok · ${text} (${++passed})`);
// Solo se ve un aviso a la vez (el más importante): se anotan todos los que aparecen en la página, aunque
// otro más importante (p. ej. una pista) los tape enseguida.
const recordToasts = (page) =>
  page.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver(() => {
      for (const t of document.querySelectorAll('.toast')) if (!window.__toasts.includes(t.textContent)) window.__toasts.push(t.textContent);
    }).observe(document, { childList: true, subtree: true });
  });
const toastWith = (page, re) =>
  page.waitForFunction((src) => (window.__toasts ?? []).some((t) => new RegExp(src).test(t)), re.source, { timeout: 6_000 });

const browser = await chromium.launch();
const players = {};
const errors = [];
const watch = (p, page) => {
  page.on('pageerror', (e) => errors.push(`${p.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.location()?.url ?? '') && !m.text().includes('navigator.vibrate') && errors.push(`${p.name}: ${m.text()}`));
};
try {
  for (const [name, north] of [['Ana', 0], ['Beto', 120], ['Caro', -150]]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', permissions: ['geolocation'] });
    await context.route('**/mapa.config.json', (route) => route.fulfill({ json: { proveedor: 'ninguno' } }));
    const p = { name, context, north };
    let j = 0;
    const move = () => {
      j = 1 - j;
      const q = offsetM(CENTER, p.north + j * 0.3, 0);
      return context.setGeolocation({ latitude: q.lat, longitude: q.lng, accuracy: 6 }).catch(() => {});
    };
    await move();
    p.timer = setInterval(move, 1_000);
    await recordToasts(context);
    p.page = await context.newPage();
    watch(p, p.page);
    await p.page.goto(server.url);
    players[name] = p;
  }
  const { Ana: ana, Beto: beto, Caro: caro } = players;
  const all = [ana, beto, caro];
  const shot = (page, label) => shots && page.screenshot({ path: `${shots}/${label}.png`, fullPage: true });
  const text = (page, sel) => page.locator(sel).first().textContent().then((t) => t.trim().replace(/\s+/g, ' '));
  const reload = async (p) => {
    await p.page.reload();
    await p.page.waitForSelector('.hud, .result, .card h2');
  };

  // Sala: Ana cazadora; Beto y Caro fugitivos (a mano). 10 min de persecución, pistas cada 3 min.
  await ana.page.fill('#f-name', 'Ana');
  await ana.page.check('#f-adult');
  await ana.page.click('[data-act=create]');
  const code = (await text(ana.page, '.code')).trim();
  for (const p of [beto, caro]) {
    await p.page.fill('#f-name', p.name);
    await p.page.check('#f-adult');
    await p.page.fill('#f-code', code);
    await p.page.click('[data-act=join]');
  }
  await ana.page.waitForFunction(() => document.querySelectorAll('.player').length === 3);
  const idOf = {};
  for (const p of all) idOf[p.name] = await p.page.evaluate(() => JSON.parse(localStorage.getItem('outrun.session')).playerId);
  for (const [n, role] of [['Ana', 'hunter'], ['Beto', 'runner'], ['Caro', 'runner']]) {
    await ana.page.selectOption(`[data-assign="${idOf[n]}"]`, role);
    await ana.page.waitForFunction(([id, r]) => document.querySelector(`[data-assign="${id}"]`)?.value === r, [idOf[n], role]);
  }
  await ana.page.click('[data-act=center]');
  await ana.page.waitForFunction(() => document.querySelector('[data-act=center]')?.textContent.includes('Volver'));
  await ana.page.check('#c-safety');
  await ana.page.selectOption('#c-duration', '10');
  await ana.page.selectOption('#c-ping', '3');
  await ana.page.waitForFunction(() => document.querySelector('.rules')?.textContent.includes('Cada 3 min'));
  for (const p of all) await p.page.click('[data-act=ready]');
  await ana.page.waitForSelector('[data-act=start]:not([disabled])');
  await ana.page.click('[data-act=start]');
  for (const p of all) await p.page.waitForSelector('.countdown .big');
  await advance(5_000);
  for (const p of all) {
    await p.page.waitForSelector('.overlay.reveal');
    await p.page.locator('.overlay.reveal').click();
  }
  await advance(2 * 60_000);
  for (const p of all) await reload(p); // resincroniza el reloj de la página tras el salto
  for (const p of all) await p.page.waitForFunction(() => document.querySelector('.hud .label')?.textContent === 'Persecución');

  // 1. Captura rechazada. Ana junto a Beto.
  ana.north = 0.5;
  beto.north = 4;
  const fresh = (n) => {
    const s = server.hub.roomStateByCode(code)?.players[idOf[n]]?.samples.at(-1);
    return s && !s.jump && clock.t - s.effectiveAt < 10_000 && Math.abs(s.lat - offsetM(CENTER, players[n].north, 0).lat) < 1e-5;
  };
  for (let i = 0; i < 200 && !(fresh('Ana') && fresh('Beto')); i++) await sleep(100);
  assert.ok(fresh('Ana') && fresh('Beto'), 'lecturas recientes y estables de Ana y Beto');
  await ana.page.click(`[data-claim="${idOf.Beto}"]`);
  await ana.page.waitForFunction(() => /Esperando a que Beto confirme/.test(document.querySelector('.dock')?.textContent ?? ''), null, { timeout: 5_000 });
  ok('al reclamar, el cazador ve «Esperando a que Beto confirme»');
  await reload(ana);
  await ana.page.waitForFunction(() => /Esperando a que Beto confirme/.test(document.querySelector('.dock')?.textContent ?? ''), null, { timeout: 5_000 });
  ok('tras recargar, el cazador sigue viendo su reclamación pendiente');
  await beto.page.waitForSelector('.claim-sheet');
  assert.match(await text(beto.page, '.claim-sheet'), /Ana/);
  await shot(beto.page, '01-reclamacion-Beto');
  await beto.page.click('[data-respond=no]');
  await toastWith(beto.page, /^Captura rechazada/);
  await toastWith(ana.page, /^Captura rechazada/);
  await ana.page.waitForSelector('[data-claim]');
  assert.equal(await beto.page.locator('.claim-sheet').count(), 0);
  assert.equal(await caro.page.evaluate(() => window.__toasts.some((t) => t.includes('rechazada'))), false);
  assert.equal(server.hub.roomStateByCode(code).players[idOf.Beto].status, 'active');
  await shot(ana.page, '02-rechazada-Ana');
  ok('captura rechazada: los dos lo ven, el tercero no; el fugitivo sigue libre y el cazador puede volver a reclamar');

  // 2. La misma partida en otra pestaña del mismo navegador.
  const tab2 = await beto.context.newPage();
  watch(beto, tab2);
  await tab2.goto(server.url);
  await tab2.waitForSelector('.hud');
  await beto.page.waitForFunction(() => document.querySelector('[data-act=play-here]') && /abierta en otra pestaña/.test(document.body.textContent));
  assert.equal(await beto.page.locator('#map-host').isHidden(), true);
  assert.equal(await beto.page.locator('.conn-notice').count(), 0);
  await shot(beto.page, '03-otra-pestana-Beto');
  ok('la pestaña anterior explica que la partida está abierta en otra y no muestra el mapa ni manda al inicio');
  await beto.page.click('[data-act=play-here]');
  await beto.page.waitForSelector('.hud');
  await tab2.waitForSelector('[data-act=play-here]');
  await tab2.close();
  assert.equal(server.hub.roomStateByCode(code).players[idOf.Beto].status, 'active');
  ok('«Jugar en esta pestaña» recupera la partida (rol y estado intactos) y para la otra');

  // 3. Caro pierde la conexión (página cerrada): «sin conexión» a los 30 s y fuera a los 5 min.
  await caro.page.close();
  for (let i = 0; i < 50 && server.hub.roomStateByCode(code).players[idOf.Caro].connected; i++) await sleep(100);
  await advance(40_000);
  await ana.page.waitForFunction(() => /Sin conexión: Caro/.test(document.querySelector('.presence')?.textContent ?? ''), null, { timeout: 6_000 });
  await toastWith(ana.page, /Caro no da señales/);
  await shot(ana.page, '04-sin-conexion-Ana');
  ok('a los 30 s sin señales, los demás ven «Sin conexión: Caro» (sin equipo ni posición)');
  // En dos tramos, como pasaría con el reloj real: la pista de los 3 min y el aviso de los 5 min no llegan
  // en la misma ráfaga (en pantalla solo cabe un aviso a la vez).
  await advance(3 * 60_000);
  await sleep(5_000);
  await advance(2 * 60_000);
  await toastWith(ana.page, /Caro ha quedado fuera: más de 5 min sin conexión/);
  await ana.page.waitForFunction(() => !document.querySelector('.presence'));
  assert.equal(server.hub.roomStateByCode(code).phase, 'ACTIVE'); // queda Beto
  ok('a los 5 min queda fuera y todos lo saben; la partida sigue con Beto');

  // Caro vuelve: su pantalla le explica qué ha pasado.
  caro.page = await caro.context.newPage();
  watch(caro, caro.page);
  await caro.page.goto(server.url);
  await caro.page.waitForFunction(() => /Estás fuera de la partida/.test(document.body.textContent) && /más de 5 min sin conexión/.test(document.body.textContent));
  assert.equal(await caro.page.locator('#map-host').isHidden(), true);
  await shot(caro.page, '05-fuera-Caro');
  ok('quien vuelve tarde ve que está fuera, por qué, y que verá el resultado');

  // 4. Final: el Mission Report dice «Sin conexión» para Caro, igual para todos (también para ella).
  await advance(10 * 60_000);
  for (const p of [ana, beto, caro]) await p.page.waitForSelector('[aria-label="Mission Report"]', { timeout: 6_000 });
  const rosters = [];
  for (const p of [ana, beto, caro]) rosters.push(await text(p.page, '.roster.t-runner'));
  assert.match(rosters[0], /Caro\s*Sin conexión/);
  assert.ok(rosters.every((r) => r === rosters[0]), `informes distintos: ${rosters.join(' | ')}`);
  await shot(caro.page, '06-informe-Caro');
  ok('el Mission Report es igual para los tres y dice «Sin conexión» para Caro');

  assert.deepEqual(errors, []);
  ok('sin errores en la consola de ninguna página');
  console.log(`\n${passed}/${passed} comprobaciones correctas`);
} finally {
  for (const p of Object.values(players)) clearInterval(p.timer);
  await browser.close();
  await server.close();
}
